CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_version_id" uuid,
	"official_reference" text NOT NULL,
	"original_filename" text,
	"local_path" text,
	"mime_type" text,
	"width" integer,
	"height" integer,
	"sha256" text,
	"source_file_id" uuid,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_catalog_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_category" text NOT NULL,
	"official_name" text NOT NULL,
	"version_code" text,
	"published_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"source_file_id" uuid,
	"status" text DEFAULT 'discovered' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_media" (
	"question_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"relation_type" text DEFAULT 'primary' NOT NULL,
	"confidence" numeric(3, 2),
	"verified_manually" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_media_question_id_media_asset_id_pk" PRIMARY KEY("question_id","media_asset_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"official_group_code" text,
	"official_question_code" text,
	"statement" text NOT NULL,
	"correct_answer" boolean NOT NULL,
	"image_reference" text,
	"topic_id" uuid,
	"status" text DEFAULT 'parsed' NOT NULL,
	"source_line_start" integer,
	"source_line_end" integer,
	"content_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text NOT NULL,
	"original_filename" text NOT NULL,
	"local_path" text NOT NULL,
	"mime_type" text,
	"sha256" text NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"source_version" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_catalog_version_id_question_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."question_catalog_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_file_id_source_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_catalog_versions" ADD CONSTRAINT "question_catalog_versions_source_file_id_source_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_catalog_version_id_question_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."question_catalog_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_id_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_ref_unique" ON "media_assets" USING btree ("catalog_version_id","official_reference");--> statement-breakpoint
CREATE INDEX "media_assets_status_idx" ON "media_assets" USING btree ("verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_versions_category_code_unique" ON "question_catalog_versions" USING btree ("license_category","version_code");--> statement-breakpoint
CREATE INDEX "question_media_media_idx" ON "question_media" USING btree ("media_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_catalog_hash_unique" ON "questions" USING btree ("catalog_version_id","content_hash");--> statement-breakpoint
CREATE INDEX "questions_catalog_idx" ON "questions" USING btree ("catalog_version_id");--> statement-breakpoint
CREATE INDEX "questions_topic_idx" ON "questions" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_files_sha256_unique" ON "source_files" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_code_unique" ON "topics" USING btree ("code");