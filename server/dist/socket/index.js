import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { db, messages, sessions, groupMembers, users } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { aiClient } from '../services/aiClient.js';
export function initializeSocket(httpServer) {
    const io = new SocketServer(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:3000',
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });
    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication required'));
            }
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const [user] = await db
                .select({ id: users.id, name: users.name })
                .from(users)
                .where(eq(users.id, decoded.userId))
                .limit(1);
            if (!user) {
                return next(new Error('User not found'));
            }
            socket.userId = user.id;
            socket.userName = user.name;
            next();
        }
        catch (error) {
            next(new Error('Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.userId}`);
        // Join session room
        socket.on('join:session', async (sessionId) => {
            try {
                // Verify user has access to session
                const [session] = await db
                    .select()
                    .from(sessions)
                    .where(eq(sessions.id, sessionId))
                    .limit(1);
                if (!session) {
                    socket.emit('error', { message: 'Session not found' });
                    return;
                }
                const [membership] = await db
                    .select()
                    .from(groupMembers)
                    .where(and(eq(groupMembers.groupId, session.groupId), eq(groupMembers.userId, socket.userId)))
                    .limit(1);
                if (!membership) {
                    socket.emit('error', { message: 'Access denied' });
                    return;
                }
                socket.join(`session:${sessionId}`);
                socket.emit('joined:session', { sessionId });
                // Notify others
                socket.to(`session:${sessionId}`).emit('user:joined', {
                    userId: socket.userId,
                    userName: socket.userName,
                });
            }
            catch (error) {
                console.error('Error joining session:', error);
                socket.emit('error', { message: 'Failed to join session' });
            }
        });
        // Leave session room
        socket.on('leave:session', (sessionId) => {
            socket.leave(`session:${sessionId}`);
            socket.to(`session:${sessionId}`).emit('user:left', {
                userId: socket.userId,
                userName: socket.userName,
            });
        });
        // Send message
        socket.on('message:send', async (data) => {
            try {
                const { sessionId, content } = data;
                if (!content?.trim()) {
                    socket.emit('error', { message: 'Message content is required' });
                    return;
                }
                // Verify access
                const [session] = await db
                    .select()
                    .from(sessions)
                    .where(eq(sessions.id, sessionId))
                    .limit(1);
                if (!session) {
                    socket.emit('error', { message: 'Session not found' });
                    return;
                }
                const [membership] = await db
                    .select()
                    .from(groupMembers)
                    .where(and(eq(groupMembers.groupId, session.groupId), eq(groupMembers.userId, socket.userId)))
                    .limit(1);
                if (!membership) {
                    socket.emit('error', { message: 'Access denied' });
                    return;
                }
                // Save message to database
                const [newMessage] = await db
                    .insert(messages)
                    .values({
                    sessionId,
                    userId: socket.userId,
                    content: content.trim(),
                    type: 'user',
                })
                    .returning();
                // Update session last activity
                await db
                    .update(sessions)
                    .set({ lastActivityAt: new Date() })
                    .where(eq(sessions.id, sessionId));
                // Get user info
                const [user] = await db
                    .select({ name: users.name, avatar: users.avatar })
                    .from(users)
                    .where(eq(users.id, socket.userId))
                    .limit(1);
                const messageWithUser = {
                    ...newMessage,
                    userName: user?.name,
                    userAvatar: user?.avatar,
                };
                // Broadcast to all in session (including sender)
                io.to(`session:${sessionId}`).emit('message:new', messageWithUser);
                // Check for @ai mention and trigger AI response
                if (content.trim().toLowerCase().startsWith('@ai')) {
                    try {
                        // Process @ai message
                        const aiResponse = await aiClient.processAtAiMessage(content, sessionId, socket.userId);
                        if (aiResponse) {
                            // Save AI response to database
                            const [aiMessage] = await db
                                .insert(messages)
                                .values({
                                sessionId,
                                userId: null, // AI messages have no user
                                content: aiResponse.answer,
                                type: 'ai',
                                metadata: {
                                    sources: aiResponse.sources,
                                    model: aiResponse.model,
                                    latency_ms: aiResponse.latency_ms,
                                    context_messages_used: aiResponse.context_messages_used,
                                    papers_used: aiResponse.papers_used,
                                },
                            })
                                .returning();
                            // Broadcast AI response
                            const aiMessageWithMeta = {
                                ...aiMessage,
                                userName: 'AI Assistant',
                                userAvatar: null,
                            };
                            io.to(`session:${sessionId}`).emit('message:new', aiMessageWithMeta);
                        }
                    }
                    catch (aiError) {
                        console.error('AI response error:', aiError);
                        // Send error as AI message so user sees feedback
                        const errorMessage = aiError instanceof Error ? aiError.message : 'AI service unavailable';
                        socket.emit('error', { message: `AI: ${errorMessage}` });
                    }
                }
            }
            catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
        // Typing indicators
        socket.on('typing:start', (sessionId) => {
            socket.to(`session:${sessionId}`).emit('user:typing', {
                userId: socket.userId,
                userName: socket.userName,
            });
        });
        socket.on('typing:stop', (sessionId) => {
            socket.to(`session:${sessionId}`).emit('user:stopped-typing', {
                userId: socket.userId,
            });
        });
        // Disconnect
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.userId}`);
        });
    });
    return io;
}
//# sourceMappingURL=index.js.map