import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the api module before importing auth store
vi.mock('@/lib/api', () => ({
    api: {
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        updateMe: vi.fn(),
    },
}));

import { useAuthStore } from '@/lib/auth';
import { api } from '@/lib/api';

const mockedApi = vi.mocked(api);

describe('useAuthStore', () => {
    beforeEach(() => {
        // Reset the store to initial state
        useAuthStore.setState({
            user: null,
            accessToken: null,
            refreshToken: null,
            isLoading: false,
            isAuthenticated: false,
        });
        vi.clearAllMocks();
    });

    it('starts with unauthenticated state', () => {
        const { result } = renderHook(() => useAuthStore());
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
        expect(result.current.accessToken).toBeNull();
    });

    it('login sets authenticated state', async () => {
        const mockUser = { id: '1', name: 'Test', email: 'test@test.com' };
        mockedApi.login.mockResolvedValue({
            user: mockUser as any,
            accessToken: 'access-123',
            refreshToken: 'refresh-456',
        });

        const { result } = renderHook(() => useAuthStore());

        await act(async () => {
            await result.current.login('test@test.com', 'password');
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.accessToken).toBe('access-123');
        expect(result.current.refreshToken).toBe('refresh-456');
        expect(result.current.isLoading).toBe(false);
    });

    it('login sets isLoading during request', async () => {
        let resolveLogin: (value: any) => void;
        mockedApi.login.mockReturnValue(new Promise(r => { resolveLogin = r; }));

        const { result } = renderHook(() => useAuthStore());

        // Start login (don't await)
        let loginPromise: Promise<void>;
        act(() => {
            loginPromise = result.current.login('test@test.com', 'password');
        });

        expect(result.current.isLoading).toBe(true);

        // Resolve
        await act(async () => {
            resolveLogin!({ user: { id: '1' }, accessToken: 'a', refreshToken: 'r' });
            await loginPromise!;
        });

        expect(result.current.isLoading).toBe(false);
    });

    it('login resets isLoading on failure', async () => {
        mockedApi.login.mockRejectedValue(new Error('Bad credentials'));

        const { result } = renderHook(() => useAuthStore());

        try {
            await act(async () => {
                await result.current.login('bad@test.com', 'wrong');
            });
        } catch {
            // expected - login throws on failure
        }

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isAuthenticated).toBe(false);
    });

    it('logout clears auth state', async () => {
        // Set up authenticated state
        useAuthStore.setState({
            user: { id: '1', name: 'Test', email: 'test@test.com' } as any,
            accessToken: 'access-123',
            refreshToken: 'refresh-456',
            isAuthenticated: true,
        });

        mockedApi.logout.mockResolvedValue(undefined as any);

        const { result } = renderHook(() => useAuthStore());

        await act(async () => {
            await result.current.logout();
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
        expect(result.current.accessToken).toBeNull();
        expect(result.current.refreshToken).toBeNull();
    });

    it('logout clears state even if API call fails', async () => {
        useAuthStore.setState({
            user: { id: '1' } as any,
            accessToken: 'a',
            refreshToken: 'r',
            isAuthenticated: true,
        });

        mockedApi.logout.mockRejectedValue(new Error('Network error'));

        const { result } = renderHook(() => useAuthStore());

        await act(async () => {
            await result.current.logout();
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
    });

    it('setUser updates user directly', () => {
        const { result } = renderHook(() => useAuthStore());
        const newUser = { id: '2', name: 'Updated', email: 'new@test.com' } as any;

        act(() => {
            result.current.setUser(newUser);
        });

        expect(result.current.user).toEqual(newUser);
    });
});
