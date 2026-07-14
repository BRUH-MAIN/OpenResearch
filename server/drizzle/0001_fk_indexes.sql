CREATE INDEX "ai_artifacts_group_id_idx" ON "ai_artifacts" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_invitations_invited_user_id_idx" ON "group_invitations" USING btree ("invited_user_id");--> statement-breakpoint
CREATE INDEX "group_members_user_id_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_papers_group_id_idx" ON "group_papers" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_reports_group_id_idx" ON "group_reports" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "messages_session_id_idx" ON "messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_papers_paper_id_idx" ON "saved_papers" USING btree ("paper_id");--> statement-breakpoint
CREATE INDEX "sessions_group_id_idx" ON "sessions" USING btree ("group_id");