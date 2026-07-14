# Socket.IO events

The websocket carries realtime chat and the streamed `@ai` answer. Everything
else is REST.

## Connecting

The client passes its access token in the handshake:

```ts
io(API_URL, { auth: { token: accessToken } })
```

The server verifies it against `JWT_SECRET` and loads the user before any event
is accepted. An invalid token fails the connection outright.

## Client → server

| Event | Payload | Notes |
|---|---|---|
| `join:session` | `sessionId` (uuid) | Verifies group membership, then joins the `session:<id>` room |
| `leave:session` | `sessionId` (uuid) | |
| `message:send` | `{ sessionId, content }` | If `content` contains `@ai`, the RAG answer is triggered |
| `typing:start` | `sessionId` (uuid) | Relayed to the rest of the room |
| `typing:stop` | `sessionId` (uuid) | |

Every payload is validated with Zod before use. Socket input is untrusted in
exactly the way an HTTP body is; the original code destructured it directly.

## Server → client

| Event | Payload | Notes |
|---|---|---|
| `joined:session` | `{ sessionId }` | Acknowledges the join |
| `user:joined` / `user:left` | `{ userId, userName }` | To others in the room |
| `message:new` | the message row | Broadcast to the room, sender included |
| `ai:token` | `{ messageId, token }` | One per token, as the LLM produces it |
| `ai:token:done` | `{ messageId, content, metadata }` | `metadata.sources` becomes the citation chips |
| `ai:error` | `{ message, code, recoverable }` | e.g. `AI_NOT_CONFIGURED`, `AI_TIMEOUT` |
| `user:typing` / `user:stopped-typing` | `{ userId, userName }` | |
| `error` | `{ message, details? }` | Validation and access failures |

## The `@ai` flow

```
message:send  ──▶  persist the user's message, broadcast `message:new`
                        │
                        │  content contains "@ai"?
                        ▼
              insert an empty AI message, broadcast it (the bubble appears)
                        │
                        ▼
              AI service streams NDJSON back to the server
                        │
                        ├─ each {"token": …}  ──▶  `ai:token`
                        │
                        └─ final {"done": true, "sources": [...]}
                                   │
                                   ▼
                        persist the full text + metadata
                                   │
                                   ▼
                              `ai:token:done`
```

The placeholder message exists so the UI can show the assistant's bubble the
instant the request starts, rather than after the first token arrives.

Rooms are per-session (`session:<sessionId>`), so a streamed answer is visible
live to everyone in that discussion — not just to whoever asked.
