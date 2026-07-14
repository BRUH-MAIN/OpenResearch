import { Response, NextFunction } from 'express';
import { db, groupMembers, sessions } from '../db/index.js';
import { and, eq } from 'drizzle-orm';
import { AuthRequest } from './auth.js';
import { createError } from './error.js';

export interface GroupRequest extends AuthRequest {
  membership?: { groupId: string; userId: string; role: string };
  session?: typeof sessions.$inferSelect;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guard before querying: a non-UUID id would fail the Postgres uuid cast with a 500.
function assertUuid(value: string, message: string) {
  if (!UUID_RE.test(value)) {
    throw createError(message, 404);
  }
}

async function findMembership(groupId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return membership;
}

/**
 * Requires the authenticated user to be a member of `req.params.groupId`.
 * Attaches the membership row to `req.membership`.
 */
export const requireGroupMember = async (
  req: GroupRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { groupId } = req.params;
    assertUuid(groupId, 'Group not found');
    const membership = await findMembership(groupId, req.user!.id);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Requires the authenticated user to be the owner of `req.params.groupId`.
 */
export const requireGroupOwner = async (
  req: GroupRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { groupId } = req.params;
    assertUuid(groupId, 'Group not found');
    const membership = await findMembership(groupId, req.user!.id);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }
    if (membership.role !== 'owner') {
      throw createError('Only the group owner can perform this action', 403);
    }

    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * For session-scoped routes: loads the session from `req.params.sessionId`,
 * verifies membership of its group, and attaches both to the request.
 */
export const requireSessionAccess = async (
  req: GroupRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    assertUuid(sessionId, 'Session not found');

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw createError('Session not found', 404);
    }

    const membership = await findMembership(session.groupId, req.user!.id);
    if (!membership) {
      throw createError('Access denied', 403);
    }

    req.session = session;
    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};
