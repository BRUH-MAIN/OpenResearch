# Database Schema Documentation

## Overview

OpenResearch uses **PostgreSQL 16** with the **pgvector** extension for vector embeddings. The schema is managed using **Drizzle ORM**.

## Schema Diagram

```
users ──┬──▶ groups (owner)
        ├──▶ group_members
        ├──▶ saved_papers
        └──▶ group_memory_notes

groups ─┬──▶ group_members
        ├──▶ sessions
        ├──▶ group_papers
        ├──▶ group_paper_vectors
        ├──▶ group_memory_notes
        ├──▶ ai_artifacts
        └──▶ group_reports

sessions ──┬──▶ messages
           └──▶ saved_papers

papers ──┬──▶ saved_papers
         └──▶ group_papers
```

## Core Tables

### users

User accounts and profiles.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | User's display name |
| `email` | VARCHAR(255) | Email (unique) |
| `password` | VARCHAR(255) | Hashed password (null for OAuth) |
| `avatar` | TEXT | Avatar URL |
| `interests` | JSONB | Array of research interests |
| `google_id` | VARCHAR(255) | Google OAuth ID |
| `created_at` | TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Indexes:**
- `users_email_unique` on `email`

### groups

Research collaboration groups.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Group name |
| `description` | TEXT | Group description |
| `owner_id` | UUID | Creator user ID (FK to users) |
| `avatar` | TEXT | Group avatar URL |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Relations:**
- `owner_id` → `users.id` (CASCADE DELETE)

### group_members

Group membership (junction table).

| Column | Type | Description |
|--------|------|-------------|
| `group_id` | UUID | Group ID (FK to groups) |
| `user_id` | UUID | User ID (FK to users) |
| `role` | VARCHAR(50) | 'owner' or 'member' |
| `joined_at` | TIMESTAMP | Join time |

**Primary Key:** (`group_id`, `user_id`)

**Relations:**
- `group_id` → `groups.id` (CASCADE DELETE)
- `user_id` → `users.id` (CASCADE DELETE)

### sessions

Discussion sessions within groups.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `group_id` | UUID | Group ID (FK to groups) |
| `title` | VARCHAR(500) | Session title |
| `status` | VARCHAR(50) | 'active' or 'archived' |
| `created_at` | TIMESTAMP | Creation time |
| `last_activity_at` | TIMESTAMP | Last message time |

**Relations:**
- `group_id` → `groups.id` (CASCADE DELETE)

### messages

Messages within sessions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `session_id` | UUID | Session ID (FK to sessions) |
| `user_id` | UUID | User ID (FK to users, null for AI) |
| `content` | TEXT | Message content |
| `type` | VARCHAR(50) | 'user' or 'ai' |
| `metadata` | JSONB | Additional message data |
| `created_at` | TIMESTAMP | Send time |

**Relations:**
- `session_id` → `sessions.id` (CASCADE DELETE)
- `user_id` → `users.id` (SET NULL)

**Indexes:**
- `idx_messages_session_id` on `session_id`

### papers

Academic papers (arXiv and imported).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `title` | VARCHAR(1000) | Paper title |
| `authors` | JSONB | Array of author names |
| `abstract` | TEXT | Paper abstract |
| `tags` | JSONB | Array of topic tags |
| `url` | TEXT | Paper URL (arXiv, DOI, etc.) |
| `published_date` | VARCHAR(50) | Publication date |
| `citations` | INTEGER | Citation count |
| `created_at` | TIMESTAMP | Import time |

**Indexes:**
- `idx_papers_created_at` on `created_at`

### saved_papers

User's saved papers (junction table).

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | UUID | User ID (FK to users) |
| `paper_id` | UUID | Paper ID (FK to papers) |
| `session_id` | UUID | Optional session context (FK to sessions) |
| `notes` | TEXT | User notes about paper |
| `saved_at` | TIMESTAMP | Save time |

**Primary Key:** (`user_id`, `paper_id`)

**Relations:**
- `user_id` → `users.id` (CASCADE DELETE)
- `paper_id` → `papers.id` (CASCADE DELETE)
- `session_id` → `sessions.id` (SET NULL)

### group_papers

Papers added to groups (junction table).

