# OpenResearch

A collaboration platform for research teams. Groups share papers, discuss them in
realtime, and ask an AI assistant questions that are answered **from their own
papers** — with citations showing exactly which passages the answer came from.

The AI only speaks when spoken to: it responds to `@ai` and nothing else.

---

## The flagship: group-scoped RAG chat

Everything else here is scaffolding for this one flow.

```
User types "@ai which architecture does this paper propose?"
        │
        ▼
  Node server  ── verifies group membership, opens a placeholder message
        │
        ▼
  AI service   ── retrieves from THIS GROUP's papers only:
        │           • pgvector cosine similarity  (HNSW index)     ─┐
        │           • Postgres BM25 full-text     (GIN index)      ─┤ fused with
        │                                                            │ Reciprocal
        │           one SQL statement, filtered by group_id          │ Rank Fusion
        │                                                           ─┘
        ▼
  LLM  ── prompt = retrieved chunks + recent messages + the question
        │
        ▼
  tokens stream back → Socket.IO → the browser, live
        │
        ▼
  final frame carries `sources` → rendered as citation chips
```

**Why hybrid retrieval and not just vectors?** Embeddings understand that
"attention mechanism" and "transformer architecture" mean the same thing, but they
are lossy about exact tokens — ask for "ResNet-152" or "BLEU 41.8" and semantic
similarity will confidently hand you the wrong number. BM25 has the opposite
failure. Running both and fusing the *ranks* (not the scores, which are not on a
comparable scale) answers both kinds of question. See
[ADR 0004](docs/adr/0004-hybrid-retrieval.md).

**Group isolation** is the security boundary. Every retrieval query filters by
`group_id` in the `WHERE` clause — not by discarding results afterwards — and every
route that reaches it goes through membership middleware. One team's papers cannot
reach another team's answers.

---

## Architecture

```
┌──────────────┐        ┌──────────────────┐        ┌─────────────────┐
│  Next.js 16  │  REST  │  Node 20         │  HTTP  │  FastAPI        │
│  React 19    │◄──────►│  Express 5       │◄──────►│  (Python 3.12)  │
│              │   WS   │  Socket.IO       │        │                 │
│  browser     │◄──────►│                  │        │  RAG + LLM      │
└──────────────┘        └────────┬─────────┘        └────────┬────────┘
                                 │                           │
                                 │      ┌────────────────────┘
                                 ▼      ▼
                        ┌──────────────────────────┐
                        │  PostgreSQL 16           │
                        │  + pgvector (768-dim)    │
                        │  HNSW + GIN indexes      │
                        └──────────────────────────┘
```

The browser never talks to the AI service. The server proxies to it, which keeps
authorization, rate limiting, and the `@ai` gate in exactly one place.

**The server owns the schema.** Every table and index is a Drizzle migration. The
Python service reads and writes rows and issues no DDL — even the PDF upload
feature, where text extraction *must* happen in Python (pypdf), hands the text back
so the server can persist it. See [ADR 0001](docs/adr/0001-service-boundaries.md).

A correlation ID is generated per request and forwarded across all three tiers, so
one user action can be traced through every log.

---

## Features

- **Groups** — create, invite by email, owner/member roles
- **Realtime chat** — Socket.IO sessions with typing indicators
- **`@ai` RAG chat** — streamed answers grounded in the group's papers, with citations
- **Research agent** — a tool-using ReAct loop that searches the group's papers,
  goes to arXiv for what they don't cover, reads a paper in full when it needs to,
  and answers with citations. Its reasoning streams live, step by step.
- **Paper library** — arXiv search, save, tag
- **PDF upload** — extracts the text layer (pypdf), chunks it, and embeds it, so
  answers can reach section-level detail instead of stopping at the abstract
- **Paper Q&A and summarization** — per-paper, `@ai`-gated
- **PDF reports** — group activity, generated with reportlab

---

## Running it

**Prerequisites:** Docker, and API keys for an LLM and for embeddings.

