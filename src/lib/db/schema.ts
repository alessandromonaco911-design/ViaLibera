import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Preliminary schema scoped to data sourcing and import pipeline only.
 * No users, sessions, stats, or quiz engine tables in this phase.
 */

/** 1. Files downloaded from official sources (MIT / Portale dell'Automobilista). */
export const sourceFiles = pgTable(
  "source_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: text("source_type").notNull(), // quiz_listing | circular | image_archive | other
    sourceUrl: text("source_url").notNull(),
    originalFilename: text("original_filename").notNull(),
    localPath: text("local_path").notNull(),
    mimeType: text("mime_type"),
    sha256: text("sha256").notNull(),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    sourceVersion: text("source_version"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("source_files_sha256_unique").on(t.sha256)],
);

/** 2. Catalog versions: one row per official question bank release (e.g. patente B). */
export const questionCatalogVersions = pgTable(
  "question_catalog_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseCategory: text("license_category").notNull(), // e.g. 'B'
    officialName: text("official_name").notNull(),
    versionCode: text("version_code"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    sourceFileId: uuid("source_file_id").references(() => sourceFiles.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("discovered"), // discovered|parsed|validated|imported|failed
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("catalog_versions_category_code_unique").on(t.licenseCategory, t.versionCode)],
);

/** 3. Topics / arguments (e.g. "Segnali di pericolo"). */
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => topics.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("topics_code_unique").on(t.code)],
);

/** 4. Questions (quiz statements). */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogVersionId: uuid("catalog_version_id")
      .notNull()
      .references(() => questionCatalogVersions.id, { onDelete: "cascade" }),
    officialGroupCode: text("official_group_code"),
    officialQuestionCode: text("official_question_code"),
    statement: text("statement").notNull(),
    correctAnswer: boolean("correct_answer").notNull(),
    imageReference: text("image_reference"),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    status: text("status").notNull().default("parsed"), // parsed|validated|imported|rejected
    sourceLineStart: integer("source_line_start"),
    sourceLineEnd: integer("source_line_end"),
    contentHash: text("content_hash").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("questions_catalog_code_unique").on(t.catalogVersionId, t.officialQuestionCode),
    index("questions_catalog_idx").on(t.catalogVersionId),
    index("questions_topic_idx").on(t.topicId),
  ],
);

/** 5. Media assets (official images referenced by questions). */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogVersionId: uuid("catalog_version_id").references(() => questionCatalogVersions.id, {
      onDelete: "set null",
    }),
    officialReference: text("official_reference").notNull(),
    originalFilename: text("original_filename"),
    localPath: text("local_path"),
    mimeType: text("mime_type"),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256"),
    sourceFileId: uuid("source_file_id").references(() => sourceFiles.id, { onDelete: "set null" }),
    verificationStatus: text("verification_status").notNull().default("unverified"), // found_verified|found_unverified|missing|ambiguous|unverified
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("media_assets_ref_unique").on(t.catalogVersionId, t.officialReference),
    index("media_assets_status_idx").on(t.verificationStatus),
  ],
);

/** 6. Join table question <-> media. */
export const questionMedia = pgTable(
  "question_media",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull().default("primary"), // primary|alternative|decoy
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    verifiedManually: boolean("verified_manually").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.mediaAssetId] }),
    index("question_media_media_idx").on(t.mediaAssetId),
  ],
);

export type SourceFile = typeof sourceFiles.$inferSelect;
export type QuestionCatalogVersion = typeof questionCatalogVersions.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type QuestionMedia = typeof questionMedia.$inferSelect;
