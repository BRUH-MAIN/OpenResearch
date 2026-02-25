import { Router } from 'express';
import { db, groups, groupMembers, users, groupInvitations, friends } from '../db/index.js';
import { eq, and, count, desc, lt } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import { isSoftDbErrorForUi } from '../utils/dbErrors.js';
import { parseLimit, decodeCursor, buildPaginatedResponse } from '../utils/pagination.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get user's groups (with optional cursor-based pagination)
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const limit = parseLimit(req.query.limit as string);
    const cursorId = decodeCursor(req.query.cursor as string);

    let query = db
      .select({
        group: groups,
        role: groupMembers.role,
        memberCount: count(groupMembers.userId),
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(
        cursorId
          ? and(eq(groupMembers.userId, userId), lt(groups.createdAt, db.select({ createdAt: groups.createdAt }).from(groups).where(eq(groups.id, cursorId)).limit(1)))
          : eq(groupMembers.userId, userId)
      )
      .groupBy(groups.id, groupMembers.role)
      .orderBy(desc(groups.createdAt))
      .limit(limit + 1); // fetch one extra to detect hasMore

    const userGroups = await query;

    const formattedGroups = userGroups.map(({ group, role, memberCount }) => ({
      ...group,
      role,
      memberCount,
    }));

    res.json(buildPaginatedResponse(formattedGroups, limit));
  } catch (error) {
    next(error);
  }
});

// Get single group
router.get('/:groupId', async (req: AuthRequest, res, next) => {
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

    const [group] = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        ownerId: groups.ownerId,
        avatar: groups.avatar,
        createdAt: groups.createdAt,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(groups)
      .innerJoin(users, eq(users.id, groups.ownerId))
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) {
      throw createError('Group not found', 404);
    }

    const [{ count: memberCount }] = await db
      .select({ count: count() })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));

    res.json({
      ...group,
      memberCount,
      userRole: membership.role,
    });
  } catch (error) {
    next(error);
  }
});

