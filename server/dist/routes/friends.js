import { Router } from 'express';
import { db, friends, friendRequests, users } from '../db/index.js';
import { eq, and, or, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
const router = Router();
// All routes require authentication
router.use(authenticate);
// Get user's friends list
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userFriends = await db
            .select({
            id: friends.id,
            friendId: friends.friendId,
            name: users.name,
            email: users.email,
            avatar: users.avatar,
            createdAt: friends.createdAt,
        })
            .from(friends)
            .innerJoin(users, eq(users.id, friends.friendId))
            .where(eq(friends.userId, userId))
            .orderBy(desc(friends.createdAt));
        res.json(userFriends);
    }
    catch (error) {
        next(error);
    }
});
// Search users (for adding friends)
router.get('/search', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { q } = req.query;
        if (!q || typeof q !== 'string' || q.length < 2) {
            throw createError('Search query must be at least 2 characters', 400);
        }
        const searchResults = await db
            .select({
            id: users.id,
            name: users.name,
            email: users.email,
            avatar: users.avatar,
        })
            .from(users)
            .where(eq(users.email, q.toLowerCase()))
            .limit(20);
        const existingFriendIds = await db
            .select({ friendId: friends.friendId })
            .from(friends)
            .where(eq(friends.userId, userId));
        const friendIdSet = new Set(existingFriendIds.map((f) => f.friendId));
        friendIdSet.add(userId);
        const filteredResults = searchResults.filter((u) => !friendIdSet.has(u.id));
        res.json(filteredResults);
    }
    catch (error) {
        next(error);
    }
});
// Get pending friend requests (received)
router.get('/requests', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const requests = await db
            .select({
            id: friendRequests.id,
            fromUserId: friendRequests.fromUserId,
            status: friendRequests.status,
            message: friendRequests.message,
            createdAt: friendRequests.createdAt,
            name: users.name,
            email: users.email,
            avatar: users.avatar,
        })
            .from(friendRequests)
            .innerJoin(users, eq(users.id, friendRequests.fromUserId))
            .where(and(eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')))
            .orderBy(desc(friendRequests.createdAt));
        res.json(requests);
    }
    catch (error) {
        next(error);
    }
});
// Get sent friend requests
router.get('/requests/sent', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const requests = await db
            .select({
            id: friendRequests.id,
            toUserId: friendRequests.toUserId,
            status: friendRequests.status,
            message: friendRequests.message,
            createdAt: friendRequests.createdAt,
            name: users.name,
            email: users.email,
            avatar: users.avatar,
        })
            .from(friendRequests)
            .innerJoin(users, eq(users.id, friendRequests.toUserId))
            .where(eq(friendRequests.fromUserId, userId))
            .orderBy(desc(friendRequests.createdAt));
        res.json(requests);
    }
    catch (error) {
        next(error);
    }
});
// Send friend request
router.post('/requests', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { toUserId, email, message } = req.body;
        let targetUserId = toUserId;
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
        if (targetUserId === userId) {
            throw createError('Cannot send friend request to yourself', 400);
        }
        const [existingFriend] = await db
            .select()
            .from(friends)
            .where(and(eq(friends.userId, userId), eq(friends.friendId, targetUserId)))
            .limit(1);
        if (existingFriend) {
            throw createError('Already friends with this user', 409);
        }
        const [existingRequest] = await db
            .select()
            .from(friendRequests)
            .where(and(eq(friendRequests.status, 'pending'), or(and(eq(friendRequests.fromUserId, userId), eq(friendRequests.toUserId, targetUserId)), and(eq(friendRequests.fromUserId, targetUserId), eq(friendRequests.toUserId, userId)))))
            .limit(1);
        if (existingRequest) {
            throw createError('Friend request already pending', 409);
        }
        const [newRequest] = await db
            .insert(friendRequests)
            .values({
            fromUserId: userId,
            toUserId: targetUserId,
            message,
            status: 'pending',
        })
            .returning();
        const [targetUser] = await db
            .select({
            name: users.name,
            email: users.email,
            avatar: users.avatar,
        })
            .from(users)
            .where(eq(users.id, targetUserId))
            .limit(1);
        res.status(201).json({
            ...newRequest,
            ...targetUser,
        });
    }
    catch (error) {
        next(error);
    }
});
// Accept friend request
router.post('/requests/:requestId/accept', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { requestId } = req.params;
        const [request] = await db
            .select()
            .from(friendRequests)
            .where(and(eq(friendRequests.id, requestId), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')))
            .limit(1);
        if (!request) {
            throw createError('Friend request not found', 404);
        }
        // Create bidirectional friendship
        await db.insert(friends).values([
            { userId: userId, friendId: request.fromUserId },
            { userId: request.fromUserId, friendId: userId },
        ]);
        // Update request status
        await db
            .update(friendRequests)
            .set({ status: 'accepted', updatedAt: new Date() })
            .where(eq(friendRequests.id, requestId));
        const [friend] = await db
            .select({
            id: users.id,
            name: users.name,
            email: users.email,
            avatar: users.avatar,
        })
            .from(users)
            .where(eq(users.id, request.fromUserId))
            .limit(1);
        res.json({ message: 'Friend request accepted', friend });
    }
    catch (error) {
        next(error);
    }
});
// Reject friend request
router.post('/requests/:requestId/reject', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { requestId } = req.params;
        const [request] = await db
            .select()
            .from(friendRequests)
            .where(and(eq(friendRequests.id, requestId), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')))
            .limit(1);
        if (!request) {
            throw createError('Friend request not found', 404);
        }
        await db
            .update(friendRequests)
            .set({ status: 'rejected', updatedAt: new Date() })
            .where(eq(friendRequests.id, requestId));
        res.json({ message: 'Friend request rejected' });
    }
    catch (error) {
        next(error);
    }
});
// Cancel sent friend request
router.delete('/requests/:requestId', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { requestId } = req.params;
        const [request] = await db
            .select()
            .from(friendRequests)
            .where(and(eq(friendRequests.id, requestId), eq(friendRequests.fromUserId, userId)))
            .limit(1);
        if (!request) {
            throw createError('Friend request not found', 404);
        }
        await db.delete(friendRequests).where(eq(friendRequests.id, requestId));
        res.json({ message: 'Friend request cancelled' });
    }
    catch (error) {
        next(error);
    }
});
// Remove friend
router.delete('/:friendId', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { friendId } = req.params;
        // Remove bidirectional friendship
        await db
            .delete(friends)
            .where(or(and(eq(friends.userId, userId), eq(friends.friendId, friendId)), and(eq(friends.userId, friendId), eq(friends.friendId, userId))));
        res.json({ message: 'Friend removed successfully' });
    }
    catch (error) {
        next(error);
    }
});
export default router;
//# sourceMappingURL=friends.js.map