import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { db, messages, sessions, groupMembers, users } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { aiClient, validateAiTrigger } from '../services/aiClient.js';
import logger from '../utils/logger.js';

const socketLogger = logger.child({ context: 'socket' });

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

interface JWTPayload {
  userId: string;
  email: string;
}

interface PaperQuestionPayload {
  paperId: string;
  question: string;
  groupId: string;
  sessionId: string;
  userId?: string;
}

interface PaperSummarizePayload {
  paperId: string;
  groupId: string;
  sessionId: string;
  userId?: string;
}

export function initializeSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

      const [user] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user.id;
      socket.userName = user.name;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    socketLogger.info({ userId: socket.userId }, 'User connected');

    // Join session room
    socket.on('join:session', async (sessionId: string) => {
      try {
        // Verify user has access to session
        const [session] = await db
          .select()
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);

        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        const [membership] = await db
          .select()
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, session.groupId),
              eq(groupMembers.userId, socket.userId!)
            )
          )
          .limit(1);

        if (!membership) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.join(`session:${sessionId}`);
        socket.emit('joined:session', { sessionId });

        // Notify others
        socket.to(`session:${sessionId}`).emit('user:joined', {
          userId: socket.userId,
          userName: socket.userName,
        });
      } catch (error) {
        socketLogger.error({ err: error }, 'Error joining session');
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // Leave session room
    socket.on('leave:session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
      socket.to(`session:${sessionId}`).emit('user:left', {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    // Send message
    socket.on('message:send', async (data: { sessionId: string; content: string }) => {
      try {
        const { sessionId, content } = data;

        if (!content?.trim()) {
          socket.emit('error', { message: 'Message content is required' });
          return;
        }

        // Verify access
        const [session] = await db
          .select()
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);

        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        const [membership] = await db
          .select()
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, session.groupId),
              eq(groupMembers.userId, socket.userId!)
            )
          )
          .limit(1);

        if (!membership) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Save message to database
        const [newMessage] = await db
          .insert(messages)
          .values({
            sessionId,
            userId: socket.userId,
            content: content.trim(),
            type: 'user',
          })
          .returning();

        // Update session last activity
        await db
          .update(sessions)
          .set({ lastActivityAt: new Date() })
          .where(eq(sessions.id, sessionId));

        // Get user info
        const [user] = await db
          .select({ name: users.name, avatar: users.avatar })
          .from(users)
          .where(eq(users.id, socket.userId!))
          .limit(1);

        const messageWithUser = {
          ...newMessage,
          userName: user?.name,
          userAvatar: user?.avatar,
        };

        // Broadcast to all in session (including sender)
        io.to(`session:${sessionId}`).emit('message:new', messageWithUser);

        // Check for @ai mention and trigger AI response
        if (content.toLowerCase().includes('@ai')) {
          try {
            // Pre-check AI service health before making request
            const isAvailable = await aiClient.isAvailable();
            if (!isAvailable) {
              // Emit a user-friendly error without crashing
              socket.emit('ai:error', {
                message: 'AI service is not available. Please ensure GROQ_API_KEY is configured.',
                code: 'AI_NOT_CONFIGURED',
                recoverable: true
              });
              return;
            }

            // Get group ID from session for group-isolated RAG
            const aiResponse = await aiClient.processAtAiMessage(
              content,
              sessionId,
              socket.userId!,
              session.groupId // Pass groupId for group-isolated RAG
            );

            if (aiResponse) {
              // Now always a GroupAIChatResponse
              const answerText = aiResponse.text;

              // Extract metadata safely
              const metadataObj = aiResponse.metadata as Record<string, unknown> || {};

              // Save AI response to database
              const [aiMessage] = await db
                .insert(messages)
                .values({
                  sessionId,
                  userId: null, // AI messages have no user
                  content: answerText,
                  type: 'ai',
                  metadata: {
                    sources: aiResponse.sources || [],
                    model: (metadataObj.model as string) || 'groq',
                    latency_ms: aiResponse.latency_ms,
                    context_items_used: (metadataObj.context_items_used as number) || 0,
                    vector_ids_used: (metadataObj.vector_ids_used as string[]) || [],
                  },
                })
                .returning();

              // Broadcast AI response
              const aiMessageWithMeta = {
                ...aiMessage,
                userName: 'AI Assistant',
                userAvatar: null,
              };

              io.to(`session:${sessionId}`).emit('message:new', aiMessageWithMeta);
            }
          } catch (aiError) {
            socketLogger.error({ err: aiError }, 'AI response error');
            // Send structured error so client can handle gracefully
            const errorMessage = aiError instanceof Error ? aiError.message : 'AI service unavailable';
            const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
            socket.emit('ai:error', {
              message: isTimeout ? 'AI request timed out. Please try again.' : `AI Error: ${errorMessage}`,
              code: isTimeout ? 'AI_TIMEOUT' : 'AI_ERROR',
              recoverable: true
            });
          }
        }
      } catch (error) {
        socketLogger.error({ err: error }, 'Error sending message');
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Paper Question - requires @ai trigger
    socket.on('paper:question', async (data: PaperQuestionPayload) => {
      try {
        const { paperId, question, groupId, sessionId } = data;

        // Validate @ai trigger - CRITICAL
        if (!question.toLowerCase().includes('@ai')) {
          socket.emit('ai:error', {
            message: 'Question must contain @ai trigger. AI only responds when triggered by @ai.',
            code: 'MISSING_AI_TRIGGER',
            recoverable: true
          });
          return;
        }

        // Pre-check AI service availability
        const isAvailable = await aiClient.isAvailable();
        if (!isAvailable) {
          socket.emit('ai:error', {
            message: 'AI service is not available. Please ensure GROQ_API_KEY is configured.',
            code: 'AI_NOT_CONFIGURED',
            recoverable: true
          });
          return;
        }

        // Verify access to group
        const [membership] = await db
          .select()
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, groupId),
              eq(groupMembers.userId, socket.userId!)
            )
          )
          .limit(1);

        if (!membership) {
          socket.emit('error', { message: 'Access denied to group' });
          return;
        }

        // Call AI service
        const response = await aiClient.paperQuestion({
          paper_id: paperId,
          question,
          group_id: groupId,
          session_id: sessionId,
          user_id: socket.userId!,
        });

        // Emit answer
        socket.emit('paper:answer', {
          paperId,
          question,
          answer: response.answer,
          sources: response.sources,
          metadata: response.metadata,
          latency_ms: response.latency_ms,
        });

        // Also broadcast to session room if in a session
        if (sessionId) {
          // Save as message
          const [aiMessage] = await db
            .insert(messages)
            .values({
              sessionId,
              userId: null,
              content: `**Paper Q&A**\n\n**Q:** ${question.replace(/@ai/gi, '').trim()}\n\n**A:** ${response.answer}`,
              type: 'ai',
              metadata: {
                paper_id: paperId,
                sources: response.sources,
                artifact_type: 'paper_qa',
              },
            })
            .returning();

          io.to(`session:${sessionId}`).emit('message:new', {
            ...aiMessage,
            userName: 'AI Assistant',
            userAvatar: null,
          });
        }
      } catch (error) {
        socketLogger.error({ err: error }, 'Paper question error');
        const errorMessage = error instanceof Error ? error.message : 'Failed to process question';
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
        socket.emit('ai:error', {
          message: isTimeout ? 'AI request timed out. Please try again.' : errorMessage,
          code: isTimeout ? 'AI_TIMEOUT' : 'AI_ERROR',
          recoverable: true
        });
      }
    });

    // Paper Summarize - requires @ai trigger
    socket.on('paper:summarize', async (data: PaperSummarizePayload) => {
      try {
        const { paperId, groupId, sessionId } = data;

        // Pre-check AI service availability
        const isAvailable = await aiClient.isAvailable();
        if (!isAvailable) {
          socket.emit('ai:error', {
            message: 'AI service is not available. Please ensure GROQ_API_KEY is configured.',
            code: 'AI_NOT_CONFIGURED',
            recoverable: true
          });
          return;
        }

        // Verify access to group
        const [membership] = await db
          .select()
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, groupId),
              eq(groupMembers.userId, socket.userId!)
            )
          )
          .limit(1);

        if (!membership) {
          socket.emit('error', { message: 'Access denied to group' });
          return;
        }

        // Call AI service (trigger is always set to @ai summarize)
        const response = await aiClient.paperSummarize({
          paper_id: paperId,
          group_id: groupId,
          session_id: sessionId,
          user_id: socket.userId!,
          trigger: '@ai summarize',
        });

        // Emit summary
        socket.emit('paper:summary', {
          paperId,
          summary: response.summary,
          keyPoints: response.key_points,
          metadata: response.metadata,
          latency_ms: response.latency_ms,
        });

        // Also broadcast to session room if in a session
        if (sessionId) {
          const summaryContent = `**Paper Summary**\n\n${response.summary}\n\n**Key Points:**\n${response.key_points.map(p => `- ${p}`).join('\n')}`;

          const [aiMessage] = await db
            .insert(messages)
            .values({
              sessionId,
              userId: null,
              content: summaryContent,
              type: 'ai',
              metadata: {
                paper_id: paperId,
                key_points: response.key_points,
                artifact_type: 'paper_summary',
              },
            })
            .returning();

          io.to(`session:${sessionId}`).emit('message:new', {
            ...aiMessage,
            userName: 'AI Assistant',
            userAvatar: null,
          });
        }
      } catch (error) {
        socketLogger.error({ err: error }, 'Paper summarize error');
        const errorMessage = error instanceof Error ? error.message : 'Failed to summarize paper';
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
        socket.emit('ai:error', {
          message: isTimeout ? 'AI request timed out. Please try again.' : errorMessage,
          code: isTimeout ? 'AI_TIMEOUT' : 'AI_ERROR',
          recoverable: true
        });
      }
    });

    // Typing indicators
    socket.on('typing:start', (sessionId: string) => {
      socket.to(`session:${sessionId}`).emit('user:typing', {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    socket.on('typing:stop', (sessionId: string) => {
      socket.to(`session:${sessionId}`).emit('user:stopped-typing', {
        userId: socket.userId,
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      socketLogger.info({ userId: socket.userId }, 'User disconnected');
    });
  });

  return io;
}
