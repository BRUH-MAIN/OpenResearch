-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Group Papers table - papers assigned to specific groups
CREATE TABLE IF NOT EXISTS "group_papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"paper_id" uuid NOT NULL,
	"added_by" uuid NOT NULL,
	"full_text" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_papers_unique" UNIQUE("group_id", "paper_id")
);

-- Group Paper Vectors table - vector embeddings for group-isolated RAG
CREATE TABLE IF NOT EXISTS "group_paper_vectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"paper_id" text NOT NULL,
	"content_type" varchar(50) NOT NULL DEFAULT 'paper',
	"content_id" text,
	"chunk_index" integer DEFAULT 0,
	"content" text,
	"embedding" vector(768),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Group Memory Notes table - decisions, facts, internal guidelines
CREATE TABLE IF NOT EXISTS "group_memory_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid,
	"content" text NOT NULL,
	"note_type" varchar(50) NOT NULL DEFAULT 'note',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- AI Artifacts table - stores AI-generated content
CREATE TABLE IF NOT EXISTS "ai_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"session_id" uuid,
	"paper_id" uuid,
	"user_id" uuid,
	"artifact_type" varchar(50) NOT NULL,
	"prompt" text,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Group Reports table - generated report metadata
CREATE TABLE IF NOT EXISTS "group_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"generated_by" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer,
	"include_sessions" boolean DEFAULT true,
	"include_papers" boolean DEFAULT true,
	"include_summaries" boolean DEFAULT true,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for group isolation (CRITICAL for security)
CREATE INDEX IF NOT EXISTS "group_papers_group_idx" ON "group_papers" ("group_id");
CREATE INDEX IF NOT EXISTS "group_papers_paper_idx" ON "group_papers" ("paper_id");

CREATE INDEX IF NOT EXISTS "group_vec_group_idx" ON "group_paper_vectors" ("group_id");
CREATE INDEX IF NOT EXISTS "group_vec_paper_idx" ON "group_paper_vectors" ("paper_id");
CREATE INDEX IF NOT EXISTS "group_vec_type_idx" ON "group_paper_vectors" ("content_type");
-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS "group_vec_hnsw_idx" ON "group_paper_vectors" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "group_memory_group_idx" ON "group_memory_notes" ("group_id");
CREATE INDEX IF NOT EXISTS "group_memory_type_idx" ON "group_memory_notes" ("note_type");

CREATE INDEX IF NOT EXISTS "ai_artifacts_group_idx" ON "ai_artifacts" ("group_id");
CREATE INDEX IF NOT EXISTS "ai_artifacts_session_idx" ON "ai_artifacts" ("session_id");
CREATE INDEX IF NOT EXISTS "ai_artifacts_paper_idx" ON "ai_artifacts" ("paper_id");
CREATE INDEX IF NOT EXISTS "ai_artifacts_type_idx" ON "ai_artifacts" ("artifact_type");

CREATE INDEX IF NOT EXISTS "group_reports_group_idx" ON "group_reports" ("group_id");

-- Foreign key constraints
ALTER TABLE "group_papers" ADD CONSTRAINT "group_papers_group_fk" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;
ALTER TABLE "group_papers" ADD CONSTRAINT "group_papers_paper_fk" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "group_papers" ADD CONSTRAINT "group_papers_user_fk" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "group_memory_notes" ADD CONSTRAINT "group_memory_group_fk" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;
ALTER TABLE "group_memory_notes" ADD CONSTRAINT "group_memory_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_group_fk" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_session_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL;
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_paper_fk" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL;
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "group_reports" ADD CONSTRAINT "group_reports_group_fk" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;
ALTER TABLE "group_reports" ADD CONSTRAINT "group_reports_user_fk" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE SET NULL;
