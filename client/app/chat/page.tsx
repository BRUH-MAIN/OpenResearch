'use client';

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Avatar, Badge } from '@/components/ui';
import { ArrowLeft, Send, Sparkles, ListTodo, FileText, Loader2, MessageCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Session, Message, Task } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { useToastStore } from '@/lib/toast';

function ChatPageContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const { accessToken, user } = useAuthStore();
  const { addToast } = useToastStore();
  
  const [inputMessage, setInputMessage] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [session, setSession] = useState<(Session & { messageCount: number }) | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // AI states
  const [aiSummary, setAiSummary] = useState<{ summary: string; key_points: string[] } | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<'summary' | 'tasks' | 'ask' | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  
  // Socket connection
  const { 
    isConnected, 
    messages, 
    typingUsers,
    sendMessage,
    startTyping,
    stopTyping,
    initMessages 
  } = useSocket(sessionId);

  // Fetch session and initial messages
  useEffect(() => {
    async function fetchData() {
      if (!accessToken || !sessionId) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        setError(null);
        const [sessionData, messagesData, tasksData] = await Promise.all([
          api.getSession(accessToken, sessionId),
          api.getSessionMessages(accessToken, sessionId),
          api.getSessionTasks(accessToken, sessionId),
        ]);
        setSession(sessionData);
        setTasks(tasksData);
        initMessages(messagesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchData();
  }, [accessToken, sessionId, initMessages]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Typing timeout
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    startTyping();
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !isConnected) return;
    
    sendMessage(inputMessage.trim());
    setInputMessage('');
    stopTyping();
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // AI Feature Handlers
  const handleGenerateSummary = async () => {
    if (!accessToken || !sessionId) return;
    
    setAiLoading('summary');
    try {
      const result = await api.summarizeSession(accessToken, sessionId);
      setAiSummary(result);
      addToast('Summary generated successfully', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to generate summary', 'error');
    } finally {
      setAiLoading(null);
    }
  };

  const handleExtractTasks = async () => {
    if (!accessToken || !sessionId) return;
    
    setAiLoading('tasks');
    try {
      const result = await api.extractTasks(accessToken, sessionId);
      if (result.tasks.length === 0) {
        addToast('No tasks found in this conversation', 'info');
      } else {
        addToast(`Found ${result.tasks.length} task(s)`, 'success');
        // Convert AI extracted tasks to display format
        const extractedTasks: Task[] = result.tasks.map((t, i) => ({
          id: `ai-${Date.now()}-${i}`,
          sessionId: sessionId!,
          title: t.title,
          description: t.description || undefined,
          status: 'pending' as const,
          assignedTo: t.assignee || undefined,
          assigneeName: t.assignee || undefined,
          createdAt: new Date().toISOString(),
        }));
        setTasks(prev => [...prev, ...extractedTasks]);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to extract tasks', 'error');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAskAI = async (question: string) => {
    if (!accessToken || !sessionId || !question.trim()) return;
    
    setAiLoading('ask');
    setAiAnswer(null);
    try {
      const result = await api.askQuestion(accessToken, sessionId, question);
      setAiAnswer(result.answer);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to get AI answer', 'error');
    } finally {
      setAiLoading(null);
    }
  };

  const handleCustomQuestion = () => {
    if (aiQuestion.trim()) {
      handleAskAI(aiQuestion);
      setAiQuestion('');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#212121] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-gray-400">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (error || !session || !sessionId) {
    return (
      <div className="min-h-screen bg-[#212121] flex flex-col">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          {error && (
            <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6 inline-block">
              <p className="text-red-400">{error}</p>
            </div>
          )}
          <h2 className="text-2xl font-bold text-white">Session not found</h2>
          <Link href="/home">
            <Button className="mt-4">Back to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#212121] flex flex-col">
      <Navbar />
      
      {/* Session Header */}
      <div className="bg-[#323232] border-b border-[#0D7377] px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href={`/group?id=${session.groupId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft size={18} className="mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">{session.title}</h1>
              <p className="text-sm text-gray-400">
                {session.messageCount} messages • Last active{' '}
                {new Date(session.lastActivityAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Button
            variant={showAIPanel ? 'primary' : 'outline'}
            onClick={() => setShowAIPanel(!showAIPanel)}
          >
            <Sparkles size={18} className="mr-2" />
            AI Assistant
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            <div className="max-w-4xl mx-auto">
              {messages.map((msg) => {
                const isCurrentUser = msg.userId === user?.id;
                const isAI = msg.type === 'ai';

                return (
                  <div
                    key={msg.id}
                    className={`flex mb-4 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`flex space-x-3 max-w-2xl ${
                        isCurrentUser ? 'flex-row-reverse space-x-reverse' : ''
                      }`}
                    >
                      <Avatar
                        src={isAI ? undefined : msg.userAvatar}
                        alt={isAI ? 'AI' : msg.userName || 'User'}
                        size="sm"
                      />
                      <div className={isCurrentUser ? 'items-end' : 'items-start'}>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-300">
                            {isAI ? 'AI Assistant' : msg.userName || 'Unknown'}
                          </span>
                          {msg.metadata?.isTask && <Badge variant="warning">Task</Badge>}
                          {msg.metadata?.isSummary && <Badge variant="primary">Summary</Badge>}
                          <span className="text-xs text-gray-500">
                            {new Date(msg.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div
                          className={`px-4 py-2 rounded-lg ${
                            isCurrentUser
                              ? 'bg-[#0D7377] text-white'
                              : isAI
                              ? 'bg-[#323232] text-[#14FFEC] border border-[#0D7377]'
                              : 'bg-[#323232] text-gray-200'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex justify-start mb-4">
                  <div className="bg-[#323232] text-gray-400 px-4 py-2 rounded-lg text-sm">
                    {typingUsers.map(u => u.userName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Message Input */}
          <div className="bg-[#323232] border-t border-[#0D7377] px-4 py-4">
            <div className="max-w-4xl mx-auto">
              {!isConnected && (
                <div className="flex items-center justify-center mb-2 text-yellow-500 text-sm">
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Connecting to chat...
                </div>
              )}
              <div className="flex space-x-3">
                <textarea
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder={isConnected ? "Type your message..." : "Connecting..."}
                  className="flex-1 px-4 py-3 border border-[#0D7377] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14FFEC] resize-none bg-[#212121] text-white disabled:opacity-50"
                  rows={2}
                  disabled={!isConnected}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || !isConnected}
                  className="self-end"
                >
                  <Send size={18} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Panel */}
        {showAIPanel && (
          <div className="w-96 bg-[#323232] border-l border-[#0D7377] p-4 overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center">
              <Sparkles size={20} className="mr-2 text-[#14FFEC]" />
              AI Features
            </h2>

            {/* Session Summary */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center">
                <FileText size={16} className="mr-2" />
                Session Summary
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="w-full mb-3"
                onClick={handleGenerateSummary}
                disabled={aiLoading === 'summary'}
              >
                {aiLoading === 'summary' ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Summary'
                )}
              </Button>
              {aiSummary && (
                <div className="p-3 bg-[#212121] rounded-lg border border-[#0D7377]">
                  <p className="text-sm text-gray-200 mb-3">{aiSummary.summary}</p>
                  {aiSummary.key_points.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-[#14FFEC] mb-1">Key Points:</p>
                      <ul className="list-disc list-inside text-xs text-gray-400 space-y-1">
                        {aiSummary.key_points.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Extracted Tasks */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center">
                <ListTodo size={16} className="mr-2" />
                Tasks ({tasks.length})
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="w-full mb-3"
                onClick={handleExtractTasks}
                disabled={aiLoading === 'tasks'}
              >
                {aiLoading === 'tasks' ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Extract Tasks'
                )}
              </Button>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 bg-[#212121] rounded-lg border border-[#0D7377]"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium text-white">{task.title}</p>
                      <Badge
                        variant={
                          task.status === 'completed'
                            ? 'success'
                            : task.status === 'in-progress'
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {task.status}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-400">{task.description}</p>
                    )}
                    {task.assigneeName && (
                      <p className="text-xs text-[#14FFEC] mt-1">Assigned to: {task.assigneeName}</p>
                    )}
                  </div>
                ))}
                {tasks.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-2">No tasks yet</p>
                )}
              </div>
            </div>

            {/* Ask AI */}
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center">
                <MessageCircle size={16} className="mr-2" />
                Ask AI
              </h3>
              <div className="flex space-x-2 mb-3">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCustomQuestion()}
                  placeholder="Ask a question..."
                  className="flex-1 px-3 py-2 text-sm border border-[#0D7377] rounded-lg bg-[#212121] text-white focus:outline-none focus:ring-2 focus:ring-[#14FFEC]"
                  disabled={aiLoading === 'ask'}
                />
                <Button
                  size="sm"
                  onClick={handleCustomQuestion}
                  disabled={!aiQuestion.trim() || aiLoading === 'ask'}
                >
                  {aiLoading === 'ask' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                </Button>
              </div>
              <div className="space-y-2 mb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left"
                  onClick={() => handleAskAI('What are the key points discussed?')}
                  disabled={aiLoading === 'ask'}
                >
                  What are the key points?
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left"
                  onClick={() => handleAskAI('What are the action items and next steps?')}
                  disabled={aiLoading === 'ask'}
                >
                  What are action items?
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left"
                  onClick={() => handleAskAI('What questions are still unanswered or need more discussion?')}
                  disabled={aiLoading === 'ask'}
                >
                  What needs more discussion?
                </Button>
              </div>
              {aiAnswer && (
                <div className="p-3 bg-[#212121] rounded-lg border border-[#14FFEC]">
                  <p className="text-xs font-semibold text-[#14FFEC] mb-1">AI Answer:</p>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap">{aiAnswer}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#212121] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}