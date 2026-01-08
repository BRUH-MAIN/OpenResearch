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
                if (content.toLowerCase().includes('@ai')) {
                    try {
                        // Get group ID from session for group-isolated RAG
                        const aiResponse = await aiClient.processAtAiMessage(content, sessionId, socket.userId, session.groupId // Pass groupId for group-isolated RAG
                        );
                        if (aiResponse) {
                            // Determine answer field based on response type
                            const answerText = 'text' in aiResponse ? aiResponse.text : aiResponse.answer;
                            // Extract metadata safely - GroupAIChatResponse has metadata, ChatResponse doesn't
                            const hasMetadata = 'metadata' in aiResponse && aiResponse.metadata;
                            const metadataObj = hasMetadata ? aiResponse.metadata : {};
                            // Save AI response to database
                            const [aiMessage] = await db
                                .insert(messages)
                                .values({
                                sessionId,
                                userId: null, // AI messages have no user
                                content: answerText,
                                type: 'ai',
                                metadata: {
                                    sources: 'sources' in aiResponse ? aiResponse.sources : [],
                                    model: metadataObj.model || ('model' in aiResponse ? aiResponse.model : 'gemini'),
                                    latency_ms: aiResponse.latency_ms,
                                    context_items_used: metadataObj.context_items_used || 0,
                                    vector_ids_used: metadataObj.vector_ids_used || [],
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
        // Paper Question - requires @ai trigger
        socket.on('paper:question', async (data) => {
            try {
                const { paperId, question, groupId, sessionId } = data;
                // Validate @ai trigger - CRITICAL
                if (!question.toLowerCase().includes('@ai')) {
                    socket.emit('error', {
                        message: 'Question must contain @ai trigger. AI only responds when triggered by @ai.',
                        code: 'MISSING_AI_TRIGGER'
                    });
                    return;
                }
                // Verify access to group
                const [membership] = await db
                    .select()
                    .from(groupMembers)
                    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, socket.userId)))
                    .limit(1);
                if (!membership) {
                    socket.emit('error', { message: 'Access denied to group' });
                    return;
                }
                // Call AI service
                const response = await aiClient.paperQuestion({
                    paper_id: paperId,
                    question,
                    group_id: groupId,
                    session_id: sessionId,
                    user_id: socket.userId,
                });
                // Emit answer
                socket.emit('paper:answer', {
                    paperId,
                    question,
                    answer: response.answer,
                    sources: response.sources,
                    metadata: response.metadata,
                    latency_ms: response.latency_ms,
                });
                // Also broadcast to session room if in a session
                if (sessionId) {
                    // Save as message
                    const [aiMessage] = await db
                        .insert(messages)
                        .values({
                        sessionId,
                        userId: null,
                        content: `**Paper Q&A**\n\n**Q:** ${question.replace(/@ai/gi, '').trim()}\n\n**A:** ${response.answer}`,
                        type: 'ai',
                        metadata: {
                            paper_id: paperId,
                            sources: response.sources,
                            artifact_type: 'paper_qa',
                        },
                    })
                        .returning();
                    io.to(`session:${sessionId}`).emit('message:new', {
                        ...aiMessage,
                        userName: 'AI Assistant',
                        userAvatar: null,
                    });
                }
            }
            catch (error) {
                console.error('Paper question error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Failed to process question';
                socket.emit('error', { message: errorMessage });
            }
        });
        // Paper Summarize - requires @ai trigger
        socket.on('paper:summarize', async (data) => {
            try {
                const { paperId, groupId, sessionId } = data;
                // Verify access to group
                const [membership] = await db
                    .select()
                    .from(groupMembers)
                    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, socket.userId)))
                    .limit(1);
                if (!membership) {
                    socket.emit('error', { message: 'Access denied to group' });
                    return;
                }
                // Call AI service (trigger is always set to @ai summarize)
                const response = await aiClient.paperSummarize({
                    paper_id: paperId,
                    group_id: groupId,
                    session_id: sessionId,
                    user_id: socket.userId,
                    trigger: '@ai summarize',
                });
                // Emit summary
                socket.emit('paper:summary', {
                    paperId,
                    summary: response.summary,
                    keyPoints: response.key_points,
                    metadata: response.metadata,
                    latency_ms: response.latency_ms,
                });
                // Also broadcast to session room if in a session
                if (sessionId) {
                    const summaryContent = `**Paper Summary**\n\n${response.summary}\n\n**Key Points:**\n${response.key_points.map(p => `- ${p}`).join('\n')}`;
                    const [aiMessage] = await db
                        .insert(messages)
                        .values({
                        sessionId,
                        userId: null,
                        content: summaryContent,
                        type: 'ai',
                        metadata: {
                            paper_id: paperId,
                            key_points: response.key_points,
                            artifact_type: 'paper_summary',
                        },
                    })
                        .returning();
                    io.to(`session:${sessionId}`).emit('message:new', {
                        ...aiMessage,
                        userName: 'AI Assistant',
                        userAvatar: null,
                    });
                }
            }
            catch (error) {
                console.error('Paper summarize error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Failed to summarize paper';
                socket.emit('error', { message: errorMessage });
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