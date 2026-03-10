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
  deep_research: 'Deep Research',
  methodology_extraction: 'Structured Comparison',
};

function formatAgenticContent(response: AgenticRunResponse): string {
  const result = response.result as Record<string, unknown> | undefined;

  // Known result keys in priority order
  const resultKeys = [
    'deep_research', 'literature_review', 'research_gaps', 'fact_check',
    'novelty', 'mentor_advice', 'paper_draft', 'research_plan',
    'methodology_matrix', 'papers', 'result',
  ];

  // Extract the first non-null string value from the result object.
  // The LLM output already contains its own headings — do NOT wrap with extra ## / ###.
  let body = '';
  if (result && typeof result === 'object') {
    for (const key of resultKeys) {
      if (!(key in result)) continue;
      const value = (result as Record<string, unknown>)[key];
      if (value == null) continue;
      if (typeof value === 'string') {
        body = value;
        break;
      } else if (Array.isArray(value)) {
        body = value
          .map((item) => (typeof item === 'string' ? `- ${item}` : `- ${JSON.stringify(item)}`))
          .join('\n');
        break;
      }
    }
    if (!body) {
      body = JSON.stringify(result, null, 2);
    }
  } else {
    body = JSON.stringify(result || {}, null, 2);
  }

  // Artifacts and latency are stored in message metadata — not rendered as markdown.
  return body;
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
          artifacts: response.artifacts || [],
          latency_ms: response.latency_ms || 0,
        },
      });
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});


router.post('/citation-graph/build', async (req: AuthRequest, res: Response, next) => {
  try {
    const { query, groupId } = req.body;
    if (!query || typeof query !== 'string') {
      throw createError('query is required', 400);
    }

    const result = await aiClient.buildCitationGraph({ query, group_id: groupId });
    res.json(result);
  } catch (error) {
    next(error);
  }
});


// ============ Workflow Routes ============

// ── Workflow chat progress tracker ──────────────────────────────────
// Builds a live-updating markdown message in the chat window showing
// which workflow steps are pending / running / completed, mirroring
// the progress indicators that single-shot agents already display.

interface WfChatTracker {
  messageId: string;
  totalSteps: number;
  title: string;
  stepNames: Map<number, string>;
  stepStatuses: Map<number, { status: string; preview?: string }>;
}

function buildWorkflowMarkdown(t: WfChatTracker): string {
  const lines: string[] = [`**🔬 ${t.title}**`, ''];
  for (let i = 0; i < t.totalSteps; i++) {
    const name = t.stepNames.get(i) || `Step ${i + 1}`;
    const info = t.stepStatuses.get(i);
    if (!info) { lines.push(`⬚ ${name}`); continue; }
    const icon: Record<string, string> = {
      running: '⏳', completed: '✅', failed: '❌', awaiting_approval: '⏸️',
    };
    let line = `${icon[info.status] || '⬚'} **${name}**`;
    if (info.status === 'running') line += ' — Running…';
    else if (info.status === 'completed') line += ' — Done';
    else if (info.status === 'failed') line += ' — Failed';
    else if (info.status === 'awaiting_approval') line += ' — Awaiting approval';
    lines.push(line);
  }
  return lines.join('\n');
}

function applyWorkflowEvent(t: WfChatTracker, ev: Record<string, unknown>): string {
  const type = ev.type as string;
  if (type === 'workflow:planned') {
    const plan = ev.plan as Record<string, unknown> | undefined;
    if (plan) {
      t.title = (plan.title as string) || t.title;
      const steps = plan.steps as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(steps)) {
        t.totalSteps = steps.length;
        steps.forEach((s) => {
          const idx = (s.step_index as number) ?? 0;
          t.stepNames.set(idx, (s.name as string) || `Step ${idx + 1}`);
        });
      }
    }
  }
  if (type === 'workflow:step:started') {
    const idx = ev.step_index as number;
    t.totalSteps = Math.max(t.totalSteps, (ev.total_steps as number) || t.totalSteps);
    t.stepNames.set(idx, (ev.name as string) || t.stepNames.get(idx) || `Step ${idx + 1}`);
    t.stepStatuses.set(idx, { status: 'running' });
  }
  if (type === 'workflow:step:completed') {
    const idx = ev.step_index as number;
    t.stepStatuses.set(idx, {
      status: 'completed',
      preview: ((ev.output_preview as string) || '').slice(0, 120),
    });
  }
  if (type === 'workflow:step:checkpoint') {
    const idx = ev.step_index as number;
    t.stepStatuses.set(idx, { status: 'awaiting_approval' });
  }
  if (type === 'workflow:failed') {
    const idx = ev.step_index as number;
    if (idx !== undefined) t.stepStatuses.set(idx, { status: 'failed' });
  }
  return buildWorkflowMarkdown(t);
}

