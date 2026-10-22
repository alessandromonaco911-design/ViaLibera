import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, sql } from "../../src/lib/db";
import {
  mediaAssets,
  questionCatalogVersions,
  questionMedia,
  questions,
  sourceFiles,
  topics,
} from "../../src/lib/db/schema";
import { questionSchema, mediaSchema, groupSchema, topicSchema, type ParsedQuestionInput, type MediaAssetInput } from "../data/lib/validation";
import { OFFICIAL_SOURCES } from "../data/sources";
import { catalogInput } from "./catalog-input";

/**
 * Transactional importer for the official catalog.
 *
 * Usage:
 *   tsx scripts/db/import-catalog.ts --dry-run [catalogId]
 *   tsx scripts/db/import-catalog.ts --apply   [catalogId]
 *
 * Behaviors:
 * - dry-run: full read + validation + planned counts, NO database writes
 * - apply: single transaction, full rollback on error, idempotent upserts by
 *   natural keys, no silent deletions
 * - same source hash already imported: unchanged mode (integrity verified)
 * - different source hash: explicit abort (new version required)
 */

const ROOT = process.cwd();
const DEFAULT_CATALOG_ID = "ab-2025-04-23";
const DEFAULT_SOURCE_ID = "pda-2025-ab-it";

export interface ImportOptions {
  mode: "dry-run" | "apply";
  catalogId: string;
  licenseCategory?: string;
  versionCode?: string;
  processedDir?: string;
  mediaDir?: string;
  /** manifest path; null skips source-hash verification (test mode) */
  manifestPath?: string | null;
  /** pdf path; null skips pdf existence check (test mode) */
  pdfPath?: string | null;
  /** Register a verified manifest inside the import transaction, never during dry-run. */
  registerSource?: boolean;
}

export interface ImportResult {
  mode: string;
  catalogId: string;
  counts: Record<string, number>;
  operations: Record<string, number>;
  fkChecks: string[];
  rejected: { line: number; reason: string }[];
  unchangedMode: boolean;
  ok: boolean;
  error?: string;
}

