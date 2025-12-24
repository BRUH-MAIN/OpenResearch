'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth';
import { api } from '@/lib/api';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

// Public routes that don't require authentication
const publicRoutes = ['/', '/landing', '/auth/signin', '/auth/signup'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, accessToken, refreshAuth, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      // Skip auth check for public routes
      if (publicRoutes.includes(pathname)) {
        setIsLoading(false);
        return;
      }

      // If we have a token, try to get user info
      if (accessToken) {
        try {
          const user = await api.getMe(accessToken);
          setUser(user);
          setIsLoading(false);
          return;
        } catch {
          // Token might be expired, try refresh
          const refreshed = await refreshAuth();
          if (refreshed) {
            const newToken = useAuthStore.getState().accessToken;
            if (newToken) {
              const user = await api.getMe(newToken);
              setUser(user);
              setIsLoading(false);
              return;
            }
          }
        }
      }

      // Not authenticated, redirect to signin for protected routes
      if (!publicRoutes.includes(pathname)) {
        router.push('/auth/signin');
      }
      
      setIsLoading(false);
    }

    checkAuth();
  }, [pathname, accessToken, refreshAuth, setUser, router]);

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (!isLoading && isAuthenticated && (pathname === '/auth/signin' || pathname === '/auth/signup')) {
      router.push('/home');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  return (
    <AuthContext.Provider value={{ isLoading, isAuthenticated }}>
      {isLoading && !publicRoutes.includes(pathname) ? (
        <div className="min-h-screen bg-[#212121] flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-4 border-[#0D7377] border-t-[#14FFEC] rounded-full animate-spin" />
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
