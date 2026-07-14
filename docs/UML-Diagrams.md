# UML Diagrams — OpenResearch

**Version 2.0 — July 2026.** Regenerated against the implemented system; every
class, event, and endpoint below exists in the code.

## Contents

1. [Use Case Diagram](#1-use-case-diagram)
2. [Class Diagram](#2-class-diagram)
3. [Component Diagram](#3-component-diagram)
4. [Sequence Diagrams](#4-sequence-diagrams)
5. [Activity Diagrams](#5-activity-diagrams)
6. [State Machine Diagrams](#6-state-machine-diagrams)
7. [Deployment Diagram](#7-deployment-diagram)

---

## 1. Use Case Diagram

```mermaid
graph TB
    Member["👤 Group Member"]
    Owner["👤 Group Owner"]
    AIService["⚙️ AI Service<br/>(supporting actor)"]
    ArXiv["⚙️ arXiv API<br/>(supporting actor)"]

    subgraph OpenResearch
        UC1["UC1<br/>Register / Sign in"]
        UC2["UC2<br/>Create group"]
        UC3["UC3<br/>Invite member"]
        UC4["UC4<br/>Manage members"]
        UC5["UC5<br/>Discuss in real time"]
        UC6["UC6<br/>Search papers"]
        UC7["UC7<br/>Add paper to group"]
        UC8["UC8<br/>Upload paper PDF"]
        UC9["UC9<br/>Ask @ai a question"]
        UC10["UC10<br/>Summarize a paper"]
        UC11["UC11<br/>Generate a report"]
    end

    Member --> UC1
    Member --> UC5
    Member --> UC6
    Member --> UC7
    Member --> UC8
    Member --> UC9
    Member --> UC10
    Member --> UC11

    Owner --> UC2
    Owner --> UC3
    Owner --> UC4

    UC6 -.->|"«include»"| ArXiv
    UC7 -.->|"«include» embed"| AIService
    UC8 -.->|"«include» extract + embed"| AIService
    UC9 -.->|"«include» retrieve + generate"| AIService
    UC10 -.->|"«include»"| AIService
    UC11 -.->|"«include»"| AIService

    UC9 -.->|"«extend» cite sources"| UC9a["UC9a<br/>Display citations"]
```

> **Owner generalises Member:** an owner may do everything a member may do, plus
> UC2–UC4.

---

## 2. Class Diagram

### 2.1 Domain model (persisted entities)

```mermaid
classDiagram
    class User {
        +UUID id
        +string name
        +string email
        +string passwordHash
        +string[] interests
    }

    class Group {
        +UUID id
        +string name
        +string description
        +UUID ownerId
    }

    class GroupMember {
        +UUID groupId
        +UUID userId
        +Role role
        +Date joinedAt
    }

    class Session {
        +UUID id
        +UUID groupId
        +string title
        +Status status
        +Date lastActivityAt
    }

    class Message {
        +UUID id
        +UUID sessionId
        +UUID userId
        +string content
        +MessageType type
        +json metadata
    }

    class Paper {
        +UUID id
        +string title
        +string[] authors
        +string abstract
        +string[] tags
        +string url
    }

    class GroupPaper {
        +UUID id
        +UUID groupId
        +UUID paperId
        +string fullText
    }

    class GroupPaperVector {
        +UUID id
        +UUID groupId
        +string paperId
        +int chunkIndex
        +string content
        +vector~768~ embedding
        +tsvector contentTsv
    }

    class RefreshToken {
        +UUID id
        +UUID userId
        +string token
        +Date expiresAt
    }

    class AiArtifact {
        +UUID id
        +UUID groupId
        +ArtifactType artifactType
        +string content
    }

    User "1" -- "*" GroupMember
    Group "1" -- "*" GroupMember : membership
    User "1" -- "*" RefreshToken
    Group "1" -- "*" Session
    Session "1" -- "*" Message
    User "1" -- "*" Message : authors
    Group "1" -- "*" GroupPaper
    Paper "1" -- "*" GroupPaper
    Group "1" -- "*" GroupPaperVector : isolates
    Group "1" -- "*" AiArtifact
    GroupPaper ..> GroupPaperVector : chunked and embedded into
```

> `Message.metadata` carries the `sources` array for an AI message — the data the
> interface renders as citation chips.
>
> `GroupPaperVector.groupId` is the isolation boundary: **every** retrieval query
> filters on it.

### 2.2 AI service — class structure

```mermaid
classDiagram
    class ChatRouter {
        <<router>>
        +group_ai_chat(group_id, request)
        +group_ai_chat_stream(group_id, request)
        -_prepare(group_id, request)
    }

    class PapersRouter {
        <<router>>
        +extract_pdf_text(file)
        +add_paper_to_group(group_id, request)
        +paper_question(request)
        +paper_summarize(request)
    }

    class Deps {
        <<module>>
        +validate_ai_trigger(text) str
        +get_group_context(group_id, query) tuple
        +build_chat_prompt(items, history, prompt) str
        +build_sources(items) list
        +store_ai_artifact(...) str
    }

    class VectorStore {
        +insert_paper_chunks(group_id, paper_id, ...) list
        +hybrid_search_group_vectors(group_id, query, ...) list
        +search_group_vectors(group_id, query, ...) list
    }

    class EmbeddingService {
        +EMBEDDING_DIMENSION = 768
        +generate_embedding(text, task_type) tuple
        +generate_embeddings_batch(texts) tuple
        +chunk_text(text, size, overlap) list
        -_mock_embedding(text) list
    }

    class LLMClient {
        +provider: str
        +model_name: str
        +generate(prompt, system) tuple
        +generate_stream(prompt, system)
        -_invoke_with_fallback(messages)
    }

    class Database {
        +get_session_messages(session_id) list
        +get_paper_info(paper_id) dict
        +store_ai_artifact(...) str
    }

    class DbEngine {
        <<singleton>>
        +init_engine() bool
        +get_session_factory()
    }

    ChatRouter ..> Deps
    PapersRouter ..> Deps
    Deps ..> VectorStore
    Deps ..> LLMClient
    Deps ..> Database
    VectorStore ..> EmbeddingService
    VectorStore ..> DbEngine
    Database ..> DbEngine
```

> Dependencies run in one direction only: **router → deps → (vector store | LLM
> client | database) → engine**. A router contains no SQL; the vector store knows
> nothing of HTTP.
>
> `DbEngine` is a single shared connection pool. Before the refactor, `Database`
> and `VectorStore` each opened their own.

### 2.3 Server — authorization middleware

```mermaid
classDiagram
    class AuthMiddleware {
        +authenticate(req, res, next)
        +generateTokens(userId, email) TokenPair
        +verifyRefreshToken(token) Payload
        +ACCESS_TOKEN_TTL = "15m"
    }

    class GroupAccessMiddleware {
        +requireGroupMember(req, res, next)
        +requireGroupOwner(req, res, next)
        +requireSessionAccess(req, res, next)
        -findMembership(groupId, userId)
    }

    class AiClient {
        +isAvailable() bool
        +groupAIChatStream(request)
        +extractPdfText(buffer, filename)
        +addPaperToGroup(request)
        -buildHeaders() Headers
    }

    class AiChatService {
        +streamAiChatToSession(io, params)
    }

    AuthMiddleware <|.. GroupAccessMiddleware : runs after
    AiChatService ..> AiClient
```

> `GroupAccessMiddleware` replaced 34 copy-pasted membership checks. Every
> group-scoped route now passes through it.

---

## 3. Component Diagram

```mermaid
graph TB
    subgraph Client["Web Client — Next.js 16"]
        Pages["App Router pages"]
        Hooks["React Query hooks<br/>useResearchSession"]
        SocketC["Socket.IO client"]
        ApiC["API client"]
    end

    subgraph Server["Application Server — Node 20 / Express 5"]
        Routes["Routes<br/>auth · groups · sessions<br/>papers · groupPapers · reports"]
        MW["Middleware<br/>authenticate · groupAccess<br/>validate · correlationId · rateLimit"]
        SocketS["Socket.IO server"]
        ChatSvc["aiChatService"]
        AiCl["aiClient"]
        Drizzle["Drizzle ORM<br/>(sole schema owner)"]
    end

    subgraph AI["AI Service — FastAPI / Python 3.12"]
        Routers["Routers<br/>chat · papers · vectors<br/>reports · health"]
        DepsM["deps<br/>RAG pipeline"]
        VS["vectorStore<br/>hybrid search"]
        Emb["embeddings<br/>Gemini"]
        LLM["llmClient<br/>DeepSeek → Groq"]
        Rep["reportGenerator"]
    end

    DB[("PostgreSQL 16<br/>+ pgvector")]
    Gemini(["Gemini API"])
    LLMs(["DeepSeek / Groq"])
    Arxiv(["arXiv API"])

    Pages --> Hooks --> ApiC
    Pages --> SocketC
    ApiC -->|REST| Routes
    SocketC <-->|WebSocket| SocketS

    Routes --> MW
    MW --> Drizzle
    SocketS --> ChatSvc --> AiCl
    Routes --> AiCl
    AiCl -->|"HTTP + X-Correlation-Id"| Routers

    Routers --> DepsM
    DepsM --> VS
    DepsM --> LLM
    VS --> Emb
    Routers --> Rep

    Drizzle --> DB
    VS --> DB
    Emb --> Gemini
    LLM --> LLMs
    Routes --> Arxiv
```

> Note the arrow that does **not** exist: the client never reaches the AI
> service. Every AI request is proxied by the server, which is why the `@ai` gate
> and authorization live in exactly one place.

---

## 4. Sequence Diagrams

### 4.1 `@ai` question — the flagship flow

```mermaid
sequenceDiagram
    actor U as Member
    participant C as Client
    participant S as Server
    participant AI as AI Service
    participant E as Gemini
    participant L as LLM
    participant DB as PostgreSQL

    U->>C: "@ai which architecture is proposed?"
    C->>S: socket message:send
    S->>DB: verify group membership
    S->>DB: INSERT user message
    S-->>C: message:new (broadcast to session)

    Note over S: content contains "@ai"

    S->>DB: INSERT empty AI message
    S-->>C: message:new (placeholder — bubble appears at once)

    S->>AI: POST /groups/{id}/ai-chat/stream<br/>X-Correlation-Id
    AI->>E: embed the question (768-dim)
    E-->>AI: query vector

    Note over AI,DB: ONE SQL statement:<br/>vector CTE (HNSW) + BM25 CTE (GIN)<br/>fused by RRF, WHERE group_id = ...

    AI->>DB: hybrid search
    DB-->>AI: top-k chunks (+ title, url, scores)

    AI->>AI: build_chat_prompt(chunks, history, question)
    AI->>L: stream completion

    loop each token
        L-->>AI: token
        AI-->>S: {"token": "..."}  (NDJSON)
        S-->>C: ai:token
        C-->>U: text appears live
    end

    L-->>AI: end of stream
    AI->>DB: persist ai_artifact + embed it back
    AI-->>S: {"done": true, "sources": [...]}
    S->>DB: UPDATE message (content + sources)
    S-->>C: ai:token:done
    C-->>U: answer + citation chips
```

### 4.2 PDF upload and indexing

```mermaid
sequenceDiagram
    actor U as Member
    participant C as Client
    participant S as Server
    participant AI as AI Service
    participant E as Gemini
    participant DB as PostgreSQL

    U->>C: choose a PDF
    C->>S: POST .../papers/upload (multipart)
    S->>S: multer — memory, ≤20MB, PDF only
    S->>AI: POST /papers/extract-text
    AI->>AI: pypdf — read the text layer

    alt no text layer (scanned)
        AI-->>S: 422 "scanned PDFs are not supported"
        S-->>C: 422 (a clear message, not a silent empty index)
    else text extracted
        AI-->>S: {text, page_count}
        S->>DB: INSERT paper + group_paper (full_text)
        Note over S,DB: the SERVER writes — it owns the schema
        S->>AI: POST /groups/{id}/papers (embed)
        AI->>AI: chunk (1000 chars, 200 overlap)
        AI->>E: embed ALL chunks — one batched call
        E-->>AI: vectors
        AI->>DB: one INSERT, one transaction
        AI-->>S: {vectors_created}
        S-->>C: 201 {pageCount, vectorsCreated}
    end
```

### 4.3 Authentication and token refresh

```mermaid
sequenceDiagram
    actor U as User
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    U->>C: sign in
    C->>S: POST /api/auth/login
    S->>DB: find user, then bcrypt.compare
    Note over S: sign access token (JWT_SECRET, 15m)<br/>sign refresh token (JWT_REFRESH_SECRET, 7d)
    S->>DB: INSERT refresh_token row
    S-->>C: Set-Cookie: refresh_token (HttpOnly, Path=/api/auth)<br/>body: { accessToken } only

    Note over C: the refresh token is unreadable by JS

    C->>S: GET /api/groups (Bearer access)
    S-->>C: 200

    Note over C,S: ...15 minutes pass...

    C->>S: GET /api/groups (expired)
    S-->>C: 401 Token expired
    C->>S: POST /api/auth/refresh (cookie sent automatically)
    S->>DB: look up the token row
    S->>DB: DELETE it — rotation
    S->>DB: INSERT the new one
    S-->>C: new cookie + { accessToken }
    C->>S: retry the request
    S-->>C: 200
```

---

## 5. Activity Diagrams

### 5.1 Handling an incoming message

```mermaid
flowchart TD
    A([Message received]) --> B{Zod: payload valid?}
    B -->|no| B1[emit error] --> Z([end])
    B -->|yes| C{Member of the group?}
    C -->|no| C1[emit Access denied] --> Z
    C -->|yes| D[persist message]
    D --> E[broadcast message:new]
    E --> F{contains @ai?}

    F -->|no| Z
    F -->|yes| G{AI service reachable?}
    G -->|no| G1[emit ai:error<br/>AI_NOT_CONFIGURED] --> Z

    G -->|yes| H[insert placeholder AI message]
    H --> I[embed the question]
    I --> J[hybrid retrieval, scoped to the group]
    J --> K{full-text search failed?}
    K -->|yes| K1[fall back to vector-only]
    K -->|no| L
    K1 --> L[build the prompt]
    L --> M[stream from the primary LLM]
    M --> N{primary failed?}
    N -->|yes| N1[retry, then the fallback provider]
    N -->|no| O
    N1 --> O[relay tokens to the session]
    O --> P[persist answer + sources]
    P --> Q[emit ai:token:done]
    Q --> R[render citation chips]
    R --> Z
```

### 5.2 Retrieval — hybrid search and RRF

```mermaid
flowchart TD
    A([Query]) --> B[embed the query, 768-dim]
    B --> C[ONE SQL statement]

    C --> D["CTE vector_results<br/>ORDER BY embedding &lt;=&gt; query<br/>HNSW index<br/>WHERE group_id = :group_id"]
    C --> E["CTE bm25_results<br/>ORDER BY ts_rank_cd(content_tsv, ...)<br/>GIN index<br/>WHERE group_id = :group_id"]

    D --> F[LEFT JOIN on chunk id]
    E --> F

    F --> G["RRF fusion:<br/>0.6/(60 + vector_rank)<br/>+ 0.4/(60 + bm25_rank)"]
    G --> H["a chunk found by only one engine still scores —<br/>COALESCE ranks it last on the other side"]
    H --> I[ORDER BY rrf_score DESC, LIMIT k]
    I --> J[enrich with paper title + url]
    J --> K([chunks + scores → prompt and citations])
```

---

## 6. State Machine Diagrams

### 6.1 An AI message

```mermaid
stateDiagram-v2
    [*] --> Placeholder : @ai detected, empty message inserted
    Placeholder --> Streaming : first ai:token
    Streaming --> Streaming : subsequent tokens
    Streaming --> Complete : ai:token:done (content + sources persisted)
    Streaming --> Failed : provider error after fallback
    Placeholder --> Failed : retrieval or provider unavailable
    Complete --> [*]
    Failed --> [*]

    note right of Complete
        metadata.sources → citation chips
    end note
```

### 6.2 A group invitation

```mermaid
stateDiagram-v2
    [*] --> Pending : member invites by email
    Pending --> Accepted : invitee accepts → group_members row created
    Pending --> Declined : invitee declines
    Pending --> Expired : expiresAt passes
    Pending --> Cancelled : owner or inviter withdraws it
    Accepted --> [*]
    Declined --> [*]
    Expired --> [*]
    Cancelled --> [*]
```

### 6.3 A refresh token

```mermaid
stateDiagram-v2
    [*] --> Active : issued at login, row stored
    Active --> Rotated : presented at /refresh — row deleted, new pair issued
    Active --> Revoked : logout
    Active --> Expired : after 7 days
    Rotated --> [*] : replaying it now fails
    Revoked --> [*]
    Expired --> [*]
```

---

## 7. Deployment Diagram

```mermaid
graph TB
    subgraph Browser["«device» User's browser"]
        SPA["«artifact»<br/>Next.js app"]
    end

    subgraph Host["«device» Docker host"]
        subgraph N1["«container» openresearch-client:342MB"]
            C["Next.js (standalone)<br/>:3000"]
        end
        subgraph N2["«container» openresearch-server:354MB"]
            S["Node 20 · Express · Socket.IO<br/>:3001 · non-root"]
        end
        subgraph N3["«container» openresearch-ai:480MB"]
            A["FastAPI · uvicorn<br/>:8000 · non-root"]
        end
        subgraph N4["«container» postgres"]
            P[("PostgreSQL 16 + pgvector<br/>:5432")]
        end
    end

    Ext1(["Gemini API"])
    Ext2(["DeepSeek / Groq"])
    Ext3(["arXiv"])

    SPA -->|HTTPS| C
    SPA -->|REST + WebSocket| S
    S -->|HTTP| A
    S -->|TCP| P
    A -->|TCP| P
    A -->|HTTPS| Ext1
    A -->|HTTPS| Ext2
    S -->|HTTPS| Ext3
```

> The AI service is **not** published to the browser; only the server may reach
> it. Its image was 2.81 GB before the local transformer models were removed
> ([ADR 0003](adr/0003-hosted-embeddings.md)).
