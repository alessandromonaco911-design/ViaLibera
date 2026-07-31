import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ParsedQuestion, VerificationStatus } from "../scripts/data/lib/types";

/**
 * Invariants over the REAL processed catalog (ab-2025-04-23).
 * Tests skip gracefully if the processed data has not been generated yet.
 */

const ROOT = join(__dirname, "..");
const CATALOG = "ab-2025-04-23";
const P_DIR = join(ROOT, "data", "processed", CATALOG);
const M_DIR = join(ROOT, "data", "media", CATALOG);
const CACHE = join(ROOT, "data", "processed", ".cache", CATALOG);

let data:
  | {
      questions: ParsedQuestion[];
      groups: { code: string; topic: string }[];
      topics: { code: string; name: string }[];
      media: { hash: string; verificationStatus: VerificationStatus; questions: string[] }[];
      mediaFiles: string[];
      positions: { pageDims: { page: number; width: number; height: number }[] } | null;
    }
  | null = null;

async function load() {
  if (data) return data;
  if (!existsSync(join(P_DIR, "questions.jsonl"))) return null;
  const lines = (await readFile(join(P_DIR, "questions.jsonl"), "utf-8")).split("\n").filter(Boolean);
  const questions = lines.map((l) => JSON.parse(l) as ParsedQuestion);
  const groups = JSON.parse(await readFile(join(P_DIR, "groups.json"), "utf-8"));
  const topics = JSON.parse(await readFile(join(P_DIR, "topics.json"), "utf-8"));
  const media = JSON.parse(await readFile(join(P_DIR, "media.json"), "utf-8"));
  const mediaFiles = existsSync(M_DIR) ? await readdir(M_DIR) : [];
  let positions: { pageDims: { page: number; width: number; height: number }[] } | null = null;
  try {
    positions = JSON.parse(await readFile(join(CACHE, "positions.json"), "utf-8"));
  } catch {
    positions = null;
  }
  data = { questions, groups, topics, media, mediaFiles, positions };
  return data;
}

test("invariants sui dati reali (skip se non generati)", async (t) => {
  const d = await load();
  if (!d) {
    t.skip("processed data not found; run npm run data:parse first");
    return;
  }

  const { questions, groups, topics, media, mediaFiles, positions } = d;
  const mediaHashes = new Set(media.map((m) => m.hash));
  const mediaFileHashes = new Set(mediaFiles.map((f) => f.replace(/\.[a-z0-9]+$/, "")));
  const groupCodes = new Set(groups.map((g) => g.code));
  const topicNames = new Set(topics.map((tp) => tp.name));
  const pageDims = new Map((positions?.pageDims ?? []).map((pd) => [pd.page, pd]));

  // ogni domanda possiede un codice ufficiale non vuoto
  for (const q of questions) {
    assert.ok(q.questionNumber.trim().length > 0, `empty code for ${q.statement.slice(0, 30)}`);
  }

  // ogni risposta è boolean
  for (const q of questions) assert.equal(typeof q.correctAnswer, "boolean");

  // ogni domanda con relazione media punta a un asset esistente
  for (const q of questions) {
    if (q.imageRef) assert.ok(mediaHashes.has(q.imageRef), `missing asset for question ${q.questionNumber}`);
    if (q.imageBBox && positions) {
      const dim = pageDims.get(q.imageBBox.page);
      assert.ok(dim, `page dims missing for page ${q.imageBBox.page}`);
      assert.ok(
        q.imageBBox.x >= -2 && q.imageBBox.y >= -2,
        `bbox out of page (low) for ${q.questionNumber}`,
      );
      assert.ok(
        q.imageBBox.x + q.imageBBox.w <= dim!.width + 2 && q.imageBBox.y + q.imageBBox.h <= dim!.height + 2,
        `bbox out of page (high) for ${q.questionNumber}`,
      );
    }
  }

  // nessun localPath punta a un file inesistente (asset files on disk)
  for (const m of media) {
    assert.ok(mediaFileHashes.has(m.hash), `media file missing for ${m.hash.slice(0, 12)}`);
  }

  // SHA-256 valido e coerente con il file (campionamento deterministico)
  const sample = media.slice(0, 20);
  for (const m of sample) {
    const fname = mediaFiles.find((f) => f.startsWith(m.hash));
    assert.ok(fname, `file not found for ${m.hash.slice(0, 12)}`);
    const buf = await readFile(join(M_DIR, fname));
    const h = createHash("sha256").update(buf).digest("hex");
    assert.equal(h, m.hash, `sha256 mismatch for ${fname}`);
  }

  // ogni topic referenziato esiste
  for (const q of questions) {
    assert.ok(topicNames.has(q.topic), `topic "${q.topic.slice(0, 40)}" (q ${q.questionNumber}) not in topics.json`);
    assert.ok(groupCodes.has(q.groupCode), `group ${q.groupCode} not in groups.json`);
  }

  // nessun codice domanda duplicato entro la chiave naturale (officialQuestionCode globale)
  const seen = new Set<string>();
  for (const q of questions) {
    assert.ok(!seen.has(q.questionNumber), `duplicate officialQuestionCode ${q.questionNumber}`);
    seen.add(q.questionNumber);
  }

  // nessun asset visually_verified senza audit umano
  for (const m of media) {
    assert.notEqual(m.verificationStatus, "visually_verified", `asset ${m.hash.slice(0, 12)} marked visually_verified`);
  }
});

test("chiave naturale: officialQuestionCode è globale e unico (dati reali)", async (t) => {
  const d = await load();
  if (!d) {
    t.skip("processed data not found");
    return;
  }
  const codes = d.questions.map((q) => q.questionNumber);
  assert.equal(new Set(codes).size, codes.length);
  // formato: 5 cifre
  for (const c of codes) assert.match(c, /^\d{5}$/, `unexpected code format: ${c}`);
  // coppia (groupCode, questionNumber) unica
  const pairs = d.questions.map((q) => `${q.groupCode}|${q.questionNumber}`);
  assert.equal(new Set(pairs).size, pairs.length);
});
