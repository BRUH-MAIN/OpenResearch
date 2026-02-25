-- Migration: Add full-text search support for hybrid search (BM25 + vector)
-- This enables Reciprocal Rank Fusion combining semantic + keyword search

-- Add tsvector column, auto-populated from content
ALTER TABLE "group_paper_vectors"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', COALESCE("content", ''))) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS "group_vec_tsv_idx"
  ON "group_paper_vectors" USING gin ("content_tsv");