// Create group
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { name, description, avatar } = req.body;
    const userId = req.user!.id;

    if (!name || !description) {
      throw createError('Name and description are required', 400);
    }

    const [newGroup] = await db
      .insert(groups)
      .values({
        name,
        description,
        ownerId: userId,
        avatar: avatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(name)}`,
      })
      .returning();

    await db.insert(groupMembers).values({
      groupId: newGroup.id,
      userId,
      role: 'owner',
    });

    res.status(201).json({
      ...newGroup,
      memberCount: 1,
      role: 'owner',
    });
  } catch (error) {
    next(error);
  }
});

// Update group
router.patch('/:groupId', async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const { name, description, avatar } = req.body;

    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId)))
      .limit(1);

    if (!group) {
      throw createError('Group not found or you are not the owner', 403);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (avatar) updateData.avatar = avatar;

    const [updatedGroup] = await db
      .update(groups)
      .set(updateData)
      .where(eq(groups.id, groupId))
      .returning();

    res.json(updatedGroup);
  } catch (error) {
    next(error);
  }
});

// Delete group
router.delete('/:groupId', async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId)))
      .limit(1);

    if (!group) {
      throw createError('Group not found or you are not the owner', 403);
    }

    await db.delete(groups).where(eq(groups.id, groupId));

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get group members
router.get('/:groupId/members', async (req: AuthRequest, res, next) => {
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

    const members = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId));

    res.json(members);
  } catch (error) {
    next(error);
  }
});

// Add member to group
router.post('/:groupId/members', async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const { email } = req.body;

    if (!email) {
      throw createError('Email is required', 400);
    }

    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId)))
      .limit(1);

    if (!group) {
      throw createError('Group not found or you are not the owner', 403);
    }

    const [userToAdd] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!userToAdd) {
      throw createError('User not found', 404);
    }

    const [existingMember] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userToAdd.id)))
      .limit(1);

    if (existingMember) {
      throw createError('User is already a member', 409);
    }

    await db.insert(groupMembers).values({
      groupId,
      userId: userToAdd.id,
      role: 'member',
    });

    res.status(201).json({
      userId: userToAdd.id,
      name: userToAdd.name,
      email: userToAdd.email,
      avatar: userToAdd.avatar,
      role: 'member',
    });
  } catch (error) {
    next(error);
  }
});

// Remove member from group
router.delete('/:groupId/members/:memberId', async (req: AuthRequest, res, next) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user!.id;

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) {
      throw createError('Group not found', 404);
    }

    if (group.ownerId !== userId && memberId !== userId) {
      throw createError('Only the owner can remove members', 403);
    }

    if (memberId === group.ownerId) {
      throw createError('Cannot remove the group owner', 400);
    }

    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberId)));

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
});

// ==================== GROUP INVITATIONS ====================

// Get user's pending group invitations
router.get('/invitations/pending', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    const invitations = await db
      .select({
        id: groupInvitations.id,
        groupId: groupInvitations.groupId,
        groupName: groups.name,
        groupAvatar: groups.avatar,
        groupDescription: groups.description,
        invitedBy: groupInvitations.invitedBy,
        inviterName: users.name,
        inviterAvatar: users.avatar,
        message: groupInvitations.message,
        createdAt: groupInvitations.createdAt,
        expiresAt: groupInvitations.expiresAt,
      })
      .from(groupInvitations)
      .innerJoin(groups, eq(groups.id, groupInvitations.groupId))
      .innerJoin(users, eq(users.id, groupInvitations.invitedBy))
      .where(and(eq(groupInvitations.invitedUserId, userId), eq(groupInvitations.status, 'pending')))
      .orderBy(desc(groupInvitations.createdAt));

    res.json(invitations);
  } catch (error) {
    if (process.env.NODE_ENV === 'development' && isSoftDbErrorForUi(error)) {
      res.json([]);
      return;
    }
    next(error);
  }
});

// Get group's pending invitations
router.get('/:groupId/invitations', async (req: AuthRequest, res, next) => {
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

    const invitations = await db
      .select({
        id: groupInvitations.id,
        invitedUserId: groupInvitations.invitedUserId,
        invitedUserName: users.name,
        invitedUserEmail: users.email,
        invitedUserAvatar: users.avatar,
        status: groupInvitations.status,
        message: groupInvitations.message,
        createdAt: groupInvitations.createdAt,
      })
      .from(groupInvitations)
      .innerJoin(users, eq(users.id, groupInvitations.invitedUserId))
      .where(eq(groupInvitations.groupId, groupId))
      .orderBy(desc(groupInvitations.createdAt));

    res.json(invitations);
  } catch (error) {
    next(error);
  }
});

// Invite user to group
router.post('/:groupId/invitations', async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const { invitedUserId, email, message } = req.body;

    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    let targetUserId = invitedUserId;

    if (!targetUserId && email) {
      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!targetUser) {
        throw createError('User not found', 404);
      }
      targetUserId = targetUser.id;
    }

    if (!targetUserId) {
      throw createError('User ID or email is required', 400);
    }

    const [existingMember] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)))
      .limit(1);

    if (existingMember) {
      throw createError('User is already a member of this group', 409);
    }

    const [existingInvite] = await db
      .select()
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.groupId, groupId),
          eq(groupInvitations.invitedUserId, targetUserId),
          eq(groupInvitations.status, 'pending')
        )
      )
      .limit(1);

    if (existingInvite) {
      throw createError('User already has a pending invitation', 409);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [newInvitation] = await db
      .insert(groupInvitations)
      .values({
        groupId,
        invitedBy: userId,
        invitedUserId: targetUserId,
        message,
        status: 'pending',
        expiresAt,
      })
      .returning();

    const [invitedUser] = await db
      .select({
        name: users.name,
        email: users.email,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    res.status(201).json({
      ...newInvitation,
      invitedUserName: invitedUser.name,
      invitedUserEmail: invitedUser.email,
      invitedUserAvatar: invitedUser.avatar,
    });
  } catch (error) {
    next(error);
  }
});

// Invite a friend to group
router.post('/:groupId/invite-friend/:friendId', async (req: AuthRequest, res, next) => {
  try {
    const { groupId, friendId } = req.params;
    const userId = req.user!.id;
    const { message } = req.body;

    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    const [friendship] = await db
      .select()
      .from(friends)
      .where(and(eq(friends.userId, userId), eq(friends.friendId, friendId)))
      .limit(1);

    if (!friendship) {
      throw createError('User is not in your friends list', 400);
    }

    const [existingMember] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, friendId)))
      .limit(1);

    if (existingMember) {
      throw createError('Friend is already a member of this group', 409);
    }

    const [existingInvite] = await db
      .select()
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.groupId, groupId),
          eq(groupInvitations.invitedUserId, friendId),
          eq(groupInvitations.status, 'pending')
        )
      )
      .limit(1);

    if (existingInvite) {
      throw createError('Friend already has a pending invitation', 409);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [newInvitation] = await db
      .insert(groupInvitations)
      .values({
        groupId,
        invitedBy: userId,
        invitedUserId: friendId,
        message,
        status: 'pending',
        expiresAt,
      })
      .returning();

    res.status(201).json(newInvitation);
  } catch (error) {
    next(error);
  }
});

// Accept group invitation
router.post('/invitations/:invitationId/accept', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { invitationId } = req.params;

    const [invitation] = await db
      .select()
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.id, invitationId),
          eq(groupInvitations.invitedUserId, userId),
          eq(groupInvitations.status, 'pending')
        )
      )
      .limit(1);

    if (!invitation) {
      throw createError('Invitation not found', 404);
    }

    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      throw createError('Invitation has expired', 410);
    }

    await db.insert(groupMembers).values({
      groupId: invitation.groupId,
      userId,
      role: 'member',
    });

    await db
      .update(groupInvitations)
      .set({ status: 'accepted' })
      .where(eq(groupInvitations.id, invitationId));

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, invitation.groupId))
      .limit(1);

    res.json({ message: 'Invitation accepted', group });
  } catch (error) {
    next(error);
  }
});

// Decline group invitation
router.post('/invitations/:invitationId/decline', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { invitationId } = req.params;

    const [invitation] = await db
      .select()
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.id, invitationId),
          eq(groupInvitations.invitedUserId, userId),
          eq(groupInvitations.status, 'pending')
        )
      )
      .limit(1);

    if (!invitation) {
      throw createError('Invitation not found', 404);
    }

    await db
      .update(groupInvitations)
      .set({ status: 'declined' })
      .where(eq(groupInvitations.id, invitationId));

    res.json({ message: 'Invitation declined' });
  } catch (error) {
    next(error);
  }
});

// Cancel invitation
router.delete('/:groupId/invitations/:invitationId', async (req: AuthRequest, res, next) => {
  try {
    const { groupId, invitationId } = req.params;
    const userId = req.user!.id;

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);

    if (!group) {
      throw createError('Group not found', 404);
    }

    const [invitation] = await db
      .select()
      .from(groupInvitations)
      .where(eq(groupInvitations.id, invitationId))
      .limit(1);

    if (!invitation) {
      throw createError('Invitation not found', 404);
    }

    if (group.ownerId !== userId && invitation.invitedBy !== userId) {
      throw createError('Not authorized to cancel this invitation', 403);
    }

    await db.delete(groupInvitations).where(eq(groupInvitations.id, invitationId));

    res.json({ message: 'Invitation cancelled' });
  } catch (error) {
    next(error);
  }
});

export default router;
