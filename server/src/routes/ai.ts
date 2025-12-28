/**
 * AI Routes
 * 
 * Proxy routes to the FastAPI AI service.
 * These provide REST access to AI features for clients that prefer HTTP over WebSocket.
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { aiClient } from '../services/aiClient.js';
import { db, sessions, groupMembers, messages } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { createError } from '../middleware/error.js';

const router = Router();

// Helper to check session access
async function checkSessionAccess(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return null;
  }

  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, session.groupId),
        eq(groupMembers.userId, userId)
      )
    )
    .limit(1);

  return membership ? session : null;
}

// Health check - no auth required
router.get('/health', async (req, res, next) => {
  try {
    const health = await aiClient.health();
    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'AI service not reachable',
    });
  }
});

// All other routes require authentication
router.use(authenticate);

// Chat Q&A
router.post('/chat', async (req: AuthRequest, res: Response, next) => {
  try {
    const { question, sessionId, includePapers = true, maxContextMessages = 30 } = req.body;
    const userId = req.user!.id;

    if (!question || typeof question !== 'string') {
      throw createError('Question is required', 400);
    }

    // If sessionId provided, verify access
    if (sessionId) {
      const session = await checkSessionAccess(sessionId, userId);
      if (!session) {
        throw createError('Session not found or access denied', 404);
      }
    }

    const response = await aiClient.chat({
      question,
      session_id: sessionId,
      user_id: userId,
      include_papers: includePapers,
      max_context_messages: maxContextMessages,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Ask in session context (with @ai prefix handling)
router.post('/ask/:sessionId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const { question } = req.body;
    const userId = req.user!.id;

    if (!question || typeof question !== 'string') {
      throw createError('Question is required', 400);
    }

    // Verify session access
    const session = await checkSessionAccess(sessionId, userId);
    if (!session) {
      throw createError('Session not found or access denied', 404);
    }

    // Process the question (strip @ai prefix if present)
    const cleanQuestion = question.trim().toLowerCase().startsWith('@ai')
      ? question.trim().slice(3).trim()
      : question.trim();

    if (!cleanQuestion) {
      throw createError('Please provide a question', 400);
    }

    const response = await aiClient.chat({
      question: cleanQuestion,
      session_id: sessionId,
      user_id: userId,
      include_papers: true,
      max_context_messages: 30,
    });

    // Optionally save AI response as a message
    if (req.query.save === 'true') {
      await db.insert(messages).values({
        sessionId,
        userId: null,
        content: response.answer,
        type: 'ai',
        metadata: {
          sources: response.sources,
          model: response.model,
          latency_ms: response.latency_ms,
        },
      });
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Summarize session
router.post('/summarize/:sessionId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const { maxMessages = 100 } = req.body;
    const userId = req.user!.id;

    // Verify session access
    const session = await checkSessionAccess(sessionId, userId);
    if (!session) {
      throw createError('Session not found or access denied', 404);
    }

    const response = await aiClient.summarize({
      session_id: sessionId,
      max_messages: maxMessages,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
