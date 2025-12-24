import { Router, Response } from 'express';
import { db, groups, groupMembers, users, sessions } from '../db/index.js';
import { eq, and, count, desc } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get user's groups
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;

    // Get groups where user is a member
    const userGroups = await db
      .select({
        group: groups,
        role: groupMembers.role,
        memberCount: count(groupMembers.userId),
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(eq(groupMembers.userId, userId))
      .groupBy(groups.id, groupMembers.role)
      .orderBy(desc(groups.createdAt));

    // Format response
    const formattedGroups = userGroups.map(({ group, role, memberCount }) => ({
      ...group,
      role,
      memberCount,
    }));

    res.json(formattedGroups);
  } catch (error) {
    next(error);
  }
});

// Get single group
router.get('/:groupId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    // Check membership
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    // Get group with owner info
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

    // Get member count
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
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const { name, description, avatar } = req.body;
    const userId = req.user!.id;

    if (!name || !description) {
      throw createError('Name and description are required', 400);
    }

    // Create group
    const [newGroup] = await db
      .insert(groups)
      .values({
        name,
        description,
        ownerId: userId,
        avatar: avatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(name)}`,
      })
      .returning();

    // Add owner as member
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
router.patch('/:groupId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const { name, description, avatar } = req.body;

    // Check if user is owner
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
router.delete('/:groupId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    // Check if user is owner
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
router.get('/:groupId/members', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    // Check membership
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
router.post('/:groupId/members', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const { email } = req.body;

    if (!email) {
      throw createError('Email is required', 400);
    }

    // Check if user is owner
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId)))
      .limit(1);

    if (!group) {
      throw createError('Group not found or you are not the owner', 403);
    }

    // Find user to add
    const [userToAdd] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!userToAdd) {
      throw createError('User not found', 404);
    }

    // Check if already a member
    const [existingMember] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userToAdd.id)))
      .limit(1);

    if (existingMember) {
      throw createError('User is already a member', 409);
    }

    // Add member
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
router.delete('/:groupId/members/:memberId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user!.id;

    // Check if user is owner or removing themselves
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

export default router;
