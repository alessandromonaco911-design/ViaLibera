import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { mediaAssets, questionCatalogVersions, questions, topics } from "../src/lib/db/schema";
import { importCatalog } from "../scripts/db/import-catalog";

const ROOT = join(__dirname, "..");
const FIX = join(ROOT, "data", "processed", ".fixture-tests");
const HASH_A = "a".repeat(64);

function makeCatalog(valid: boolean) {
  return {
    topics: [{ code: "9001", name: "Topic di test" }],
    groups: [{ code: "9001", topic: "Topic di test", page: 1, line: 1 }],
    media: [
      {
        hash: HASH_A,
        mime: "image/png",
        ext: "png",
        width: 100,
        height: 100,
        questions: ["10001"],
        verificationStatus: "structurally_verified",
        verificationMethod: "pipeline:auto",
        minConfidence: 0.9,
        pageFirstSeen: 1,
      },
    ],
    questions: [
      {
        page: 1,
        questionNumber: "10001",
        groupCode: "9001",
        topic: valid ? "Topic di test" : "Topic inesistente",
        statement: "Domanda di test VERO",
        correctAnswer: true,
        imageRef: HASH_A,
        imageBBox: { page: 1, x: 465, y: 600, w: 80, h: 80 },
        rowBand: { bottom: 596, top: 682 },
        structuralConfidence: 0.95,
        sourceLineStart: 2,
        sourceLineEnd: 2,
        contentHash: "c".repeat(64),
      },
      {
        page: 1,
        questionNumber: "10002",
        groupCode: "9001",
        topic: "Topic di test",
        statement: "Domanda di test FALSO senza immagine",
        correctAnswer: false,
        imageRef: null,
        imageBBox: null,
        rowBand: null,
        structuralConfidence: null,
        sourceLineStart: 3,
        sourceLineEnd: 3,
        contentHash: "d".repeat(64),
      },
    ],
  };
}

async function writeFixture(cat: ReturnType<typeof makeCatalog>) {
  await rm(FIX, { recursive: true, force: true });
  await mkdir(FIX, { recursive: true });
  await writeFile(join(FIX, "topics.json"), JSON.stringify(cat.topics));
  await writeFile(join(FIX, "groups.json"), JSON.stringify(cat.groups));
  await writeFile(join(FIX, "media.json"), JSON.stringify(cat.media));
  await writeFile(join(FIX, "questions.jsonl"), cat.questions.map((q) => JSON.stringify(q)).join("\n"));
}

async function cleanupTestCatalog() {
  const c = await db
    .select({ id: questionCatalogVersions.id })
    .from(questionCatalogVersions)
    .where(and(eq(questionCatalogVersions.licenseCategory, "ZZ"), eq(questionCatalogVersions.versionCode, "fixture")))
    .limit(1);
  if (c[0]) {
    await db.delete(questions).where(eq(questions.catalogVersionId, c[0].id));
    await db.delete(mediaAssets).where(eq(mediaAssets.catalogVersionId, c[0].id));
    await db.delete(questionCatalogVersions).where(eq(questionCatalogVersions.id, c[0].id));
  }
  // orphan media from previous failed runs (catalog set null)
  await db.delete(mediaAssets).where(eq(mediaAssets.catalogVersionId, null as never));
  const tRows = await db.select({ id: topics.id }).from(topics).where(eq(topics.code, "9001")).limit(1);
  if (tRows[0]) await db.delete(topics).where(eq(topics.id, tRows[0].id));
}

test("19. failure esplicito quando manca il file sorgente", async () => {
  await assert.rejects(
    importCatalog({
      mode: "dry-run",
      catalogId: "zz-missing",
      licenseCategory: "ZZ",
      versionCode: "missing",
      pdfPath: join(FIX, "non-esiste.pdf"),
      manifestPath: null,
    }),
    /sorgente mancante/,
  );
  await assert.rejects(
    importCatalog({
      mode: "dry-run",
      catalogId: "zz-missing",
      licenseCategory: "ZZ",
      versionCode: "missing",
      pdfPath: null,
      manifestPath: null,
      processedDir: join(FIX, "non-esiste"),
    }),
    /output processato mancante/,
  );
});

test("20. transazione annullata in caso di import incompleto", async () => {
  await cleanupTestCatalog();
  try {
    // broken fixture: question references a topic that does not exist
    await writeFixture(makeCatalog(false));
    const res = await importCatalog({
      mode: "apply",
      catalogId: "zz-fixture",
      licenseCategory: "ZZ",
      versionCode: "fixture",
      pdfPath: null,
      manifestPath: null,
      processedDir: FIX,
      mediaDir: FIX,
    });
    assert.equal(res.ok, false, "apply su dati incompleti deve fallire");
    // nothing must have been written
    const cRows = await db
      .select({ id: questionCatalogVersions.id })
      .from(questionCatalogVersions)
      .where(and(eq(questionCatalogVersions.licenseCategory, "ZZ"), eq(questionCatalogVersions.versionCode, "fixture")))
      .limit(1);
    assert.equal(cRows.length, 0, "il catalogo non deve esistere dopo il rollback");

    // valid fixture: apply must succeed and be idempotent
    await writeFixture(makeCatalog(true));
    const ok1 = await importCatalog({
      mode: "apply",
      catalogId: "zz-fixture",
      licenseCategory: "ZZ",
      versionCode: "fixture",
      pdfPath: null,
      manifestPath: null,
      processedDir: FIX,
      mediaDir: FIX,
    });
    assert.equal(ok1.ok, true);
    const c2Rows = await db
      .select({ id: questionCatalogVersions.id, status: questionCatalogVersions.status })
      .from(questionCatalogVersions)
      .where(and(eq(questionCatalogVersions.licenseCategory, "ZZ"), eq(questionCatalogVersions.versionCode, "fixture")))
      .limit(1);
    const c2 = c2Rows[0];
    assert.ok(c2, "il catalogo deve esistere dopo l'apply");
    assert.equal(c2!.status, "imported");
    const qCount = await db
      .select({ c: dsql<number>`count(*)` })
      .from(questions)
      .where(eq(questions.catalogVersionId, c2!.id));
    assert.equal(Number(qCount[0].c), 2);

    // second apply: idempotent, no duplication
    const ok2 = await importCatalog({
      mode: "apply",
      catalogId: "zz-fixture",
      licenseCategory: "ZZ",
      versionCode: "fixture",
      pdfPath: null,
      manifestPath: null,
      processedDir: FIX,
      mediaDir: FIX,
    });
    assert.equal(ok2.ok, true);
    assert.equal(ok2.operations.questionsInsert, 0, "secondo apply non deve inserire domande");
    const qCount2 = await db
      .select({ c: dsql<number>`count(*)` })
      .from(questions)
      .where(eq(questions.catalogVersionId, c2!.id));
    assert.equal(Number(qCount2[0].c), 2);
  } finally {
    await cleanupTestCatalog();
    await rm(FIX, { recursive: true, force: true });
    await (db.$client as { end: () => Promise<void> }).end();
  }
});
