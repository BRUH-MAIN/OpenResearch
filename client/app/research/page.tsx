'use client';

import React, { useState, useRef, useEffect, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Modal } from '@/components/ui';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Loader2, FileText, PlusCircle, Bot, Copy, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Session, GroupPaper } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { useToastStore } from '@/lib/toast';

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
import type { PinnedNote } from '@/components/research';
import type { TimelineEvent } from '@/components/research';

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

// ==================== Main Component ====================

function ResearchChatContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const { accessToken, user } = useAuthStore();
  const { addToast } = useToastStore();

  // UI State
  const [inputMessage, setInputMessage] = useState('');
  const [session, setSession] = useState<(Session & { messageCount: number }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sources State
  const [sources, setSources] = useState<Source[]>([]);
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([]);
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [deepResearchMessageId, setDeepResearchMessageId] = useState<string | null>(null);

  // Command Palette
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);

  // Workspace State
  const [pinnedNotes, setPinnedNotes] = useState<PinnedNote[]>([]);
  const [outline, setOutline] = useState<string | null>(null);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

  // Socket connection
  const {
    isConnected,
    messages,
    typingUsers,
    sendMessage,
    startTyping,
    stopTyping,
    initMessages,
    appendMessage,
    updateMessage,
  } = useSocket(sessionId);

  // Load pinned notes from localStorage
  useEffect(() => {
    if (sessionId) {
      setPinnedNotes(loadPinnedNotes(sessionId));
    }
  }, [sessionId]);

  // Build timeline events
  const timelineEvents: TimelineEvent[] = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Session created
    if (session) {
      events.push({
        id: 'session-created',
        type: 'session_created',
        title: `Session "${session.title}" created`,
        timestamp: session.createdAt,
      });
    }

    // Sources added
    sources.forEach((source) => {
      events.push({
        id: `source-${source.id}`,
        type: 'source_added',
        title: `Added "${source.title.length > 40 ? source.title.slice(0, 40) + '…' : source.title}"`,
        timestamp: source.addedAt,
      });
    });

    // Reports generated
    studioOutputs.forEach((output) => {
      events.push({
        id: `report-${output.id}`,
        type: 'report_generated',
        title: output.title,
        description: output.status === 'generating' ? 'In progress…' : undefined,
        timestamp: output.createdAt,
      });
    });

    // Sort chronologically (newest first)
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return events;
  }, [session, sources, studioOutputs]);

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

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim() || !isConnected) return;

    sendMessage(inputMessage.trim());
    setInputMessage('');
    stopTyping();
    setShowCommandPalette(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [inputMessage, isConnected, sendMessage, stopTyping]);

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
      setRightPanelCollapsed(false);
      addToast('Pinned to Workspace', 'success');
    },
    [sessionId, pinnedNotes, addToast]
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

    setRightPanelCollapsed(false);

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
  }, [accessToken, session?.groupId, addToast]);

  // Outline handler
  const handleGenerateOutline = useCallback(async () => {
    if (!accessToken || !sessionId || !session?.groupId) return;

    setIsGeneratingOutline(true);
    setRightPanelCollapsed(false);

    try {
      const enabledPaperIds = sources
        .filter((s) => s.enabled && s.type === 'paper')
        .map((s) => s.id);

      const response = await api.runAgenticTask(accessToken, {
        taskType: 'research_planning',
        prompt: `Generate a structured research outline for "${session.title}" based on the selected sources. Include sections, subsections, and key points to cover.`,
        groupId: session.groupId,
        sessionId,
        paperIds: enabledPaperIds.length > 0 ? enabledPaperIds : undefined,
      });

      const outlineText =
        (response.result?.outline as string) ||
        (response.result?.report as string) ||
        (response.result?.research_planning as string) ||
        JSON.stringify(response.result || {}, null, 2);

      setOutline(outlineText);
      addToast('Outline generated', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to generate outline', 'error');
    } finally {
      setIsGeneratingOutline(false);
    }
  }, [accessToken, sessionId, session?.groupId, session?.title, sources, addToast]);

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

      const artifacts = response.artifacts?.length
        ? `\n\n**Artifacts**\n${response.artifacts.map((artifactId) => `- ${artifactId}`).join('\n')}`
        : '';

      const content = `### Deep Research Report\n\n${deepResearch}${artifacts}\n\n_Completed in ${response.latency_ms}ms_`;

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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      {/* Main Three-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Sources Panel */}
        <SourcesPanel
          sources={sources}
          onToggleSource={handleToggleSource}
          onToggleAll={handleToggleAll}
          onAddSource={() => setShowAddSourceModal(true)}
          onDeepResearch={handleDeepResearch}
          isDeepResearching={isDeepResearching}
          isCollapsed={leftPanelCollapsed}
          onToggleCollapse={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
        />

        {/* Center - Chat Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header — Source-Aware */}
          <div
            className="flex items-center justify-between px-6 py-3 border-b"
            style={{ borderColor: 'var(--color-border-primary)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-[15px] font-medium truncate"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {sourceContextLabel}
              </span>
              {enabledSources.length > 0 && (
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded-full shrink-0"
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {enabledSources.length} source{enabledSources.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
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
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto research-panel-scroll">
            <div className="max-w-3xl mx-auto px-6 py-6">
              {/* Empty State with dynamic suggestions */}
              {showEmptyState && (
                <div className="py-8">
                  <div className="mb-6">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                      <Bot size={32} style={{ color: 'var(--color-brand-primary)' }} />
                    </div>
                  </div>
                  <h1
                    className="text-[28px] font-normal leading-tight mb-3"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {session.title}
                  </h1>
                  <p
                    className="text-[14px] mb-5"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {enabledSources.length} sources · Ready to research
                  </p>
                  <p
                    className="text-[15px] leading-relaxed mb-8"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    Add sources from your group papers or ask me anything about your research topic.
                  </p>

                  <div className="space-y-2.5">
                    {dynamicSuggestions.map((question, index) => (
                      <button
                        key={index}
                        onClick={() => handleSelectPrompt(question)}
                        className="w-full text-left px-5 py-4 rounded-2xl text-[14px] leading-relaxed transition-all card-base card-interactive"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
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
                      onFeedback={isAI ? handleFeedback : undefined}
                      onCopy={handleCopy}
                      onPin={isAI ? handlePinMessage : undefined}
                      onCitationClick={handleCitationClick}
                      className={isAgenticPending ? 'ai-thinking-animation' : ''}
                    />
                  </div>
                );
              })}

              {/* Typing indicator */}
              {typingUsers.length > 0 && !typingUsers.some((u) => u.userId === 'ai') && (
                <div
                  className="flex items-center gap-3 py-3 px-4 animate-fade-in"
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

          {/* Input Area */}
          <div
            className="px-6 py-4 border-t"
            style={{
              borderColor: 'var(--color-border-primary)',
              background: 'var(--color-bg-primary)',
            }}
          >
            <div className="max-w-3xl mx-auto relative">
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
                className="flex items-end gap-3 px-5 py-3 rounded-2xl transition-all"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-primary)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-brand-secondary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20, 255, 236, 0.1)';
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
                  className="flex-1 bg-transparent text-[14px] disabled:opacity-50 research-textarea"
                  style={{ color: 'var(--color-text-primary)' }}
                />

                <span
                  className="px-3 py-1 rounded-full text-[12px] whitespace-nowrap shrink-0"
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {enabledSources.length} sources
                </span>

                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || !isConnected}
                  className="p-2 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  style={{
                    background: inputMessage.trim()
                      ? 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary))'
                      : 'var(--color-bg-tertiary)',
                    color: inputMessage.trim()
                      ? 'var(--color-bg-primary)'
                      : 'var(--color-text-muted)',
                    boxShadow: inputMessage.trim() ? '0 0 12px rgba(20, 255, 236, 0.2)' : 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <p
                className="text-[11px] text-center mt-3"
                style={{ color: 'var(--color-text-muted)' }}
              >
                OpenResearch can be inaccurate; please double-check its responses.
              </p>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Workspace Panel */}
        <StudioPanel
          outputs={studioOutputs}
          onGenerateReport={handleGenerateReport}
          hasSourcesSelected={enabledSources.length > 0}
          isCollapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          pinnedNotes={pinnedNotes}
          onRemoveNote={handleRemoveNote}
          onScrollToMessage={handleScrollToMessage}
          timelineEvents={timelineEvents}
          sources={sources}
          outline={outline}
          isGeneratingOutline={isGeneratingOutline}
          onGenerateOutline={handleGenerateOutline}
          onCopy={handleCopy}
          onToast={(msg) => addToast(msg, 'success')}
        />
      </div>

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
    </div>
  );
}

export default function ResearchChatPage() {
  return (
    <Suspense fallback={<ResearchSkeleton />}>
      <ResearchChatContent />
    </Suspense>
  );
}
