'use client';

import React, { useState, useRef, useEffect, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Modal } from '@/components/ui';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Loader2, FileText, PlusCircle, Bot, Copy, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Session, GroupPaper, AgenticTaskType } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { useToastStore } from '@/lib/toast';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

import {
  SourcesPanel,
  StudioPanel,
  ResearchMessage,
  Source,
  StudioOutput,
  Citation,
  CommandPalette,
  COMMANDS,
  Command,
} from '@/components/research';
import { PaperContextMenuProvider, PaperLinkContextMenu } from '@/components/research/PaperLinkContextMenu';
import type { ClaimNode, ClaimEdge } from '@/components/research/ClaimLineageGraph';
import type { PinnedNote } from '@/components/research';

// ==================== Skeleton Loading ====================

function ResearchSkeleton() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />
      <div className="research-skeleton">
        {/* Left sidebar skeleton */}
        <div className="research-skeleton-sidebar space-y-3">
          <Skeleton height={36} borderRadius="var(--radius-lg)" />
          <Skeleton height={32} borderRadius="var(--radius-lg)" />
          <div className="space-y-2 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-lg" style={{ border: '1px solid var(--color-border-primary)' }}>
                <Skeleton height={14} width="80%" borderRadius="var(--radius-sm)" />
                <Skeleton height={10} width="50%" borderRadius="var(--radius-sm)" className="mt-2" />
                <Skeleton height={10} width="100%" borderRadius="var(--radius-sm)" className="mt-2" />
              </div>
            ))}
          </div>
        </div>

        {/* Center chat skeleton */}
        <div className="research-skeleton-chat">
          <div className="flex items-center justify-between mb-6 pb-3" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
            <Skeleton height={16} width={120} borderRadius="var(--radius-sm)" />
            <Skeleton height={24} width={90} borderRadius="var(--radius-full)" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto w-full">
            <Skeleton height={56} width={56} borderRadius="var(--radius-xl)" className="mb-6" />
            <Skeleton height={28} width="60%" borderRadius="var(--radius-sm)" className="mb-3" />
            <Skeleton height={14} width="30%" borderRadius="var(--radius-sm)" className="mb-8" />
            <div className="space-y-2 w-full">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={52} borderRadius="var(--radius-xl)" />
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar skeleton */}
        <div className="research-skeleton-right" />
      </div>
    </div>
  );
}

// ==================== localStorage helpers for pins ====================

const PINS_KEY = (sessionId: string) => `openresearch_pins_${sessionId}`;

const AGENTIC_SLASH_TASKS: Array<{ value: AgenticTaskType; label: string }> = [
  { value: 'paper_retrieval', label: 'Paper Retrieval' },
  { value: 'literature_survey', label: 'Literature Survey' },
  { value: 'gap_analysis', label: 'Gap Analysis' },
  { value: 'fact_check', label: 'Fact Check' },
  { value: 'novelty_assessment', label: 'Novelty Assessment' },
  { value: 'research_mentor', label: 'Research Mentor' },
  { value: 'paper_writing', label: 'Paper Writing' },
  { value: 'deep_research', label: 'Deep Research' },
  { value: 'methodology_extraction', label: 'Structured Comparison' },
];

const AGENTIC_SLASH_TASK_SET = new Set<AgenticTaskType>(
  AGENTIC_SLASH_TASKS.map((task) => task.value)
);

function loadPinnedNotes(sessionId: string): PinnedNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PINS_KEY(sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePinnedNotes(sessionId: string, notes: PinnedNote[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PINS_KEY(sessionId), JSON.stringify(notes));
}

function formatAgenticResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object') {
    const orderedKeys = [
      'deep_research',
      'literature_review',
      'research_gaps',
      'fact_check',
      'novelty',
      'mentor_advice',
      'paper_draft',
      'research_plan',
      'methodology_matrix',
      'papers',
      'result',
    ];

    for (const key of orderedKeys) {
      if (!(key in result)) continue;
      const value = (result as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }

  return JSON.stringify(result || {}, null, 2);
}

interface ResearchPanelPrefs {
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  rightPanelWidth: number;
}

const RESEARCH_PANEL_PREFS_KEY = 'openresearch_research_panel_prefs_v1';

function loadResearchPanelPrefs(): ResearchPanelPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RESEARCH_PANEL_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResearchPanelPrefs>;
    if (
      typeof parsed.leftPanelCollapsed !== 'boolean' ||
      typeof parsed.rightPanelCollapsed !== 'boolean' ||
      typeof parsed.rightPanelWidth !== 'number'
    ) {
      return null;
    }
    return {
      leftPanelCollapsed: parsed.leftPanelCollapsed,
      rightPanelCollapsed: parsed.rightPanelCollapsed,
      rightPanelWidth: Math.max(280, Math.min(600, parsed.rightPanelWidth)),
    };
  } catch {
    return null;
  }
}

