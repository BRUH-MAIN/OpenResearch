/**
 * AI Routes
 * 
 * Proxy routes to the FastAPI AI service.
 * These provide REST access to AI features for clients that prefer HTTP over WebSocket.
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { aiClient, AgenticRunResponse, AgenticTaskType } from '../services/aiClient.js';
import { db, sessions, groupMembers, messages } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { createError } from '../middleware/error.js';
import { agenticLimiter } from '../middleware/rateLimiter.js';
import { io } from '../index.js';


const router = Router();

const AGENTIC_TASK_LABELS: Record<AgenticTaskType, string> = {
  paper_retrieval: 'Paper Retrieval',
  literature_survey: 'Literature Survey',
  gap_analysis: 'Gap Analysis',
  fact_check: 'Fact Check',
  novelty_assessment: 'Novelty Assessment',
  research_mentor: 'Research Mentor',
  paper_writing: 'Paper Writing',
  research_planning: 'Research Planning',
  deep_research: 'Deep Research',
  methodology_extraction: 'Methodology Extraction',
  reviewer_anticipation: 'Reviewer Anticipation',
};

function formatAgenticContent(response: AgenticRunResponse): string {
  const label = AGENTIC_TASK_LABELS[response.task_type] || 'Agentic Task';
  const result = response.result as Record<string, unknown> | undefined;

  const sections: Array<{ key: string; title: string }> = [
    { key: 'deep_research', title: 'Deep Research' },
    { key: 'literature_review', title: 'Literature Review' },
    { key: 'research_gaps', title: 'Research Gaps' },
    { key: 'fact_check', title: 'Fact Check' },
    { key: 'novelty', title: 'Novelty Assessment' },
    { key: 'mentor_advice', title: 'Mentor Advice' },
    { key: 'paper_draft', title: 'Paper Draft' },
    { key: 'research_plan', title: 'Research Plan' },
    { key: 'methodology_matrix', title: 'Methodology Comparison' },
    { key: 'reviewer_critiques', title: 'Reviewer Critiques' },
    { key: 'papers', title: 'Papers' },
    { key: 'result', title: 'Result' },
  ];

  const parts: string[] = [];

  if (result && typeof result === 'object') {
    sections.forEach(({ key, title }) => {
      if (!(key in result)) return;
      const value = (result as Record<string, unknown>)[key];
      if (value == null) return;

      let sectionBody = '';
      if (Array.isArray(value)) {
        sectionBody = value
          .map((item) => (typeof item === 'string' ? `- ${item}` : `- ${JSON.stringify(item)}`))
          .join('\n');
      } else if (typeof value === 'string') {
        sectionBody = value;
      } else {
        sectionBody = JSON.stringify(value, null, 2);
      }

      parts.push(`### ${title}\n\n${sectionBody}`);
    });
  }

  const body = parts.length > 0 ? parts.join('\n\n') : JSON.stringify(result || {}, null, 2);
  const artifacts = response.artifacts?.length
    ? `\n\n**Artifacts**\n${response.artifacts.map((artifactId) => `- ${artifactId}`).join('\n')}`
    : '';
  const latency = response.latency_ms ? `\n\n_Completed in ${response.latency_ms}ms_` : '';

  return `## ${label}\n\n${body}${artifacts}${latency}`;
}

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


router.post('/agentic/run', agenticLimiter, async (req: AuthRequest, res: Response, next) => {
  try {
    const { taskType, prompt, groupId, sessionId, paperIds, options, agenticRunId } = req.body;
    const userId = req.user!.id;

    if (!taskType || typeof taskType !== 'string') {
      throw createError('taskType is required', 400);
    }

    if (!(taskType in AGENTIC_TASK_LABELS)) {
      throw createError('Invalid taskType', 400);
    }

    if (!prompt || typeof prompt !== 'string') {
      throw createError('prompt is required', 400);
    }

    let resolvedGroupId: string | undefined = groupId;

    if (sessionId) {
      const session = await checkSessionAccess(sessionId, userId);
      if (!session) {
        throw createError('Session not found or access denied', 404);
      }
      resolvedGroupId = session.groupId;
    }

    const response = await aiClient.runAgenticTaskStream(
      {
        task_type: taskType as AgenticTaskType,
        prompt,
        group_id: resolvedGroupId,
        user_id: userId,
        session_id: sessionId,
        paper_ids: paperIds,
        options,
      },
      (message) => {
        if (sessionId && agenticRunId) {
          io.to(`session:${sessionId}`).emit('agentic:progress', {
            messageId: agenticRunId,
            content: message,
          });
        }
      }
    );

    if (sessionId) {
      await db.insert(messages).values({
        sessionId,
        userId,
        content: prompt,
        type: 'user',
      });

      const content = formatAgenticContent(response);

      await db.insert(messages).values({
        sessionId,
        userId: null,
        content,
        type: 'ai',
        metadata: {
          task_type: response.task_type,
          artifacts: response.artifacts,
          latency_ms: response.latency_ms,
        },
      });
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