| Column | Type | Description |
|--------|------|-------------|
| `group_id` | UUID | Group ID (FK to groups) |
| `paper_id` | UUID | Paper ID (FK to papers) |
| `added_by` | UUID | User who added (FK to users) |
| `notes` | TEXT | Group-specific notes |
| `added_at` | TIMESTAMP | Add time |

**Primary Key:** (`group_id`, `paper_id`)

**Relations:**
- `group_id` → `groups.id` (CASCADE DELETE)
- `paper_id` → `papers.id` (CASCADE DELETE)
- `added_by` → `users.id` (SET NULL)

## AI & Vector Tables

### group_paper_vectors

Vector embeddings for group-isolated RAG.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `group_id` | UUID | Group ID (isolation key) |
| `paper_id` | TEXT | Paper or source ID |
| `content_type` | VARCHAR(50) | 'paper', 'qa', 'summary', 'memory', 'report' |
| `content_id` | TEXT | Reference to source artifact |
| `chunk_index` | INTEGER | Chunk number for large content |
| `content` | TEXT | Text content |
| `embedding` | VECTOR(1536) | OpenAI embedding vector |
| `metadata` | JSONB | Additional metadata |
| `created_at` | TIMESTAMP | Creation time |

**Indexes:**
- `idx_group_vectors_hnsw` (HNSW) on `embedding` using `vector_cosine_ops`
- `idx_group_vectors_group_id` on `group_id`
- `idx_group_vectors_content_type` on `content_type`

**Critical:** All queries MUST filter by `group_id` to maintain isolation.

**Content Types:**
- `paper`: Paper abstract/content chunks
- `qa`: Question-answer pairs
- `summary`: Paper or session summaries
- `memory`: Group memory notes
- `report`: Report content

### group_memory_notes

Group knowledge base (decisions, facts, guidelines).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `group_id` | UUID | Group ID (FK to groups) |
| `user_id` | UUID | Author (FK to users) |
| `content` | TEXT | Note content |
| `note_type` | VARCHAR(50) | 'note', 'decision', 'guideline', 'fact' |
| `metadata` | JSONB | Additional data |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Relations:**
- `group_id` → `groups.id` (CASCADE DELETE)
- `user_id` → `users.id` (SET NULL)

**Note Types:**
- `note`: General observation or note
- `decision`: Research decision or conclusion
- `guideline`: Internal group guideline
- `fact`: Important fact or finding

### ai_artifacts

AI-generated content storage.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `group_id` | UUID | Group ID (FK to groups) |
| `session_id` | UUID | Session context (FK to sessions) |
| `paper_id` | UUID | Paper context (FK to papers) |
| `user_id` | UUID | Requesting user (FK to users) |
| `artifact_type` | VARCHAR(50) | Type of artifact |
| `prompt` | TEXT | Original user prompt |
| `content` | TEXT | AI-generated content |
| `metadata` | JSONB | Generation metadata |
| `created_at` | TIMESTAMP | Generation time |

**Relations:**
- `group_id` → `groups.id` (CASCADE DELETE)
- `session_id` → `sessions.id` (SET NULL)
- `paper_id` → `papers.id` (SET NULL)
- `user_id` → `users.id` (SET NULL)

**Artifact Types:**
- `qa`: Question-answer response
- `summary`: Paper summary
- `session_summary`: Session summary
- `chat_response`: Group chat AI response
- `report`: Generated report content

**Metadata Fields:**
- `model`: AI model used
- `latency_ms`: Generation time
- `vector_ids_used`: Context vectors used
- `context_items_count`: Number of context items

### group_reports

Report generation metadata.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `group_id` | UUID | Group ID (FK to groups) |
| `created_by` | UUID | User who generated (FK to users) |
| `title` | VARCHAR(500) | Report title |
| `report_type` | VARCHAR(50) | 'weekly', 'monthly', 'custom' |
| `status` | VARCHAR(50) | 'generating', 'completed', 'failed' |
| `file_path` | TEXT | Path to PDF file |
| `file_size` | INTEGER | File size in bytes |
| `sections_included` | JSONB | Sections in report |
| `generated_at` | TIMESTAMP | Generation time |
| `error_message` | TEXT | Error if failed |

**Relations:**
- `group_id` → `groups.id` (CASCADE DELETE)
- `created_by` → `users.id` (SET NULL)

