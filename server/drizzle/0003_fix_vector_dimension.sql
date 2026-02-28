-- Migration: Fix vector dimension from 1536 to 768
-- SPECTER2 embedding model produces 768-dimensional vectors, not 1536
-- The original schema incorrectly assumed OpenAI-style 1536-dim embeddings

ALTER TABLE "group_paper_vectors"
  ALTER COLUMN "embedding" TYPE vector(768);
