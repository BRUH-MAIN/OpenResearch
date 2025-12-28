import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, User } from './api';

// Mutex for preventing concurrent token refresh
let refreshPromise: Promise<boolean> | null = null;

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, interests?: string[]) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  updateUser: (data: Partial<User>) => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const result = await api.login(email, password);
          set({
            user: result.user,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (name: string, email: string, password: string, interests?: string[]) => {
        set({ isLoading: true });
        try {
          const result = await api.register({ name, email, password, interests });
          set({
            user: result.user,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        const { accessToken, refreshToken } = get();
        try {
          if (accessToken && refreshToken) {
            await api.logout(accessToken, refreshToken);
          }
        } catch {
          // Ignore logout errors
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        // If a refresh is already in progress, wait for it
        if (refreshPromise) {
          return refreshPromise;
        }

        // Start a new refresh
        refreshPromise = (async () => {
          try {
            const result = await api.refreshToken(refreshToken);
            set({
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
            });
            return true;
          } catch {
            // Refresh failed, clear auth state
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
            });
            return false;
          } finally {
            refreshPromise = null;
          }
        })();

        return refreshPromise;
      },

      updateUser: async (data: Partial<User>) => {
        const { accessToken } = get();
        if (!accessToken) throw new Error('Not authenticated');

        const updatedUser = await api.updateMe(accessToken, data);
        set({ user: updatedUser });
      },

      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'openresearch-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Helper hook to get token with auto-refresh
export function useToken() {
  const { accessToken, refreshAuth } = useAuthStore();
  
  const getToken = async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    const refreshed = await refreshAuth();
    if (refreshed) {
      return useAuthStore.getState().accessToken;
    }
    return null;
  };

  return { token: accessToken, getToken };
}
