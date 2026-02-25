import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Group } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

const GROUPS_KEY = ['groups'] as const;

/** Fetch all groups for the current user */
export function useGroups() {
    const token = useAuthStore((s) => s.accessToken);
    return useQuery({
        queryKey: GROUPS_KEY,
        queryFn: () => api.getGroups(token!),
        enabled: !!token,
    });
}

/** Fetch a single group by ID */
export function useGroup(groupId: string | undefined) {
    const token = useAuthStore((s) => s.accessToken);
    return useQuery({
        queryKey: ['group', groupId],
        queryFn: () => api.getGroup(token!, groupId!),
        enabled: !!token && !!groupId,
    });
}

/** Create a new group with automatic cache invalidation */
export function useCreateGroup() {
    const token = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { name: string; description: string; avatar?: string }) =>
            api.createGroup(token!, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
        },
    });
}

/** Delete a group with automatic cache invalidation */
export function useDeleteGroup() {
    const token = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (groupId: string) => api.deleteGroup(token!, groupId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
        },
    });
}
