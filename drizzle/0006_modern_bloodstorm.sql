ALTER TABLE "exam_session_questions" ADD COLUMN "answer_verified" boolean;--> statement-breakpoint
ALTER TABLE "exam_session_questions" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "source_session_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "feedback_mode" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "requested_question_count" integer;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "practice_status" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_source_session_id_exam_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_sessions_topic_idx" ON "exam_sessions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_mode_idx" ON "exam_sessions" USING btree ("mode");