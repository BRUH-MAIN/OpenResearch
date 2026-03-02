'use client';

import React, { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Bot,
  Copy,
  Plus,
  Wifi,
  WifiOff,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Session, GroupPaper, AgenticTaskType, AgenticRunResponse, IntentClassifiedEvent, MethodologyRow, ReviewerCritique } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { useToastStore } from '@/lib/toast';
import { Button, Modal } from '@/components/ui';

import {
  SourcesPanel,
  StudioPanel,
  ResearchMessage,
  Source,
  StudioOutput,
  IntentBanner,
  MethodologyMatrix,
  ReviewerCritiques,
} from '@/components/research';

// Default suggested questions
const DEFAULT_QUESTIONS = [
  'How did Transformers overcome the limitations of recurrent neural networks?',
  'What are the core components of the original Transformer architecture?',
  'Can you explain the mathematical causes of hallucinations in LLMs?',
];

const AGENTIC_TASKS: { value: AgenticTaskType; label: string; description: string }[] = [
  { value: 'paper_retrieval', label: 'Paper Retrieval', description: 'Find and rank relevant papers.' },
  { value: 'literature_survey', label: 'Literature Survey', description: 'Synthesize a structured review.' },
  { value: 'gap_analysis', label: 'Gap Analysis', description: 'Identify research gaps and opportunities.' },
  { value: 'fact_check', label: 'Fact Check', description: 'Verify claims against available context.' },
  { value: 'novelty_assessment', label: 'Novelty Assessment', description: 'Assess novelty vs existing work.' },
  { value: 'research_mentor', label: 'Research Mentor', description: 'Provide mentoring and next steps.' },
  { value: 'paper_writing', label: 'Paper Writing', description: 'Draft outline and starter content.' },
  { value: 'research_planning', label: 'Research Planning', description: 'Create a milestone-based plan.' },
  { value: 'deep_research', label: 'Deep Research', description: 'Multi-hop synthesis across papers.' },
  { value: 'methodology_extraction', label: 'Methodology Extraction', description: 'Compare study designs across papers.' },
  { value: 'reviewer_anticipation', label: 'Reviewer Anticipation', description: 'Predict peer-review critiques.' },
];

