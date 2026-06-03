import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

const INVITATIONS_KEY = ['invitations', 'pending'] as const;

/** Fetch pending group invitations with automatic polling */
export function usePendingInvitations() {
    const token = useAuthStore((s) => s.accessToken);
    return useQuery({
        queryKey: INVITATIONS_KEY,
        queryFn: () => api.getPendingInvitations(token!),
        enabled: !!token,
        refetchInterval: 30_000, // Poll every 30 seconds
    });
}

/** Accept an invitation with cache invalidation */
export function useAcceptInvitation() {
    const token = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (invitationId: string) =>
            api.acceptGroupInvitation(token!, invitationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
            queryClient.invalidateQueries({ queryKey: ['groups'] });
        },
    });
}

/** Decline an invitation with cache invalidation */
export function useDeclineInvitation() {
    const token = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (invitationId: string) =>
            api.declineGroupInvitation(token!, invitationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
        },
    });
}
