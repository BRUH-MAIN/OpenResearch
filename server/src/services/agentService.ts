/**
 * Relays a research-agent run into a chat session.
 *
 * Unlike the plain chat stream, the agent's *reasoning* is part of the output:
 * each tool call and observation is pushed to the room as it happens, so the
 * user watches the investigation instead of a spinner. The steps are also
 * persisted onto the message, so reopening the session shows how the answer was
 * reached — an agent whose work you cannot inspect is not worth trusting.
 */

import { Server as SocketServer } from 'socket.io';
import { db, messages } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { aiClient } from './aiClient.js';
import logger from '../utils/logger.js';

const agentLogger = logger.child({ context: 'agent' });

export interface AgentRunParams {
  sessionId: string;
  groupId: string;
  userId: string;
  content: string;
}

interface AgentStep {
  n: number;
  tool: string;
  args?: Record<string, unknown>;
  summary?: string;
}

export async function runResearchAgentInSession(
  io: SocketServer,
  { sessionId, groupId, userId, content }: AgentRunParams
): Promise<void> {
  const room = `session:${sessionId}`;

  const [placeholder] = await db
    .insert(messages)
    .values({
      sessionId,
      userId: null,
      content: '',
      type: 'ai',
      metadata: { agent: true, streaming: true },
    })
    .returning();

  io.to(room).emit('message:new', {
    ...placeholder,
    userName: 'Research Agent',
    userAvatar: null,
  });

  const steps: AgentStep[] = [];
  let accumulated = '';
  let meta: Record<string, unknown> = {};

  try {
    for await (const event of aiClient.runResearchAgentStream({
      prompt: content,
      group_id: groupId,
      session_id: sessionId,
      user_id: userId,
    })) {
      if (event.error) {
        agentLogger.error({ err: event.error }, 'Agent stream error');
        break;
      }

      if (event.step) {
        steps.push({ n: event.step.n, tool: event.step.tool, args: event.step.args });
        io.to(room).emit('agent:step', {
          messageId: placeholder.id,
          ...event.step,
        });
      }

      if (event.observation) {
        const last = steps[steps.length - 1];
        if (last) last.summary = event.observation.summary;
        io.to(room).emit('agent:observation', {
          messageId: placeholder.id,
          ...event.observation,
        });
      }

      if (event.token) {
        accumulated += event.token;
        io.to(room).emit('ai:token', {
          messageId: placeholder.id,
          token: event.token,
        });
      }

      if (event.done) {
        meta = {
          agent: true,
          steps,
          iterations: event.iterations ?? steps.length,
          sources: event.sources ?? [],
          model: event.model ?? 'llm',
          latency_ms: event.latency_ms ?? 0,
        };
      }
    }
  } catch (err) {
    agentLogger.error({ err }, 'Research agent failed');
    if (!accumulated) {
      accumulated = 'The research agent could not complete this investigation. Please try again.';
    }
  }

  await db
    .update(messages)
    .set({
      content: accumulated,
      metadata: { ...meta, agent: true, steps, streaming: false },
    })
    .where(eq(messages.id, placeholder.id));

  io.to(room).emit('ai:token:done', {
    messageId: placeholder.id,
    content: accumulated,
    metadata: { ...meta, agent: true, steps, streaming: false },
  });
}
