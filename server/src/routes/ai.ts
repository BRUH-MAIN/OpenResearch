import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { messages } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// AI Server URL - configurable via environment variable
const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8000';

// Helper to proxy requests to AI server
async function proxyToAI(endpoint: string, data: any): Promise<any> {
  const response = await fetch(`${AI_SERVER_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'AI service error' })) as { detail?: string };
    throw new Error(error.detail || `AI service returned ${response.status}`);
  }

  return response.json();
}

// Format messages for AI server
interface DBMessage {
  id: string;
  content: string;
  type: string;
  createdAt: Date;
  user: { name: string } | null;
}

function formatMessages(dbMessages: DBMessage[]) {
  return dbMessages.map(msg => ({
    id: msg.id,
    content: msg.content,
    user_name: msg.user?.name || 'Unknown',
    type: msg.type,
    created_at: msg.createdAt.toISOString(),
  }));
}

// Check AI server health
router.get('/health', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${AI_SERVER_URL}/health`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      gemini_configured: false,
      error: 'AI server is not reachable',
    });
  }
});

// Summarize a session's conversation
router.post('/summarize/:sessionId', authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Get session and its messages
    const session = await db.query.sessions.findFirst({
      where: (s, { eq }) => eq(s.id, sessionId),
      with: {
        messages: {
          with: {
            user: true,
          },
          orderBy: (m, { asc }) => [asc(m.createdAt)],
        },
      },
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (!session.messages || session.messages.length === 0) {
      return res.status(400).json({ message: 'No messages in session to summarize' });
    }

    const result = await proxyToAI('/api/summarize', {
      session_title: session.title,
      messages: formatMessages(session.messages as unknown as DBMessage[]),
    });

    res.json(result);
  } catch (error) {
    console.error('Summarize error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to generate summary',
    });
  }
});

// Extract tasks from a session
router.post('/extract-tasks/:sessionId', authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Get session and its messages
    const session = await db.query.sessions.findFirst({
      where: (s, { eq }) => eq(s.id, sessionId),
      with: {
        messages: {
          with: {
            user: true,
          },
          orderBy: (m, { asc }) => [asc(m.createdAt)],
        },
      },
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (!session.messages || session.messages.length === 0) {
      return res.status(400).json({ message: 'No messages in session' });
    }

    const result = await proxyToAI('/api/extract-tasks', {
      session_title: session.title,
      messages: formatMessages(session.messages as unknown as DBMessage[]),
    });

    res.json(result);
  } catch (error) {
    console.error('Extract tasks error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to extract tasks',
    });
  }
});

// Ask a question about a session
router.post('/ask/:sessionId', authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ message: 'Question is required' });
    }

    // Get session and its messages
    const session = await db.query.sessions.findFirst({
      where: (s, { eq }) => eq(s.id, sessionId),
      with: {
        messages: {
          with: {
            user: true,
          },
          orderBy: (m, { asc }) => [asc(m.createdAt)],
        },
      },
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (!session.messages || session.messages.length === 0) {
      return res.status(400).json({ message: 'No messages in session to analyze' });
    }

    const result = await proxyToAI('/api/ask', {
      question,
      session_title: session.title,
      messages: formatMessages(session.messages as unknown as DBMessage[]),
    });

    res.json(result);
  } catch (error) {
    console.error('Ask question error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to answer question',
    });
  }
});

export default router;
