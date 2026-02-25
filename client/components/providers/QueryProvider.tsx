'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 2,       // 2 minutes
            gcTime: 1000 * 60 * 10,          // 10 minutes garbage collection
            retry: 1,
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: 0,
        },
    },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
