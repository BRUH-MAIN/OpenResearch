import { Router, Response } from 'express';
import { db, sessions, groupMembers, messages, tasks, users } from '../db/index.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Helper to check group membership
async function checkGroupMembership(groupId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return membership;
}

// Get sessions for a group
router.get('/group/:groupId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    const membership = await checkGroupMembership(groupId, userId);
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

// Get single session
router.get('/:sessionId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw createError('Session not found', 404);
    }

    const membership = await checkGroupMembership(session.groupId, userId);
    if (!membership) {
      throw createError('Access denied', 403);
    }

    // Get message count
    const [{ count: messageCount }] = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.sessionId, sessionId));

    res.json({
      ...session,
      messageCount,
    });
  } catch (error) {
    next(error);
  }
});

// Create session
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId, title } = req.body;
    const userId = req.user!.id;

    if (!groupId || !title) {
      throw createError('Group ID and title are required', 400);
    }

    const membership = await checkGroupMembership(groupId, userId);
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

// Update session
router.patch('/:sessionId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;
    const { title, status } = req.body;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw createError('Session not found', 404);
    }

    const membership = await checkGroupMembership(session.groupId, userId);
    if (!membership) {
      throw createError('Access denied', 403);
    }

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
router.delete('/:sessionId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw createError('Session not found', 404);
    }

    // Only group owner can delete sessions
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, session.groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.role, 'owner')
        )
      )
      .limit(1);

    if (!membership) {
      throw createError('Only the group owner can delete sessions', 403);
    }

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get session messages
router.get('/:sessionId/messages', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw createError('Session not found', 404);
    }

    const membership = await checkGroupMembership(session.groupId, userId);
    if (!membership) {
      throw createError('Access denied', 403);
    }

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

// Get session tasks
router.get('/:sessionId/tasks', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw createError('Session not found', 404);
    }

    const membership = await checkGroupMembership(session.groupId, userId);
    if (!membership) {
      throw createError('Access denied', 403);
    }

    const sessionTasks = await db
      .select({
        id: tasks.id,
        sessionId: tasks.sessionId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        assignedTo: tasks.assignedTo,
        createdAt: tasks.createdAt,
        assigneeName: users.name,
        assigneeAvatar: users.avatar,
      })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assignedTo))
      .where(eq(tasks.sessionId, sessionId))
      .orderBy(desc(tasks.createdAt));

    res.json(sessionTasks);
  } catch (error) {
    next(error);
  }
});

// Create task
router.post('/:sessionId/tasks', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;
    const { title, description, assignedTo } = req.body;

    if (!title) {
      throw createError('Title is required', 400);
    }

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw createError('Session not found', 404);
    }

    const membership = await checkGroupMembership(session.groupId, userId);
    if (!membership) {
      throw createError('Access denied', 403);
    }

    const [newTask] = await db
      .insert(tasks)
      .values({
        sessionId,
        title,
        description,
        assignedTo,
        status: 'pending',
      })
      .returning();

    res.status(201).json(newTask);
  } catch (error) {
    next(error);
  }
});

// Update task
router.patch('/:sessionId/tasks/:taskId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId, taskId } = req.params;
    const userId = req.user!.id;
    const { title, description, status, assignedTo } = req.body;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw createError('Session not found', 404);
    }

    const membership = await checkGroupMembership(session.groupId, userId);
    if (!membership) {
      throw createError('Access denied', 403);
    }

    const updateData: Record<string, unknown> = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status && ['pending', 'in-progress', 'completed'].includes(status)) {
      updateData.status = status;
    }
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;

    const [updatedTask] = await db
      .update(tasks)
      .set(updateData)
      .where(and(eq(tasks.id, taskId), eq(tasks.sessionId, sessionId)))
      .returning();

    if (!updatedTask) {
      throw createError('Task not found', 404);
    }

    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
});

export default router;