function saveResearchPanelPrefs(prefs: ResearchPanelPrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RESEARCH_PANEL_PREFS_KEY, JSON.stringify(prefs));
}

const RESEARCH_CHAT_CONTENT_MAX_WIDTH = '52rem';

// ==================== Main Component ====================

function ResearchChatContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const { accessToken, user } = useAuthStore();
  const { addToast } = useToastStore();
  const useOverlayPanels = useMediaQuery('(max-width: 1023px)');

  // UI State
  const [inputMessage, setInputMessage] = useState('');
  const [session, setSession] = useState<(Session & { messageCount: number }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => loadResearchPanelPrefs()?.leftPanelCollapsed ?? false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(() => loadResearchPanelPrefs()?.rightPanelCollapsed ?? true);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [showMobileSourcesPanel, setShowMobileSourcesPanel] = useState(false);
  const [showMobileWorkspacePanel, setShowMobileWorkspacePanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sources State
  const [sources, setSources] = useState<Source[]>([]);
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([]);
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [deepResearchMessageId, setDeepResearchMessageId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>('auto');

  // Citation Graph
  const [graphNodes, setGraphNodes] = useState<ClaimNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<ClaimEdge[]>([]);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);

  // Diagrams detected from AI responses
  const [detectedDiagrams, setDetectedDiagrams] = useState<{ id: string; code: string; detectedAt: string }[]>([]);

  // Right panel resize
  const [rightPanelWidth, setRightPanelWidth] = useState(() => loadResearchPanelPrefs()?.rightPanelWidth ?? 340);

  // Command Palette
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);

  // Workspace State
  const [pinnedNotes, setPinnedNotes] = useState<PinnedNote[]>([]);

  // Socket connection
  const {
    isConnected,
    messages,
    typingUsers,
    streamingMessageIds,
    sendMessage,
    startTyping,
    stopTyping,
    initMessages,
    appendMessage,
    updateMessage,
  } = useSocket(sessionId);

  // Build citation graph from current sources
  const handleBuildGraph = useCallback(async () => {
    if (!accessToken || !session) return;
    setIsLoadingGraph(true);
    try {
      const query = messages.length > 0
        ? messages[messages.length - 1]?.content?.slice(0, 300) || 'research'
        : 'research';
      const res = await api.buildCitationGraph(accessToken, {
        query,
        groupId: session.groupId ?? undefined,
      });
      setGraphNodes(res.graph?.nodes ?? []);
      setGraphEdges(res.graph?.edges ?? []);
    } catch (err) {
      console.error('Failed to build citation graph', err);
      addToast('Failed to build citation graph', 'error');
    } finally {
      setIsLoadingGraph(false);
    }
  }, [accessToken, session, messages, addToast]);

  // Handle mermaid diagrams detected in AI responses
  const handleDiagramDetected = useCallback((code: string) => {
    setDetectedDiagrams((prev) => {
      // Avoid duplicates by checking first 200 chars
      if (prev.some((d) => d.code.slice(0, 200) === code.slice(0, 200))) return prev;
      return [...prev, { id: `diag-${Date.now()}`, code, detectedAt: new Date().toISOString() }];
    });
  }, []);

  // Load pinned notes from localStorage
  useEffect(() => {
    if (sessionId) {
      setPinnedNotes(loadPinnedNotes(sessionId));
    }
  }, [sessionId]);

  // Persist panel preferences for desktop continuity.
  useEffect(() => {
    if (useOverlayPanels) return;

    saveResearchPanelPrefs({
      leftPanelCollapsed,
      rightPanelCollapsed,
      rightPanelWidth,
    });
  }, [leftPanelCollapsed, rightPanelCollapsed, rightPanelWidth, useOverlayPanels]);

  useEffect(() => {
    if (useOverlayPanels) return;

    setShowMobileSourcesPanel(false);
    setShowMobileWorkspacePanel(false);
  }, [useOverlayPanels]);

  // Keyboard shortcuts for quick command-driven workflows.
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const isEditable = !!target && (
        target.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select'
      );

      // Ctrl/Cmd + / opens command palette prefilled with slash trigger.
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        setInputMessage('/');
        setCommandQuery('/');
        setCommandActiveIndex(0);
        setShowCommandPalette(true);
        textareaRef.current?.focus();
        return;
      }

      // Ctrl/Cmd + Shift + W inserts workflow command scaffold.
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        setInputMessage('/workflow ');
        setCommandQuery('/workflow');
        setCommandActiveIndex(0);
        setShowCommandPalette(true);
        textareaRef.current?.focus();
        return;
      }

      // Escape closes palette when not in an editable field.
      if (!isEditable && event.key === 'Escape') {
        setShowCommandPalette(false);
        return;
      }

      // Ctrl/Cmd + Shift + L toggles sources panel.
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        if (useOverlayPanels) {
          setShowMobileSourcesPanel((prev) => !prev);
          return;
        }
        setLeftPanelCollapsed((prev) => !prev);
        return;
      }

      // Ctrl/Cmd + Shift + R toggles workspace panel.
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (useOverlayPanels) {
          setShowMobileWorkspacePanel((prev) => !prev);
          return;
        }
        setRightPanelCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [useOverlayPanels]);

  const quickCommandChips = useMemo(() => {
    return [
      { label: '/workflow', value: '/workflow ' },
      ...AGENTIC_SLASH_TASKS.slice(0, 4).map((task) => ({
        label: `/${task.value}`,
        value: `/${task.value} `,
      })),
    ];
  }, []);

  // Dynamic empty state suggestions
  const dynamicSuggestions = useMemo(() => {
    if (sources.length === 0) {
      return [
        'What are the key concepts in these papers?',
        'Compare the methodologies used',
        'Summarize the main findings',
      ];
    }

    const suggestions: string[] = [];
    const titles = sources.slice(0, 3).map((s) => s.title);

    if (titles.length >= 1) {
      const shortTitle = titles[0].length > 50 ? titles[0].slice(0, 50) + '…' : titles[0];
      suggestions.push(`Summarize "${shortTitle}"`);
    }
    if (titles.length >= 2) {
      const t1 = titles[0].length > 30 ? titles[0].slice(0, 30) + '…' : titles[0];
      const t2 = titles[1].length > 30 ? titles[1].slice(0, 30) + '…' : titles[1];
      suggestions.push(`Compare "${t1}" and "${t2}"`);
    }
    suggestions.push('What are the research gaps across these papers?');

    return suggestions;
  }, [sources]);

  // Source-aware header
  const sourceContextLabel = useMemo(() => {
    const enabled = sources.filter((s) => s.enabled);
    if (enabled.length === 0) return 'Chat';
    if (enabled.length === 1) {
      const t = enabled[0].title;
      return t.length > 30 ? t.slice(0, 30) + '…' : t;
    }
    if (enabled.length === 2) {
      const t1 = enabled[0].title.length > 20 ? enabled[0].title.slice(0, 20) + '…' : enabled[0].title;
      const t2 = enabled[1].title.length > 20 ? enabled[1].title.slice(0, 20) + '…' : enabled[1].title;
      return `${t1}, ${t2}`;
    }
    const t1 = enabled[0].title.length > 20 ? enabled[0].title.slice(0, 20) + '…' : enabled[0].title;
    return `${t1} +${enabled.length - 1} more`;
  }, [sources]);

  const workspaceArtifactCount = useMemo(() => {
    return pinnedNotes.length + detectedDiagrams.length + (graphNodes.length > 0 ? 1 : 0);
  }, [pinnedNotes.length, detectedDiagrams.length, graphNodes.length]);

  const openSourcesPanel = useCallback(() => {
    if (useOverlayPanels) {
      setShowMobileSourcesPanel(true);
      return;
    }
    setLeftPanelCollapsed(false);
  }, [useOverlayPanels]);

  const openWorkspacePanel = useCallback(() => {
    if (useOverlayPanels) {
      setShowMobileWorkspacePanel(true);
      return;
    }
    setRightPanelCollapsed(false);
  }, [useOverlayPanels]);

  // Fetch session, messages, and group papers
  useEffect(() => {
    async function fetchData() {
      if (!accessToken || !sessionId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const [sessionData, messagesData] = await Promise.all([
          api.getSession(accessToken, sessionId),
          api.getSessionMessages(accessToken, sessionId),
        ]);
        setSession(sessionData);
        initMessages(messagesData);

        // Fetch group papers as sources
        if (sessionData.groupId) {
          try {
            const papers = await api.getGroupPapers(accessToken, sessionData.groupId);
            const sourcesFromPapers: Source[] = papers.map((paper: GroupPaper) => ({
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
            }));
            setSources(sourcesFromPapers);
          } catch {
            // Papers might not be available, continue without them
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [accessToken, sessionId, initMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    }
  }, [inputMessage]);

  // Typing handlers
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputMessage(value);
      startTyping();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        stopTyping();
      }, 2000);

      // Command palette detection
      const lastWord = value.split(/\s/).pop() || '';
      if (lastWord.startsWith('/') || lastWord.startsWith('@')) {
        setShowCommandPalette(true);
        setCommandQuery(lastWord);
        setCommandActiveIndex(0);
      } else {
        setShowCommandPalette(false);
      }
    },
    [startTyping, stopTyping]
  );

  const handleCommandSelect = useCallback(
    (command: Command) => {
      // Replace the last word (command trigger) with the command prefix
      const words = inputMessage.split(/\s/);
      words.pop();
      const newInput = [...words, command.prefix + ' '].join(' ').trimStart();
      setInputMessage(newInput);
      setShowCommandPalette(false);
      textareaRef.current?.focus();
    },
    [inputMessage]
  );

  const handleSendMessage = useCallback(async () => {
    const rawMessage = inputMessage.trim();
    if (!rawMessage) return;

    const slashMatch = rawMessage.match(/^\/([a-z_]+)(?:\s+([\s\S]+))?$/i);
    if (slashMatch) {
      const slashCommand = slashMatch[1].toLowerCase();
      const slashArg = slashMatch[2]?.trim() || '';

      if (slashCommand === 'workflow') {
        if (!accessToken || !sessionId) {
          addToast('Please sign in to run workflows', 'error');
          return;
        }
        if (slashArg.length < 10) {
          addToast('Workflow usage: /workflow <goal (at least 10 chars)>', 'error');
          return;
        }

        appendMessage({
          id: `workflow-user-${Date.now()}`,
          sessionId,
          userId: user?.id || 'user',
          content: rawMessage,
          type: 'user',
          createdAt: new Date().toISOString(),
          userName: user?.name,
          userAvatar: user?.avatar,
        });

        setInputMessage('');
        stopTyping();
        setShowCommandPalette(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        try {
          const plan = await api.planWorkflow(accessToken, {
            goal: slashArg,
            groupId: session?.groupId,
            sessionId,
          });

          const stepLines = plan.steps
            .map((step) => `${step.is_checkpoint ? '⏸️' : '⬚'} Step ${step.step_index + 1}: ${step.name} (${step.agent_type})`)
            .join('\n');

          appendMessage({
            id: `workflow-plan-${Date.now()}`,
            sessionId,
            userId: null,
            content: `**🧭 ${plan.title}**\n\n${plan.description}\n\n- Research type: ${plan.research_type}\n- Estimated time: ~${plan.estimated_minutes} min\n- Steps: ${plan.steps.length}\n\n${stepLines}`,
            type: 'ai',
            createdAt: new Date().toISOString(),
            userName: 'Research Assistant',
            metadata: {
              task_type: 'workflow_plan',
              workflow_id: plan.workflow_id,
              planned: true,
            },
          });
          addToast('Workflow planned', 'success');
        } catch (err) {
          addToast(err instanceof Error ? err.message : 'Failed to plan workflow', 'error');
        }
        return;
      }

      if (!AGENTIC_SLASH_TASK_SET.has(slashCommand as AgenticTaskType)) {
        addToast('Unknown slash command. Use /workflow or /<agent_name> <prompt>.', 'error');
        return;
      }

      if (!slashArg) {
        addToast(`Usage: /${slashCommand} <prompt>`, 'error');
        return;
      }

      if (!accessToken || !sessionId) {
        addToast('Please sign in to run agentic tasks', 'error');
        return;
      }

      const taskType = slashCommand as AgenticTaskType;
      const promptWithTrigger = slashArg.toLowerCase().includes('@ai') ? slashArg : `@ai ${slashArg}`;
      const enabledPaperIds = sources
        .filter((source) => source.enabled && source.type === 'paper')
        .map((source) => source.id);

      const pendingMessageId = `agentic-${Date.now()}`;

      appendMessage({
        id: `agentic-user-${Date.now()}`,
        sessionId,
        userId: user?.id || 'user',
        content: rawMessage,
        type: 'user',
        createdAt: new Date().toISOString(),
        userName: user?.name,
        userAvatar: user?.avatar,
      });

      const label = AGENTIC_SLASH_TASKS.find((task) => task.value === taskType)?.label || 'Agentic Task';
      appendMessage({
        id: pendingMessageId,
        sessionId,
        userId: null,
        content: `${label} is running...`,
        type: 'ai',
        createdAt: new Date().toISOString(),
        userName: 'Research Assistant',
      });

      setInputMessage('');
      stopTyping();
      setShowCommandPalette(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      try {
        const response = await api.runAgenticTask(accessToken, {
          taskType,
          prompt: promptWithTrigger,
          groupId: session?.groupId,
          sessionId,
          paperIds: enabledPaperIds.length > 0 ? enabledPaperIds : undefined,
          options: {
            selected_source_count: enabledPaperIds.length,
          },
          agenticRunId: pendingMessageId,
        });

        const resultText = formatAgenticResult(response.result);
        updateMessage(pendingMessageId, {
          content: `## ${label}\n\n${resultText}`,
        });
        addToast('Agentic task completed', 'success');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Agentic task failed';
        updateMessage(pendingMessageId, { content: `Agentic task failed.\n\n${message}` });
        addToast(message, 'error');
      }

      return;
    }

    if (!isConnected) return;

    // Never auto-route to a specific agent for plain messages.
    // This prevents accidental agentic triggers from arbitrary slash-like text.
    sendMessage(rawMessage, 'auto');
    setInputMessage('');
    stopTyping();
    setShowCommandPalette(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [
    inputMessage,
    accessToken,
    sessionId,
    session?.groupId,
    user?.id,
    user?.name,
    user?.avatar,
    sources,
    isConnected,
    appendMessage,
    updateMessage,
    sendMessage,
    stopTyping,
    addToast,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommandPalette) {
      const filtered = COMMANDS.filter(
        (cmd) =>
          cmd.prefix.toLowerCase().includes(commandQuery.toLowerCase()) ||
          cmd.label.toLowerCase().includes(commandQuery.toLowerCase())
      );

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filtered[commandActiveIndex]) {
        e.preventDefault();
        handleCommandSelect(filtered[commandActiveIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Source handlers
  const handleToggleSource = useCallback((id: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  }, []);

  const handleToggleAll = useCallback((enabled: boolean) => {
    setSources((prev) => prev.map((s) => ({ ...s, enabled })));
  }, []);

  const handleDeleteSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleAddPaperToSources = useCallback((url: string, title: string) => {
    // Avoid duplicate sources by URL
    setSources((prev) => {
      if (prev.some((s) => s.url === url)) {
        addToast('Source already added', 'info');
        return prev;
      }
      addToast(`Added: ${title.slice(0, 40)}…`, 'success');
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
  }, [addToast]);

  // Pin handlers
  const handlePinMessage = useCallback(
    (messageId: string, content: string) => {
      if (!sessionId) return;
      const existing = pinnedNotes.find((n) => n.messageId === messageId);
      if (existing) {
        addToast('Already pinned', 'info');
        return;
      }

      const newNote: PinnedNote = {
        id: `pin-${Date.now()}`,
        messageId,
        content,
        userName: 'Research Assistant',
        pinnedAt: new Date().toISOString(),
      };
      const updated = [newNote, ...pinnedNotes];
      setPinnedNotes(updated);
      savePinnedNotes(sessionId, updated);
      openWorkspacePanel();
      addToast('Pinned to Workspace', 'success');
    },
    [sessionId, pinnedNotes, addToast, openWorkspacePanel]
  );

  const handleRemoveNote = useCallback(
    (noteId: string) => {
      if (!sessionId) return;
      const updated = pinnedNotes.filter((n) => n.id !== noteId);
      setPinnedNotes(updated);
      savePinnedNotes(sessionId, updated);
    },
    [sessionId, pinnedNotes]
  );

  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Studio handlers
  const handleGenerateReport = useCallback(async () => {
    if (!accessToken || !session?.groupId) return;

    openWorkspacePanel();

    try {
      const result = await api.generateGroupReport(accessToken, session.groupId);
      setStudioOutputs((prev) => [
        {
          id: result.reportId,
          type: 'report' as const,
          title: result.title,
          status: result.status === 'completed' ? 'ready' as const : 'generating' as const,
          createdAt: result.createdAt,
          downloadUrl: result.downloadUrl || undefined,
        },
        ...prev,
      ]);
      addToast('Report generated successfully', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to generate report', 'error');
    }
  }, [accessToken, session?.groupId, addToast, openWorkspacePanel]);

  const handleDeepResearch = useCallback(async () => {
    if (!accessToken || !sessionId || !session?.groupId) {
      addToast('Deep research requires an active group session', 'error');
      return;
    }

    const enabledPaperIds = sources
      .filter((source) => source.enabled && source.type === 'paper')
      .map((source) => source.id);

    const prompt = `@ai Deep research on "${session.title}". Focus on the selected sources and provide a comprehensive synthesis with citations.`;
    const pendingMessageId = `agentic-${Date.now()}`;

    setIsDeepResearching(true);
    setDeepResearchMessageId(pendingMessageId);

    appendMessage({
      id: pendingMessageId,
      sessionId,
      userId: 'ai',
      content: 'Deep Research is running…\n\nI will share a comprehensive report shortly.',
      type: 'ai',
      createdAt: new Date().toISOString(),
      userName: 'Research Assistant',
    });

    try {
      const response = await api.runAgenticTask(accessToken, {
        taskType: 'deep_research',
        prompt,
        groupId: session.groupId,
        sessionId,
        paperIds: enabledPaperIds.length > 0 ? enabledPaperIds : undefined,
        options: {
          selected_source_count: enabledPaperIds.length,
        },
      });

      const deepResearch =
        (response.result?.deep_research as string | undefined) ||
        (response.result?.report as string | undefined) ||
        JSON.stringify(response.result || {}, null, 2);

      // Artifacts and latency stored in metadata, not rendered in markdown
      const content = deepResearch;

      updateMessage(pendingMessageId, { content });
      addToast('Deep research completed', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deep research failed';
      updateMessage(pendingMessageId, { content: `Deep research failed.\n\n${message}` });
      addToast(message, 'error');
    } finally {
      setIsDeepResearching(false);
      setDeepResearchMessageId(null);
    }
  }, [accessToken, sessionId, session?.groupId, session?.title, sources, appendMessage, updateMessage, addToast]);

  // Message handlers
  const handleFeedback = useCallback(
    (messageId: string, feedback: 'up' | 'down') => {
      addToast(`Feedback recorded: ${feedback === 'up' ? 'Helpful' : 'Not helpful'}`, 'success');
    },
    [addToast]
  );

  const handleCopy = useCallback(
    (content: string) => {
      navigator.clipboard.writeText(content);
      addToast('Copied to clipboard', 'success');
    },
    [addToast]
  );

  const handleCitationClick = useCallback((citation: Citation) => {
    const sourceElement = document.getElementById(`source-${citation.sourceId}`);
    if (sourceElement) {
      sourceElement.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleSelectPrompt = useCallback(
    (prompt: string) => {
      setInputMessage(`@ai ${prompt}`);
      textareaRef.current?.focus();
    },
    []
  );

  // Loading state
  if (isLoading) {
    return <ResearchSkeleton />;
  }

  // Error state
  if (error || !session || !sessionId) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          {error && (
            <div
              className="rounded-xl p-4 mb-6 inline-block"
              style={{
                background: 'var(--color-error-bg)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <p style={{ color: 'var(--color-error)' }}>{error}</p>
            </div>
          )}
          <h2
            className="text-2xl font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Session not found
          </h2>
          <Link href="/home">
            <Button className="mt-6">Back to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  const enabledSources = sources.filter((s) => s.enabled);
  const showEmptyState = messages.length === 0;
  const selectedAgentLabel = selectedAgent === 'auto'
    ? 'Auto routing'
    : selectedAgent
        .split('_')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');

  return (
    <PaperContextMenuProvider onAddToSources={handleAddPaperToSources}>
    <div className="flex flex-col overflow-hidden" style={{ background: 'var(--color-bg-primary)', height: '100dvh' }}>
      <Navbar />

      {/* Main Three-Column Layout */}
      <div className={useOverlayPanels ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'flex-1 min-h-0 flex items-stretch gap-3 overflow-hidden p-3'}>
        {/* Left Sidebar - Sources Panel */}
        {!useOverlayPanels && (
          <SourcesPanel
            sources={sources}
            onToggleSource={handleToggleSource}
            onDeleteSource={handleDeleteSource}
            onToggleAll={handleToggleAll}
            onAddSource={() => setShowAddSourceModal(true)}
            selectedAgent={selectedAgent}
            onAgentChange={setSelectedAgent}
            isCollapsed={leftPanelCollapsed}
            onToggleCollapse={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
          />
        )}

        {/* Center - Chat Panel */}
        <div className={`flex-1 min-h-0 flex flex-col min-w-0 self-stretch overflow-hidden research-chat-shell ${useOverlayPanels ? 'rounded-none border-x-0 border-b-0 shadow-none' : ''}`}>
          {/* Chat Header — Source-Aware */}
          <div
            className="sticky top-0 z-20 px-6 py-4 border-b research-chat-header"
            style={{
              borderColor: 'var(--color-border-primary)',
              background: 'var(--glass-bg-strong)',
              backdropFilter: 'blur(14px)',
            }}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p
                  className="text-[11px] uppercase tracking-[0.24em] mb-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Research Workspace
                </p>
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h1
                    className="text-[20px] font-semibold truncate"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {session.title}
                  </h1>
                  <span
                    className="text-[11px] px-2 py-1 rounded-full shrink-0"
                    style={{
                      background: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border-primary)',
                    }}
                  >
                    {sourceContextLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="research-header-meta-pill">
                    {enabledSources.length} active source{enabledSources.length !== 1 ? 's' : ''}
                  </span>
                  <span className="research-header-meta-pill">
                    {messages.length} message{messages.length !== 1 ? 's' : ''}
                  </span>
                  <span className="research-header-meta-pill">
                    {selectedAgentLabel}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 lg:justify-end">
              {useOverlayPanels && (
                <>
                  <button
                    type="button"
                    onClick={openSourcesPanel}
                    className="research-header-action research-header-action--compact lg:hidden"
                  >
                    <FileText size={15} />
                    <span>Sources</span>
                    <span className="research-action-badge">{enabledSources.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={openWorkspacePanel}
                    className="research-header-action research-header-action--compact lg:hidden"
                  >
                    <Copy size={15} />
                    <span>Workspace</span>
                    <span className="research-action-badge">{workspaceArtifactCount}</span>
                  </button>
                </>
              )}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                style={{
                  background: isConnected ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                  color: isConnected ? 'var(--color-success)' : 'var(--color-error)',
                }}
              >
                {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>

              <button
                type="button"
                onClick={() => setShowAddSourceModal(true)}
                className="research-header-action hidden lg:inline-flex"
              >
                <PlusCircle size={16} />
                <span>Add Source</span>
              </button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto research-panel-scroll research-chat-scroll-area">
            <div className="research-chat-stage">
              <div className="mx-auto px-4 py-6 md:px-5 md:py-8" style={{ maxWidth: RESEARCH_CHAT_CONTENT_MAX_WIDTH }}>
              {/* Empty State with dynamic suggestions */}
              {showEmptyState && (
                <div className="research-empty-state">
                  <div className="research-empty-state-header">
                    <div className="research-empty-state-icon">
                      <Bot size={20} style={{ color: 'var(--color-brand-primary)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="research-empty-state-kicker">
                        Research companion
                      </p>
                      <h1 className="research-empty-state-title">
                        Use your selected sources to produce a concrete research output.
                      </h1>
                      <p className="text-[13px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                        {session.title}
                      </p>
                      <p className="research-empty-state-copy">
                        Ask for synthesis, method comparisons, contradictions, evidence tables, or next-step plans. The thread keeps notes, diagrams, and citations attached as you iterate.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-4">
                        <span className="research-header-meta-pill">{enabledSources.length} sources attached</span>
                        <span className="research-header-meta-pill">Ask for comparisons, gaps, or synthesis</span>
                      </div>
                    </div>
                  </div>

                  <div className="research-suggestion-grid">
                    {dynamicSuggestions.map((question, index) => (
                      <button
                        key={index}
                        onClick={() => handleSelectPrompt(question)}
                        className="research-suggestion-card"
                      >
                        <span className="research-suggestion-label">Try this</span>
                        <span className="research-suggestion-text">{question}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="space-y-4 md:space-y-5">
              {messages.map((msg) => {
                const isCurrentUser = msg.userId === user?.id;
                const isAI = msg.type === 'ai';
                const isAgenticPending = deepResearchMessageId === msg.id && isAI;

                return (
                  <div key={msg.id} data-message-id={msg.id}>
                    <ResearchMessage
                      id={msg.id}
                      content={msg.content}
                      type={isAI ? 'ai' : 'user'}
                      userName={msg.userName}
                      userAvatar={msg.userAvatar}
                      timestamp={new Date(msg.createdAt)}
                      isCurrentUser={isCurrentUser}
                      isStreaming={streamingMessageIds.has(msg.id)}
                      onFeedback={isAI ? handleFeedback : undefined}
                      onCopy={handleCopy}
                      onPin={isAI ? handlePinMessage : undefined}
                      onCitationClick={handleCitationClick}
                      onDiagramDetected={isAI ? handleDiagramDetected : undefined}
                      className={isAgenticPending ? 'ai-thinking-animation' : ''}
                    />
                  </div>
                );
              })}
              </div>

              {/* Typing indicator */}
              {typingUsers.length > 0 && !typingUsers.some((u) => u.userId === 'ai') && (
                <div
                  className="flex items-center gap-3 py-3 px-4 mt-4 animate-fade-in research-typing-indicator"
                >
                  <div className="flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: 'var(--color-brand-secondary)', animationDelay: '0ms' }}
                    />
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: 'var(--color-brand-secondary)', animationDelay: '200ms' }}
                    />
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: 'var(--color-brand-secondary)', animationDelay: '400ms' }}
                    />
                  </div>
                  <span
                    className="text-[12px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {typingUsers.map((u) => u.userName).join(', ')}{' '}
                    {typingUsers.length === 1 ? 'is' : 'are'} typing…
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
            </div>
          </div>

          {/* Input Area */}
          <div
            className="sticky bottom-0 z-20 px-4 py-4 md:px-5 border-t research-composer-wrap"
            style={{
              borderColor: 'var(--color-border-primary)',
              background: 'var(--glass-bg-strong)',
              backdropFilter: 'blur(18px)',
            }}
          >
            <div className="mx-auto relative" style={{ maxWidth: RESEARCH_CHAT_CONTENT_MAX_WIDTH }}>
              {/* Command Palette */}
              {showCommandPalette && (
                <CommandPalette
                  query={commandQuery}
                  activeIndex={commandActiveIndex}
                  onSelect={handleCommandSelect}
                />
              )}

              {!isConnected && (
                <div
                  className="flex items-center justify-center mb-3 text-sm px-4 py-2 rounded-xl"
                  style={{
                    color: 'var(--color-warning)',
                    background: 'var(--color-warning-bg)',
                  }}
                >
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Connecting to session…
                </div>
              )}
              <div
                className="research-composer"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-primary)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-brand-secondary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20, 255, 236, 0.08), 0 12px 28px rgba(0, 0, 0, 0.18)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-primary)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a research question… (type / or @ for commands)"
                  disabled={!isConnected}
                  rows={1}
                  className="flex-1 bg-transparent text-[15px] disabled:opacity-50 research-textarea"
                  style={{ color: 'var(--color-text-primary)' }}
                />

                <div className="flex items-center gap-2 shrink-0 self-end pb-1">
                  <span className="research-composer-pill">
                    {enabledSources.length} sources
                  </span>
                  <span className="research-composer-pill research-composer-pill--muted">
                    {selectedAgentLabel}
                  </span>

                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || !isConnected}
                    className="research-send-button disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    style={{
                      background: inputMessage.trim()
                        ? 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary))'
                        : 'var(--color-bg-tertiary)',
                      color: inputMessage.trim()
                        ? 'var(--color-bg-primary)'
                        : 'var(--color-text-muted)',
                      boxShadow: inputMessage.trim() ? '0 14px 28px rgba(13, 115, 119, 0.28)' : 'none',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {quickCommandChips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      setInputMessage(chip.value);
                      setCommandQuery(chip.value.trim());
                      setCommandActiveIndex(0);
                      setShowCommandPalette(true);
                      textareaRef.current?.focus();
                    }}
                    className="research-command-chip"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <p
                className="text-[11px] mt-3"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <span>Press </span>
                <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Ctrl/Cmd + /</kbd>
                <span> for commands, </span>
                <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Ctrl/Cmd + Shift + L</kbd>
                <span> and </span>
                <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Ctrl/Cmd + Shift + R</kbd>
                <span> for panels. OpenResearch can be inaccurate; please double-check its responses.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Workspace Panel */}
        {!useOverlayPanels && (
          <StudioPanel
            isCollapsed={rightPanelCollapsed}
            onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            width={rightPanelWidth}
            onResize={setRightPanelWidth}
            hasSourcesSelected={enabledSources.length > 0}
            pinnedNotes={pinnedNotes}
            onRemoveNote={handleRemoveNote}
            onScrollToMessage={handleScrollToMessage}
            detectedDiagrams={detectedDiagrams}
            graphNodes={graphNodes}
            graphEdges={graphEdges}
            isLoadingGraph={isLoadingGraph}
            onBuildGraph={handleBuildGraph}
            groupId={session?.groupId ?? undefined}
            sessionId={sessionId ?? undefined}
          />
        )}
      </div>

      {useOverlayPanels && (
        <>
          <Modal
            isOpen={showMobileSourcesPanel}
            onClose={() => setShowMobileSourcesPanel(false)}
            title="Sources"
            size="xl"
            className="max-w-4xl h-[calc(100dvh-1rem)] sm:h-auto"
            bodyClassName="p-0 sm:p-0"
          >
            <SourcesPanel
              sources={sources}
              onToggleSource={handleToggleSource}
              onDeleteSource={handleDeleteSource}
              onToggleAll={handleToggleAll}
              onAddSource={() => {
                setShowMobileSourcesPanel(false);
                setShowAddSourceModal(true);
              }}
              selectedAgent={selectedAgent}
              onAgentChange={setSelectedAgent}
              onToggleCollapse={() => setShowMobileSourcesPanel(false)}
              variant="overlay"
            />
          </Modal>

          <Modal
            isOpen={showMobileWorkspacePanel}
            onClose={() => setShowMobileWorkspacePanel(false)}
            title="Workspace"
            size="xl"
            className="max-w-4xl h-[calc(100dvh-1rem)] sm:h-auto"
            bodyClassName="p-0 sm:p-0"
          >
            <StudioPanel
              onToggleCollapse={() => setShowMobileWorkspacePanel(false)}
              hasSourcesSelected={enabledSources.length > 0}
              pinnedNotes={pinnedNotes}
              onRemoveNote={handleRemoveNote}
              onScrollToMessage={handleScrollToMessage}
              detectedDiagrams={detectedDiagrams}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              isLoadingGraph={isLoadingGraph}
              onBuildGraph={handleBuildGraph}
              groupId={session?.groupId ?? undefined}
              sessionId={sessionId ?? undefined}
              variant="overlay"
            />
          </Modal>
        </>
      )}

      {/* Add Source Modal */}
      <Modal
        isOpen={showAddSourceModal}
        onClose={() => setShowAddSourceModal(false)}
        title="Add Sources"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Add papers from your group collection or import new sources.
          </p>
          <div className="flex flex-col gap-2">
            <Link href={`/group-papers?groupId=${session.groupId}`}>
              <Button variant="secondary" className="w-full justify-start">
                <FileText size={16} className="mr-2" />
                Browse Group Papers
              </Button>
            </Link>
            <Link href="/discover">
              <Button variant="secondary" className="w-full justify-start">
                <PlusCircle size={16} className="mr-2" />
                Discover New Papers
              </Button>
            </Link>
          </div>
        </div>
      </Modal>
      <PaperLinkContextMenu />
    </div>
    </PaperContextMenuProvider>
  );
}

export default function ResearchChatPage() {
  return (
    <Suspense fallback={<ResearchSkeleton />}>
      <ResearchChatContent />
    </Suspense>
  );
}
