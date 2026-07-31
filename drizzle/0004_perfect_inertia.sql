CREATE TABLE "exam_session_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"selected_answer" boolean,
	"answered_at" timestamp with time zone,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"mode" text DEFAULT 'simulation' NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"total_questions" integer NOT NULL,
	"allowed_errors" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"correct_count" integer,
	"error_count" integer,
	"unanswered_count" integer,
	"passed" boolean,
	"selection_seed" integer NOT NULL,
	"result_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_session_questions" ADD CONSTRAINT "exam_session_questions_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_session_questions" ADD CONSTRAINT "exam_session_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_catalog_version_id_question_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."question_catalog_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_session_questions_session_position_unique" ON "exam_session_questions" USING btree ("session_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_session_questions_session_question_unique" ON "exam_session_questions" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "exam_session_questions_session_idx" ON "exam_session_questions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_status_idx" ON "exam_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exam_sessions_catalog_idx" ON "exam_sessions" USING btree ("catalog_version_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_expires_idx" ON "exam_sessions" USING btree ("expires_at");