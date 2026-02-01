# Socket.IO Events Documentation

## Overview

OpenResearch uses **Socket.IO 4.8** for real-time bidirectional communication between client and server. The server emits events for messages, AI responses, and user activity.

## Connection

### Client Connection

```typescript
import { io } from 'socket.io-client';

const socket = io(NEXT_PUBLIC_WS_URL, {
  auth: {
    token: accessToken, // JWT access token
  },
  transports: ['websocket', 'polling'],
});
```

### Authentication

Socket.IO connections require JWT authentication via the `auth.token` property. The server validates tokens on connection.

```typescript
// Server-side authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    socket.userName = decoded.name;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});
```

## Events Reference

### Client → Server Events

#### `join:session`

Join a session room to receive real-time updates.

**Payload:**
```typescript
{
  sessionId: string; // UUID of session to join
}
```

**Example:**
```typescript
socket.emit('join:session', 'session-uuid-here');
```

**Server Response:**
- Emits `joined:session` on success
- Emits `error` if session not found or access denied

---

#### `leave:session`

Leave a session room.

**Payload:**
```typescript
{
  sessionId: string; // UUID of session to leave
}
```

**Example:**
```typescript
socket.emit('leave:session', 'session-uuid-here');
```

---

#### `message:send`

Send a message to a session. Triggers AI response if message contains `@ai`.

**Payload:**
```typescript
{
  sessionId: string;  // UUID of target session
  content: string;    // Message text (can include @ai trigger)
}
```

**Example:**
```typescript
// Regular message
socket.emit('message:send', {
  sessionId: 'session-uuid',
  content: 'This is a regular message',
});

// AI-triggered message
socket.emit('message:send', {
  sessionId: 'session-uuid',
  content: '@ai What papers discuss transformers?',
});
```

**Server Response:**
- Emits `message:new` to all users in session (user message)
- If `@ai` present, emits second `message:new` with AI response
- Emits `error` on failure

---

#### `paper:question`

Ask a question about a specific paper in a group.

**Payload:**
```typescript
{
  paperId: string;    // UUID of paper
  groupId: string;    // UUID of group (for context isolation)
  question: string;   // Question text (must include @ai)
  sessionId?: string; // Optional session context
}
```

**Example:**
```typescript
socket.emit('paper:question', {
  paperId: 'paper-uuid',
  groupId: 'group-uuid',
  question: '@ai What methodology was used?',
  sessionId: 'session-uuid', // optional
});
```

**Server Response:**
- Emits `paper:answer` with AI response
- Emits `error` if paper not found or @ai trigger missing

---

#### `paper:summarize`

Request AI summarization of a paper.

**Payload:**
```typescript
{
  paperId: string;    // UUID of paper
  groupId: string;    // UUID of group (for context isolation)
  sessionId?: string; // Optional session context
}
```

**Example:**
```typescript
socket.emit('paper:summarize', {
  paperId: 'paper-uuid',
  groupId: 'group-uuid',
});
```

**Server Response:**
- Emits `paper:summary` with summary and key points
- Emits `error` on failure

---

#### `typing:start`

Indicate user is typing in a session.

**Payload:**
```typescript
{
  sessionId: string; // UUID of session
}
```

**Example:**
```typescript
socket.emit('typing:start', 'session-uuid');
```

**Server Response:**
- Broadcasts `user:typing` to other users in session

---

#### `typing:stop`

Indicate user stopped typing.

**Payload:**
```typescript
{
  sessionId: string; // UUID of session
}
```

**Example:**
```typescript
socket.emit('typing:stop', 'session-uuid');
```

**Server Response:**
- Broadcasts `user:stopped-typing` to other users in session

---

### Server → Client Events

#### `joined:session`

Confirms successful join to session room.

**Payload:**
```typescript
{
  sessionId: string;
  userId: string;
  userName: string;
}
```

**Example:**
```typescript
socket.on('joined:session', (data) => {
  console.log(`Joined session: ${data.sessionId}`);
});
```

---

#### `message:new`

New message in session (user or AI).

