import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, GroupPaper, Message, Session, RagSource } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import type { Source } from '@/components/research';
import type { AgentStep } from '@/lib/socket';

/**
 * Loads everything the research workspace needs for a session: the session
 * itself, its message history, and the group's papers (which become the
 * toggleable RAG sources in the left panel).
 */
export function useResearchSession(sessionId: string | null) {
  const token = useAuthStore((s) => s.accessToken);

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(token!, sessionId!),
    enabled: !!token && !!sessionId,
  });

  const messagesQuery = useQuery({
    queryKey: ['session', sessionId, 'messages'],
    queryFn: () => api.getSessionMessages(token!, sessionId!),
    enabled: !!token && !!sessionId,
  });

  const groupId = sessionQuery.data?.groupId;

  const papersQuery = useQuery({
    queryKey: ['group', groupId, 'papers'],
    queryFn: () => api.getGroupPapers(token!, groupId!),
    enabled: !!token && !!groupId,
  });

  // Group papers are the source list; `enabled` is local UI state layered on top.
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    if (!papersQuery.data) return;
    setSources(
      papersQuery.data.map((paper: GroupPaper) => ({
        id: paper.paperId,
        type: 'paper' as const,
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
        url: paper.url,
        enabled: true,
        addedAt: paper.addedAt,
        tags: paper.tags,
        publishedDate: paper.publishedDate,
      }))
    );
  }, [papersQuery.data]);

  const toggleSource = useCallback((id: string) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }, []);

  const toggleAllSources = useCallback((enabled: boolean) => {
    setSources((prev) => prev.map((s) => ({ ...s, enabled })));
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addSource = useCallback((url: string, title: string) => {
    let added = false;
    setSources((prev) => {
      if (prev.some((s) => s.url === url)) return prev;
      added = true;
      return [
        ...prev,
        {
          id: `ctx-${Date.now()}`,
          type: 'paper' as const,
          title,
          url,
          enabled: true,
          addedAt: new Date().toISOString(),
        },
      ];
    });
    return added;
  }, []);

  const enabledSources = useMemo(() => sources.filter((s) => s.enabled), [sources]);

  return {
    session: sessionQuery.data ?? null,
    initialMessages: (messagesQuery.data ?? []) as Message[],
    isLoading: sessionQuery.isLoading || messagesQuery.isLoading,
    error: sessionQuery.error ?? messagesQuery.error,
    sources,
    enabledSources,
    toggleSource,
    toggleAllSources,
    removeSource,
    addSource,
  };
}

/**
 * An agent message carries its reasoning trace in metadata, so reopening a
 * session still shows how the answer was reached — not just the answer.
 */
export function getMessageAgentSteps(message: Message): AgentStep[] {
  const steps = message.metadata?.steps;
  if (!Array.isArray(steps)) return [];
  return steps.filter(
    (s): s is AgentStep => !!s && typeof s === 'object' && 'tool' in s
  );
}

/**
 * The AI service returns the retrieved chunks that grounded an answer in the
 * message metadata; surface them so each AI message can render citation chips.
 */
export function getMessageCitations(message: Message): RagSource[] {
  const sources = message.metadata?.sources;
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (s): s is RagSource => !!s && typeof s === 'object' && 'id' in s
  );
}

export type { Session };
