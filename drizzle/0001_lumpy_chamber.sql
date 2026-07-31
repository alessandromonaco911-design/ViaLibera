DROP INDEX "questions_catalog_hash_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "questions_catalog_code_unique" ON "questions" USING btree ("catalog_version_id","official_question_code");