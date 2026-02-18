# UML Diagrams — OpenResearch Platform

**Document Version:** 1.0
**Date:** February 10, 2026
**Project:** OpenResearch — Collaboration-First Research Platform

---

## Table of Contents

1. [Use Case Diagram](#1-use-case-diagram)
2. [Class Diagram](#2-class-diagram)
3. [Activity Diagram](#3-activity-diagram)
4. [Sequence Diagram](#4-sequence-diagram)
5. [State Chart (State Machine) Diagram](#5-state-chart-diagram)
6. [Component Diagram](#6-component-diagram)
7. [Deployment Diagram](#7-deployment-diagram)

---

## 1. Use Case Diagram

```mermaid
graph LR
    %% Actors
    Researcher([🧑‍🔬 Researcher])
    GroupOwner([👑 Group Owner])
    Guest([👤 Guest Member])
    Admin([🔧 System Admin])

    %% External Systems
    ArXiv([📚 arXiv API])
    GroqAI([🤖 Groq LLM API])
    OpenAIAPI([🧠 OpenAI Embeddings API])

    %% System Boundary
    subgraph OpenResearch ["🔬 OpenResearch System"]
        UC1["U1: Register / Login"]
        UC2["U2: Manage Profile"]
        UC3["U3: Create Research Group"]
        UC4["U4: Invite Members"]
        UC5["U5: Manage Group Settings"]
        UC6["U6: Remove Members"]
        UC7["U7: Real-time Chat"]
        UC8["U8: AI Chat — @ai trigger"]
        UC9["U9: Search Papers on arXiv"]
        UC10["U10: Save Papers to Library"]
        UC11["U11: Add Paper to Group"]
        UC12["U12: AI Paper Q&A"]
        UC13["U13: AI Paper Summarization"]
        UC14["U14: Semantic Vector Search"]
        UC15["U15: Generate PDF Report"]
        UC16["U16: Download Report"]
        UC17["U17: Agentic Research Tasks"]
        UC18["U18: System Monitoring"]
    end

    %% Researcher associations
    Researcher --> UC1
    Researcher --> UC2
    Researcher --> UC3
    Researcher --> UC7
    Researcher --> UC9
    Researcher --> UC10
    Researcher --> UC11
    Researcher --> UC12
    Researcher --> UC13
    Researcher --> UC14
    Researcher --> UC15
    Researcher --> UC16
    Researcher --> UC17

    %% Group Owner extends Researcher
    GroupOwner --> UC4
    GroupOwner --> UC5
    GroupOwner --> UC6

    %% Guest
    Guest --> UC1
    Guest --> UC7
    Guest --> UC9

    %% Admin
    Admin --> UC18

    %% Extends and Includes
    UC7 -.->|extends| UC8
    UC9 -.->|extends| UC10
    UC11 -.->|includes| UC14
    UC12 -.->|includes| UC14

    %% External system connections
    UC9 --> ArXiv
    UC8 --> GroqAI
    UC12 --> GroqAI
    UC13 --> GroqAI
    UC17 --> GroqAI
    UC11 --> OpenAIAPI
    UC14 --> OpenAIAPI
```

---

## 2. Class Diagram

```mermaid
classDiagram
    direction TB

    class User {
        +UUID id
        +String name
        +String email
        +String passwordHash
        +String avatar
        +JSON researchInterests
        +String bio
        +DateTime createdAt
        +DateTime updatedAt
        +register()
        +login()
        +updateProfile()
        +refreshToken()
    }

    class Group {
        +UUID id
        +String name
        +String description
        +UUID createdBy
        +DateTime createdAt
        +DateTime updatedAt
        +create()
        +update()
        +delete()
        +getMembers()
    }

    class GroupMember {
        +UUID groupId
        +UUID userId
        +String role
        +DateTime joinedAt
    }

    class Session {
        +UUID id
        +UUID groupId
        +String title
        +String description
        +String status
        +DateTime createdAt
        +start()
        +end()
    }

    class Message {
        +UUID id
        +UUID sessionId
        +UUID userId
        +String content
        +String type
        +JSON metadata
        +DateTime createdAt
        +send()
        +delete()
    }

    class Paper {
        +UUID id
        +String title
        +JSON authors
        +String abstract
        +String arxivId
        +String pdfUrl
        +String publishedDate
        +JSON categories
        +DateTime createdAt
        +search()
        +import()
    }

    class SavedPaper {
        +UUID userId
        +UUID paperId
        +String notes
        +DateTime savedAt
        +save()
        +unsave()
        +addNotes()
    }

    class GroupPaper {
        +UUID id
        +UUID groupId
        +UUID paperId
        +UUID addedBy
        +DateTime addedAt
        +addToGroup()
        +removeFromGroup()
    }

    class GroupPaperVector {
        +UUID id
        +UUID groupPaperId
        +UUID groupId
        +String chunkText
        +String chunkType
        +int chunkIndex
        +Vector embedding
        +JSON metadata
        +DateTime createdAt
    }

    class GroupMemoryNote {
        +UUID id
        +UUID groupId
        +String category
        +String content
        +JSON metadata
        +DateTime createdAt
        +DateTime updatedAt
    }

    class AIArtifact {
        +UUID id
        +UUID groupId
        +String artifactType
        +String prompt
        +String content
        +JSON metadata
        +DateTime createdAt
        +store()
    }

    class GroupReport {
        +UUID id
        +UUID groupId
        +UUID generatedBy
        +String reportType
        +String status
        +String filePath
        +JSON config
        +DateTime createdAt
        +generate()
        +download()
    }

    class GroupInvitation {
        +UUID id
        +UUID groupId
        +UUID invitedBy
        +UUID invitedUserId
        +String email
        +String status
        +String message
        +DateTime createdAt
        +DateTime expiresAt
        +send()
        +accept()
        +decline()
    }

    class RefreshToken {
        +UUID id
        +UUID userId
        +String token
        +DateTime expiresAt
        +DateTime createdAt
    }

    %% Relationships
    User "1" --> "*" Group : creates
    User "1" --> "*" GroupMember : has memberships
    Group "1" --> "*" GroupMember : has members
    Group "1" --> "*" Session : contains
    Session "1" --> "*" Message : contains
    User "1" --> "*" Message : sends
    User "1" --> "*" SavedPaper : saves
    Paper "1" --> "*" SavedPaper : saved as
    Group "1" --> "*" GroupPaper : has papers
    Paper "1" --> "*" GroupPaper : linked via
    GroupPaper "1" --> "*" GroupPaperVector : has vectors
    Group "1" --> "*" GroupMemoryNote : has notes
    Group "1" --> "*" AIArtifact : has artifacts
    Group "1" --> "*" GroupReport : has reports
    Group "1" --> "*" GroupInvitation : has invitations
    User "1" --> "*" RefreshToken : has tokens
```

---

## 3. Activity Diagram

### 3.1 AI Paper Q&A Activity

```mermaid
flowchart TD
    Start([Start]) --> A["User navigates to Group Papers"]
    A --> B["User selects a paper"]
    B --> C["User types question with @ai trigger"]
    C --> D{"Contains @ai trigger?"}

    D -->|No| E["Return 400 Error: Missing @ai trigger"]
    E --> End1([End])

    D -->|Yes| F["Validate UUID and request"]
    F --> G{"Valid request?"}
    G -->|No| H["Return validation error"]
    H --> End2([End])

    G -->|Yes| I["Fetch paper from database"]
    I --> J{"Paper found in group?"}
    J -->|No| K["Return 404 Error"]
    K --> End3([End])

    J -->|Yes| L["Generate embedding for question"]
    L --> M["Vector search in group namespace"]
    M --> N["Retrieve relevant paper chunks (RAG)"]
    N --> O["Build context from chunks + paper abstract"]
    O --> P["Send prompt + context to Groq LLM"]
    P --> Q["Receive AI response"]
    Q --> R["Store response as AI Artifact"]
    R --> S["Store embedding for future retrieval"]
    S --> T["Return response to user"]
    T --> End4([End])
```

### 3.2 User Registration & Authentication Activity

```mermaid
flowchart TD
    Start([Start]) --> A{"New User?"}

    A -->|Yes| B["Fill registration form"]
    B --> C["Submit email, password, name"]
    C --> D{"Valid input?"}
    D -->|No| E["Show validation errors"]
    E --> B
    D -->|Yes| F{"Email already exists?"}
    F -->|Yes| G["Show 'Email already registered' error"]
    G --> B
    F -->|No| H["Hash password with bcrypt"]
    H --> I["Create user record in DB"]
    I --> J["Generate JWT access + refresh tokens"]
    J --> K["Redirect to Home Dashboard"]
    K --> End1([End])

    A -->|No| L["Fill login form"]
    L --> M["Submit email + password"]
    M --> N{"Valid credentials?"}
    N -->|No| O["Show 'Invalid credentials' error"]
    O --> L
    N -->|Yes| J
```

---

## 4. Sequence Diagram

### 4.1 Real-time Chat with AI (@ai trigger)

```mermaid
sequenceDiagram
    actor User
    participant Client as Next.js Client
    participant Socket as Socket.IO Server
    participant Server as Express Backend
    participant AI as FastAPI AI Service
    participant Groq as Groq LLM API
    participant OpenAI as OpenAI Embeddings
    participant DB as PostgreSQL + pgvector

    User->>Client: Types message with @ai
    Client->>Socket: emit("typing", {sessionId, userId})
    Socket-->>Client: broadcast("user_typing") to others

    User->>Client: Sends message
    Client->>Socket: emit("send_message", {content, sessionId})
    Socket->>DB: INSERT message (type: 'user')
    Socket-->>Client: broadcast("new_message") to all members

    Socket->>Server: Detect @ai trigger
    Server->>AI: POST /groups/{groupId}/ai-chat
    AI->>AI: Validate @ai trigger
    AI->>OpenAI: Generate embedding for prompt
    OpenAI-->>AI: Return embedding vector
    AI->>DB: Vector similarity search (filtered by groupId)
    DB-->>AI: Return relevant context chunks
    AI->>Groq: Send prompt + RAG context
    Groq-->>AI: Return AI response
    AI->>DB: Store AI artifact + embedding
    AI-->>Server: Return AI response
    Server->>DB: INSERT message (type: 'ai')
    Server-->>Socket: Emit AI response
    Socket-->>Client: broadcast("new_message") AI reply
    Client-->>User: Display AI response in chat
```

### 4.2 Paper Search, Save & Embed

```mermaid
sequenceDiagram
    actor User
    participant Client as Next.js Client
    participant Server as Express Backend
    participant ArXiv as arXiv API
    participant AI as FastAPI AI Service
    participant OpenAI as OpenAI Embeddings
    participant DB as PostgreSQL + pgvector

    User->>Client: Enter search query
    Client->>Server: GET /api/papers/search/external?q=...
    Server->>ArXiv: Search papers
    ArXiv-->>Server: Return paper metadata
    Server-->>Client: Return search results
    Client-->>User: Display paper list

    User->>Client: Click "Save Paper"
    Client->>Server: POST /api/papers/import
    Server->>DB: INSERT into papers table
    Server-->>Client: Paper saved
    Client->>Server: POST /api/papers/{id}/save
    Server->>DB: INSERT into saved_papers
    Server-->>Client: Confirmation

    User->>Client: Click "Add to Group"
    Client->>Server: POST /api/groups/{groupId}/papers
    Server->>DB: INSERT into group_papers
    Server->>AI: POST /groups/{groupId}/papers/embed
    AI->>AI: Chunk paper text
    AI->>OpenAI: Generate embeddings for each chunk
    OpenAI-->>AI: Return embedding vectors
    AI->>DB: INSERT vectors into group_paper_vectors
    AI-->>Server: Embedding complete
    Server-->>Client: Paper added to group
    Client-->>User: Show success
```

---

## 5. State Chart (State Machine) Diagram

### 5.1 Group Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created : Owner creates session

    Created --> Active : First member joins
    Active --> Active : Members send messages
    Active --> Active : AI responds to @ai
    Active --> Active : Members join/leave

    Active --> Idle : No activity (timeout)
    Idle --> Active : New message received
    Idle --> Closed : Auto-close after extended idle

    Active --> Closed : Owner ends session
    Closed --> [*]

    state Active {
        [*] --> Chatting
        Chatting --> AIProcessing : @ai message sent
        AIProcessing --> Chatting : AI response received
        Chatting --> Typing : User starts typing
        Typing --> Chatting : User sends/stops
    }
```

### 5.2 Group Invitation Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending : Owner sends invitation

    Pending --> Accepted : Invitee accepts
    Pending --> Declined : Invitee declines
    Pending --> Expired : Invitation expires

    Accepted --> [*] : User added as member
    Declined --> [*]
    Expired --> [*]
```

### 5.3 Report Generation Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Requested : User clicks Generate Report

    Requested --> Validating : Validate config & permissions
    Validating --> Fetching : Validation passed
    Validating --> Failed : Validation error

    Fetching --> Processing : Data fetched from DB
    Processing --> Generating : AI summaries generated
    Generating --> Completed : PDF created successfully
    Generating --> Failed : Generation error

    Completed --> Downloaded : User downloads PDF
    Downloaded --> [*]
    Failed --> [*]

    Completed --> [*] : Expires after retention period
```

---

## 6. Component Diagram

```mermaid
graph TB
    subgraph ClientLayer ["🖥️ Frontend — Next.js 16 + React 19"]
        AuthUI["Auth Module<br/>(Login / Register)"]
        Dashboard["Home Dashboard"]
        GroupView["Group Management"]
        ChatUI["Real-time Chat UI"]
        PaperSearch["Paper Search & Library"]
        GroupPapers["Group Papers + AI Q&A"]
        ReportUI["Report Generator"]
        ProfileUI["Profile Settings"]
        SocketClient["Socket.IO Client"]
        APIClient["REST API Client<br/>(Axios)"]
        AuthStore["Auth Store<br/>(Zustand)"]
    end

    subgraph ServerLayer ["⚙️ Backend — Node.js 20 + Express 5"]
        AuthMiddleware["JWT Auth Middleware"]
        RateLimiter["Rate Limiter"]
        Validator["Request Validator<br/>(Zod)"]
        ErrorHandler["Error Handler"]

        AuthRoutes["Auth Routes"]
        GroupRoutes["Group Routes"]
        SessionRoutes["Session Routes"]
        PaperRoutes["Paper Routes"]
        AIRoutes["AI Proxy Routes"]
        ReportRoutes["Report Routes"]
        RecommendRoutes["Recommendation Routes"]
        HealthRoutes["Health Check"]

        SocketHandler["Socket.IO Handler"]
        DrizzleORM["Drizzle ORM"]
    end

    subgraph AILayer ["🤖 AI Service — Python 3.12 + FastAPI"]
        AIMain["FastAPI App"]
        GroqClient["Groq LLM Client"]
        EmbeddingService["Embedding Service<br/>(OpenAI)"]
        VectorStore["Vector Store<br/>(pgvector)"]
        ReportGen["Report Generator<br/>(ReportLab)"]
        AgenticService["Agentic Orchestration"]
        IntentClassifier["Intent Classifier"]
        MemoryModule["Memory Module"]
        DBModule["Database Module"]
    end

    subgraph DataLayer ["🗄️ Data — PostgreSQL 16 + pgvector"]
        UsersTbl["users"]
        GroupsTbl["groups"]
        SessionsTbl["sessions"]
        MessagesTbl["messages"]
        PapersTbl["papers"]
        VectorsTbl["group_paper_vectors"]
        ArtifactsTbl["ai_artifacts"]
        ReportsTbl["group_reports"]
    end

    subgraph ExternalAPIs ["🌐 External APIs"]
        ArXivAPI["arXiv API"]
        GroqAPI["Groq LLM API"]
        OpenAIAPI["OpenAI<br/>Embeddings API"]
    end

    %% Client to Server
    APIClient -->|REST/HTTPS| AuthMiddleware
    SocketClient -->|WebSocket/WSS| SocketHandler

    %% Middleware chain
    AuthMiddleware --> RateLimiter
    RateLimiter --> Validator
    Validator --> AuthRoutes
    Validator --> GroupRoutes
    Validator --> SessionRoutes
    Validator --> PaperRoutes
    Validator --> AIRoutes
    Validator --> ReportRoutes
    Validator --> RecommendRoutes

    %% Server to DB
    DrizzleORM -->|TCP| DataLayer

    %% Server to AI
    AIRoutes -->|REST/HTTP| AIMain
    ReportRoutes -->|REST/HTTP| AIMain

    %% AI Service internal
    AIMain --> GroqClient
    AIMain --> EmbeddingService
    AIMain --> VectorStore
    AIMain --> ReportGen
    AIMain --> AgenticService
    AIMain --> IntentClassifier
    AIMain --> MemoryModule
    AIMain --> DBModule

    %% AI to External
    GroqClient --> GroqAPI
    EmbeddingService --> OpenAIAPI
    PaperRoutes --> ArXivAPI

    %% AI to DB
    DBModule -->|TCP| DataLayer
    VectorStore -->|TCP| DataLayer
```

---

## 7. Deployment Diagram

```mermaid
graph TB
    subgraph UserDevice ["👤 User Device"]
        Browser["Web Browser<br/>(Chrome / Firefox / Safari / Edge)"]
    end

    subgraph DockerHost ["🐳 Docker Host — docker-compose"]
        subgraph Network ["openresearch-network (bridge)"]

            subgraph ClientContainer ["📦 openresearch-client"]
                NextJS["Next.js 16<br/>Port: 3000<br/>Memory: 512MB"]
            end

            subgraph ServerContainer ["📦 openresearch-server"]
                Express["Node.js 20 + Express 5<br/>+ Socket.IO 4.8<br/>Port: 3001<br/>Memory: 512MB"]
            end

            subgraph AIContainer ["📦 openresearch-ai"]
                FastAPI["Python 3.12 + FastAPI<br/>+ Uvicorn<br/>Port: 8000<br/>Memory: 4GB"]
            end

            subgraph MCPContainer ["📦 openresearch-mcp-academic-papers"]
                MCPServer["MCP Academic Papers<br/>Port: 9010<br/>Memory: 512MB"]
            end

            subgraph DBContainer ["📦 openresearch-db"]
                Postgres["PostgreSQL 16<br/>+ pgvector extension<br/>Port: 5432<br/>Memory: 1GB"]
                Volume[("postgres_data<br/>(persistent volume)")]
            end

        end
    end

    subgraph ExternalServices ["☁️ External Cloud Services"]
        GroqCloud["Groq Cloud API<br/>(Llama 3.3 70B)"]
        OpenAICloud["OpenAI API<br/>(text-embedding-3-small)"]
        ArXivService["arXiv.org API"]
    end

    %% Connections
    Browser -->|"HTTPS :3000"| NextJS
    Browser -->|"WSS :3001"| Express

    NextJS -->|"HTTP :3001"| Express
    Express -->|"HTTP :8000"| FastAPI
    FastAPI -->|"HTTP :9010"| MCPServer

    Express -->|"TCP :5432"| Postgres
    FastAPI -->|"TCP :5432"| Postgres
    Postgres --- Volume

    FastAPI -->|"HTTPS"| GroqCloud
    FastAPI -->|"HTTPS"| OpenAICloud
    MCPServer -->|"HTTPS"| ArXivService

    %% Health Checks
    Express -.->|healthcheck| Express
    FastAPI -.->|healthcheck| FastAPI
    Postgres -.->|pg_isready| Postgres
```

---

*Document Generated: February 10, 2026*