function ChatPageContent() {
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
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [showAgenticDropdown, setShowAgenticDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sources State
  const [sources, setSources] = useState<Source[]>([]);
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([]);
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [deepResearchMessageId, setDeepResearchMessageId] = useState<string | null>(null);
  const [agenticMode, setAgenticMode] = useState(false);
  const [agenticTask, setAgenticTask] = useState<AgenticTaskType>('literature_survey');
  const [isAgenticRunning, setIsAgenticRunning] = useState(false);
  const [methodologyRows, setMethodologyRows] = useState<MethodologyRow[]>([]);
  const [reviewerCritiques, setReviewerCritiques] = useState<ReviewerCritique[]>([]);
  const [lastAgenticTaskType, setLastAgenticTaskType] = useState<AgenticTaskType | null>(null);

  // Socket connection
  const {
    isConnected,
    messages,
    typingUsers,
    aiError,
    intentEvent,
    sendMessage,
    startTyping,
    stopTyping,
    initMessages,
    appendMessage,
    updateMessage,
    clearAIError,
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
            // Papers might not be available
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Typing handlers
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleInputChange = useCallback((value: string) => {
    setInputMessage(value);
    startTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => stopTyping(), 2000);
  }, [startTyping, stopTyping]);

  const getAgenticLabel = useCallback((task: AgenticTaskType) => {
    return AGENTIC_TASKS.find((t) => t.value === task)?.label || 'Agentic Task';
  }, []);

  const formatAgenticResponse = useCallback((response: AgenticRunResponse): string => {
    const label = getAgenticLabel(response.task_type);
    const result = response.result as Record<string, unknown> | string | undefined;

    let body = '';
    if (typeof result === 'string') {
      body = result;
    } else if (result && typeof result === 'object') {
      const sections: Array<{ key: string; title: string }> = [
        { key: 'deep_research', title: 'Deep Research' },
        { key: 'literature_review', title: 'Literature Review' },
        { key: 'research_gaps', title: 'Research Gaps' },
        { key: 'fact_check', title: 'Fact Check' },
        { key: 'novelty', title: 'Novelty Assessment' },
        { key: 'mentor_advice', title: 'Mentor Advice' },
        { key: 'paper_draft', title: 'Paper Draft' },
        { key: 'research_plan', title: 'Research Plan' },
        { key: 'methodology_matrix', title: 'Methodology Comparison' },
        { key: 'reviewer_critiques', title: 'Anticipated Reviewer Critiques' },
        { key: 'papers', title: 'Papers' },
        { key: 'result', title: 'Result' },
      ];

      const parts: string[] = [];
      sections.forEach(({ key, title }) => {
        if (!(key in result)) return;
        const value = (result as Record<string, unknown>)[key];
        if (value == null) return;

        let sectionBody = '';
        if (Array.isArray(value)) {
          sectionBody = value
            .map((item) => (typeof item === 'string' ? `- ${item}` : `- ${JSON.stringify(item)}`))
            .join('\n');
        } else if (typeof value === 'string') {
          sectionBody = value;
        } else {
          sectionBody = JSON.stringify(value, null, 2);
        }

        parts.push(`### ${title}\n\n${sectionBody}`);
      });

      body = parts.join('\n\n');
    }

    if (!body) {
      body = JSON.stringify(result || {}, null, 2);
    }

    const artifacts = response.artifacts?.length
      ? `\n\n**Artifacts**\n${response.artifacts.map((artifactId) => `- ${artifactId}`).join('\n')}`
      : '';

    const latency = response.latency_ms ? `\n\n_Completed in ${response.latency_ms}ms_` : '';

    return `## ${label}\n\n${body}${artifacts}${latency}`;
  }, [getAgenticLabel]);

  const parseAgenticCommand = useCallback((message: string) => {
    const match = message.trim().match(/^\/agent(?:ic)?\s+(\S+)\s+([\s\S]+)$/i);
    if (!match) return null;
    const rawTask = match[1].toLowerCase().replace(/-/g, '_');
    const prompt = match[2].trim();
    if (!prompt) return null;
    const task = AGENTIC_TASKS.find((t) => t.value === rawTask)?.value as AgenticTaskType | undefined;
    if (!task) return null;
    return { task, prompt };
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || !sessionId) return;

    const rawMessage = inputMessage.trim();
    const command = parseAgenticCommand(rawMessage);
    const shouldRunAgentic = agenticMode || Boolean(command);

    if (!shouldRunAgentic) {
      if (!isConnected) return;
      sendMessage(rawMessage);
      setInputMessage('');
      stopTyping();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }

    if (!accessToken) {
      addToast('Please sign in to run agentic tasks', 'error');
      return;
    }

    const taskType = command?.task ?? agenticTask;
    const prompt = command?.prompt ?? rawMessage;
    const promptWithTrigger = prompt.toLowerCase().includes('@ai') ? prompt : `@ai ${prompt}`;

    const enabledPaperIds = sources
      .filter((source) => source.enabled && source.type === 'paper')
      .map((source) => source.id);

    const pendingMessageId = `agentic-${Date.now()}`;
    const userMessageId = `agentic-user-${Date.now()}`;

    appendMessage({
      id: userMessageId,
      sessionId,
      userId: user?.id || 'user',
      content: rawMessage,
      type: 'user',
      createdAt: new Date().toISOString(),
      userName: user?.name,
      userAvatar: user?.avatar,
    });

    appendMessage({
      id: pendingMessageId,
      sessionId,
      userId: null,
      content: `${getAgenticLabel(taskType)} is running...`,
      type: 'ai',
      createdAt: new Date().toISOString(),
      userName: 'Research Assistant',
    });

    setInputMessage('');
    stopTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    setIsAgenticRunning(true);

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

      const content = formatAgenticResponse(response);
      updateMessage(pendingMessageId, { content });

      // Extract structured data for rich components
      setLastAgenticTaskType(response.task_type);
      const rawResult = response.result as Record<string, unknown> | undefined;
      if (rawResult && response.task_type === 'methodology_extraction') {
        const matrix = rawResult.methodology_matrix;
        if (typeof matrix === 'string') {
          // Backend returns markdown — try to parse rows from the table
          // For now, the markdown table renders fine via ResearchMessage
          setMethodologyRows([]);
        } else if (Array.isArray(matrix)) {
          setMethodologyRows(matrix as MethodologyRow[]);
        }
      } else if (rawResult && response.task_type === 'reviewer_anticipation') {
        const critiques = rawResult.reviewer_critiques;
        if (typeof critiques === 'string') {
          setReviewerCritiques([]);
        } else if (Array.isArray(critiques)) {
          setReviewerCritiques(critiques as ReviewerCritique[]);
        }
      } else {
        setMethodologyRows([]);
        setReviewerCritiques([]);
      }

      addToast('Agentic task completed', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agentic task failed';
      updateMessage(pendingMessageId, { content: `Agentic task failed.\n\n${message}` });
      addToast(message, 'error');
    } finally {
      setIsAgenticRunning(false);
    }
  }, [
    inputMessage,
    isConnected,
    sessionId,
    parseAgenticCommand,
    agenticMode,
    accessToken,
    agenticTask,
    sources,
    appendMessage,
    updateMessage,
    sendMessage,
    stopTyping,
    getAgenticLabel,
    formatAgenticResponse,
    addToast,
    session?.groupId,
    user?.id,
    user?.name,
    user?.avatar,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

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
        agenticRunId: pendingMessageId,
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

  // Source handlers
  const handleToggleSource = useCallback((id: string) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }, []);

  const handleToggleAll = useCallback((enabled: boolean) => {
    setSources((prev) => prev.map((s) => ({ ...s, enabled })));
  }, []);

  // Studio handlers
  const handleGenerateReport = useCallback(async () => {
    if (!accessToken || !session?.groupId) return;
    try {
      const result = await api.generateGroupReport(accessToken, session.groupId);
      setStudioOutputs((prev) => [{
        id: result.reportId,
        type: 'report' as const,
        title: result.title,
        status: result.status === 'completed' ? 'ready' as const : 'generating' as const,
        createdAt: result.createdAt,
        downloadUrl: result.downloadUrl || undefined,
      }, ...prev]);
      addToast('Report generated', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to generate report', 'error');
    }
  }, [accessToken, session?.groupId, addToast]);

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    addToast('Copied to clipboard', 'success');
  }, [addToast]);

  const handleFeedback = useCallback((messageId: string, feedback: 'up' | 'down') => {
    addToast(`Feedback recorded`, 'success');
  }, [addToast]);

  const handleSelectQuestion = useCallback((question: string) => {
    setInputMessage(question);
  }, []);

  const enabledSourcesCount = sources.filter((s) => s.enabled).length;

  // Loading state
  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg-primary)' }}
      >
        <div className="text-center">
          <Loader2
            size={40}
            className="animate-spin mx-auto mb-4"
            style={{ color: 'var(--color-brand-secondary)' }}
          />
          <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
            Loading research session…
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !session || !sessionId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg-primary)' }}
      >
        <div className="text-center max-w-md">
          {error && (
            <div
              className="rounded-xl p-4 mb-6"
              style={{
                background: 'var(--color-error-bg)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <p className="text-[14px]" style={{ color: 'var(--color-error)' }}>{error}</p>
            </div>
          )}
          <h2
            className="text-[20px] font-medium mb-4"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Session not found
          </h2>
          <Link href="/home">
            <Button>Back to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  // AI summary from first message or default
  const aiSummary = messages.find((m) => m.type === 'ai')?.content ||
    `This research session contains ${enabledSourcesCount} sources. Start by asking a question about your research materials or use the suggested prompts below.`;

  const selectedAgenticTask = AGENTIC_TASKS.find((t) => t.value === agenticTask);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Top Header Bar */}
      <header
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
        }}
      >
        <div className="flex items-center gap-3">
          <Link href="/home" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(13, 115, 119, 0.2)' }}
            >
              <Bot size={18} style={{ color: 'var(--color-brand-secondary)' }} />
            </div>
          </Link>
          <span
            className="text-[14px] font-medium truncate max-w-[400px]"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {session.title}
          </span>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-3">
          {aiError && (
            <button
              onClick={clearAIError}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors"
              style={{
                background: 'var(--color-warning-bg)',
                color: 'var(--color-warning)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}
              title="Click to dismiss"
            >
              <AlertTriangle size={12} />
              <span className="max-w-[200px] truncate">{aiError.message}</span>
            </button>
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
        </div>
      </header>

      {/* Main Three-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Sources */}
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

        {/* Center Panel - Chat */}
        <div
          className="flex-1 flex flex-col min-w-0"
          style={{ background: 'var(--color-bg-primary)' }}
        >
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
              {enabledSourcesCount > 0 && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(13, 115, 119, 0.15)',
                    color: 'var(--color-brand-secondary)',
                  }}
                >
                  {enabledSourcesCount} source{enabledSourcesCount !== 1 ? 's' : ''} active
                </span>
              )}
            </div>
          </div>

          {/* Chat Content */}
          <div className="flex-1 overflow-y-auto research-panel-scroll">
            <div className="max-w-3xl mx-auto px-6 py-8">
              {/* Welcome State */}
              {messages.length === 0 ? (
                <>
                  {/* AI Avatar */}
                  <div className="mb-6">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                      <Bot size={32} style={{ color: 'var(--color-brand-primary)' }} />
                    </div>
                  </div>

                  {/* Title */}
                  <h1
                    className="text-[32px] font-normal leading-tight mb-3"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {session.title}
                  </h1>

                  {/* Sources Count */}
                  <p className="text-[14px] mb-5" style={{ color: 'var(--color-text-secondary)' }}>
                    {enabledSourcesCount} sources
                  </p>

                  {/* Summary */}
                  <p
                    className="text-[15px] leading-relaxed mb-6"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {aiSummary}
                  </p>

                  {/* Copy Button */}
                  <div className="flex items-center gap-1 mb-10">
                    <button
                      onClick={() => handleCopy(aiSummary)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] transition-all"
                      style={{
                        background: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border-primary)',
                        color: 'var(--color-text-primary)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
                        e.currentTarget.style.background = 'var(--color-bg-elevated)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-primary)';
                        e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                      }}
                    >
                      <Copy size={16} />
                      <span>Copy summary</span>
                    </button>
                  </div>

                  {/* Suggested Questions */}
                  <div className="space-y-2.5">
                    {DEFAULT_QUESTIONS.map((question, index) => (
                      <button
                        key={index}
                        onClick={() => handleSelectQuestion(question)}
                        className="w-full text-left px-5 py-4 rounded-2xl text-[14px] leading-relaxed transition-all card-base card-interactive"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                /* Message Thread */
                <div className="space-y-2">
                  {messages.map((msg) => {
                    const isAgenticPending = deepResearchMessageId === msg.id && msg.type === 'ai';

                    return (
                      <ResearchMessage
                        key={msg.id}
                        id={msg.id}
                        content={msg.content}
                        type={msg.type === 'ai' ? 'ai' : 'user'}
                        userName={msg.userName}
                        userAvatar={msg.userAvatar}
                        timestamp={new Date(msg.createdAt)}
                        isCurrentUser={msg.userId === user?.id}
                        onFeedback={msg.type === 'ai' ? handleFeedback : undefined}
                        onCopy={handleCopy}
                        className={isAgenticPending ? 'ai-thinking-animation' : ''}
                      />
                    );
                  })}

                  {/* Rich structured results */}
                  {lastAgenticTaskType === 'methodology_extraction' && methodologyRows.length > 0 && (
                    <div className="px-4 py-2">
                      <MethodologyMatrix rows={methodologyRows} />
                    </div>
                  )}
                  {lastAgenticTaskType === 'reviewer_anticipation' && reviewerCritiques.length > 0 && (
                    <div className="px-4 py-2">
                      <ReviewerCritiques critiques={reviewerCritiques} />
                    </div>
                  )}

                  {/* Typing Indicator */}
                  {typingUsers.length > 0 && (
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
              )}
            </div>
          </div>

          {/* Intent Classification Banner */}
          {intentEvent && (
            <div className="px-6 pb-1">
              <div className="max-w-3xl mx-auto">
                <IntentBanner
                  event={intentEvent}
                  onOverride={(newIntent) => {
                    setAgenticTask(newIntent);
                    setAgenticMode(true);
                  }}
                />
              </div>
            </div>
          )}

          {/* Chat Input */}
          <div
            className="px-6 py-4 border-t"
            style={{ borderColor: 'var(--color-border-primary)' }}
          >
            <div className="max-w-3xl mx-auto">
              {/* Agentic Controls */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAgenticMode((prev) => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] border transition-all"
                    style={
                      agenticMode
                        ? {
                          background: 'rgba(13, 115, 119, 0.2)',
                          color: 'var(--color-brand-secondary)',
                          borderColor: 'rgba(20, 255, 236, 0.4)',
                          boxShadow: '0 0 8px rgba(20, 255, 236, 0.1)',
                        }
                        : {
                          background: 'var(--color-bg-tertiary)',
                          color: 'var(--color-text-secondary)',
                          borderColor: 'var(--color-border-primary)',
                        }
                    }
                  >
                    <Bot size={14} />
                    {agenticMode ? 'Agentic On' : 'Agentic Off'}
                  </button>

                  {agenticMode && (
                    <div className="relative">
                      <button
                        onClick={() => setShowAgenticDropdown(!showAgenticDropdown)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border transition-all"
                        style={{
                          background: 'var(--color-bg-tertiary)',
                          borderColor: 'var(--color-border-primary)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {selectedAgenticTask?.label}
                        <ChevronDown size={12} />
                      </button>

                      {showAgenticDropdown && (
                        <div
                          className="absolute bottom-full left-0 mb-2 w-64 rounded-xl overflow-hidden animate-scale-in"
                          style={{
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border-secondary)',
                            boxShadow: 'var(--shadow-xl)',
                            zIndex: 'var(--z-dropdown)',
                          }}
                        >
                          {AGENTIC_TASKS.map((task) => (
                            <button
                              key={task.value}
                              onClick={() => {
                                setAgenticTask(task.value);
                                setShowAgenticDropdown(false);
                              }}
                              className="w-full text-left px-4 py-2.5 transition-colors"
                              style={{
                                color: task.value === agenticTask
                                  ? 'var(--color-brand-secondary)'
                                  : 'var(--color-text-primary)',
                                background: task.value === agenticTask
                                  ? 'rgba(13, 115, 119, 0.1)'
                                  : 'transparent',
                              }}
                              onMouseEnter={(e) => {
                                if (task.value !== agenticTask) {
                                  e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (task.value !== agenticTask) {
                                  e.currentTarget.style.background = 'transparent';
                                }
                              }}
                            >
                              <div className="text-[13px] font-medium">{task.label}</div>
                              <div
                                className="text-[11px] mt-0.5"
                                style={{ color: 'var(--color-text-muted)' }}
                              >
                                {task.description}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {agenticMode && (
                  <span
                    className="text-[11px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Tip: /agent &lt;task&gt; &lt;prompt&gt;
                  </span>
                )}
              </div>

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
                  placeholder={agenticMode ? 'Describe your research task…' : 'Start typing…'}
                  disabled={(!isConnected && !agenticMode) || isAgenticRunning}
                  className="flex-1 bg-transparent text-[14px] focus:outline-none disabled:opacity-50"
                  style={{
                    color: 'var(--color-text-primary)',
                  }}
                />

                {/* Sources Badge */}
                <span
                  className="px-3 py-1 rounded-full text-[12px] whitespace-nowrap"
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {enabledSourcesCount} sources
                </span>

                {/* Send Button */}
                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || ((!isConnected && !agenticMode)) || isAgenticRunning}
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

              {/* Disclaimer */}
              <p
                className="text-[11px] text-center mt-3"
                style={{ color: 'var(--color-text-muted)' }}
              >
                OpenResearch can be inaccurate; please double-check its responses.
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel - Outputs */}
        <StudioPanel
          outputs={studioOutputs}
          onGenerateReport={handleGenerateReport}
          isCollapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          hasSourcesSelected={enabledSourcesCount > 0}
        />
      </div>

      {/* Add Source Modal */}
      <Modal
        isOpen={showAddSourceModal}
        onClose={() => setShowAddSourceModal(false)}
        title="Add Sources"
      >
        <div className="space-y-4">
          <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
            Add papers from your group collection or import new sources.
          </p>
          <div className="flex flex-col gap-3">
            <Link href={`/group-papers?groupId=${session.groupId}`} onClick={() => setShowAddSourceModal(false)}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] text-left transition-all card-base"
                style={{ color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-accent)';
                  e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-primary)';
                  e.currentTarget.style.background = 'var(--color-bg-secondary)';
                }}
              >
                <Bot size={20} style={{ color: 'var(--color-brand-secondary)' }} />
                Browse Group Papers
              </button>
            </Link>
            <Link href="/discover" onClick={() => setShowAddSourceModal(false)}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] text-left transition-all card-base"
                style={{ color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-accent)';
                  e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-primary)';
                  e.currentTarget.style.background = 'var(--color-bg-secondary)';
                }}
              >
                <Plus size={20} style={{ color: 'var(--color-success)' }} />
                Discover New Papers
              </button>
            </Link>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'var(--color-bg-primary)' }}
        >
          <div className="text-center">
            <Loader2
              size={40}
              className="animate-spin mx-auto mb-4"
              style={{ color: 'var(--color-brand-secondary)' }}
            />
            <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
              Loading…
            </p>
          </div>
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
