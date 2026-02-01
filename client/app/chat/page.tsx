'use client';

import React, { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Bot, MoreVertical, Copy, ThumbsUp, ThumbsDown, BookmarkPlus, Plus } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Session, GroupPaper } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { useToastStore } from '@/lib/toast';
import { Button, Modal } from '@/components/ui';

import {
  SourcesPanel,
  StudioPanel,
  ResearchMessage,
  Source,
  StudioOutput,
  Citation,
} from '@/components/research';

// Default suggested questions matching NotebookLM style
const DEFAULT_QUESTIONS = [
  'How did Transformers overcome the limitations of recurrent neural networks?',
  'What are the core components of the original Transformer architecture?',
  'Can you explain the mathematical causes of hallucinations in LLMs?',
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sources State
  const [sources, setSources] = useState<Source[]>([]);
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([]);

  // Socket connection
  const {
    isConnected,
    messages,
    sendMessage,
    startTyping,
    stopTyping,
    initMessages,
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

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim() || !isConnected) return;
    sendMessage(inputMessage.trim());
    setInputMessage('');
    stopTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, [inputMessage, isConnected, sendMessage, stopTyping]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

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
        type: 'report',
        title: result.title,
        status: result.status === 'completed' ? 'ready' : 'generating',
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

  const handleSaveToNotes = useCallback((messageId: string) => {
    addToast('Saved to notes', 'success');
  }, [addToast]);

  const handleSelectQuestion = useCallback((question: string) => {
    setInputMessage(question);
  }, []);

  const enabledSourcesCount = sources.filter((s) => s.enabled).length;

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#131314] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={40} className="text-[#8ab4f8] animate-spin mx-auto mb-4" />
          <p className="text-[#9aa0a6] text-[14px]">Loading research session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !session || !sessionId) {
    return (
      <div className="min-h-screen bg-[#131314] flex items-center justify-center">
        <div className="text-center max-w-md">
          {error && (
            <div className="bg-[#f28b82]/10 border border-[#f28b82]/30 rounded-xl p-4 mb-6">
              <p className="text-[#f28b82] text-[14px]">{error}</p>
            </div>
          )}
          <h2 className="text-[20px] font-medium text-[#e8eaed] mb-4">Session not found</h2>
          <Link href="/home">
            <Button>Back to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Generate AI summary from first AI message or default
  const aiSummary = messages.find((m) => m.type === 'ai')?.content || 
    `This research session contains ${enabledSourcesCount} sources. Start by asking a question about your research materials or use the suggested prompts below.`;

  return (
    <div className="h-screen bg-[#131314] flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#1e1f20] border-b border-[#3c4043]">
        <div className="flex items-center gap-3">
          <Link href="/home" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#8ab4f8]/20 flex items-center justify-center">
              <Bot size={18} className="text-[#8ab4f8]" />
            </div>
          </Link>
          <span className="text-[14px] text-[#e8eaed] font-medium truncate max-w-[400px]">
            {session.title}
          </span>
        </div>
        
        <div className="flex items-center gap-2" />
      </header>

      {/* Main Three-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Sources */}
        <SourcesPanel
          sources={sources}
          onToggleSource={handleToggleSource}
          onToggleAll={handleToggleAll}
          onAddSource={() => setShowAddSourceModal(true)}
          onDeepResearch={() => addToast('Deep research coming soon', 'info')}
          onWebSearch={(query: string) => addToast(`Searching for: ${query}`, 'info')}
          isCollapsed={leftPanelCollapsed}
          onToggleCollapse={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
        />

        {/* Center Panel - Chat */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#131314]">
          {/* Chat Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-[#3c4043]">
            <span className="text-[15px] font-medium text-[#e8eaed]">Chat</span>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-full hover:bg-[#28292a] text-[#9aa0a6] hover:text-[#e8eaed] transition-colors">
                <MoreVertical size={18} />
              </button>
            </div>
          </div>

          {/* Chat Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-8">
              {/* Initial AI Response Card (when no messages or showing welcome) */}
              {messages.length === 0 ? (
                <>
                  {/* AI Avatar */}
                  <div className="mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-[#28292a] flex items-center justify-center">
                      <Bot size={32} className="text-[#ea4335]" />
                    </div>
                  </div>

                  {/* Title */}
                  <h1 className="text-[32px] font-normal text-[#e8eaed] leading-tight mb-3">
                    {session.title}
                  </h1>

                  {/* Sources Count */}
                  <p className="text-[14px] text-[#9aa0a6] mb-5">
                    {enabledSourcesCount} sources
                  </p>

                  {/* Summary */}
                  <p className="text-[15px] text-[#9aa0a6] leading-relaxed mb-6">
                    {aiSummary}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 mb-10">
                    <button
                      onClick={() => handleSaveToNotes('welcome')}
                      className="flex items-center gap-2 px-4 py-2.5 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-full text-[13px] text-[#e8eaed] transition-colors"
                    >
                      <BookmarkPlus size={16} />
                      <span>Save to note</span>
                    </button>
                    <button
                      onClick={() => handleCopy(aiSummary)}
                      className="p-2.5 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
                    >
                      <Copy size={18} />
                    </button>
                    <button className="p-2.5 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors">
                      <ThumbsUp size={18} />
                    </button>
                    <button className="p-2.5 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors">
                      <ThumbsDown size={18} />
                    </button>
                  </div>

                  {/* Suggested Questions */}
                  <div className="space-y-2.5">
                    {DEFAULT_QUESTIONS.map((question, index) => (
                      <button
                        key={index}
                        onClick={() => handleSelectQuestion(question)}
                        className="w-full text-left px-5 py-4 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] hover:border-[#5f6368] rounded-2xl text-[14px] text-[#e8eaed] transition-all leading-relaxed"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                /* Message Thread */
                <div className="space-y-2">
                  {messages.map((msg) => (
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
                      onSaveToNotes={msg.type === 'ai' ? handleSaveToNotes : undefined}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Chat Input */}
          <div className="px-6 py-4 border-t border-[#3c4043]">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-3 px-5 py-3 bg-[#28292a] border border-[#3c4043] rounded-full focus-within:border-[#8ab4f8] transition-colors">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Start typing..."
                  disabled={!isConnected}
                  className="flex-1 bg-transparent text-[14px] text-[#e8eaed] placeholder:text-[#9aa0a6] focus:outline-none disabled:opacity-50"
                />
                
                {/* Sources Badge */}
                <span className="px-3 py-1 bg-[#3c4043] rounded-full text-[12px] text-[#9aa0a6] whitespace-nowrap">
                  {enabledSourcesCount} sources
                </span>
                
                {/* Send Button */}
                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || !isConnected}
                  className="p-2 bg-[#8ab4f8] hover:bg-[#aecbfa] rounded-full text-[#1e1f20] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              
              {/* Disclaimer */}
              <p className="text-[11px] text-[#5f6368] text-center mt-3">
                OpenResearch can be inaccurate; please double-check its responses.
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel - Studio */}
        <StudioPanel
          outputs={studioOutputs}
          onGenerateAudio={() => addToast('Audio overview coming soon', 'info')}
          onGenerateVideo={() => addToast('Video summary coming soon', 'info')}
          onGenerateMindmap={() => addToast('Mind map coming soon', 'info')}
          onGenerateReport={handleGenerateReport}
          onGenerateFlashcards={() => addToast('Flashcards coming soon', 'info')}
          onGenerateQuiz={() => addToast('Quiz coming soon', 'info')}
          onGenerateInfographic={() => addToast('Infographic coming soon', 'info')}
          onGenerateSlides={() => addToast('Slide deck coming soon', 'info')}
          onGenerateTable={() => addToast('Data table coming soon', 'info')}
          onAddNote={() => addToast('Add note coming soon', 'info')}
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
          <p className="text-[14px] text-[#9aa0a6]">
            Add papers from your group collection or import new sources.
          </p>
          <div className="flex flex-col gap-3">
            <Link href={`/group-papers?groupId=${session.groupId}`} onClick={() => setShowAddSourceModal(false)}>
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-xl text-[14px] text-[#e8eaed] transition-colors text-left">
                <Bot size={20} className="text-[#8ab4f8]" />
                Browse Group Papers
              </button>
            </Link>
            <Link href="/discover" onClick={() => setShowAddSourceModal(false)}>
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-xl text-[14px] text-[#e8eaed] transition-colors text-left">
                <Plus size={20} className="text-[#81c995]" />
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
        <div className="min-h-screen bg-[#131314] flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={40} className="text-[#8ab4f8] animate-spin mx-auto mb-4" />
            <p className="text-[#9aa0a6] text-[14px]">Loading...</p>
          </div>
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
