-- Migration: Add methodology_matrices, claim_lineage_nodes, and claim_lineage_edges tables
-- These support the Methodology Extraction and Claim Lineage features

CREATE TABLE IF NOT EXISTS "methodology_matrices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "sessions"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "query" text NOT NULL,
  "rows" jsonb NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "claim_lineage_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "sessions"("id") ON DELETE SET NULL,
  "node_type" varchar(50) NOT NULL,
  "label" text NOT NULL,
  "content" text,
  "source_url" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "claim_lineage_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "source_node_id" uuid NOT NULL REFERENCES "claim_lineage_nodes"("id") ON DELETE CASCADE,
  "target_node_id" uuid NOT NULL REFERENCES "claim_lineage_nodes"("id") ON DELETE CASCADE,
  "edge_type" varchar(50) NOT NULL,
  "weight" real DEFAULT 1.0,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_methodology_matrices_group" ON "methodology_matrices" ("group_id");
CREATE INDEX IF NOT EXISTS "idx_methodology_matrices_session" ON "methodology_matrices" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_claim_lineage_nodes_group" ON "claim_lineage_nodes" ("group_id");
CREATE INDEX IF NOT EXISTS "idx_claim_lineage_nodes_session" ON "claim_lineage_nodes" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_claim_lineage_edges_group" ON "claim_lineage_edges" ("group_id");
CREATE INDEX IF NOT EXISTS "idx_claim_lineage_edges_source" ON "claim_lineage_edges" ("source_node_id");
CREATE INDEX IF NOT EXISTS "idx_claim_lineage_edges_target" ON "claim_lineage_edges" ("target_node_id");