export async function importCatalog(opts: ImportOptions): Promise<ImportResult> {
  const catalogId = opts.catalogId;
  const licenseCategory = opts.licenseCategory ?? "AB";
  const versionCode = opts.versionCode ?? "2025-04-23";
  const src = OFFICIAL_SOURCES.find((s) => s.id === DEFAULT_SOURCE_ID)!;

  const manifestPath = opts.manifestPath ?? join(ROOT, "data", "manifests", `${DEFAULT_SOURCE_ID}.json`);
  const manifest =
    manifestPath && existsSync(manifestPath)
      ? (JSON.parse(await readFile(manifestPath, "utf-8")) as { sha256: string; url: string; title: string; publishedAt: string | null; filename: string })
      : null;
  if (opts.registerSource && !manifest) throw new Error(`manifest sorgente mancante: ${manifestPath}`);

  // --- 1. source file verification ---
  const pdfPath = opts.pdfPath ?? join(ROOT, "data", "official", src.localFilename);
  if (!existsSync(pdfPath)) {
    throw new Error(`sorgente mancante: ${pdfPath}. Eseguire npm run data:download && npm run data:audit`);
  }
  if (manifest) {
    const pdfHash = createHash("sha256").update(await readFile(pdfPath)).digest("hex");
    if (pdfHash !== manifest.sha256) {
      throw new Error(
        `hash incoerente: sorgente su disco (${pdfHash.slice(0, 16)}…) != manifest (${manifest.sha256.slice(0, 16)}…)`,
      );
    }
  }

  // --- 2. processed data loading + validation ---
  const pDir = opts.processedDir ?? join(ROOT, "data", "processed", catalogId);
  if (!existsSync(join(pDir, "questions.jsonl"))) {
    throw new Error(`output processato mancante: ${pDir}. Eseguire npm run data:parse`);
  }
  const rawQuestions = (await readFile(join(pDir, "questions.jsonl"), "utf-8")).split("\n").filter(Boolean);
  const questionsParsed: ParsedQuestionInput[] = [];
  const rejected: { line: number; reason: string }[] = [];
  rawQuestions.forEach((line, i) => {
    const res = questionSchema.safeParse(JSON.parse(line));
    if (res.success) questionsParsed.push(res.data);
    else rejected.push({ line: i + 1, reason: res.error.issues.map((x) => x.path.join(".")).join(",") });
  });
  const groups = JSON.parse(await readFile(join(pDir, "groups.json"), "utf-8"));
  const topicsOut = JSON.parse(await readFile(join(pDir, "topics.json"), "utf-8"));
  const mediaOut = JSON.parse(await readFile(join(pDir, "media.json"), "utf-8")) as MediaAssetInput[];
  for (const g of groups) groupSchema.parse(g);
  for (const t of topicsOut) topicSchema.parse(t);
  for (const m of mediaOut) mediaSchema.parse(m);

  // media files on disk
  const mediaDir = opts.mediaDir ?? join(ROOT, "data", "media", catalogId);
  const mediaFiles = existsSync(mediaDir) ? await readdir(mediaDir) : [];
  const missingFiles: string[] = [];
  for (const m of mediaOut) {
    const filename = `${m.hash}.${m.ext}`;
    if (!mediaFiles.includes(filename)) missingFiles.push(m.hash.slice(0, 12));
    else if (createHash("sha256").update(await readFile(join(mediaDir, filename))).digest("hex") !== m.hash) {
      throw new Error(`hash media incoerente: ${filename}`);
    }
  }

  // --- 3. DB state ---
  const srcFileRows = manifest
    ? await db.select({ id: sourceFiles.id }).from(sourceFiles).where(eq(sourceFiles.sha256, manifest.sha256)).limit(1)
    : [];
  let srcFile = srcFileRows[0] ?? null;
  const catalogRows = await db
    .select()
    .from(questionCatalogVersions)
    .where(and(eq(questionCatalogVersions.licenseCategory, licenseCategory), eq(questionCatalogVersions.versionCode, versionCode)))
    .limit(1);
  const catalog = catalogRows[0] ?? null;

  let catalogSourceSha: string | null = null;
  if (catalog?.sourceFileId) {
    const sfRows = await db.select({ sha256: sourceFiles.sha256 }).from(sourceFiles).where(eq(sourceFiles.id, catalog.sourceFileId)).limit(1);
    catalogSourceSha = sfRows[0]?.sha256 ?? null;
  }
  if (catalog && catalogSourceSha && manifest && catalogSourceSha !== manifest.sha256) {
    throw new Error(
      `catalogo ${licenseCategory}/${versionCode} già importato da source hash diverso (${catalogSourceSha.slice(0, 16)}…). Trattare come nuova versione.`,
    );
  }

  const nameToCode = new Map<string, string>();
  for (const t of topicsOut) nameToCode.set(t.name, t.code);

  const vero = questionsParsed.filter((q) => q.correctAnswer).length;
  const withImage = questionsParsed.filter((q) => q.imageRef).length;
  const counts: Record<string, number> = {
    topics: topicsOut.length,
    groups: groups.length,
    questions: questionsParsed.length,
    vero,
    falso: questionsParsed.length - vero,
    withImage,
    withoutImage: questionsParsed.length - withImage,
    media: mediaOut.length,
    questionMedia: questionsParsed.filter((q) => q.imageRef).length,
    rejectedRecords: rejected.length,
    missingMediaFiles: missingFiles.length,
  };

  // FK / integrity checks
  const fkChecks: string[] = [];
  if (manifest && !srcFile && !opts.registerSource) {
    fkChecks.push(`source_files: nessuna riga con sha256 ${manifest.sha256.slice(0, 16)}… (eseguire npm run data:audit)`);
  }
  const duplicateCodes = questionsParsed.length - new Set(questionsParsed.map((q) => q.questionNumber)).size;
  if (duplicateCodes > 0) fkChecks.push(`officialQuestionCode duplicati: ${duplicateCodes}`);
  for (const q of questionsParsed) {
    if (q.imageRef && !mediaOut.some((m: { hash: string }) => m.hash === q.imageRef)) {
      fkChecks.push(`domanda ${q.questionNumber}: imageRef non presente in media.json`);
      break;
    }
    if (!nameToCode.has(q.topic)) {
      fkChecks.push(`domanda ${q.questionNumber}: topic "${q.topic.slice(0, 40)}" non presente in topics.json`);
      break;
    }
  }

  // --- 4. planned operations ---
  const ops: Record<string, number> = {
    topicsInsert: 0,
    topicsUpdate: 0,
    questionsInsert: 0,
    questionsUnchanged: 0,
    mediaInsert: 0,
    mediaUnchanged: 0,
    questionMediaInsert: 0,
    questionMediaUnchanged: 0,
    fakeTopicsRemoved: 0,
    placeholderCatalogRemoved: 0,
    catalogUpdated: false as unknown as number,
  };

  const unchangedMode = !!catalog && catalog.status === "imported" && catalogSourceSha === manifest?.sha256;

  if (!unchangedMode) {
    for (const t of topicsOut) {
      const existing = (await db.select({ id: topics.id }).from(topics).where(eq(topics.code, t.code)).limit(1))[0];
      if (existing) ops.topicsUpdate++;
      else ops.topicsInsert++;
    }
    if (catalog) {
      const existingCodes = new Set(
        (
          await db
            .select({ officialQuestionCode: questions.officialQuestionCode })
            .from(questions)
            .where(eq(questions.catalogVersionId, catalog.id))
        ).map((r) => r.officialQuestionCode),
      );
      for (const q of questionsParsed) {
        if (existingCodes.has(q.questionNumber)) ops.questionsUnchanged++;
        else ops.questionsInsert++;
      }
      const existingRefs = new Set(
        (
          await db
            .select({ officialReference: mediaAssets.officialReference })
            .from(mediaAssets)
            .where(eq(mediaAssets.catalogVersionId, catalog.id))
        ).map((r) => r.officialReference),
      );
      for (const m of mediaOut) {
        if (existingRefs.has(m.hash)) ops.mediaUnchanged++;
        else ops.mediaInsert++;
      }
    } else {
      ops.questionsInsert = questionsParsed.length;
      ops.mediaInsert = mediaOut.length;
    }
    ops.questionMediaInsert = counts.questionMedia;
    ops.catalogUpdated = 1;
  }

  // fake topics + placeholder catalog cleanup (planned)
  for (const code of ["TEST-1", "TEST-2"]) {
    const fake = (await db.select({ id: topics.id }).from(topics).where(eq(topics.code, code)).limit(1))[0];
    if (fake) {
      const refs = (await db.select({ id: questions.id }).from(questions).where(eq(questions.topicId, fake.id)).limit(1))[0];
      if (!refs) ops.fakeTopicsRemoved++;
    }
  }
  const placeholder = (
    await db
      .select()
      .from(questionCatalogVersions)
      .where(and(eq(questionCatalogVersions.licenseCategory, "B"), eq(questionCatalogVersions.versionCode, "unknown")))
      .limit(1)
  )[0];
  if (placeholder) {
    const refs = (await db.select({ id: questions.id }).from(questions).where(eq(questions.catalogVersionId, placeholder.id)).limit(1))[0];
    if (!refs) ops.placeholderCatalogRemoved++;
  }

  // --- 5. execute ---
  if (opts.mode === "dry-run") {
    return {
      mode: "dry-run",
      catalogId,
      counts,
      operations: ops,
      fkChecks,
      rejected,
      unchangedMode,
      ok: fkChecks.length === 0 && rejected.length === 0 && missingFiles.length === 0,
    };
  }

  if (fkChecks.length > 0 || rejected.length > 0 || missingFiles.length > 0) {
    return {
      mode: "apply",
      catalogId,
      counts,
      operations: ops,
      fkChecks,
      rejected,
      unchangedMode,
      ok: false,
      error: `validazione fallita: ${fkChecks.join("; ")} (nessuna transazione avviata)`,
    };
  }

  // apply: single transaction
  try {
    await db.transaction(async (tx) => {
      if (!srcFile && manifest && opts.registerSource) {
        const inserted = await tx.insert(sourceFiles).values({
          sourceType: "quiz_listing", sourceUrl: manifest.url, originalFilename: manifest.filename,
          localPath: pdfPath, mimeType: "application/pdf", sha256: manifest.sha256,
          publishedAt: manifest.publishedAt ? new Date(manifest.publishedAt) : null,
          metadata: manifest,
        }).onConflictDoNothing({ target: sourceFiles.sha256 }).returning({ id: sourceFiles.id });
        srcFile = inserted[0] ?? (await tx.select({ id: sourceFiles.id }).from(sourceFiles).where(eq(sourceFiles.sha256, manifest.sha256)).limit(1))[0];
      }
      const tIds = new Map<string, string>();
      for (const t of topicsOut) {
        const ins = await tx
          .insert(topics)
          .values({ code: t.code, name: t.name, sortOrder: 0 })
          .onConflictDoUpdate({ target: [topics.code], set: { name: t.name, updatedAt: new Date() } })
          .returning({ id: topics.id });
        tIds.set(t.code, ins[0].id);
      }

      let catalogIdDb: string;
      if (catalog) {
        catalogIdDb = catalog.id;
      } else {
        const ins = await tx
          .insert(questionCatalogVersions)
          .values({
            licenseCategory,
            officialName: manifest?.title ?? `Catalogo di test ${catalogId}`,
            versionCode,
            publishedAt: manifest?.publishedAt ? new Date(manifest.publishedAt) : null,
            status: "importing",
            sourceFileId: srcFile?.id ?? null,
            metadata: { catalogId, sourceUrl: manifest?.url ?? null },
          })
          .onConflictDoNothing({
            target: [questionCatalogVersions.licenseCategory, questionCatalogVersions.versionCode],
          })
          .returning({ id: questionCatalogVersions.id });
        catalogIdDb =
          ins[0]?.id ??
          (
            await tx
              .select({ id: questionCatalogVersions.id })
              .from(questionCatalogVersions)
              .where(and(eq(questionCatalogVersions.licenseCategory, licenseCategory), eq(questionCatalogVersions.versionCode, versionCode)))
              .limit(1)
          )[0]!.id;
      }

      // Bound parameter counts and network round trips for remote PostgreSQL imports.
      const questionRows = questionsParsed.map(q => {
        const topicCode = nameToCode.get(q.topic);
        if (!topicCode) throw new Error(`topic mancante per domanda ${q.questionNumber}: "${q.topic.slice(0, 50)}"`);
        const topicId = tIds.get(topicCode);
        if (!topicId) throw new Error(`topicId non risolto per codice ${topicCode}`);
        return {
            catalogVersionId: catalogIdDb,
            officialGroupCode: q.groupCode,
            officialQuestionCode: q.questionNumber,
            statement: q.statement,
            correctAnswer: q.correctAnswer,
            imageReference: q.imageRef,
            topicId,
            status: "imported",
            sourceLineStart: q.sourceLineStart,
            sourceLineEnd: q.sourceLineEnd,
            contentHash: q.contentHash,
            metadata: {
              page: q.page,
              imageBBox: q.imageBBox,
              rowBand: q.rowBand,
              structuralConfidence: q.structuralConfidence,
            },
          };
      });
      let qInsert = 0;
      for (let offset = 0; offset < questionRows.length; offset += 500) {
        const ins = await tx.insert(questions).values(questionRows.slice(offset, offset + 500))
          .onConflictDoNothing({
            target: [questions.catalogVersionId, questions.officialQuestionCode],
          })
          .returning({ id: questions.id });
        qInsert += ins.length;
      }
      ops.questionsInsert = qInsert;
      ops.questionsUnchanged = questionRows.length - qInsert;

      let mInsert = 0;
      const mediaRows = mediaOut.map(m => ({
            catalogVersionId: catalogIdDb,
            officialReference: m.hash,
            localPath: `data/media/${catalogId}/${m.hash}.${m.ext}`,
            mimeType: m.mime,
            width: m.width,
            height: m.height,
            sha256: m.hash,
            sourceFileId: srcFile?.id ?? null,
            verificationStatus: m.verificationStatus,
            verificationMethod: m.verificationMethod,
            verifiedByType: "automated" as const,
            metadata: { minConfidence: m.minConfidence, pageFirstSeen: m.pageFirstSeen, questionCodes: m.questions },
          }));
      for (let offset = 0; offset < mediaRows.length; offset += 500) {
        const ins = await tx.insert(mediaAssets).values(mediaRows.slice(offset, offset + 500))
          .onConflictDoNothing({ target: [mediaAssets.catalogVersionId, mediaAssets.officialReference] })
          .returning({ id: mediaAssets.id });
        mInsert += ins.length;
      }
      ops.mediaInsert = mInsert;
      ops.mediaUnchanged = mediaRows.length - mInsert;
      const mediaIds = new Map((await tx.select({ id: mediaAssets.id, hash: mediaAssets.officialReference }).from(mediaAssets)
        .where(eq(mediaAssets.catalogVersionId, catalogIdDb))).map(row => [row.hash, row.id]));
      const questionIds = new Map((await tx.select({ id: questions.id, code: questions.officialQuestionCode }).from(questions)
        .where(eq(questions.catalogVersionId, catalogIdDb))).map(row => [row.code, row.id]));

      let qmInsert = 0;
      const relations = questionsParsed.flatMap(q => {
        if (!q.imageRef) return [];
        const questionId = questionIds.get(q.questionNumber);
        const assetId = mediaIds.get(q.imageRef);
        if (!questionId || !assetId) {
          throw new Error(`relation mancante per domanda ${q.questionNumber} (imageRef ${(q.imageRef ?? "").slice(0, 12)})`);
        }
        return [{
            questionId,
            mediaAssetId: assetId,
            relationType: "primary",
            confidence: q.structuralConfidence !== null ? String(q.structuralConfidence) : null,
            verifiedManually: false,
          }];
      });
      for (let offset = 0; offset < relations.length; offset += 500) {
        const ins = await tx.insert(questionMedia).values(relations.slice(offset, offset + 500))
          .onConflictDoNothing({ target: [questionMedia.questionId, questionMedia.mediaAssetId] })
          .returning();
        qmInsert += ins.length;
      }
      ops.questionMediaInsert = qmInsert;
      ops.questionMediaUnchanged = relations.length - qmInsert;

      for (const code of ["TEST-1", "TEST-2"]) {
        const fake = (await tx.select({ id: topics.id }).from(topics).where(eq(topics.code, code)).limit(1))[0];
        if (fake) {
          const refs = (await tx.select({ id: questions.id }).from(questions).where(eq(questions.topicId, fake.id)).limit(1))[0];
          if (!refs) {
            await tx.delete(topics).where(eq(topics.id, fake.id));
            console.log(`[import] rimosso topic fittizio ${code} (non referenziato)`);
          }
        }
      }
      const placeholder2 = (
        await tx
          .select()
          .from(questionCatalogVersions)
          .where(and(eq(questionCatalogVersions.licenseCategory, "B"), eq(questionCatalogVersions.versionCode, "unknown")))
          .limit(1)
      )[0];
      if (placeholder2) {
        const refs = (await tx.select({ id: questions.id }).from(questions).where(eq(questions.catalogVersionId, placeholder2.id)).limit(1))[0];
        if (!refs) {
          await tx.delete(questionCatalogVersions).where(eq(questionCatalogVersions.id, placeholder2.id));
          console.log("[import] rimosso catalogo segnaposto (B/unknown) non referenziato");
          ops.placeholderCatalogRemoved = 1;
        }
      }

      const upd = await tx
        .update(questionCatalogVersions)
        .set({
          status: "imported",
          importedAt: new Date(),
          sourceFileId: srcFile?.id ?? null,
          officialName: manifest?.title ?? `Catalogo di test ${catalogId}`,
          publishedAt: manifest?.publishedAt ? new Date(manifest.publishedAt) : null,
          metadata: { catalogId, sourceUrl: manifest?.url ?? null, note: "importato; revisione visiva e legale non completata" },
          updatedAt: new Date(),
        })
        .where(eq(questionCatalogVersions.id, catalogIdDb))
        .returning({ id: questionCatalogVersions.id });
      if (upd.length) ops.catalogUpdated = 1;
    });
  } catch (err) {
    return {
      mode: "apply",
      catalogId,
      counts,
      operations: ops,
      fkChecks,
      rejected,
      unchangedMode,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    mode: "apply",
    catalogId,
    counts,
    operations: ops,
    fkChecks,
    rejected,
    unchangedMode,
    ok: fkChecks.length === 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--apply") ? "apply" : "dry-run";
  const catalogId = args.find((a) => !a.startsWith("--")) ?? DEFAULT_CATALOG_ID;

  const result = await importCatalog({ mode, ...catalogInput(catalogId) });
  console.log("\n===", result.mode.toUpperCase(), result.ok ? "OK" : "CON ERRORI", "===");
  console.log("counts:", JSON.stringify(result.counts, null, 2));
  console.log("operations:", JSON.stringify(result.operations, null, 2));
  console.log("fkChecks:", result.fkChecks.length ? result.fkChecks : "ok");
  console.log("rejected records:", result.rejected.length);
  if (result.error) console.error("error:", result.error);

  if (result.mode === "apply") {
    const report = {
      catalogId: result.catalogId,
      mode: "apply",
      executedAt: new Date().toISOString(),
      counts: result.counts,
      operations: result.operations,
      fkChecks: result.fkChecks,
      rejected: result.rejected,
      unchangedMode: result.unchangedMode,
      ok: result.ok,
    };
    const reportDir = join(ROOT, "data", "reports");
    if (!existsSync(reportDir)) await import("node:fs/promises").then((m) => m.mkdir(reportDir, { recursive: true }));
    const reportPath = join(reportDir, `import-${result.catalogId}.json`);
    await import("node:fs/promises").then((m) => m.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8"));
    console.log("Metrics:", reportPath);
  }

  await sql.end();
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
