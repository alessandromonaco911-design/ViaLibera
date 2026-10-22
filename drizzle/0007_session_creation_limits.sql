CREATE TABLE "session_creation_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_creation_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE INDEX "session_creation_limits_expires_idx" ON "session_creation_limits" USING btree ("expires_at");