```bash
cp .env.example .env          # fill in the keys below
cp .env .env.docker
docker compose up -d --build
```

Open http://localhost:3000.

| Key | Needed for | Get one |
|---|---|---|
| `GEMINI_API_KEY` | embeddings (`gemini-embedding-001`, truncated to 768-dim) | [aistudio.google.com](https://aistudio.google.com/apikey) |
| `DEEPSEEK_API_KEY` | chat, Q&A, summaries (primary) | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| `GROQ_API_KEY` | chat fallback if DeepSeek fails | [console.groq.com](https://console.groq.com/keys) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | auth — must differ, 32+ chars | `openssl rand -hex 32` |

Without `GEMINI_API_KEY` the service still starts, but embeddings fall back to
deterministic placeholder vectors and retrieval returns noise.

---

## Tests

```bash
docker compose -f docker-compose.test.yml up -d   # ephemeral Postgres (tmpfs)
npm --prefix server test                          # 32 integration tests
cd ai-service && python -m pytest                 # 60 tests, every API mocked
npx playwright test                               # hermetic e2e smoke (~7s)
```

The server tests run against a **real Postgres + pgvector**, migrated with the same
migrations the app ships with — the schema and its constraints are part of what is
being tested. The AI-service tests mock Gemini, DeepSeek and Groq with `respx`, so
they need no keys and cost nothing. The e2e test never triggers `@ai`, so it makes
no LLM call and finishes in seconds.

---

## Stack

**Client** Next.js 16, React 19, TypeScript, Tailwind 4, Zustand, React Query, Socket.IO client
**Server** Node 20, Express 5, Socket.IO, Drizzle ORM, Zod, JWT
**AI** FastAPI, Python 3.12, pgvector, Gemini embeddings, DeepSeek → Groq fallback
**Data** PostgreSQL 16 + pgvector — HNSW (vector) and GIN (full-text) indexes

Roughly 5.3k lines of server TypeScript, 3.3k of Python, 10k of client TypeScript.

---

## Design decisions

Each of these is a place where the obvious choice was not the one taken, and the
reasoning is written down:

| | |
|---|---|
| [0001](docs/adr/0001-service-boundaries.md) | Three services — and why only one may own the schema |
| [0002](docs/adr/0002-jwt-access-refresh-split.md) | 15-minute access tokens, refresh tokens in an httpOnly cookie |
| [0003](docs/adr/0003-hosted-embeddings.md) | Hosted embeddings over local models — a 2.81 GB image became 480 MB, and Matryoshka truncation kept the schema |
| [0004](docs/adr/0004-hybrid-retrieval.md) | Vector + BM25 with Reciprocal Rank Fusion |
| [0005](docs/adr/0005-scope-cut.md) | Deleting six half-built features to finish one |
| [0006](docs/adr/0006-research-agent.md) | Rebuilding one agent properly — and hand-writing the ReAct loop rather than calling a framework |

---

## What this project used to be

Worth being direct about, because the git history is public.

This started as a much broader application: LangGraph agentic tasks, multi-step
workflows with human checkpoints, citation graphs, claim lineage, methodology
matrices, recommendations. Most of it ran. Very little of it was finished — the
recommendation engine scored every paper `0.8`; the friends tables had no endpoint
that could create a friendship.

It also had real problems. Both JWT tokens were signed with the same secret and
lived for 7 days, while the unused refresh secret sat there, validated at boot and
called by nothing. The group-membership check was copy-pasted 34 times. The test
suite mocked the database and asserted against logic re-implemented inside the
tests, so it could not fail — and CI enforced a 90% coverage gate over it.

The repair: cut 16,354 lines, fix the auth, move authorization behind middleware,
replace the tests with ones that run against a real database, and shrink the AI
image roughly 6×.

Scope discipline is the point. Six shallow features give someone six places to ask
"how does this work?" and get an unsatisfying answer. One finished feature gives
them one place — and a real answer.
