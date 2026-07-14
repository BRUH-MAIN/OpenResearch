# Database schema

PostgreSQL 16 with the `pgvector` extension. **All DDL lives in Drizzle
migrations** under `server/drizzle/`, generated from `server/src/db/schema.ts`.
The Python service reads and writes rows; it never creates tables
([ADR 0001](adr/0001-service-boundaries.md)).

13 tables.

## Core

| Table | Purpose |
|---|---|
| `users` | Accounts. Passwords are bcrypt (cost 12); `google_id` is reserved for OAuth. |
| `groups` | A research team. `owner_id` → users. |
| `group_members` | Membership, composite PK `(group_id, user_id)`, `role` = `owner` \| `member`. This table *is* the authorization boundary. |
| `group_invitations` | Pending invites, with an expiry. |
| `sessions` | A discussion thread inside a group. |
| `messages` | Chat. `user_id` is null for AI messages; `metadata` holds the retrieval `sources`. |
| `refresh_tokens` | One row per live refresh token, so it can be revoked and rotated ([ADR 0002](adr/0002-jwt-access-refresh-split.md)). |

## Papers

| Table | Purpose |
|---|---|
| `papers` | The global library — title, authors, abstract, tags, url. |
| `saved_papers` | A user's bookmarks, composite PK `(user_id, paper_id)`. |
| `group_papers` | A paper attached to a group. `full_text` holds the text extracted from an uploaded PDF — the input the RAG index chunks. |

## AI

| Table | Purpose |
|---|---|
| `group_paper_vectors` | The RAG index. One row per chunk. |
| `ai_artifacts` | Durable record of AI outputs (answers, summaries), embedded back into the index so past answers become retrievable context. |
| `group_reports` | Metadata for generated PDF reports. |

### `group_paper_vectors` — the index that matters

| Column | Notes |
|---|---|
| `group_id` | **Every query filters on this.** Group isolation is enforced here, in the `WHERE` clause. |
| `content` | The chunk text (~1000 chars, 200-char overlap, snapped to sentence boundaries). |
| `embedding` | `vector(768)` — Gemini `text-embedding-004` ([ADR 0003](adr/0003-hosted-embeddings.md)). |
| `content_tsv` | Generated `tsvector`, maintained by Postgres, for the BM25 half of retrieval. |
| `content_type` | `paper` \| `qa` \| `summary` \| `chat_response`. |

Indexes:

```sql
-- vector half: approximate nearest neighbour, cosine distance
CREATE INDEX idx_group_vectors_hnsw ON group_paper_vectors
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- keyword half: BM25 over the generated tsvector
CREATE INDEX group_vec_tsv_idx ON group_paper_vectors USING gin (content_tsv);

-- every query filters by group first
CREATE INDEX idx_group_vectors_group_id ON group_paper_vectors (group_id);
```

Both halves are queried in one statement and fused with Reciprocal Rank Fusion
([ADR 0004](adr/0004-hybrid-retrieval.md)).

## Indexes on foreign keys

Postgres does **not** index foreign-key columns automatically. Migration `0001`
adds them for the columns actually filtered on in hot paths —
`messages.session_id`, `sessions.group_id`, `group_members.user_id`,
`group_papers.group_id`, `saved_papers.paper_id`, and the rest.

## Migrations

```bash
npm --prefix server run db:generate   # schema.ts  →  a new SQL migration
npm --prefix server run db:migrate    # apply pending migrations
```

Migrations are applied by `server/src/db/migrate.ts` (Drizzle's programmatic
migrator), which runs on container start. Each migration runs once, inside a
transaction, and is recorded — replacing a hand-rolled loop that globbed `.sql`
files and swallowed "already exists" errors.
