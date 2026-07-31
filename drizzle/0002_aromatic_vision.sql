CREATE TYPE "public"."media_verification_status" AS ENUM('extracted', 'structurally_verified', 'visually_verified', 'ambiguous', 'missing', 'rejected');--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "verification_status" SET DEFAULT 'extracted'::"public"."media_verification_status";--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "verification_status" SET DATA TYPE "public"."media_verification_status" USING "verification_status"::"public"."media_verification_status";--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "verification_method" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "verified_by_type" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "review_note" text;