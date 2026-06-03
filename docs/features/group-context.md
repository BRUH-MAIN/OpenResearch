# Group-Isolated Context Space

## Overview

OpenResearch implements **group-isolated context spaces** using PostgreSQL 16 with the pgvector extension. Each research group has its own isolated RAG (Retrieval-Augmented Generation) context, ensuring that:

1. Papers added to a group are only searchable within that group
2. AI responses are informed only by the group's papers and discussions
3. Summaries, Q&A pairs, and chat history are group-specific
4. No data leakage between groups

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Group A Context                       │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│ │   Papers    │ │  Summaries  │ │    Q&A History      │ │
│ │ (embedded)  │ │ (embedded)  │ │    (embedded)       │ │
│ └─────────────┘ └─────────────┘ └─────────────────────┘ │
│                         │                                │
│                    Vector Store                          │
│              (HNSW Index, Cosine Similarity)            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    Group B Context                       │
│              (Completely Isolated)                       │
└─────────────────────────────────────────────────────────┘
```

## Database Schema

### group_paper_vectors

```sql
CREATE TABLE group_paper_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL,  -- Group isolation key
    paper_id TEXT NOT NULL,  -- Paper or source identifier
    content_type VARCHAR(50) NOT NULL DEFAULT 'paper', 
    -- Types: 'paper', 'summary', 'qa', 'memory', 'report'
    content_id TEXT,  -- Reference to source artifact
    chunk_index INTEGER DEFAULT 0,  -- For chunked content
    content TEXT,  -- Text content
    embedding VECTOR(768),  -- SPECTER2 embedding
    metadata JSONB,  -- Additional metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- HNSW index for fast similarity search (cosine distance)
CREATE INDEX idx_group_vectors_hnsw 
ON group_paper_vectors 
USING hnsw (embedding vector_cosine_ops);

-- Index for group isolation (CRITICAL for security)
CREATE INDEX idx_group_vectors_group_id 
ON group_paper_vectors(group_id);

-- Index for content type filtering
CREATE INDEX idx_group_vectors_content_type
ON group_paper_vectors(content_type);
```

## How It Works

### 1. Adding Papers to a Group

When a paper is added to a group:

```typescript
// POST /api/groups/:groupId/papers
const response = await api.addPaperToGroup(token, groupId, paperId, notes);
```

1. Paper metadata is stored in `group_papers` table
2. Paper abstract is sent to AI service for embedding
3. Embedding (768 dimensions) is stored in `group_paper_vectors`
4. Index is updated for fast similarity search

### 2. Querying with RAG

When a user asks `@ai` a question:

```typescript
// The @ai trigger is required
const question = "@ai What papers discuss transformer architectures?";
```

1. Question is embedded using the same model
2. Vector similarity search finds relevant context **from the same group only**
3. Top-K results are retrieved
4. LLM generates response with retrieved context

```sql
-- Simplified query (actual uses HNSW index)
SELECT content, 1 - (embedding <=> $query_embedding) AS similarity
FROM group_paper_vectors
WHERE group_id = $group_id  -- GROUP ISOLATION
ORDER BY embedding <=> $query_embedding
LIMIT 10;
```

### 3. Storing AI Interactions

AI-generated content is also embedded and stored:

- **Summaries**: When a paper is summarized, the summary is embedded
- **Q&A Pairs**: Question-answer pairs are embedded for future retrieval
- **Chat Messages**: Important AI responses are embedded
- **Memory Notes**: Group memory notes (decisions, facts, guidelines) are embedded
- **Reports**: Generated report content is embedded

This creates a growing, searchable knowledge base for each group.

## API Endpoints

### Group Papers

```
GET    /api/groups/:groupId/papers              # List group papers
POST   /api/groups/:groupId/papers              # Add paper to group
DELETE /api/groups/:groupId/papers/:paperId     # Remove paper
POST   /api/groups/:groupId/papers/:paperId/question   # Ask question (@ai required)
POST   /api/groups/:groupId/papers/:paperId/summarize  # Generate summary
POST   /api/groups/:groupId/search              # Search group vectors
```

### Socket.IO Events

```javascript
// Send message with @ai trigger
socket.emit('message:send', {
  sessionId: 'session-id',
  content: '@ai explain this paper'
});

