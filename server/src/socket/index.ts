import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { db, messages, sessions, groupMembers, users } from '../db/index.js';
import { eq, and } from 'drizzle-orm';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

interface JWTPayload {
  userId: string;
  email: string;
}

export function initializeSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      
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
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join session room
    socket.on('join:session', async (sessionId: string) => {
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
          .where(
            and(
              eq(groupMembers.groupId, session.groupId),
              eq(groupMembers.userId, socket.userId!)
            )
          )
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
      } catch (error) {
        console.error('Error joining session:', error);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // Leave session room
    socket.on('leave:session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
      socket.to(`session:${sessionId}`).emit('user:left', {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    // Send message
    socket.on('message:send', async (data: { sessionId: string; content: string }) => {
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
          .where(
            and(
              eq(groupMembers.groupId, session.groupId),
              eq(groupMembers.userId, socket.userId!)
            )
          )
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
          .where(eq(users.id, socket.userId!))
          .limit(1);

        const messageWithUser = {
          ...newMessage,
          userName: user?.name,
          userAvatar: user?.avatar,
        };

        // Broadcast to all in session (including sender)
        io.to(`session:${sessionId}`).emit('message:new', messageWithUser);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing:start', (sessionId: string) => {
      socket.to(`session:${sessionId}`).emit('user:typing', {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    socket.on('typing:stop', (sessionId: string) => {
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
