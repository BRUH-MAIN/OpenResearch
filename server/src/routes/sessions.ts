import { Router } from 'express';
import { db, sessions, groupMembers, messages, users } from '../db/index.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { requireSessionAccess, GroupRequest } from '../middleware/groupAccess.js';
import { validate } from '../middleware/validate.js';
import { createSessionSchema, updateSessionSchema } from '../validation/schemas.js';
import { createError } from '../middleware/error.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get sessions for a group
router.get('/group/:groupId', async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    const groupSessions = await db
      .select({
        id: sessions.id,
        groupId: sessions.groupId,
        title: sessions.title,
        status: sessions.status,
        createdAt: sessions.createdAt,
        lastActivityAt: sessions.lastActivityAt,
        messageCount: count(messages.id),
      })
      .from(sessions)
      .leftJoin(messages, eq(messages.sessionId, sessions.id))
      .where(eq(sessions.groupId, groupId))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.lastActivityAt));

    res.json(groupSessions);
  } catch (error) {
    next(error);
  }
});

// Create session
router.post('/', validate(createSessionSchema), async (req: AuthRequest, res, next) => {
  try {
    const { groupId, title } = req.body;
    const userId = req.user!.id;

    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    const [newSession] = await db
      .insert(sessions)
      .values({
        groupId,
        title,
        status: 'active',
      })
      .returning();

    res.status(201).json({
      ...newSession,
      messageCount: 0,
    });
  } catch (error) {
    next(error);
  }
});

// All /:sessionId routes: load session + verify group membership once
router.use('/:sessionId', requireSessionAccess);

// Get single session
router.get('/:sessionId', async (req: GroupRequest, res, next) => {
  try {
    const session = req.session!;

    const [{ count: messageCount }] = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.sessionId, session.id));

    res.json({
      ...session,
      messageCount,
    });
  } catch (error) {
    next(error);
  }
});

// Update session
router.patch('/:sessionId', validate(updateSessionSchema), async (req: GroupRequest, res, next) => {
  try {
    const { sessionId } = req.params;
    const { title, status } = req.body;

    const updateData: Record<string, unknown> = {};
    if (title) updateData.title = title;
    if (status && ['active', 'archived'].includes(status)) {
      updateData.status = status;
    }

    const [updatedSession] = await db
      .update(sessions)
      .set(updateData)
      .where(eq(sessions.id, sessionId))
      .returning();

    res.json(updatedSession);
  } catch (error) {
    next(error);
  }
});

// Delete session
router.delete('/:sessionId', async (req: GroupRequest, res, next) => {
  try {
    const { sessionId } = req.params;

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get session messages
router.get('/:sessionId/messages', async (req: GroupRequest, res, next) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const sessionMessages = await db
      .select({
        id: messages.id,
        sessionId: messages.sessionId,
        userId: messages.userId,
        content: messages.content,
        type: messages.type,
        metadata: messages.metadata,
        createdAt: messages.createdAt,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.userId))
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt)
      .limit(limit)
      .offset(offset);

    res.json(sessionMessages);
  } catch (error) {
    next(error);
  }
});

// Delete a message (own messages, or any message if group owner)
router.delete('/:sessionId/messages/:messageId', async (req: GroupRequest, res, next) => {
  try {
    const { sessionId, messageId } = req.params;
    const userId = req.user!.id;
    const membership = req.membership!;

    const [message] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.sessionId, sessionId)))
      .limit(1);

    if (!message) {
      throw createError('Message not found', 404);
    }

    if (message.userId !== userId && membership.role !== 'owner') {
      throw createError('Can only delete your own messages', 403);
    }

    await db.delete(messages).where(eq(messages.id, messageId));

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Clear all messages in a session (group owner only)
router.delete('/:sessionId/messages', async (req: GroupRequest, res, next) => {
  try {
    const { sessionId } = req.params;

    if (req.membership!.role !== 'owner') {
      throw createError('Only group owner can clear all messages', 403);
    }

    await db.delete(messages).where(eq(messages.sessionId, sessionId));

    res.json({ message: 'All messages cleared' });
  } catch (error) {
    next(error);
  }
});

export default router;
