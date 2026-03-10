import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { db, messages, sessions, groupMembers, users } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { aiClient } from '../services/aiClient.js';
import logger from '../utils/logger.js';
const socketLogger = logger.child({ context: 'socket' });
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
        socketLogger.info({ userId: socket.userId }, 'User connected');
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
                socketLogger.error({ err: error }, 'Error joining session');
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
                const { sessionId, content, taskType } = data;
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
                // Check for @ai mention OR explicit agent selection → trigger AI response
                const hasExplicitAgent = taskType && taskType !== 'auto';
                if (content.toLowerCase().includes('@ai') || hasExplicitAgent) {
                    try {
                        // Pre-check AI service health before making request
                        const isAvailable = await aiClient.isAvailable();
                        if (!isAvailable) {
                            socket.emit('ai:error', {
                                message: 'AI service is not available. Please ensure GROQ_API_KEY is configured.',
                                code: 'AI_NOT_CONFIGURED',
                                recoverable: true
                            });
                            return;
                        }
                        if (!session.groupId) {
                            socket.emit('ai:error', {
                                message: 'AI chat is only supported within research groups.',
                                code: 'NO_GROUP',
                                recoverable: true
                            });
                            return;
                        }
                        // Classify intent and determine routing
                        let classifiedTask = taskType && taskType !== 'auto' ? taskType : null;
                        const hasExplicitOverride = !!classifiedTask;
                        try {
                            const intentResult = await aiClient.classifyAgenticIntentDetailed({ prompt: content });
                            io.to(`session:${sessionId}`).emit('ai:intent_classified', {
                                task_type: classifiedTask || intentResult.task_type,
                                similarity: intentResult.similarity,
                                ambiguous: intentResult.ambiguous,
                                alternatives: intentResult.alternatives || [],
                            });
                            // Use classified intent when no explicit override
                            if (!classifiedTask && intentResult.task_type && !intentResult.ambiguous) {
                                classifiedTask = intentResult.task_type;
                            }
                        }
                        catch (intentErr) {
                            socketLogger.warn({ err: intentErr }, 'Intent classification failed (non-fatal)');
                            // If user explicitly selected an agent but classification failed,
                            // ensure we don't lose the explicit selection
                        }
                        // Determine if we should use agentic pipeline or simple chat
                        const agenticTasks = [
                            'literature_survey', 'gap_analysis', 'fact_check', 'novelty_assessment',
                            'research_mentor', 'paper_writing', 'deep_research',
                            'methodology_extraction', 'reviewer_anticipation',
                        ];
                        const useAgenticPipeline = classifiedTask && agenticTasks.includes(classifiedTask);
                        // Create placeholder AI message in DB with empty content
                        const [aiMessagePlaceholder] = await db
                            .insert(messages)
                            .values({
                            sessionId,
                            userId: null,
                            content: '',
                            type: 'ai',
                            metadata: { streaming: true },
                        })
                            .returning();
                        const placeholderWithMeta = {
                            ...aiMessagePlaceholder,
                            userName: 'AI Assistant',
                            userAvatar: null,
                        };
                        // Emit placeholder so UI shows the message bubble immediately
                        io.to(`session:${sessionId}`).emit('message:new', placeholderWithMeta);
                        // Stream tokens from AI service
                        let accumulated = '';
                        let streamMeta = {};
                        try {
                            if (useAgenticPipeline) {
                                // ── Agentic streaming pipeline ──
                                // Use runAgenticTaskStream for classified agent tasks
                                socketLogger.info({ taskType: classifiedTask }, 'Routing to agentic pipeline');
                                const agenticResult = await aiClient.runAgenticTaskStream({
                                    task_type: classifiedTask,
                                    prompt: content,
                                    group_id: session.groupId,
                                    session_id: sessionId,
                                    user_id: socket.userId,
                                }, (progressMessage) => {
                                    // Forward progress events to client
                                    io.to(`session:${sessionId}`).emit('agentic:progress', {
                                        messageId: aiMessagePlaceholder.id,
                                        content: progressMessage,
                                    });
                                }, (token) => {
                                    // Forward synthesis tokens to client for live streaming
                                    accumulated += token;
                                    io.to(`session:${sessionId}`).emit('ai:token', {
                                        messageId: aiMessagePlaceholder.id,
                                        token,
                                    });
                                });
                                // Extract result text from agentic response — only overwrite
                                // accumulated if no tokens were streamed (fallback case)
                                const resultObj = agenticResult.result || {};
                                const resultText = Object.values(resultObj)[0] || JSON.stringify(resultObj);
                                if (!accumulated) {
                                    accumulated = resultText;
                                }
                                streamMeta = {
                                    task_type: agenticResult.task_type,
                                    artifacts: agenticResult.artifacts || [],
                                    latency_ms: agenticResult.latency_ms || 0,
                                    model: 'agentic',
                                };
                            }
                            else {
                                // ── Simple chat stream ──
                                for await (const chunk of aiClient.groupAIChatStream({
                                    prompt: content,
                                    group_id: session.groupId,
                                    session_id: sessionId,
                                    user_id: socket.userId,
                                })) {
                                    if (chunk.error) {
                                        socketLogger.error({ err: chunk.error }, 'AI stream error chunk');
                                        break;
                                    }
                                    if (chunk.token) {
                                        accumulated += chunk.token;
                                        io.to(`session:${sessionId}`).emit('ai:token', {
                                            messageId: aiMessagePlaceholder.id,
                                            token: chunk.token,
                                        });
                                    }
                                    if (chunk.done) {
                                        streamMeta = {
                                            sources: chunk.sources || [],
                                            model: chunk.model || 'groq',
                                            latency_ms: chunk.latency_ms || 0,
                                            context_items_used: chunk.context_items_used || 0,
                                            vector_ids_used: chunk.vector_ids_used || [],
                                        };
                                    }
                                }
                            }
                        }
                        catch (streamErr) {
                            socketLogger.error({ err: streamErr }, 'AI token stream error');
                            // If we accumulated some text, keep it; otherwise provide error message
                            if (!accumulated) {
                                accumulated = 'I encountered an error while generating a response. Please try again.';
                            }
                        }
                        // Update DB message with final content
                        await db
                            .update(messages)
                            .set({
                            content: accumulated,
                            metadata: {
                                ...streamMeta,
                                streaming: false,
                            },
                        })
                            .where(eq(messages.id, aiMessagePlaceholder.id));
                        // Notify clients that streaming is done
                        io.to(`session:${sessionId}`).emit('ai:token:done', {
                            messageId: aiMessagePlaceholder.id,
                            content: accumulated,
                            metadata: streamMeta,
                        });
                    }
                    catch (aiError) {
                        socketLogger.error({ err: aiError }, 'AI response error');
                        const errorMessage = aiError instanceof Error ? aiError.message : 'AI service unavailable';
                        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
                        socket.emit('ai:error', {
                            message: isTimeout ? 'AI request timed out. Please try again.' : `AI Error: ${errorMessage}`,
                            code: isTimeout ? 'AI_TIMEOUT' : 'AI_ERROR',
                            recoverable: true
                        });
                    }
                }
            }
            catch (error) {
                socketLogger.error({ err: error }, 'Error sending message');
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
        // Paper Question - requires @ai trigger
        socket.on('paper:question', async (data) => {
            try {
                const { paperId, question, groupId, sessionId } = data;
                // Validate @ai trigger - CRITICAL
                if (!question.toLowerCase().includes('@ai')) {
                    socket.emit('ai:error', {
                        message: 'Question must contain @ai trigger. AI only responds when triggered by @ai.',
                        code: 'MISSING_AI_TRIGGER',
                        recoverable: true
                    });
                    return;
                }
                // Pre-check AI service availability
                const isAvailable = await aiClient.isAvailable();
                if (!isAvailable) {
                    socket.emit('ai:error', {
                        message: 'AI service is not available. Please ensure GROQ_API_KEY is configured.',
                        code: 'AI_NOT_CONFIGURED',
                        recoverable: true
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
                socketLogger.error({ err: error }, 'Paper question error');
                const errorMessage = error instanceof Error ? error.message : 'Failed to process question';
                const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
                socket.emit('ai:error', {
                    message: isTimeout ? 'AI request timed out. Please try again.' : errorMessage,
                    code: isTimeout ? 'AI_TIMEOUT' : 'AI_ERROR',
                    recoverable: true
                });
            }
        });
        // Paper Summarize - requires @ai trigger
        socket.on('paper:summarize', async (data) => {
            try {
                const { paperId, groupId, sessionId } = data;
                // Pre-check AI service availability
                const isAvailable = await aiClient.isAvailable();
                if (!isAvailable) {
                    socket.emit('ai:error', {
                        message: 'AI service is not available. Please ensure GROQ_API_KEY is configured.',
                        code: 'AI_NOT_CONFIGURED',
                        recoverable: true
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
                socketLogger.error({ err: error }, 'Paper summarize error');
                const errorMessage = error instanceof Error ? error.message : 'Failed to summarize paper';
                const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
                socket.emit('ai:error', {
                    message: isTimeout ? 'AI request timed out. Please try again.' : errorMessage,
                    code: isTimeout ? 'AI_TIMEOUT' : 'AI_ERROR',
                    recoverable: true
                });
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
        // ============ Workflow Events ============
        socket.on('workflow:plan', async (data) => {
            try {
                socketLogger.info({ userId: socket.userId, goal: data.goal.slice(0, 80) }, 'Planning workflow');
                const plan = await aiClient.planWorkflow({
                    goal: data.goal,
                    group_id: data.groupId,
                    user_id: socket.userId,
                    session_id: data.sessionId,
                    preferred_template: data.preferredTemplate,
                });
                socket.emit('workflow:planned', plan);
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : 'Workflow planning failed';
                socketLogger.error({ error: msg }, 'Workflow plan error');
                socket.emit('workflow:error', { error: msg });
            }
        });
        socket.on('workflow:start', async (data) => {
            try {
                socketLogger.info({ userId: socket.userId, workflowId: data.workflowId }, 'Starting workflow');
                const room = data.sessionId ? `session:${data.sessionId}` : undefined;
                await aiClient.startWorkflowStream({ workflow_id: data.workflowId, user_feedback: data.userFeedback }, (event) => {
                    const payload = { workflowId: data.workflowId, ...event };
                    socket.emit('workflow:event', payload);
                    if (room) {
                        socket.to(room).emit('workflow:event', payload);
                    }
                });
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : 'Workflow execution failed';
                socketLogger.error({ error: msg }, 'Workflow start error');
                socket.emit('workflow:error', { workflowId: data.workflowId, error: msg });
            }
        });
        socket.on('workflow:approve', async (data) => {
            try {
                socketLogger.info({ workflowId: data.workflowId, stepIndex: data.stepIndex }, 'Approving workflow step');
                const room = data.sessionId ? `session:${data.sessionId}` : undefined;
                await aiClient.approveWorkflowStepStream({
                    workflow_id: data.workflowId,
                    step_index: data.stepIndex,
                    approved: true,
                    feedback: data.feedback,
                }, (event) => {
                    const payload = { workflowId: data.workflowId, ...event };
                    socket.emit('workflow:event', payload);
                    if (room) {
                        socket.to(room).emit('workflow:event', payload);
                    }
                });
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : 'Step approval failed';
                socketLogger.error({ error: msg }, 'Workflow approve error');
                socket.emit('workflow:error', { workflowId: data.workflowId, error: msg });
            }
        });
        socket.on('workflow:reject', async (data) => {
            try {
                socketLogger.info({ workflowId: data.workflowId, stepIndex: data.stepIndex }, 'Rejecting workflow step');
                await aiClient.approveWorkflowStepStream({
                    workflow_id: data.workflowId,
                    step_index: data.stepIndex,
                    approved: false,
                    feedback: data.feedback,
                }, (event) => {
                    const payload = { workflowId: data.workflowId, ...event };
                    socket.emit('workflow:event', payload);
                    if (data.sessionId) {
                        socket.to(`session:${data.sessionId}`).emit('workflow:event', payload);
                    }
                });
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : 'Step rejection failed';
                socketLogger.error({ error: msg }, 'Workflow reject error');
                socket.emit('workflow:error', { workflowId: data.workflowId, error: msg });
            }
        });
        socket.on('workflow:cancel', async (data) => {
            try {
                const result = await aiClient.cancelWorkflow(data.workflowId);
                socket.emit('workflow:cancelled', result);
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : 'Workflow cancellation failed';
                socket.emit('workflow:error', { workflowId: data.workflowId, error: msg });
            }
        });
        socket.on('workflow:status', async (data) => {
            try {
                const status = await aiClient.getWorkflowStatus(data.workflowId);
                socket.emit('workflow:status', status);
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : 'Failed to get workflow status';
                socket.emit('workflow:error', { workflowId: data.workflowId, error: msg });
            }
        });
        // Disconnect
        socket.on('disconnect', () => {
            socketLogger.info({ userId: socket.userId }, 'User disconnected');
        });
    });
    return io;
}
//# sourceMappingURL=index.js.map