/** Create a placeholder AI message and return a tracker for live chat updates. */
async function createWorkflowChatPlaceholder(sessionId: string, workflowId: string) {
  const [placeholder] = await db.insert(messages).values({
    sessionId,
    userId: null,
    content: '**🔬 Starting workflow…**',
    type: 'ai',
    metadata: { streaming: true, task_type: 'workflow', workflow_id: workflowId },
  }).returning();

  io.to(`session:${sessionId}`).emit('message:new', {
    ...placeholder,
    userName: 'AI Assistant',
    userAvatar: null,
  });

  const tracker: WfChatTracker = {
    messageId: placeholder.id,
    totalSteps: 0,
    title: 'Research Workflow',
    stepNames: new Map(),
    stepStatuses: new Map(),
  };
  return tracker;
}

/** Handle a single workflow NDJSON event: update the chat message via socket and emit workflow:event. */
function relayWorkflowEvent(
  sessionId: string,
  workflowId: string,
  tracker: WfChatTracker,
  event: Record<string, unknown>,
) {
  // Always emit workflow:event for the WorkflowPanel sidebar
  io.to(`session:${sessionId}`).emit('workflow:event', { workflowId, ...event });

  const type = event.type as string;
  const progressContent = applyWorkflowEvent(tracker, event);

  if (type === 'workflow:completed') {
    const latencyMs = event.latency_ms as number;
    const mins = latencyMs ? Math.round(latencyMs / 60000) : 0;
    const timeStr = mins > 0 ? `${mins} min` : 'under a minute';
    const finalContent = progressContent + `\n\n---\n\n✅ **Workflow completed in ${timeStr}.**`;
    io.to(`session:${sessionId}`).emit('ai:token:done', {
      messageId: tracker.messageId,
      content: finalContent,
      metadata: { streaming: false, task_type: 'workflow', workflow_id: workflowId },
    });
    db.update(messages)
      .set({ content: finalContent, metadata: { task_type: 'workflow', workflow_id: workflowId } })
      .where(eq(messages.id, tracker.messageId))
      .execute()
      .catch(() => {});
  } else if (type === 'workflow:failed') {
    const errContent = progressContent + `\n\n---\n\n❌ **Workflow failed:** ${event.error || 'Unknown error'}`;
    io.to(`session:${sessionId}`).emit('ai:token:done', {
      messageId: tracker.messageId,
      content: errContent,
      metadata: { streaming: false, task_type: 'workflow', workflow_id: workflowId, error: true },
    });
    db.update(messages)
      .set({ content: errContent, metadata: { task_type: 'workflow', workflow_id: workflowId, error: true } })
      .where(eq(messages.id, tracker.messageId))
      .execute()
      .catch(() => {});
  } else if (type === 'workflow:step:checkpoint') {
    const stepOutput = (event.output as string) || '';
    const stepIndex = (event.step_index as number | undefined) ?? -1;
    const stepName = (event.step_name as string | undefined) || undefined;
    const outputPreview = stepOutput.length > 3000 ? stepOutput.slice(0, 3000) + '\n\n... (truncated)' : stepOutput;
    const pauseContent = progressContent
      + (outputPreview ? `\n\n<details><summary>Step output (click to expand)</summary>\n\n${outputPreview}\n\n</details>` : '')
      + `\n\n---\n\n⏸️ **Paused** — Review the output and approve to continue.`;
    io.to(`session:${sessionId}`).emit('ai:token:done', {
      messageId: tracker.messageId,
      content: pauseContent,
      metadata: {
        streaming: false,
        task_type: 'workflow',
        workflow_id: workflowId,
        paused: true,
        step_index: stepIndex,
        checkpoint_step_name: stepName,
      },
    });
    db.update(messages)
      .set({
        content: pauseContent,
        metadata: {
          task_type: 'workflow',
          workflow_id: workflowId,
          paused: true,
          step_index: stepIndex,
          checkpoint_step_name: stepName,
        },
      })
      .where(eq(messages.id, tracker.messageId))
      .execute()
      .catch(() => {});
  } else {
    // In-flight progress update
    io.to(`session:${sessionId}`).emit('agentic:progress', {
      messageId: tracker.messageId,
      content: progressContent,
    });
  }
}

