-- Migration: Add HNSW index for fast approximate nearest neighbor search
-- Without this index, pgvector does a sequential scan for every similarity query

-- HNSW index on embedding column for cosine distance (<=>)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_vectors_hnsw
  ON group_paper_vectors
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- B-tree index on group_id for fast filtering (every query filters by group)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_vectors_group_id
  ON group_paper_vectors (group_id);

-- B-tree index on content_type for filtered searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_vectors_content_type
  ON group_paper_vectors (content_type);
