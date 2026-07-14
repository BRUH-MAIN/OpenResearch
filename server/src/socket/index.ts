import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { db, messages, sessions, groupMembers, users } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { aiClient } from '../services/aiClient.js';
import { streamAiChatToSession } from '../services/aiChatService.js';
import { runResearchAgentInSession } from '../services/agentService.js';
import { corsOriginHandler } from '../config/cors.js';
import { getEnv } from '../config/env.js';
import { withCorrelationId } from '../middleware/correlationId.js';
import {
  socketJoinSessionSchema,
  socketSendMessageSchema,
  socketAgentRunSchema,
  socketPaperQuestionSchema,
  socketPaperSummarizeSchema,
} from '../validation/schemas.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
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

/**
 * Validates a socket payload, emitting an `error` event and returning null on failure.
 * Socket payloads are untrusted client input just like HTTP bodies.
 */
function parsePayload<T extends z.ZodType>(
  socket: Socket,
  schema: T,
  payload: unknown
): z.infer<T> | null {
  const result = schema.safeParse(payload);
  if (!result.success) {
    socket.emit('error', {
      message: 'Invalid payload',
      details: result.error.issues.map((i) => i.message),
    });
    return null;
  }
  return result.data;
}

export function initializeSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: corsOriginHandler,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 30000,
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, getEnv().JWT_SECRET) as JWTPayload;

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
    socket.on('join:session', async (rawSessionId: unknown) => {
      try {
        const sessionId = parsePayload(socket, socketJoinSessionSchema, rawSessionId);
        if (!sessionId) return;

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
    socket.on('leave:session', (rawSessionId: unknown) => {
      const sessionId = parsePayload(socket, socketJoinSessionSchema, rawSessionId);
      if (!sessionId) return;
      socket.leave(`session:${sessionId}`);
      socket.to(`session:${sessionId}`).emit('user:left', {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    // Send message
    socket.on('message:send', async (rawData: unknown) => {
      try {
        const data = parsePayload(socket, socketSendMessageSchema, rawData);
        if (!data) return;
        const { sessionId, content } = data;

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

        // @ai mention triggers a group-scoped RAG answer
        if (content.toLowerCase().includes('@ai')) {
          try {
            // Pre-check AI service health before making request
            const isAvailable = await aiClient.isAvailable();
            if (!isAvailable) {
              socket.emit('ai:error', {
                message: 'AI service is not available. Please check the AI service configuration.',
                code: 'AI_NOT_CONFIGURED',
                recoverable: true
              });
              return;
            }

            if (!session.groupId) {
              socket.emit('ai:error', {
                message: 'AI chat is only supported within research groups.',
                code: 'NO_GROUP',
                recoverable: true
              });
              return;
            }

            // Socket handlers bypass HTTP middleware, so establish the
            // correlation-ID context here for downstream AI-service calls.
            await withCorrelationId(randomUUID(), () =>
              streamAiChatToSession(io, {
                sessionId,
                groupId: session.groupId,
                userId: socket.userId!,
                content,
              })
            );
          } catch (aiError) {
            socketLogger.error({ err: aiError }, 'AI response error');
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

    /**
     * Run the research agent. Distinct from `message:send` because it is a
     * different kind of act: the agent investigates with tools over several
     * LLM round-trips, and streams its reasoning as it goes.
     */
    socket.on('agent:run', async (rawData: unknown) => {
      try {
        const data = parsePayload(socket, socketAgentRunSchema, rawData);
        if (!data) return;
        const { sessionId, content } = data;

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

        const isAvailable = await aiClient.isAvailable();
        if (!isAvailable) {
          socket.emit('ai:error', {
            message: 'AI service is not available. Please check the AI service configuration.',
            code: 'AI_NOT_CONFIGURED',
            recoverable: true,
          });
          return;
        }

        // The user's request is an ordinary message: everyone in the session
        // should see what the agent was asked, not just its answer.
        const [userMessage] = await db
          .insert(messages)
          .values({
            sessionId,
            userId: socket.userId,
            content: content.trim(),
            type: 'user',
          })
          .returning();

        const [user] = await db
          .select({ name: users.name, avatar: users.avatar })
          .from(users)
          .where(eq(users.id, socket.userId!))
          .limit(1);

        io.to(`session:${sessionId}`).emit('message:new', {
          ...userMessage,
          userName: user?.name,
          userAvatar: user?.avatar,
        });

        await db
          .update(sessions)
          .set({ lastActivityAt: new Date() })
          .where(eq(sessions.id, sessionId));

        await withCorrelationId(randomUUID(), () =>
          runResearchAgentInSession(io, {
            sessionId,
            groupId: session.groupId,
            userId: socket.userId!,
            content,
          })
        );
      } catch (error) {
        socketLogger.error({ err: error }, 'Agent run error');
        socket.emit('ai:error', {
          message: 'The research agent failed to start.',
          code: 'AGENT_ERROR',
          recoverable: true,
        });
      }
    });

    // Paper Question - requires @ai trigger
    socket.on('paper:question', async (rawData: unknown) => {
      try {
        const data = parsePayload(socket, socketPaperQuestionSchema, rawData);
        if (!data) return;
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
    socket.on('paper:summarize', async (rawData: unknown) => {
      try {
        const data = parsePayload(socket, socketPaperSummarizeSchema, rawData);
        if (!data) return;
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
    socket.on('typing:start', (rawSessionId: unknown) => {
      const sessionId = parsePayload(socket, socketJoinSessionSchema, rawSessionId);
      if (!sessionId) return;
      socket.to(`session:${sessionId}`).emit('user:typing', {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    socket.on('typing:stop', (rawSessionId: unknown) => {
      const sessionId = parsePayload(socket, socketJoinSessionSchema, rawSessionId);
      if (!sessionId) return;
      socket.to(`session:${sessionId}`).emit('user:stopped-typing', {
        userId: socket.userId,
      });
    });


    // Disconnect
    socket.on('disconnect', (reason) => {
      socketLogger.info({ userId: socket.userId, reason }, 'User disconnected');
    });
  });

  return io;
}