**Payload:**
```typescript
{
  id: string;           // Message UUID
  sessionId: string;    // Session UUID
  userId: string | null; // User UUID (null for AI)
  content: string;      // Message text
  type: 'user' | 'ai';  // Message type
  userName?: string;    // User name (if user message)
  createdAt: string;    // ISO timestamp
  metadata?: {
    latency_ms?: number;      // AI response time
    model?: string;           // AI model used
    sources?: Array<{         // RAG sources
      id: string;
      type: string;
      similarity: number;
    }>;
  };
}
```

**Example:**
```typescript
socket.on('message:new', (message) => {
  if (message.type === 'ai') {
    console.log('AI response:', message.content);
    console.log('Sources:', message.metadata?.sources);
  } else {
    console.log(`${message.userName}: ${message.content}`);
  }
});
```

---

#### `paper:answer`

AI answer to paper question.

**Payload:**
```typescript
{
  id: string;           // Artifact UUID
  answer: string;       // AI answer text
  paperId: string;      // Paper UUID
  sources: Array<{      // Context sources
    id: string;
    type: string;
    chunk: number;
  }>;
  metadata: {
    model: string;      // AI model used
    paperTitle?: string;
  };
  latency_ms: number;   // Response time
}
```

**Example:**
```typescript
socket.on('paper:answer', (data) => {
  console.log('Answer:', data.answer);
  console.log('Model:', data.metadata.model);
  console.log('Latency:', data.latency_ms + 'ms');
});
```

---

#### `paper:summary`

AI-generated paper summary.

**Payload:**
```typescript
{
  id: string;            // Artifact UUID
  summary: string;       // Full summary text
  keyPoints: string[];   // Extracted key points
  paperId: string;       // Paper UUID
  metadata: {
    model: string;       // AI model used
    paperTitle?: string;
  };
  latency_ms: number;    // Generation time
}
```

**Example:**
```typescript
socket.on('paper:summary', (data) => {
  console.log('Summary:', data.summary);
  console.log('Key Points:', data.keyPoints);
});
```

---

#### `user:joined`

User joined session room.

**Payload:**
```typescript
{
  sessionId: string;
  userId: string;
  userName: string;
}
```

**Example:**
```typescript
socket.on('user:joined', (data) => {
  console.log(`${data.userName} joined the session`);
});
```

---

#### `user:left`

User left session room.

**Payload:**
```typescript
{
  sessionId: string;
  userId: string;
  userName: string;
}
```

**Example:**
```typescript
socket.on('user:left', (data) => {
  console.log(`${data.userName} left the session`);
});
```

---

#### `user:typing`

User is typing in session.

**Payload:**
```typescript
{
  sessionId: string;
  userId: string;
  userName: string;
}
```

**Example:**
```typescript
socket.on('user:typing', (data) => {
  console.log(`${data.userName} is typing...`);
});
```

---

#### `user:stopped-typing`

User stopped typing.

**Payload:**
```typescript
{
  sessionId: string;
  userId: string;
  userName: string;
}
```

**Example:**
```typescript
socket.on('user:stopped-typing', (data) => {
  // Remove typing indicator for user
});
```

---

#### `error`

Error occurred during socket operation.

**Payload:**
```typescript
{
  message: string;    // Error message
  code?: string;      // Error code
  details?: any;      // Additional error details
}
```

**Example:**
```typescript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
});
```

---

## React Hook Example

```typescript
// lib/socket.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth';

export function useSocket(sessionId?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const { accessToken } = useAuthStore();

  useEffect(() => {
    if (!accessToken) return;

    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      auth: { token: accessToken },
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      if (sessionId) {
        newSocket.emit('join:session', sessionId);
      }
    });

    newSocket.on('joined:session', (data) => {
      console.log('Joined session:', data.sessionId);
    });

    newSocket.on('message:new', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    newSocket.on('user:typing', (data) => {
      setTypingUsers((prev) => new Set(prev).add(data.userName));
    });

    newSocket.on('user:stopped-typing', (data) => {
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.delete(data.userName);
        return next;
      });
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [accessToken, sessionId]);

  const sendMessage = (content: string) => {
    if (socket && sessionId) {
      socket.emit('message:send', { sessionId, content });
    }
  };

  const startTyping = () => {
    if (socket && sessionId) {
      socket.emit('typing:start', sessionId);
    }
  };

  const stopTyping = () => {
    if (socket && sessionId) {
      socket.emit('typing:stop', sessionId);
    }
  };

  return {
    socket,
    messages,
    typingUsers: Array.from(typingUsers),
    sendMessage,
    startTyping,
    stopTyping,
  };
}
```

