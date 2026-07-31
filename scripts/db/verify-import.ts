import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { eq, and } from "drizzle-orm";
import { db, sql } from "../../src/lib/db";
import { mediaAssets, questionCatalogVersions, questionMedia, questions, topics } from "../../src/lib/db/schema";
import { OFFICIAL_SOURCES } from "../data/sources";

/**
 * Post-import verification: reconciles three levels
 * 1. source PDF (via processed output + manifest)
 * 2. processed output (data/processed/<catalogId>)
 * 3. PostgreSQL
 * plus deterministic random spot checks (fixed seed) on >= 30 questions.
 * Report: data/reports/import-verification-<catalogId>.json
 */

const ROOT = process.cwd();
const CATALOG_ID = process.argv[2] ?? "ab-2025-04-23";
const SOURCE_ID = "pda-2025-ab-it";
const LICENSE_CATEGORY = "AB";
const VERSION_CODE = "2025-04-23";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const src = OFFICIAL_SOURCES.find((s) => s.id === SOURCE_ID)!;
  const pDir = join(ROOT, "data", "processed", CATALOG_ID);
  if (!existsSync(join(pDir, "questions.jsonl"))) {
    throw new Error(`processed output mancante: ${pDir}`);
  }

  // --- level 2: processed ---
  const lines = (await readFile(join(pDir, "questions.jsonl"), "utf-8")).split("\n").filter(Boolean);
  const pq = lines.map((l) => JSON.parse(l));
  const pg = JSON.parse(await readFile(join(pDir, "groups.json"), "utf-8"));
  const pt = JSON.parse(await readFile(join(pDir, "topics.json"), "utf-8"));
  const pm = JSON.parse(await readFile(join(pDir, "media.json"), "utf-8"));
  const manifest = JSON.parse(await readFile(join(ROOT, "data", "manifests", `${SOURCE_ID}.json`), "utf-8"));

  // --- level 3: DB ---
  const catalog = (
    await db
      .select()
      .from(questionCatalogVersions)
      .where(and(eq(questionCatalogVersions.licenseCategory, LICENSE_CATEGORY), eq(questionCatalogVersions.versionCode, VERSION_CODE)))
      .limit(1)
  )[0];
  if (!catalog) throw new Error("catalogo non presente nel DB: eseguire prima l'import");

  const dbTopics = await db.select().from(topics);
  const dbQuestions = await db
    .select({
      officialQuestionCode: questions.officialQuestionCode,
      officialGroupCode: questions.officialGroupCode,
      statement: questions.statement,
      correctAnswer: questions.correctAnswer,
      imageReference: questions.imageReference,
      contentHash: questions.contentHash,
      topicId: questions.topicId,
    })
    .from(questions)
    .where(eq(questions.catalogVersionId, catalog.id));
  const dbMedia = await db.select().from(mediaAssets).where(eq(mediaAssets.catalogVersionId, catalog.id));
  const dbQM = await db.select().from(questionMedia);
  const dbGroupCodes = new Set(dbQuestions.map((q) => q.officialGroupCode));

  const dbByCode = new Map(dbQuestions.map((q) => [q.officialQuestionCode, q]));
  const dbTopicById = new Map(dbTopics.map((t) => [t.id, t]));

  const dbTrue = dbQuestions.filter((q) => q.correctAnswer).length;
  const dbWithImg = dbQuestions.filter((q) => q.imageReference).length;

  const statusCounts = {
    extracted: dbMedia.filter((m) => m.verificationStatus === "extracted").length,
    structurally_verified: dbMedia.filter((m) => m.verificationStatus === "structurally_verified").length,
    visually_verified: dbMedia.filter((m) => m.verificationStatus === "visually_verified").length,
    ambiguous: dbMedia.filter((m) => m.verificationStatus === "ambiguous").length,
    missing: dbMedia.filter((m) => m.verificationStatus === "missing").length,
    rejected: dbMedia.filter((m) => m.verificationStatus === "rejected").length,
  };

  // --- reconciliation ---
  const reconciliation = {
    catalogs: {
      processed: 1,
      db: 1,
      ok: true,
    },
    groups: {
      processed: pg.length,
      db: dbGroupCodes.size,
      ok: pg.length === dbGroupCodes.size,
    },
    topics: {
      processed: pt.length,
      db: dbTopics.length,
      ok: pt.length === dbTopics.length,
    },
    questions: {
      processed: pq.length,
      db: dbQuestions.length,
      ok: pq.length === dbQuestions.length,
    },
    vero: {
      processed: pq.filter((q) => q.correctAnswer).length,
      db: dbTrue,
      ok: pq.filter((q) => q.correctAnswer).length === dbTrue,
    },
    falso: {
      processed: pq.filter((q) => !q.correctAnswer).length,
      db: dbQuestions.length - dbTrue,
      ok: pq.filter((q) => !q.correctAnswer).length === dbQuestions.length - dbTrue,
    },
    withImage: {
      processed: pq.filter((q) => q.imageRef).length,
      db: dbWithImg,
      ok: pq.filter((q) => q.imageRef).length === dbWithImg,
    },
    withoutImage: {
      processed: pq.filter((q) => !q.imageRef).length,
      db: dbQuestions.length - dbWithImg,
      ok: pq.filter((q) => !q.imageRef).length === dbQuestions.length - dbWithImg,
    },
    uniqueMedia: {
      processed: pm.length,
      db: dbMedia.length,
      ok: pm.length === dbMedia.length,
    },
    questionMediaRelations: {
      db: dbQM.length,
      expected: pq.filter((q) => q.imageRef).length,
      ok: dbQM.length === pq.filter((q) => q.imageRef).length,
    },
    mediaStatus: statusCounts,
    officialDuplicates: {
      processed: pq.length - new Set(pq.map((q) => q.questionNumber)).size,
      db: dbQuestions.length - new Set(dbQuestions.map((q) => q.officialQuestionCode)).size,
    },
    rejectedRecords: 0,
  };

  // --- deterministic random spot checks (>= 30) ---
  const rnd = mulberry32(20250423);
  const sample = [...pq].sort(() => rnd() - 0.5).slice(0, 30);
  const spotChecks = sample.map((q) => {
    const dbq = dbByCode.get(q.questionNumber);
    const topic = dbq?.topicId ? dbTopicById.get(dbq.topicId) : undefined;
    return {
      code: q.questionNumber,
      match: {
        code: dbq?.officialQuestionCode === q.questionNumber,
        statement: dbq?.statement === q.statement,
        answer: dbq?.correctAnswer === q.correctAnswer,
        group: dbq?.officialGroupCode === q.groupCode,
        topic: topic?.name === q.topic,
        image: dbq?.imageReference === q.imageRef,
        hash: dbq?.contentHash === q.contentHash,
      },
      dbStatement: dbq?.statement,
      expectedStatement: q.statement,
    };
  });

  const spotOk = spotChecks.filter((s) => Object.values(s.match).every(Boolean)).length;

  const report = {
    catalogId: CATALOG_ID,
    executedAt: new Date().toISOString(),
    sourcePdf: { filename: src.localFilename, sha256: manifest.sha256 as string },
    reconciliation,
    spotChecks: { total: spotChecks.length, ok: spotOk, failed: spotChecks.length - spotOk },
    spotMismatches: spotChecks.filter((s) => !Object.values(s.match).every(Boolean)).slice(0, 10),
    catalogStatus: catalog.status,
    catalogNotProductionReady: catalog.status !== "ready_for_production",
    passed:
      Object.values(reconciliation).every((r) => (r && typeof r === "object" && "ok" in r ? r.ok : true)) &&
      spotOk === spotChecks.length,
  };

  const reportDir = join(ROOT, "data", "reports");
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `import-verification-${CATALOG_ID}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n=== POST-IMPORT VERIFICATION ===");
  console.log("catalog status:", catalog.status);
  console.log("reconciliation:", JSON.stringify(reconciliation, null, 1));
  console.log(`spot checks: ${spotOk}/${spotChecks.length}`);
  console.log("RESULT:", report.passed ? "PASS" : "FAIL");
  console.log("Report:", reportPath);

  await sql.end();
  if (!report.passed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
