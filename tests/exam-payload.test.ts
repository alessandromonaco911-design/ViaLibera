import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicQuestion, buildPublicPayload, mediaUrlFor } from "../src/lib/exam/payload";
import type { DbCandidate } from "../src/lib/exam/generator";

function cand(over: Partial<DbCandidate> = {}): DbCandidate {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    groupCode: "4328",
    imageRef: "a".repeat(64),
    mediaStatus: "structurally_verified",
    statement: "Il segnale raffigurato preavvisa confine di Stato",
    correctAnswer: true,
    officialQuestionCode: "21810",
    topicId: null,
    topicName: "Segnali di indicazione",
    mediaLocalPath: "data/media/ab-2025-04-23/aaa.png",
    mediaMime: "image/png",
    mediaWidth: 200,
    mediaHeight: 200,
    ...over,
  };
}

test("payload: il payload pubblico NON contiene correctAnswer", () => {
  const q = toPublicQuestion(cand(), 1);
  const serialized = JSON.stringify(q);
  assert.ok(!serialized.includes("correctAnswer"));
  assert.ok(!serialized.includes("correct"));
});

test("payload: il payload pubblico NON contiene metadata interni né path filesystem", () => {
  const q = toPublicQuestion(cand(), 1);
  const serialized = JSON.stringify(q);
  assert.ok(!serialized.includes("data/media"));
  assert.ok(!serialized.includes("sourceLine"));
  assert.ok(!serialized.includes("rowBand"));
  assert.ok(!serialized.includes("imageBBox"));
  assert.ok(!serialized.includes("contentHash"));
  assert.ok(!serialized.includes("structuralConfidence"));
  assert.ok(!serialized.includes("verificationStatus"));
});

test("payload: campi pubblici presenti e coerenti", () => {
  const q = toPublicQuestion(cand(), 3);
  assert.equal(q.position, 3);
  assert.equal(q.statement, "Il segnale raffigurato preavvisa confine di Stato");
  assert.equal(q.officialQuestionCode, "21810");
  assert.equal(q.groupCode, "4328");
  assert.equal(q.topic, "Segnali di indicazione");
  assert.equal(q.image?.url, "/api/media/" + "a".repeat(64));
  assert.equal(q.image?.width, 200);
  assert.equal(q.image?.height, 200);
});

test("payload: domanda senza immagine -> image null", () => {
  const q = toPublicQuestion(cand({ imageRef: null, mediaStatus: null, mediaLocalPath: null }), 1);
  assert.equal(q.image, null);
});

test("payload: buildPublicPayload restituisce un payload serializzabile completo", () => {
  const payload = buildPublicPayload({
    sessionId: "22222222-2222-4222-8222-222222222222",
    status: "in_progress",
    seed: 42,
    startedAt: new Date("2026-07-31T10:00:00Z"),
    expiresAt: new Date("2026-07-31T10:20:00Z"),
    questions: [cand(), cand({ id: "33333333-3333-4333-8333-333333333333", imageRef: null, correctAnswer: false })],
  });
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes("correctAnswer"));
  assert.ok(!serialized.includes("aaa.png"));
  const parsed = JSON.parse(serialized) as typeof payload;
  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.totalQuestions, 2);
  assert.equal(parsed.seed, 42);
  assert.ok(parsed.expiresAt > parsed.startedAt);
});

test("payload: mediaUrlFor null-safe", () => {
  assert.equal(mediaUrlFor(null), null);
  assert.equal(mediaUrlFor("ab".repeat(32)), "/api/media/" + "ab".repeat(32));
});
