> [!WARNING]
> **This document describes the pre-refactor system and is now out of date.**
>
> It still specifies features that have been removed (agentic tasks, multi-step
> workflows, citation graphs, claim lineage, methodology matrices,
> recommendations, friends) and the local SPECTER2 embedding model, which was
> replaced by a hosted API.
>
> It has been kept rather than deleted because it is a course deliverable, but it
> must be regenerated against the current scope before submission — an examiner
> comparing it to the code will find the mismatch. See the README and
> `docs/adr/` for what the system actually does now.

# Software Requirements Specification (SRS)

## OpenResearch - Collaboration-First Research Platform

**Document Version:** 1.0  
**Date:** February 9, 2026  
**Project Team:** OpenResearch Development Team

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Specific Requirements](#3-specific-requirements)
4. [Non-functional Requirements](#4-non-functional-requirements)
5. [Other Requirements](#5-other-requirements)
6. [Appendix](#appendix)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) document describes the functional and non-functional requirements for **OpenResearch**, a collaboration-first research platform designed to enable research teams to collaborate in real-time with AI-powered features. This document is intended for developers, stakeholders, QA teams, and project managers involved in the development and maintenance of the system.

### 1.2 Scope

OpenResearch is a web-based platform that enables:

- **Real-time Collaboration**: Research groups can communicate through live chat with typing indicators
- **AI-Powered Research Assistance**: Integration with LLM models for paper Q&A, summarization, and discovery
- **Academic Paper Management**: Search, save, organize, and annotate research papers from arXiv
- **Vector-Based Semantic Search**: Find related content across papers using embeddings (pgvector)
- **Report Generation**: Create PDF reports summarizing group research activity

The platform consists of three main services:
1. **Frontend Client**: Next.js 16 with React 19
2. **Backend Server**: Node.js 20 with Express and Socket.IO
3. **AI Service**: Python 3.12 FastAPI with Groq LLM integration

### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|------|------------|
| **RAG** | Retrieval-Augmented Generation - AI technique combining search with LLM generation |
| **pgvector** | PostgreSQL extension for vector similarity search |
| **HNSW** | Hierarchical Navigable Small World - algorithm for approximate nearest neighbor search |
| **LLM** | Large Language Model |
| **JWT** | JSON Web Token - standard for secure authentication |
| **Socket.IO** | Real-time bidirectional event-based communication library |
| **Embedding** | Vector representation of text for semantic similarity |
| **arXiv** | Open-access repository of academic papers |
| **Drizzle ORM** | TypeScript ORM for SQL databases |

### 1.4 References

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [PostgreSQL pgvector Documentation](https://github.com/pgvector/pgvector)
- [Groq API Documentation](https://console.groq.com/docs)
- [arXiv API Documentation](https://info.arxiv.org/help/api/index.html)

### 1.5 Overview

The remainder of this document provides a detailed description of the OpenResearch platform, including product perspective, functionality, constraints, user characteristics, and comprehensive functional and non-functional requirements.

---

## 2. Overall Description

### 2.1 Product Perspective

OpenResearch operates as a standalone web application with the following system context:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              External Systems                                │
├─────────────────┬───────────────────┬───────────────────┬───────────────────┤
│    arXiv API    │    Groq API       │   OpenAI API      │   Email Service   │
│  (Paper Search) │  (LLM - Llama 3.3)│  (Embeddings)     │  (Invitations)    │
└────────┬────────┴─────────┬─────────┴─────────┬─────────┴─────────┬─────────┘
         │                  │                   │                   │
         │                  ▼                   │                   │
         │          ┌──────────────────┐        │                   │
         │          │   AI Service     │        │                   │
         │          │  (FastAPI + RAG) │◀───────┘                   │
         │          └────────┬─────────┘                            │
         │                   │                                      │
         ▼                   ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Backend Server (Node.js)                           │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│   │  REST API │  │ Socket.IO │  │ Auth (JWT)│  │ Rate Limit│               │
│   └───────────┘  └───────────┘  └───────────┘  └───────────┘               │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL 16 + pgvector                                 │
│   Users │ Groups │ Sessions │ Messages │ Papers │ Vectors │ Reports        │
└─────────────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Frontend Client (Next.js 16)                        │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│   │  Auth UI  │  │  Groups   │  │  Chat     │  │  Papers   │               │
│   └───────────┘  └───────────┘  └───────────┘  └───────────┘               │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐                              │
│   │   AI Q&A  │  │  Reports  │  │  Profile  │                              │
│   └───────────┘  └───────────┘  └───────────┘                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │
                          ┌──────┴──────┐
                          │   End User  │
                          │ (Researcher)│
                          └─────────────┘
```

### 2.2 Product Functionality

**Major System Functions:**

- **User Authentication & Profile Management**
  - User registration and login (email/password)
  - JWT-based authentication with refresh tokens
  - User profile management with research interests

- **Research Group Collaboration**
  - Create and manage research groups
  - Invite members via email
  - Role-based access (owner, member)

- **Real-time Communication**
  - Live chat within group sessions
  - Typing indicators
  - Message history persistence

- **AI-Powered Research Tools**
  - Paper Q&A with `@ai` trigger
  - Automatic paper summarization with key points extraction
  - AI-powered paper recommendations
  - Group AI chat with RAG context

- **Paper Management**
  - Search arXiv for academic papers
  - Import and save papers to personal/group libraries
  - Add notes and annotations

- **Semantic Search**
  - Vector-based similarity search across group papers
  - Find related content using embeddings

- **Report Generation**
  - Generate PDF reports summarizing group activity
  - Customizable report types (weekly, monthly, custom)

### 2.3 User Classes and Characteristics

| User Class | Description | Technical Expertise | Frequency of Use |
|------------|-------------|---------------------|------------------|
| **Researcher** | Academic researchers or students conducting literature reviews and collaborative research | Moderate | Daily |
| **Group Owner** | Users who create and manage research groups | Moderate | Daily |
| **Guest Member** | Invited members with limited permissions | Low to Moderate | Weekly |
| **System Administrator** | Technical staff managing deployment and maintenance | High | As needed |

### 2.4 Operating Environment

**Hardware Requirements:**
- Client: Any device with a modern web browser
- Server: Minimum 2 CPU cores, 4GB RAM
- Database: PostgreSQL 16+ with pgvector extension

**Software Requirements:**
- **Frontend**: Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- **Backend**: Node.js 20+, npm 10+
- **AI Service**: Python 3.12+
- **Database**: PostgreSQL 16+ with pgvector extension

### 2.5 Design and Implementation Constraints

1. **AI Trigger Requirement**: All AI features require the `@ai` trigger to activate, preventing accidental AI calls and controlling costs

2. **Group Isolation**: All vector searches and AI context are strictly isolated by group ID to prevent cross-group data leakage

3. **Rate Limiting**: API endpoints are rate-limited to prevent abuse:
   - Group Chat: 60/minute
   - Paper Q&A: 30/minute
   - Summarization: 10/minute
   - Report Generation: 5/hour

4. **External API Dependencies**:
   - Groq API for LLM (Llama 3.3 70B)
   - SPECTER2 for text embeddings (768 dimensions, local model)
   - arXiv API for paper search

5. **Real-time Communication**: Socket.IO requires persistent WebSocket connections

6. **Vector Storage**: Embeddings require ~10KB per vector chunk, scaling with paper count

### 2.6 Assumptions and Dependencies

**Assumptions:**
- Users have stable internet connectivity for real-time features
- External APIs (Groq, arXiv) maintain availability and API compatibility
- Users have modern browsers with JavaScript enabled
- Research papers are publicly accessible via arXiv

**Dependencies:**
- PostgreSQL 16 with pgvector extension for vector storage
- Groq API for LLM inference
- SPECTER2 model for embedding generation (local)
- arXiv API for paper metadata and search

---

## 3. Specific Requirements

### 3.1 External Interface Requirements

#### 3.1.1 User Interfaces

| Interface | Description |
|-----------|-------------|
| **Landing Page** | Marketing page with feature overview and login/signup CTAs |
| **Authentication Pages** | Sign in and sign up forms with validation |
| **Home Dashboard** | Display user's groups with creation option |
| **Group View** | Group details, member management, session list |
| **Chat Interface** | Real-time messaging with typing indicators and AI responses |
| **Paper Search** | arXiv search interface with filters |
| **Paper Library** | Saved papers with notes and organization |
| **Group Papers** | Group paper collection with AI Q&A interface |
| **Report Generator** | Report configuration and PDF download |
| **Profile Settings** | User profile and research interests management |

#### 3.1.2 Hardware Interfaces

| Interface | Description |
|-----------|-------------|
| **Web Browser** | Standard HTTP/HTTPS and WebSocket protocols |
| **No direct hardware** | System operates entirely as a web application |

#### 3.1.3 Software Interfaces

| Interface | Protocol | Description |
|-----------|----------|-------------|
| **arXiv API** | REST/HTTP | Search and retrieve academic paper metadata |
| **Groq API** | REST/HTTP | LLM inference for Q&A and summarization |
| **SPECTER2** | Local | Text embedding generation (768 dimensions) |
| **PostgreSQL** | TCP/IP | Primary data storage with pgvector |

#### 3.1.4 Communications Interfaces

| Protocol | Usage |
|----------|-------|
| **HTTPS** | All REST API communication |
| **WSS** | WebSocket for real-time chat (Socket.IO) |
| **SMTP** | Email notifications for invitations (future) |

### 3.2 Functional Requirements

#### Authentication & User Management

| ID | Requirement |
|----|-------------|
| **F1** | The system shall allow users to register with email and password |
| **F2** | The system shall authenticate users via JWT tokens with configurable expiration |
| **F3** | The system shall provide JWT token refresh functionality |
| **F4** | The system shall allow users to update their profile (name, avatar, interests) |
| **F5** | The system shall hash and securely store user passwords |

#### Group Management

| ID | Requirement |
|----|-------------|
| **F6** | The system shall allow authenticated users to create research groups |
| **F7** | The system shall allow group owners to invite members by email |
| **F8** | The system shall support two roles: owner and member |
| **F9** | The system shall allow group owners to remove members |
| **F10** | The system shall allow group owners to update group details |
| **F11** | The system shall allow group owners to delete groups |
| **F12** | The system shall cascade delete all group data when a group is deleted |

#### Real-time Communication

| ID | Requirement |
|----|-------------|
| **F13** | The system shall provide real-time chat within group sessions |
| **F14** | The system shall display typing indicators when users are typing |
| **F15** | The system shall persist all messages to the database |
| **F16** | The system shall support message deletion by message author |
| **F17** | The system shall notify connected users when members join/leave sessions |

#### AI Features

| ID | Requirement |
|----|-------------|
| **F18** | The system shall process AI requests only when the `@ai` trigger is present |
| **F19** | The system shall provide paper Q&A functionality using RAG |
| **F20** | The system shall generate paper summaries with key points extraction |
| **F21** | The system shall provide AI-powered paper recommendations based on group context |
| **F22** | The system shall support group AI chat with context from all group papers |
| **F23** | The system shall store AI-generated content (summaries, Q&A) as embeddings for future retrieval |
| **F24** | The system shall return a 400 error if `@ai` trigger is missing from AI requests |

#### Paper Management

| ID | Requirement |
|----|-------------|
| **F25** | The system shall allow users to search arXiv for academic papers |
| **F26** | The system shall allow users to save papers to their personal library |
| **F27** | The system shall allow users to add papers to group libraries |
| **F28** | The system shall allow users to add notes to saved papers |
| **F29** | The system shall automatically generate embeddings for papers added to groups |

#### Semantic Search

| ID | Requirement |
|----|-------------|
| **F30** | The system shall provide vector-based semantic search across group papers |
| **F31** | The system shall use cosine similarity with HNSW index for efficient search |
| **F32** | The system shall filter search results by group ID for isolation |

#### Report Generation

| ID | Requirement |
|----|-------------|
| **F33** | The system shall generate PDF reports for group activity |
| **F34** | The system shall support weekly, monthly, and custom date range reports |
| **F35** | The system shall allow selection of report sections (overview, papers, discussions, insights) |
| **F36** | The system shall provide report download functionality |

### 3.3 Use Case Model

```
                              ┌─────────────────────────────────────────┐
                              │           OpenResearch System           │
                              │                                         │
    ┌──────────┐              │  ┌─────────────────────────────────┐   │
    │          │──────────────┼─▶│       U1: Register/Login        │   │
    │          │              │  └─────────────────────────────────┘   │
    │          │              │                                         │
    │          │              │  ┌─────────────────────────────────┐   │
    │          │──────────────┼─▶│    U2: Manage Research Group    │   │
    │          │              │  └───────────────┬─────────────────┘   │
    │          │              │                  │                      │
    │          │              │          ┌───────┴───────┐              │
    │Researcher│              │          │   «include»   │              │
    │          │              │          ▼               ▼              │
    │          │              │  ┌──────────────┐ ┌──────────────┐     │
    │          │              │  │ U3: Invite   │ │ U4: Manage   │     │
    │          │              │  │   Members    │ │   Sessions   │     │
    │          │              │  └──────────────┘ └──────────────┘     │
    │          │              │                                         │
    │          │              │  ┌─────────────────────────────────┐   │
    │          │──────────────┼─▶│      U5: Real-time Chat         │   │
    │          │              │  └───────────────┬─────────────────┘   │
    │          │              │                  │                      │
    │          │              │          ┌───────┴───────┐              │
    │          │              │          │   «extend»    │              │
    │          │              │          ▼               │              │
    │          │              │  ┌──────────────┐        │              │
    │          │              │  │ U6: AI Chat  │        │              │
    │          │              │  │   (@ai)      │        │              │
    │          │              │  └──────────────┘        │              │
    │          │              │                                         │
    │          │              │  ┌─────────────────────────────────┐   │
    │          │──────────────┼─▶│     U7: Search/Save Papers      │   │
    │          │              │  └───────────────┬─────────────────┘   │
    │          │              │                  │                      │
    │          │              │          ┌───────┴───────┐              │
    │          │              │          │   «extend»    │              │
    │          │              │          ▼               ▼              │
    │          │              │  ┌──────────────┐ ┌──────────────┐     │
    │          │              │  │ U8: AI Paper │ │U9: Summarize │     │
    │          │              │  │     Q&A      │ │    Paper     │     │
    │          │              │  └──────────────┘ └──────────────┘     │
    │          │              │                                         │
    │          │              │  ┌─────────────────────────────────┐   │
    │          │──────────────┼─▶│     U10: Generate Report        │   │
    └──────────┘              │  └─────────────────────────────────┘   │
                              │                                         │
    ┌──────────┐              │  ┌─────────────────────────────────┐   │
    │  arXiv   │◀─────────────┼──│     U7: Search/Save Papers      │   │
    │   API    │              │  └─────────────────────────────────┘   │
    └──────────┘              │                                         │
                              │                                         │
    ┌──────────┐              │  ┌─────────────────────────────────┐   │
    │ Groq AI  │◀─────────────┼──│    U6, U8, U9: AI Features      │   │
    │   API    │              │  └─────────────────────────────────┘   │
    └──────────┘              │                                         │
                              └─────────────────────────────────────────┘
```

#### 3.3.1 Use Case U1: Register/Login

| Attribute | Description |
|-----------|-------------|
| **Author** | OpenResearch Team |
| **Purpose** | Allow users to create accounts and authenticate to access the platform |
| **Requirements Traceability** | F1, F2, F3, F5 |
| **Priority** | High |
| **Preconditions** | User has a valid email address |
| **Postconditions** | User is authenticated and has valid JWT tokens |
| **Actors** | User (primary) |
| **Extends** | None |
| **Includes** | None |

**Basic Flow:**

| Actor's Action | System's Response |
|----------------|-------------------|
| 1. User navigates to registration page | System displays registration form |
| 2. User enters email, password, and name | System validates input format |
| 3. User submits registration form | System creates account, hashes password, generates JWT tokens |
| 4. — | System redirects to home dashboard |

**Alternative Flow (Login):**

| Actor's Action | System's Response |
|----------------|-------------------|
| 1. User navigates to login page | System displays login form |
| 2. User enters email and password | System validates credentials |
| 3. — | System generates JWT tokens and redirects to dashboard |

**Exceptions:**

| Actor's Action | System's Response |
|----------------|-------------------|
| User enters existing email during registration | System displays "Email already registered" error |
| User enters invalid credentials during login | System displays "Invalid credentials" error |

---

#### 3.3.2 Use Case U5: Real-time Chat

| Attribute | Description |
|-----------|-------------|
| **Author** | OpenResearch Team |
| **Purpose** | Enable real-time communication within group sessions |
| **Requirements Traceability** | F13, F14, F15, F16, F17 |
| **Priority** | High |
| **Preconditions** | User is authenticated and is a member of the group |
| **Postconditions** | Message is sent and visible to all session members |
| **Actors** | User (primary), Other Group Members (secondary) |
| **Extends** | U6: AI Chat |
| **Includes** | None |

**Basic Flow:**

| Actor's Action | System's Response |
|----------------|-------------------|
| 1. User joins a group session | System establishes WebSocket connection, loads message history |
| 2. User starts typing a message | System broadcasts typing indicator to other members |
| 3. User sends message | System persists message, broadcasts to all connected users |
| 4. — | Other members see the new message in real-time |

**Alternative Flow (AI Chat):**

| Actor's Action | System's Response |
|----------------|-------------------|
| 1. User types message containing `@ai` | System detects AI trigger |
| 2. User sends message | System forwards to AI service with group context |
| 3. — | System broadcasts AI response as new message |

---

#### 3.3.3 Use Case U8: AI Paper Q&A

| Attribute | Description |
|-----------|-------------|
| **Author** | OpenResearch Team |
| **Purpose** | Allow users to ask questions about papers using AI |
| **Requirements Traceability** | F18, F19, F23, F24 |
| **Priority** | Medium |
| **Preconditions** | User is authenticated, paper is in group library, question contains `@ai` |
| **Postconditions** | AI response is generated and stored |
| **Actors** | User (primary), Groq AI API (secondary) |
| **Extends** | None |
| **Includes** | None |

**Basic Flow:**

| Actor's Action | System's Response |
|----------------|-------------------|
| 1. User navigates to paper in group library | System displays paper details and Q&A interface |
| 2. User clicks "Ask @ai" and types question | System validates `@ai` trigger presence |
| 3. User submits question | System retrieves paper context via RAG |
| 4. — | System sends context + question to Groq API |
| 5. — | System displays response and stores as embedding |

**Exceptions:**

| Actor's Action | System's Response |
|----------------|-------------------|
| User submits question without `@ai` trigger | System returns 400 error with message about missing trigger |
| AI service is unavailable | System returns 500 error with retry suggestion |

---

#### 3.3.4 Use Case U10: Generate Report

| Attribute | Description |
|-----------|-------------|
| **Author** | OpenResearch Team |
| **Purpose** | Generate PDF reports summarizing group research activity |
| **Requirements Traceability** | F33, F34, F35, F36 |
| **Priority** | Medium |
| **Preconditions** | User is authenticated and is a group member |
| **Postconditions** | PDF report is generated and available for download |
| **Actors** | User (primary), AI Service (secondary) |
| **Extends** | None |
| **Includes** | None |

**Basic Flow:**

| Actor's Action | System's Response |
|----------------|-------------------|
| 1. User navigates to Reports page | System displays report configuration options |
| 2. User selects report type (weekly/monthly/custom) | System updates date range |
| 3. User selects sections to include | System validates selections |
| 4. User clicks "Generate Report" | System starts async report generation |
| 5. — | System generates PDF using ReportLab |
| 6. — | System notifies user and provides download link |

---

## 4. Non-functional Requirements

### 4.1 Performance Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| **NFR1** | API response time for standard CRUD operations | < 200ms (95th percentile) |
| **NFR2** | Real-time message delivery latency | < 100ms |
| **NFR3** | Vector similarity search response time | < 500ms for 50,000 vectors |
| **NFR4** | AI response generation time | < 10 seconds |
| **NFR5** | PDF report generation time | < 30 seconds |
| **NFR6** | System should support 100 concurrent users per instance | Required |
| **NFR7** | WebSocket connection limit per server | 10,000 connections |

### 4.2 Safety and Security Requirements

| ID | Requirement |
|----|-------------|
| **NFR8** | All API endpoints must require JWT authentication (except public routes) |
| **NFR9** | Passwords must be hashed using bcrypt with minimum 10 rounds |
| **NFR10** | All communication must use HTTPS/WSS in production |
| **NFR11** | JWT tokens must expire within 24 hours; refresh tokens within 7 days |
| **NFR12** | Rate limiting must be enforced on all API endpoints |
| **NFR13** | Vector searches must always filter by group_id to prevent cross-group data access |
| **NFR14** | User data must be removed or anonymized upon account deletion |
| **NFR15** | API keys (Groq, OpenAI) must never be exposed to the client |

### 4.3 Software Quality Attributes

#### 4.3.1 Reliability

| Requirement | Implementation |
|-------------|----------------|
| The system shall maintain ≥99.5% uptime | Health check endpoints, automated monitoring, graceful error handling |
| The system shall recover gracefully from external API failures | Retry logic with exponential backoff, fallback messages |
| Test coverage must be ≥90% for all services | Vitest (server), pytest (AI service), coverage thresholds in CI |

#### 4.3.2 Maintainability

| Requirement | Implementation |
|-------------|----------------|
| Code shall follow consistent TypeScript/Python style guides | ESLint, Prettier, Ruff configurations |
| Database schema changes shall be managed via migrations | Drizzle ORM with versioned migrations |
| All API endpoints shall be documented | OpenAPI/Swagger specifications |
| Logging shall use structured JSON format | Winston logger with log levels |

#### 4.3.3 Scalability

| Requirement | Implementation |
|-------------|----------------|
| The system shall support horizontal scaling | Stateless backend design, Redis for Socket.IO adapter (future) |
| Database shall use connection pooling | Drizzle ORM connection pool configuration |
| Vector index shall use HNSW for O(log n) search | pgvector HNSW index with cosine similarity |

#### 4.3.4 Usability

| Requirement | Implementation |
|-------------|----------------|
| UI shall be responsive across devices | TailwindCSS responsive breakpoints |
| Loading states shall be displayed for async operations | Skeleton loaders, progress indicators |
| Error messages shall be user-friendly | Toast notifications with actionable messages |
| AI interactions shall be clearly marked | `@ai` trigger, distinct AI message styling |

---

## 5. Other Requirements

### 5.1 Database Requirements

- PostgreSQL 16 or higher with pgvector extension
- HNSW index on vector embeddings for efficient similarity search
- Foreign key constraints with appropriate CASCADE/SET NULL behavior
- Regular backups with point-in-time recovery capability

### 5.2 Legal and Compliance

- User data subject to applicable privacy regulations
- arXiv papers used under fair use for research purposes
- AI interactions logged for audit purposes

### 5.3 Internationalization

- NIL (English-only for initial release)

---

## Appendix

### Appendix A - Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend Framework | Next.js | 16 |
| UI Library | React | 19 |
| Styling | TailwindCSS | 4 |
| State Management | Zustand | Latest |
| Backend Runtime | Node.js | 20+ |
| API Framework | Express | 5 |
| Real-time | Socket.IO | 4.8 |
| ORM | Drizzle | Latest |
| Database | PostgreSQL | 16 |
| Vector Extension | pgvector | Latest |
| AI Service | FastAPI (Python) | 3.12+ |
| LLM Provider | Groq (Llama 3.3 70B) | Latest |
| Embeddings | SPECTER2 (local) | 768-dim |
| PDF Generation | ReportLab | Latest |
| Testing (Server) | Vitest | Latest |
| Testing (AI) | pytest | Latest |

### Appendix B - API Endpoint Summary

#### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user
- `PATCH /api/auth/me` - Update user profile

#### Group Endpoints
- `GET /api/groups` - List user's groups
- `POST /api/groups` - Create group
- `GET /api/groups/:id` - Get group details
- `PATCH /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group
- `GET /api/groups/:id/members` - List members
- `POST /api/groups/:id/members` - Add member
- `DELETE /api/groups/:id/members/:userId` - Remove member

#### Session Endpoints
- `GET /api/sessions/group/:groupId` - List group sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session
- `GET /api/sessions/:id/messages` - Get messages

#### Paper Endpoints
- `GET /api/papers/search/external` - Search arXiv
- `POST /api/papers/import` - Import paper
- `GET /api/papers/saved` - Get saved papers
- `POST /api/papers/:id/save` - Save paper
- `DELETE /api/papers/:id/save` - Unsave paper

#### AI Endpoints
- `POST /api/groups/:groupId/papers/:paperId/question` - Paper Q&A
- `POST /api/groups/:groupId/papers/:paperId/summarize` - Summarize paper
- `GET /api/recommendations/group/:groupId` - AI recommendations

#### Report Endpoints
- `POST /api/reports/group/:groupId/generate` - Generate report
- `GET /api/reports/:reportId/download` - Download PDF

### Appendix C - Database Schema Summary

| Table | Description |
|-------|-------------|
| `users` | User accounts and profiles |
| `groups` | Research collaboration groups |
| `group_members` | Group membership (junction) |
| `sessions` | Discussion sessions within groups |
| `messages` | Messages within sessions |
| `papers` | Academic papers (arXiv and imported) |
| `saved_papers` | User's saved papers |
| `group_papers` | Papers added to groups |
| `group_paper_vectors` | Vector embeddings for RAG |
| `group_memory_notes` | Group knowledge base |
| `ai_artifacts` | AI-generated content storage |
| `group_reports` | Report generation metadata |
| `group_invitations` | Pending group invitations |

---

*Document Generated: February 9, 2026*