router.get('/workflows/templates', async (req: AuthRequest, res: Response, next) => {
  try {
    const templates = await aiClient.listWorkflowTemplates();
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

router.post('/workflows/plan', async (req: AuthRequest, res: Response, next) => {
  try {
    const { goal, groupId, sessionId, preferredTemplate } = req.body;
    const userId = req.user!.id;

    if (!goal || typeof goal !== 'string' || goal.length < 10) {
      throw createError('goal must be at least 10 characters', 400);
    }

    const plan = await aiClient.planWorkflow({
      goal,
      group_id: groupId || undefined,
      user_id: userId,
      session_id: sessionId,
      preferred_template: preferredTemplate,
    });

    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.post('/workflows/start', async (req: AuthRequest, res: Response, next) => {
  try {
    const { workflowId, userFeedback, sessionId } = req.body;

    if (!workflowId) {
      throw createError('workflowId is required', 400);
    }

    // Create a live chat message for workflow progress (if in a session)
    let tracker: WfChatTracker | null = null;
    if (sessionId) {
      tracker = await createWorkflowChatPlaceholder(sessionId, workflowId);
    }

    await aiClient.startWorkflowStream(
      { workflow_id: workflowId, user_feedback: userFeedback },
      (event) => {
        if (sessionId && tracker) {
          relayWorkflowEvent(sessionId, workflowId, tracker, event);
        } else if (sessionId) {
          // Fallback: emit workflow:event only
          io.to(`session:${sessionId}`).emit('workflow:event', { workflowId, ...event });
        }
      },
    );

    res.json({ status: 'completed', workflowId });
  } catch (error) {
    next(error);
  }
});

router.post('/workflows/approve-step', async (req: AuthRequest, res: Response, next) => {
  try {
    const { workflowId, stepIndex, approved, feedback, sessionId } = req.body;

    if (!workflowId) {
      throw createError('workflowId is required', 400);
    }
    if (stepIndex === undefined || stepIndex === null) {
      throw createError('stepIndex is required', 400);
    }

    // On approval, create a new chat message for the continuation phase
    let tracker: WfChatTracker | null = null;
    if (sessionId && approved) {
      tracker = await createWorkflowChatPlaceholder(sessionId, workflowId);

      // Pre-populate tracker with already-completed steps from prior phases
      try {
        const status = await aiClient.getWorkflowStatus(workflowId);
        const statusObj = status as unknown as Record<string, unknown>;
        const existingSteps = statusObj?.steps;
        if (Array.isArray(existingSteps)) {
          tracker.totalSteps = existingSteps.length;
          for (const s of existingSteps) {
            const step = s as Record<string, unknown>;
            const idx = step.step_index as number;
            tracker.stepNames.set(idx, (step.name as string) || `Step ${idx + 1}`);
            const st = step.status as string;
            if (st === 'completed' || st === 'approved') {
              tracker.stepStatuses.set(idx, { status: 'completed' });
            }
          }
        }
      } catch {
        // Non-fatal — tracker will fill in from events
      }
    }

    // On rejection, post a short note in chat
    if (sessionId && !approved) {
      const [rejMsg] = await db.insert(messages).values({
        sessionId,
        userId: null,
        content: `⏸️ **Workflow step ${stepIndex + 1} rejected.** Workflow remains paused.${feedback ? `\n\n> Feedback: ${feedback}` : ''}`,
        type: 'ai',
        metadata: { task_type: 'workflow', workflow_id: workflowId },
      }).returning();
      io.to(`session:${sessionId}`).emit('message:new', {
        ...rejMsg,
        userName: 'AI Assistant',
        userAvatar: null,
      });
    }

    await aiClient.approveWorkflowStepStream(
      {
        workflow_id: workflowId,
        step_index: stepIndex,
        approved: !!approved,
        feedback,
      },
      (event) => {
        if (sessionId && tracker && approved) {
          relayWorkflowEvent(sessionId, workflowId, tracker, event);
        } else if (sessionId) {
          io.to(`session:${sessionId}`).emit('workflow:event', { workflowId, ...event });
        }
      },
    );

    res.json({ status: approved ? 'resumed' : 'rejected', workflowId });
  } catch (error) {
    next(error);
  }
});

router.post('/workflows/cancel', async (req: AuthRequest, res: Response, next) => {
  try {
    const { workflowId } = req.body;
    if (!workflowId) {
      throw createError('workflowId is required', 400);
    }

    const result = await aiClient.cancelWorkflow(workflowId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/workflows/:workflowId/status', async (req: AuthRequest, res: Response, next) => {
  try {
    const { workflowId } = req.params;
    const status = await aiClient.getWorkflowStatus(workflowId);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/workflows/group/:groupId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await aiClient.listGroupWorkflows(groupId, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});


export default router;
