'use client';

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Avatar, Badge } from '@/components/ui';
import { ArrowLeft, Send, Loader2, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Session, Message } from '@/lib/api';
import { useSocket } from '@/lib/socket';
import { useToastStore } from '@/lib/toast';

function ChatPageContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const { accessToken, user } = useAuthStore();
  const { addToast } = useToastStore();
  
  const [inputMessage, setInputMessage] = useState('');
  const [session, setSession] = useState<(Session & { messageCount: number }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
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
        const [sessionData, messagesData] = await Promise.all([
          api.getSession(accessToken, sessionId),
          api.getSessionMessages(accessToken, sessionId),
        ]);
        setSession(sessionData);
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

  const handleDeleteMessage = async (messageId: string) => {
    if (!accessToken || !sessionId) return;
    
    try {
      setDeletingMessage(messageId);
      await api.deleteMessage(accessToken, sessionId, messageId);
      // Remove message from local state - the socket hook manages messages
      addToast('Message deleted', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete message', 'error');
    } finally {
      setDeletingMessage(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-[#71717a]">Loading chat...</p>
        </div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Navbar />
      
      {/* Session Header */}
      <div className="bg-[#1a1a1a]/80 backdrop-blur-xl border-b border-[#2a2a2a] px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/group?id=${session.groupId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft size={18} className="mr-2" />
                Back
              </Button>
            </Link>
            <div className="h-8 w-px bg-[#2a2a2a]" />
            <div>
              <h1 className="text-xl font-bold text-white">{session.title}</h1>
              <p className="text-sm text-[#71717a]">
                {session.messageCount} messages • Last active{' '}
                {new Date(session.lastActivityAt).toLocaleDateString()}
              </p>
            </div>
          </div>
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
                    className={`flex mb-4 group ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
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
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[#e4e4e7]">
                            {isAI ? 'AI Assistant' : msg.userName || 'Unknown'}
                          </span>
                          {isAI && <Badge variant="primary" size="sm">AI</Badge>}
                          <span className="text-xs text-[#52525b]">
                            {new Date(msg.createdAt).toLocaleTimeString()}
                          </span>
                          {/* Delete button for user's own messages */}
                          {isCurrentUser && !isAI && (
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#ef4444]/20 text-[#71717a] hover:text-[#ef4444] transition-all"
                              title="Delete message"
                              disabled={deletingMessage === msg.id}
                            >
                              {deletingMessage === msg.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          )}
                        </div>
                        <div
                          className={`px-4 py-3 rounded-2xl ${
                            isCurrentUser
                              ? 'bg-gradient-to-r from-[#0D7377] to-[#0a8f8f] text-white rounded-br-md'
                              : isAI
                              ? 'bg-gradient-to-r from-[#0D7377]/20 to-[#14FFEC]/10 text-[#14FFEC] border border-[#0D7377]/40 rounded-bl-md'
                              : 'bg-[#1a1a1a] text-[#e4e4e7] border border-[#2a2a2a] rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex justify-start mb-4">
                  <div className="bg-[#1a1a1a] text-[#71717a] px-4 py-2 rounded-2xl rounded-bl-md text-sm border border-[#2a2a2a]">
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 bg-[#14FFEC] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-[#14FFEC] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-[#14FFEC] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span className="ml-2">{typingUsers.map(u => u.userName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Message Input */}
          <div className="bg-[#1a1a1a]/80 backdrop-blur-xl border-t border-[#2a2a2a] px-4 py-4">
            <div className="max-w-4xl mx-auto">
              {!isConnected && (
                <div className="flex items-center justify-center mb-3 text-[#f59e0b] text-sm bg-[#f59e0b]/10 px-4 py-2 rounded-xl">
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Connecting to chat...
                </div>
              )}
              <div className="flex gap-3">
                <textarea
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder={isConnected ? "Type your message..." : "Connecting..."}
                  className="flex-1 px-4 py-3 border border-[#2a2a2a] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14FFEC]/40 focus:border-[#14FFEC] resize-none bg-[#0f0f0f] text-white placeholder:text-[#52525b] disabled:opacity-50 transition-all hover:border-[#3a3a3a]"
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
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-[#71717a]">Loading...</p>
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}