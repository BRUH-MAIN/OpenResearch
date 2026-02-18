'use client';

import React, { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Modal } from '@/components/ui';
import { Loader2, FileText, PlusCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Session, GroupPaper } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { useToastStore } from '@/lib/toast';

import {
  SourcesPanel,
  StudioPanel,
  ResearchMessage,
  ChatHeader,
  AIResponseCard,
  ChatInput,
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
  const [isGenerating, setIsGenerating] = useState(false);
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

  // Source handlers
  const handleToggleSource = useCallback((id: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  }, []);

  const handleRemoveSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    addToast('Source removed', 'success');
  }, [addToast]);

  // Studio handlers
  const handleGenerateReport = useCallback(async () => {
    if (!accessToken || !session?.groupId) return;
    
    setIsGenerating(true);
    setRightPanelCollapsed(false);
    
    try {
      const result = await api.generateGroupReport(accessToken, session.groupId);
      setStudioOutputs((prev) => [
        {
          id: result.reportId,
          type: 'report',
          title: result.title,
          status: result.status === 'completed' ? 'ready' : 'generating',
          createdAt: result.createdAt,
          downloadUrl: result.downloadUrl || undefined,
        },
        ...prev,
      ]);
      addToast('Report generated successfully', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to generate report', 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [accessToken, session?.groupId, addToast]);

  const handleGenerateFlashcards = useCallback(() => {
    addToast('Flashcard generation coming soon', 'info');
  }, [addToast]);

  const handleGenerateMindmap = useCallback(() => {
    addToast('Mind map generation coming soon', 'info');
  }, [addToast]);

  const handleGenerateAudio = useCallback(() => {
    addToast('Audio overview coming soon', 'info');
  }, [addToast]);

  const handleGenerateSlides = useCallback(() => {
    addToast('Slide deck generation coming soon', 'info');
  }, [addToast]);

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
      content: 'Deep Research is running...\n\nI will share a comprehensive report shortly.',
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

  const handleSaveToNotes = useCallback(
    (messageId: string) => {
      addToast('Saved to notes', 'success');
    },
    [addToast]
  );

  const handleCitationClick = useCallback((citation: Citation) => {
    // Find and highlight the source
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

  const handleToggleAll = useCallback((enabled: boolean) => {
    setSources((prev) => prev.map((s) => ({ ...s, enabled })));
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-[#71717a]">Loading research session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !session || !sessionId) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          {error && (
            <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl p-4 mb-6 inline-block">
              <p className="text-[#f87171]">{error}</p>
            </div>
          )}
          <h2 className="text-2xl font-bold text-white">Session not found</h2>
          <Link href="/home">
            <Button className="mt-6">Back to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  const enabledSources = sources.filter((s) => s.enabled);

  // Check if we have no messages (empty state)
  const showEmptyState = messages.length === 0;

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
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
          onWebSearch={(query: string) => addToast(`Searching for: ${query}`, 'info')}
          isDeepResearching={isDeepResearching}
          isCollapsed={leftPanelCollapsed}
          onToggleCollapse={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
        />

        {/* Center - Chat Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header */}
          <ChatHeader />

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto research-panel-scroll">
            <div className="max-w-3xl mx-auto px-6 py-6">
              {/* Empty State with AI Response Card */}
              {showEmptyState && (
                <AIResponseCard
                  title={session.title}
                  sourcesCount={enabledSources.length}
                  summary={`Ready to help you research "${session.title}". Add sources from your group papers or ask me anything about your research topic.`}
                  suggestedQuestions={[
                    'What are the key concepts in these papers?',
                    'Compare the methodologies used',
                    'Summarize the main findings',
                  ]}
                  onSaveToNote={() => addToast('Saved to notes', 'success')}
                  onCopy={() => {
                    navigator.clipboard.writeText('Research session started');
                    addToast('Copied to clipboard', 'success');
                  }}
                  onThumbsUp={() => addToast('Thanks for the feedback!', 'success')}
                  onThumbsDown={() => addToast('We will try to improve', 'info')}
                  onSelectQuestion={handleSelectPrompt}
                />
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
                    onSaveToNotes={isAI ? handleSaveToNotes : undefined}
                    onCitationClick={handleCitationClick}
                    className={isAgenticPending ? 'animate-pulse' : ''}
                  />
                );
              })}

              {/* Typing indicator */}
              {typingUsers.length > 0 && !typingUsers.some((u) => u.userId === 'ai') && (
                <div className="flex items-center gap-2 text-xs text-[#52525b] mb-4">
                  <span>
                    {typingUsers.map((u) => u.userName).join(', ')}{' '}
                    {typingUsers.length === 1 ? 'is' : 'are'} typing
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="px-6 py-4 border-t border-[#1f1f1f] bg-[#0f0f0f]">
            <div className="max-w-3xl mx-auto">
              {!isConnected && (
                <div className="flex items-center justify-center mb-3 text-[#f59e0b] text-sm bg-[#f59e0b]/10 px-4 py-2 rounded-xl">
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Connecting to session...
                </div>
              )}
              <ChatInput
                value={inputMessage}
                onChange={handleInputChange}
                onSend={handleSendMessage}
                disabled={!isConnected}
                sourcesCount={enabledSources.length}
                placeholder="Ask a research question..."
              />
            </div>
          </div>
        </div>

        {/* Right Sidebar - Studio Panel */}
        <StudioPanel
          outputs={studioOutputs}
          onGenerateAudio={handleGenerateAudio}
          onGenerateVideo={() => addToast('Video coming soon', 'info')}
          onGenerateMindmap={handleGenerateMindmap}
          onGenerateReport={handleGenerateReport}
          onGenerateFlashcards={handleGenerateFlashcards}
          onGenerateQuiz={() => addToast('Quiz coming soon', 'info')}
          onGenerateInfographic={() => addToast('Infographic coming soon', 'info')}
          onGenerateSlides={handleGenerateSlides}
          onGenerateTable={() => addToast('Table coming soon', 'info')}
          onAddNote={() => addToast('Note added', 'success')}
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
          <p className="text-sm text-[#71717a]">
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
        <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
          <Navbar />
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
            <p className="text-[#71717a]">Loading...</p>
          </div>
        </div>
      }
    >
      <ResearchChatContent />
    </Suspense>
  );
}
