import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth';
import { Message } from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TypingUser {
  userId: string;
  userName: string;
}

export function useSocket(sessionId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const { accessToken, isAuthenticated } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  // Connect socket
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socket.on('error', (error: { message: string }) => {
      console.error('Socket error:', error.message);
    });

    socket.on('message:new', (message: Message) => {
      setMessages((prev) => [...prev, message]);
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

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
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

  // Send message
  const sendMessage = useCallback((content: string) => {
    if (!socketRef.current || !sessionId) return;
    socketRef.current.emit('message:send', { sessionId, content });
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

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setTypingUsers([]);
  }, []);

  return {
    isConnected,
    messages,
    typingUsers,
    sendMessage,
    startTyping,
    stopTyping,
    initMessages,
    clearMessages,
  };
}
