import { useEffect, useRef, useCallback, useState, startTransition } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth';
import { Message, IntentClassifiedEvent } from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TypingUser {
  userId: string;
  userName: string;
}

interface AIError {
  message: string;
  code?: string;
  recoverable?: boolean;
}

export function useSocket(sessionId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const { accessToken, isAuthenticated } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [aiError, setAIError] = useState<AIError | null>(null);
  const [intentEvent, setIntentEvent] = useState<IntentClassifiedEvent | null>(null);
  const [streamingMessageIds, setStreamingMessageIds] = useState<Set<string>>(new Set());

  // ── rAF-batched token buffer for smooth streaming ──
  const tokenBufferRef = useRef<Map<string, string>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  const flushTokenBuffer = useCallback(() => {
    rafIdRef.current = null;
    const buffer = tokenBufferRef.current;
    if (buffer.size === 0) return;

    const snapshot = new Map(buffer);
    buffer.clear();

    startTransition(() => {
      setMessages((prev) =>
        prev.map((msg) => {
          const pending = snapshot.get(msg.id);
          if (pending === undefined) return msg;
          return { ...msg, content: (msg.content || '') + pending };
        })
      );
    });
  }, []);

  // Connect socket
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
      setAIError(null); // Clear any previous AI errors on reconnect
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected, reason:', reason);
      setIsConnected(false);
    });

    socket.on('error', (error: { message: string }) => {
      console.error('Socket error:', error.message);
    });

    // Handle AI-specific errors
    socket.on('ai:error', (error: AIError) => {
      console.warn('AI error:', error.message, error.code);
      setAIError(error);
      // Auto-clear recoverable errors after 10 seconds
      if (error.recoverable) {
        setTimeout(() => setAIError(null), 10000);
      }
    });

    // Handle intent classification results
    socket.on('ai:intent_classified', (data: IntentClassifiedEvent) => {
      setIntentEvent(data);
      // Auto-clear after 15 seconds
      setTimeout(() => setIntentEvent(null), 15000);
    });

    socket.on('message:new', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('agentic:progress', (data: { messageId: string; content: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId ? { ...msg, content: data.content } : msg
        )
      );
    });

    // Streaming: buffer tokens and flush via rAF for smooth rendering
    socket.on('ai:token', (data: { messageId: string; token: string }) => {
      // Track this message as actively streaming
      setStreamingMessageIds((prev) => {
        if (prev.has(data.messageId)) return prev;
        const next = new Set(prev);
        next.add(data.messageId);
        return next;
      });

      // If this is the first token for this message, clear any existing
      // progress/placeholder content so tokens start fresh
      const buf = tokenBufferRef.current;
      if (!buf.has(data.messageId)) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.messageId ? { ...msg, content: '' } : msg
          )
        );
      }

      // Append token to the buffer
      buf.set(data.messageId, (buf.get(data.messageId) || '') + data.token);

      // Schedule a flush on the next animation frame (if not already scheduled)
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushTokenBuffer);
      }
    });

    // Streaming complete: flush any remaining tokens, finalize with full content
    socket.on('ai:token:done', (data: { messageId: string; content: string; metadata: Record<string, unknown> }) => {
      // Clear any buffered tokens for this message
      tokenBufferRef.current.delete(data.messageId);

      // Remove from streaming set
      setStreamingMessageIds((prev) => {
        if (!prev.has(data.messageId)) return prev;
        const next = new Set(prev);
        next.delete(data.messageId);
        return next;
      });

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== data.messageId) return msg;
          const existing = (msg.metadata ?? {}) as Record<string, unknown>;
          return { ...msg, content: data.content, metadata: { ...existing, ...data.metadata } };
        })
      );
    });

    socket.on('user:typing', (data: TypingUser) => {
      setTypingUsers((prev) => {
        if (prev.some(u => u.userId === data.userId)) return prev;
        return [...prev, data];
      });
    });

    socket.on('user:stopped-typing', (data: { userId: string }) => {
      setTypingUsers((prev) => prev.filter(u => u.userId !== data.userId));
    });

    socket.on('user:joined', (data: TypingUser) => {
      console.log(`${data.userName} joined the session`);
    });

    socket.on('user:left', (data: TypingUser) => {
      console.log(`${data.userName} left the session`);
    });

    // ── Workflow orchestration events ──
    // Forward workflow events from the socket to a window CustomEvent
    // so WorkflowPanel (and any other listener) can react in real-time.
    socket.on('workflow:event', (event: Record<string, unknown>) => {
      window.dispatchEvent(new CustomEvent('workflow:event', { detail: event }));
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      // Cancel any pending rAF flush
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      tokenBufferRef.current.clear();
    };
  }, [isAuthenticated, accessToken]);

  // Join session
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !sessionId || !isConnected) return;

    socket.emit('join:session', sessionId);

    return () => {
      socket.emit('leave:session', sessionId);
    };
  }, [sessionId, isConnected]);

  // Send message (with optional agent override: 'auto' lets backend classify)
  const sendMessage = useCallback((content: string, taskType?: string) => {
    if (!socketRef.current || !sessionId) return;
    socketRef.current.emit('message:send', { sessionId, content, taskType: taskType || 'auto' });
  }, [sessionId]);

  // Typing indicators
  const startTyping = useCallback(() => {
    if (!socketRef.current || !sessionId) return;
    socketRef.current.emit('typing:start', sessionId);
  }, [sessionId]);

  const stopTyping = useCallback(() => {
    if (!socketRef.current || !sessionId) return;
    socketRef.current.emit('typing:stop', sessionId);
  }, [sessionId]);

  // Initialize messages
  const initMessages = useCallback((initialMessages: Message[]) => {
    setMessages(initialMessages);
  }, []);

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === messageId ? { ...message, ...updates } : message))
    );
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setTypingUsers([]);
  }, []);

  // Clear AI error
  const clearAIError = useCallback(() => {
    setAIError(null);
  }, []);

  return {
    isConnected,
    messages,
    typingUsers,
    aiError,
    intentEvent,
    streamingMessageIds,
    sendMessage,
    startTyping,
    stopTyping,
    initMessages,
    appendMessage,
    updateMessage,
    clearMessages,
    clearAIError,
  };
}
