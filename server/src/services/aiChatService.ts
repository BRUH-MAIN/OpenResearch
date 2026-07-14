/**
 * Streams a group-scoped RAG answer into a chat session.
 *
 * Flow: insert an empty placeholder AI message -> stream tokens from the
 * AI service, relaying each as `ai:token` -> persist the final content and
 * emit `ai:token:done` with the retrieval metadata (sources, model, latency).
 */

import { Server as SocketServer } from 'socket.io';
import { db, messages } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { aiClient } from './aiClient.js';
import logger from '../utils/logger.js';

const aiChatLogger = logger.child({ context: 'ai-chat' });

export interface AiChatParams {
  sessionId: string;
  groupId: string;
  userId: string;
  content: string;
}

export async function streamAiChatToSession(
  io: SocketServer,
  { sessionId, groupId, userId, content }: AiChatParams
): Promise<void> {
  const room = `session:${sessionId}`;

  // Placeholder message so the UI shows the AI bubble immediately
  const [placeholder] = await db
    .insert(messages)
    .values({
      sessionId,
      userId: null,
      content: '',
      type: 'ai',
      metadata: { streaming: true },
    })
    .returning();

  io.to(room).emit('message:new', {
    ...placeholder,
    userName: 'AI Assistant',
    userAvatar: null,
  });

  let accumulated = '';
  let streamMeta: Record<string, unknown> = {};

  try {
    for await (const chunk of aiClient.groupAIChatStream({
      prompt: content,
      group_id: groupId,
      session_id: sessionId,
      user_id: userId,
    })) {
      if (chunk.error) {
        aiChatLogger.error({ err: chunk.error }, 'AI stream error chunk');
        break;
      }

      if (chunk.token) {
        accumulated += chunk.token;
        io.to(room).emit('ai:token', {
          messageId: placeholder.id,
          token: chunk.token,
        });
      }

      if (chunk.done) {
        streamMeta = {
          sources: chunk.sources || [],
          model: chunk.model || 'llm',
          latency_ms: chunk.latency_ms || 0,
          context_items_used: (chunk as Record<string, unknown>).context_items_used || 0,
          vector_ids_used: (chunk as Record<string, unknown>).vector_ids_used || [],
        };
      }
    }
  } catch (streamErr) {
    aiChatLogger.error({ err: streamErr }, 'AI token stream error');
    if (!accumulated) {
      accumulated = 'I encountered an error while generating a response. Please try again.';
    }
  }

  // Persist final content
  await db
    .update(messages)
    .set({
      content: accumulated,
      metadata: { ...streamMeta, streaming: false },
    })
    .where(eq(messages.id, placeholder.id));

  io.to(room).emit('ai:token:done', {
    messageId: placeholder.id,
    content: accumulated,
    metadata: streamMeta,
  });
}