**Report Types:**
- `weekly`: Last 7 days
- `monthly`: Last 30 days
- `custom`: Custom date range

**Status Flow:**
1. `generating` → Report is being created
2. `completed` → PDF ready for download
3. `failed` → Generation error occurred

## Invitation System

### group_invitations

Pending group invitations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `group_id` | UUID | Group ID (FK to groups) |
| `email` | VARCHAR(255) | Invitee email |
| `invited_by` | UUID | Inviter (FK to users) |
| `status` | VARCHAR(50) | 'pending', 'accepted', 'declined' |
| `token` | VARCHAR(500) | Unique invite token |
| `expires_at` | TIMESTAMP | Expiration time |
| `created_at` | TIMESTAMP | Invitation time |
| `responded_at` | TIMESTAMP | Response time |

**Relations:**
- `group_id` → `groups.id` (CASCADE DELETE)
- `invited_by` → `users.id` (SET NULL)

**Status Flow:**
1. `pending` → Invitation sent, awaiting response
2. `accepted` → User joined group
3. `declined` → User declined invitation

## Vector Operations

### Creating Embeddings

```sql
-- Insert vector with embedding
INSERT INTO group_paper_vectors (
  group_id, paper_id, content_type, content, embedding
) VALUES (
  'group-uuid',
  'paper-uuid',
  'paper',
  'This is the paper abstract...',
  '[0.123, -0.456, ...]'::vector
);
```

### Similarity Search

```sql
-- Search similar vectors in group
SELECT 
  id,
  content,
  1 - (embedding <=> $query_embedding) AS similarity
FROM group_paper_vectors
WHERE group_id = $group_id
  AND content_type = ANY($content_types)
ORDER BY embedding <=> $query_embedding
LIMIT 10;
```

### Distance Operators

- `<=>` : Cosine distance (used with HNSW index)
- `<->` : Euclidean distance
- `<#>` : Negative inner product

## Migrations

Migrations are stored in `drizzle/` directory.

### Running Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:push

# View database in Drizzle Studio
npm run db:studio
```

### Migration Files

- `0000_bizarre_power_man.sql` - Initial schema
- `0001_group_context_vectors.sql` - Group-isolated vectors

## Data Retention

### Cascade Deletes

When a user is deleted:
- Their group memberships are removed
- Their saved papers are removed
- Their messages and artifacts set user_id to NULL

When a group is deleted:
- All sessions, papers, vectors, and artifacts are removed
- All group memberships are removed
- All invitations are removed

When a session is deleted:
- All messages in the session are removed

When a paper is deleted:
- All saved_papers entries are removed
- All group_papers entries are removed

## Performance Considerations

### Indexes

Critical indexes for performance:
1. HNSW index on `group_paper_vectors.embedding`
2. B-tree index on `group_paper_vectors.group_id`
3. B-tree index on `messages.session_id`
4. B-tree index on `papers.created_at`

### Query Optimization

- Always include `group_id` in vector searches
- Use `LIMIT` on message queries
- Index foreign key columns
- Use `SELECT` with specific columns, not `*`

### Vector Store Size

Estimated storage per vector:
- Vector (1536 dim float32): ~6 KB
- Content text: varies
- Metadata: ~1 KB
- **Total per vector**: ~8-10 KB

For 10,000 papers with 5 chunks each:
- 50,000 vectors × 10 KB = ~500 MB

## Backup

### Full Backup

```bash
pg_dump $DATABASE_URL > backup.sql
```

### Restore

```bash
psql $DATABASE_URL < backup.sql
```

### Selective Backup

```bash
# Backup only schema
pg_dump -s $DATABASE_URL > schema.sql

# Backup specific tables
pg_dump -t users -t groups $DATABASE_URL > core_tables.sql
```

## Security

### Row-Level Security (Future)

Consider implementing RLS for additional security:

```sql
-- Enable RLS on group_papers
ALTER TABLE group_papers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see papers in their groups
CREATE POLICY group_papers_select ON group_papers
  FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members
      WHERE user_id = current_user_id()
    )
  );
```

### Connection Security

- Use SSL for database connections in production
- Rotate database credentials regularly
- Use least-privilege database users for applications
- Enable connection pooling for better performance