// Ask paper question
socket.emit('paper:question', {
  paperId: 'paper-id',
  question: '@ai what is the methodology?'
});

// Summarize paper
socket.emit('paper:summarize', {
  paperId: 'paper-id'
});
```

## @ai Trigger Requirement

**Important**: AI only responds when triggered by `@ai` in the message.

```javascript
// ✅ Valid - AI will respond
"@ai What papers are relevant to neural networks?"
"Hey @ai can you help me understand this?"
"Explain this paper @ai"

// ❌ Invalid - AI will NOT respond (400 error)
"What papers are relevant to neural networks?"
"Can you help me understand this?"
```

This design:
- Prevents accidental AI queries
- Reduces costs by only processing intentional requests
- Makes AI interactions explicit and trackable

## Security & Isolation

### Group-Level Isolation

Every vector query includes a `WHERE group_id = ?` clause:

```python
async def search_similar(
    self,
    group_id: str,  # Always required
    query_embedding: List[float],
    limit: int = 10
) -> List[Dict]:
    # SQL ensures group isolation
    query = """
        SELECT * FROM group_paper_vectors
        WHERE group_id = $1  -- Cannot access other groups
        ORDER BY embedding <=> $2
        LIMIT $3
    """
```

### Membership Verification

All endpoints verify group membership before allowing access:

```typescript
// Verify user is a member of the group
const [membership] = await db
  .select()
  .from(groupMembers)
  .where(and(
    eq(groupMembers.groupId, groupId),
    eq(groupMembers.userId, userId)
  ))
  .limit(1);

if (!membership) {
  throw createError('Group not found or access denied', 404);
}
```

## Performance Considerations

### HNSW Index

We use HNSW (Hierarchical Navigable Small World) index for approximate nearest neighbor search:

- **ef_construction**: 128 (build quality)
- **m**: 16 (connections per layer)
- **ef_search**: 64 (query quality)

These settings provide:
- Query time: ~1-5ms for 1M vectors
- Recall: >95% accuracy
- Index size: ~10x vector size

### Batch Operations

When adding multiple papers:

```python
# Batch embedding for efficiency
embeddings = await embedding_service.generate_embeddings(
    [paper1_abstract, paper2_abstract, paper3_abstract]
)

# Batch insert
await db.execute(batch_insert_query)
```

## Configuration

### Environment Variables

```env
# AI Service
GROQ_API_KEY=your-groq-api-key
DATABASE_URL=postgresql://user:pass@host:5432/db

# Embedding dimensions (SPECTER2 local model)
EMBEDDING_DIMENSIONS=768

# Search settings
MAX_CONTEXT_RESULTS=10
SIMILARITY_THRESHOLD=0.7
```

### Vector Store Settings

```python
# In vector_store.py
VECTOR_DIMENSIONS = 768
DEFAULT_LIMIT = 10
MIN_SIMILARITY = 0.5  # Minimum similarity to include in results
```

## Testing Group Isolation

```python
def test_group_isolation():
    # Create vectors in different groups
    await store_vector(group_id="A", content="Secret A data")
    await store_vector(group_id="B", content="Secret B data")
    
    # Search in group A
    results = await search(group_id="A", query="secret data")
    
    # Should only find group A data
    assert all(r.group_id == "A" for r in results)
    assert not any("B data" in r.content for r in results)
```

## Troubleshooting

### Vector Not Found

If similar content isn't being found:

1. Check if paper was properly embedded
2. Verify group_id matches
3. Lower similarity threshold
4. Check if HNSW index is built

### Slow Queries

If queries are slow:

1. Ensure HNSW index exists
2. Check index parameters
3. Consider partitioning by group_id for very large datasets

### Missing Context

If AI responses lack context:

1. Verify papers are added to the group
2. Check embedding generation logs
3. Increase `max_context_results`
