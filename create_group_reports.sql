DROP TABLE IF EXISTS "group_reports" CASCADE;
CREATE TABLE IF NOT EXISTS "group_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"report_type" varchar(50) DEFAULT 'weekly' NOT NULL,
	"status" varchar(50) DEFAULT 'generating' NOT NULL,
	"file_path" text,
	"file_size" integer,
	"include_sessions" boolean DEFAULT true,
	"include_papers" boolean DEFAULT true,
	"include_summaries" boolean DEFAULT true,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "group_reports" DROP CONSTRAINT IF EXISTS "group_reports_group_id_groups_id_fk";
ALTER TABLE "group_reports" ADD CONSTRAINT "group_reports_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "group_reports" DROP CONSTRAINT IF EXISTS "group_reports_created_by_users_id_fk";
ALTER TABLE "group_reports" ADD CONSTRAINT "group_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
