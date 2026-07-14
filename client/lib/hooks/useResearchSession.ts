import { useCallback, useMemo, useState } from 'react';
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

  /**
   * The source list is *derived* from the group's papers, not copied into state.
   *
   * Copying it would mean a background refetch silently resets whatever the user
   * had toggled off — the paper list is server state, and only the overlay on top
   * of it (what is disabled, what was removed, what was added ad hoc) belongs in
   * local state.
   */
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [extraSources, setExtraSources] = useState<Source[]>([]);

  const sources = useMemo<Source[]>(() => {
    const fromPapers = (papersQuery.data ?? []).map((paper: GroupPaper) => ({
      id: paper.paperId,
      type: 'paper' as const,
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      url: paper.url,
      enabled: !disabledIds.has(paper.paperId),
      addedAt: paper.addedAt,
      tags: paper.tags,
      publishedDate: paper.publishedDate,
    }));

    return [...fromPapers, ...extraSources].filter((s) => !removedIds.has(s.id));
  }, [papersQuery.data, disabledIds, removedIds, extraSources]);

  const toggleSource = useCallback((id: string) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAllSources = useCallback(
    (enabled: boolean) => {
      setDisabledIds(enabled ? new Set() : new Set(sources.map((s) => s.id)));
    },
    [sources]
  );

  const removeSource = useCallback((id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
  }, []);

  const addSource = useCallback(
    (url: string, title: string) => {
      if (sources.some((s) => s.url === url)) return false;

      setExtraSources((prev) => [
        ...prev,
        {
          id: `ctx-${Date.now()}`,
          type: 'paper' as const,
          title,
          url,
          enabled: true,
          addedAt: new Date().toISOString(),
        },
      ]);
      return true;
    },
    [sources]
  );

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