## Rooms and Namespaces

### Session Rooms

Each session has its own room. Users join/leave rooms dynamically:

```typescript
// Server-side
socket.join(`session:${sessionId}`);
io.to(`session:${sessionId}`).emit('message:new', message);
socket.leave(`session:${sessionId}`);
```

### User Rooms

Each user has a personal room for notifications:

```typescript
// Server-side
socket.join(`user:${userId}`);
io.to(`user:${userId}`).emit('notification', data);
```

## Error Handling

### Connection Errors

```typescript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
  // Retry logic or notify user
});
```

### Disconnection

```typescript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server disconnected, try reconnecting
    socket.connect();
  }
});
```

### Timeout Handling

```typescript
socket.timeout(5000).emit('message:send', data, (err, response) => {
  if (err) {
    console.error('Request timed out');
  } else {
    console.log('Response:', response);
  }
});
```

## Best Practices

### 1. Always Clean Up

```typescript
useEffect(() => {
  const socket = io(url);
  
  return () => {
    socket.close(); // Clean up on unmount
  };
}, []);
```

### 2. Handle Reconnection

```typescript
socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  // Re-join rooms
  socket.emit('join:session', sessionId);
});
```

### 3. Debounce Typing Events

```typescript
let typingTimeout: NodeJS.Timeout;

const handleTyping = () => {
  socket.emit('typing:start', sessionId);
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing:stop', sessionId);
  }, 2000);
};
```

### 4. Use Acknowledgments

```typescript
socket.emit('message:send', data, (response) => {
  if (response.error) {
    console.error('Failed to send:', response.error);
  } else {
    console.log('Message sent:', response.id);
  }
});
```

## Performance Considerations

### Connection Pooling

Maintain a single socket connection per client. Don't create multiple connections.

### Message Batching

For multiple messages, send them in batch if possible:

```typescript
const messages = ['msg1', 'msg2', 'msg3'];
socket.emit('messages:send:batch', { sessionId, messages });
```

### Compression

Socket.IO automatically compresses messages over a certain size. Enable compression in production:

```typescript
// Server
const io = new Server(httpServer, {
  perMessageDeflate: {
    threshold: 1024, // Compress messages > 1KB
  },
});
```

## Monitoring

### Connection Statistics

```typescript
// Server-side
io.engine.on('connection_error', (err) => {
  console.error('Connection error:', err);
});

setInterval(() => {
  console.log('Connected clients:', io.engine.clientsCount);
}, 60000);
```

### Event Logging

```typescript
// Log all events for debugging
socket.onAny((eventName, ...args) => {
  console.log('Event:', eventName, args);
});
```

## Troubleshooting

### Issue: Socket Not Connecting

1. Check WebSocket URL is correct
2. Verify JWT token is valid
3. Check CORS settings on server
4. Check firewall allows WebSocket connections

### Issue: Messages Not Received

1. Verify user joined correct session room
2. Check event name spelling
3. Verify server is emitting to correct room
4. Check socket connection state

### Issue: High Latency

1. Use WebSocket transport only (disable polling)
2. Enable message compression
3. Check network conditions
4. Monitor server load

## Security

### Token Expiration

Handle token expiration gracefully:

```typescript
socket.on('error', (error) => {
  if (error.message === 'Token expired') {
    // Refresh token and reconnect
    refreshToken().then((newToken) => {
      socket.auth.token = newToken;
      socket.connect();
    });
  }
});
```

### Rate Limiting

Server implements rate limiting on socket events to prevent abuse.

### Message Validation

All incoming messages are validated before processing:

```typescript
// Server-side
socket.on('message:send', async (data) => {
  // Validate data structure
  if (!data.sessionId || !data.content) {
    return socket.emit('error', { message: 'Invalid message data' });
  }
  
  // Verify user has access to session
  const hasAccess = await verifySessionAccess(socket.userId, data.sessionId);
  if (!hasAccess) {
    return socket.emit('error', { message: 'Access denied' });
  }
  
  // Process message
  // ...
});
```
