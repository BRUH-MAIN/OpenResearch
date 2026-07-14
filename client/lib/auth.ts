import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, User } from './api';

// Mutex for preventing concurrent token refresh
let refreshPromise: Promise<boolean> | null = null;

interface AuthState {
  user: User | null;
  accessToken: string | null;
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

// The refresh token is an httpOnly cookie managed entirely by the server —
// only the short-lived access token and user profile are kept client-side.
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const result = await api.login(email, password);
          set({
            user: result.user,
            accessToken: result.accessToken,
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
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        const { accessToken } = get();
        try {
          if (accessToken) {
            await api.logout(accessToken);
          }
        } catch {
          // Ignore logout errors
        } finally {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
          });
        }
      },

      refreshAuth: async () => {
        // If a refresh is already in progress, wait for it
        if (refreshPromise) {
          return refreshPromise;
        }

        // Start a new refresh; the httpOnly cookie is sent automatically
        refreshPromise = (async () => {
          try {
            const result = await api.refreshToken();
            set({ accessToken: result.accessToken, isAuthenticated: true });
            return true;
          } catch {
            // Refresh failed, clear auth state
            set({
              user: null,
              accessToken: null,
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
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Promise-based helper that resolves when Zustand persist hydration is complete.
// Uses the official persist.hasHydrated() API which is reliable in Zustand v5
// (the onFinishHydration callback can miss if hydration completes before registration).
export function waitForHydration(): Promise<void> {
  // On the server, resolve immediately (no localStorage to rehydrate from)
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    // Check the official Zustand persist API for hydration status
    if (useAuthStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    // If not yet hydrated, wait for the event
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

export const hasHydrated = () => useAuthStore.persist.hasHydrated();

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
