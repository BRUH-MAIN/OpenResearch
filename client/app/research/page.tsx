'use client';

import React, { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Modal } from '@/components/ui';
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
} from '@/components/research';

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

  // Sources State (from group papers)
  const [sources, setSources] = useState<Source[]>([]);
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([]);
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [deepResearchMessageId, setDeepResearchMessageId] = useState<string | null>(null);

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
    },
    [startTyping, stopTyping]
  );

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim() || !isConnected) return;

    sendMessage(inputMessage.trim());
    setInputMessage('');
    stopTyping();

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [inputMessage, isConnected, sendMessage, stopTyping]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    },
    []
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 size={48} className="animate-spin mb-4" style={{ color: 'var(--color-brand-secondary)' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>Loading research session…</p>
        </div>
      </div>
    );
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
          {/* Chat Header */}
          <div
            className="flex items-center justify-between px-6 py-3 border-b"
            style={{ borderColor: 'var(--color-border-primary)' }}
          >
            <span
              className="text-[15px] font-medium"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Chat
            </span>
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
              {/* Empty State */}
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
                    {[
                      'What are the key concepts in these papers?',
                      'Compare the methodologies used',
                      'Summarize the main findings',
                    ].map((question, index) => (
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
                  <ResearchMessage
                    key={msg.id}
                    id={msg.id}
                    content={msg.content}
                    type={isAI ? 'ai' : 'user'}
                    userName={msg.userName}
                    userAvatar={msg.userAvatar}
                    timestamp={new Date(msg.createdAt)}
                    isCurrentUser={isCurrentUser}
                    onFeedback={isAI ? handleFeedback : undefined}
                    onCopy={handleCopy}
                    onCitationClick={handleCitationClick}
                    className={isAgenticPending ? 'ai-thinking-animation' : ''}
                  />
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
            <div className="max-w-3xl mx-auto">
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
                className="flex items-center gap-3 px-5 py-3 rounded-full transition-all"
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
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a research question…"
                  disabled={!isConnected}
                  className="flex-1 bg-transparent text-[14px] focus:outline-none disabled:opacity-50"
                  style={{ color: 'var(--color-text-primary)' }}
                />

                <span
                  className="px-3 py-1 rounded-full text-[12px] whitespace-nowrap"
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
                  className="p-2 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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

        {/* Right Sidebar - Outputs Panel */}
        <StudioPanel
          outputs={studioOutputs}
          onGenerateReport={handleGenerateReport}
          hasSourcesSelected={enabledSources.length > 0}
          isCollapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
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
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
          <Navbar />
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 size={48} className="animate-spin mb-4" style={{ color: 'var(--color-brand-secondary)' }} />
            <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          </div>
        </div>
      }
    >
      <ResearchChatContent />
    </Suspense>
  );
}
