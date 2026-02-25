import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Paper } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

const PAPERS_KEY = ['papers'] as const;
const SAVED_PAPERS_KEY = ['papers', 'saved'] as const;

/** Fetch papers with optional search/tag filters */
export function usePapers(search?: string, tag?: string) {
    const token = useAuthStore((s) => s.accessToken);
    return useQuery({
        queryKey: [...PAPERS_KEY, { search, tag }],
        queryFn: () => api.getPapers(token!, search, tag),
        enabled: !!token,
    });
}

/** Fetch saved papers */
export function useSavedPapers() {
    const token = useAuthStore((s) => s.accessToken);
    return useQuery({
        queryKey: SAVED_PAPERS_KEY,
        queryFn: () => api.getSavedPapers(token!),
        enabled: !!token,
    });
}

/** Search external papers (arXiv) */
export function useSearchExternalPapers(query: string, enabled = true) {
    const token = useAuthStore((s) => s.accessToken);
    return useQuery({
        queryKey: ['papers', 'external', query],
        queryFn: () => api.searchExternalPapers(token!, query),
        enabled: !!token && !!query && enabled,
        staleTime: 1000 * 60 * 5, // 5 min - external search results are stable
    });
}

/** Save a paper */
export function useSavePaper() {
    const token = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (paperId: string) => api.savePaper(token!, paperId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: SAVED_PAPERS_KEY });
        },
    });
}

/** Unsave a paper */
export function useUnsavePaper() {
    const token = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (paperId: string) => api.unsavePaper(token!, paperId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: SAVED_PAPERS_KEY });
        },
    });
}
