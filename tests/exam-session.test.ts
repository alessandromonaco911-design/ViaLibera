import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, sql } from "../src/lib/db";
import { examSessions, examSessionQuestions, mediaAssets, questionCatalogVersions, questions, topics } from "../src/lib/db/schema";
import { siteConfig } from "../src/config/site";
import { selectQuestions, type QuestionCandidate } from "../src/lib/exam/generator";
import { createExamSession, getExamSession, submitExamSession, ExamSubmissionError } from "../src/lib/exam/session-service";
import { buildPublicPayload, toPublicQuestion } from "../src/lib/exam/payload";
import type { DbCandidate } from "../src/lib/exam/generator";

const HASH_MEDIA = "ab".repeat(32);
const FIX_LICENSE = "ZZ";
const FIX_VERSION = "exam-fixture";

let catalogId: string;
let topicId: string;
let questionRows: { id: string; correctAnswer: boolean; groupCode: string | null }[] = [];

async function cleanup() {
  const cat = await db
    .select({ id: questionCatalogVersions.id })
    .from(questionCatalogVersions)
    .where(and(eq(questionCatalogVersions.licenseCategory, FIX_LICENSE), eq(questionCatalogVersions.versionCode, FIX_VERSION)))
    .limit(1);
  if (cat[0]) {
    const sessions = await db.select({ id: examSessions.id }).from(examSessions).where(eq(examSessions.catalogVersionId, cat[0].id));
    for (const s of sessions) {
      await db.delete(examSessionQuestions).where(eq(examSessionQuestions.sessionId, s.id));
    }
    await db.delete(examSessions).where(eq(examSessions.catalogVersionId, cat[0].id));
    await db.delete(questions).where(eq(questions.catalogVersionId, cat[0].id));
    await db.delete(mediaAssets).where(eq(mediaAssets.catalogVersionId, cat[0].id));
    await db.delete(questionCatalogVersions).where(eq(questionCatalogVersions.id, cat[0].id));
  }
  const t = await db.select({ id: topics.id }).from(topics).where(eq(topics.code, "EXAM-FIX")).limit(1);
  if (t[0]) await db.delete(topics).where(eq(topics.id, t[0].id));
}

before(async () => {
  await cleanup();
  const [topic] = await db
    .insert(topics)
    .values({ code: "EXAM-FIX", name: "Topic esame fixture" })
    .returning();
  topicId = topic.id;
  const [cat] = await db
    .insert(questionCatalogVersions)
    .values({
      licenseCategory: FIX_LICENSE,
      officialName: "Fixture esame",
      versionCode: FIX_VERSION,
      status: "imported",
      importedAt: new Date(),
    })
    .returning();
  catalogId = cat.id;
  await db
    .insert(mediaAssets)
    .values({
      catalogVersionId: catalogId,
      officialReference: "fixture-ref-1",
      originalFilename: "fixture.png",
      localPath: `data/media/ab-2025-04-23/${HASH_MEDIA}.png`,
      mimeType: "image/png",
      sha256: HASH_MEDIA,
      verificationStatus: "structurally_verified",
    })
    .returning();


  const rows: { id: string; correctAnswer: boolean; groupCode: string | null }[] = [];
  // 10 groups x 4 questions = 40 candidates
  for (let g = 1; g <= 10; g++) {
    for (let n = 1; n <= 4; n++) {
      const withImage = n % 2 === 0;
      const [q] = await db
        .insert(questions)
        .values({
          catalogVersionId: catalogId,
          officialGroupCode: `FX${g}`,
          officialQuestionCode: `FX${g}${n}000`,
          statement: `Domanda fixture ${g}-${n} (${withImage ? "con immagine" : "senza"})`,
          correctAnswer: n % 2 === 0,
          imageReference: withImage ? HASH_MEDIA : null,
          topicId,
          status: "imported",
          contentHash: `h${g}${n}`.padEnd(64, "0"),
        })
        .returning();
      rows.push({ id: q.id, correctAnswer: q.correctAnswer, groupCode: q.officialGroupCode });
    }
  }
  questionRows = rows;
});

after(async () => {
  await cleanup();
  await sql.end();
});

async function pick30(seed: number): Promise<DbCandidate[]> {
  const candidates: QuestionCandidate[] = questionRows.map((r) => ({
    id: r.id,
    groupCode: r.groupCode,
    imageRef: r.correctAnswer === true && r.groupCode !== null ? HASH_MEDIA : null,
    mediaStatus: HASH_MEDIA ? "structurally_verified" : null,
  }));
  const { selected } = selectQuestions(candidates, { seed, total: 30, maxPerGroup: 4 });
  assert.equal(selected.length, 30);
  return selected.map((c) => ({
    ...c,
    statement: "Domanda fixture",
    correctAnswer: questionRows.find((r) => r.id === c.id)!.correctAnswer,
    officialQuestionCode: null,
    topicId: null,
    topicName: "Topic esame fixture",
    mediaLocalPath: null,
    mediaMime: null,
    mediaWidth: null,
    mediaHeight: null,
  }));
}

function payload(questions: DbCandidate[], answers: Record<string, boolean | null>) {
  return {
    version: siteConfig.payloadVersion,
    answers: questions.map((q) => ({ questionId: q.id, selectedAnswer: answers[q.id] ?? null })),
    flagged: [],
  };
}

test("sessione: creazione + payload pubblico senza correctAnswer", async () => {
  const qs = await pick30(7);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 7, questions: qs });
  assert.equal(session.totalQuestions, 30);
  const payload = buildPublicPayload({
    sessionId: session.id,
    status: "in_progress",
    seed: 7,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    questions: qs,
  });
  assert.ok(!JSON.stringify(payload).includes("correctAnswer"));
  const loaded = await getExamSession(session.id);
  assert.ok(loaded);
  assert.equal(loaded!.status, "in_progress");
  // pulizia
  await db.delete(examSessionQuestions).where(eq(examSessionQuestions.sessionId, session.id));
  await db.delete(examSessions).where(eq(examSessions.id, session.id));
});

test("sessione: submit 30 corrette = superato", async () => {
  const qs = await pick30(11);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 11, questions: qs });
  const correct: Record<string, boolean> = {};
  for (const q of qs) correct[q.id] = q.correctAnswer;
  const { result } = await submitExamSession(session.id, payload(qs, correct));
  assert.equal(result.correctCount, 30);
  assert.equal(result.errorCount, 0);
  assert.equal(result.passed, true);
  assert.equal(result.status, "completed");
});

test("sessione: submit con 4 errori = non superato", async () => {
  const qs = await pick30(13);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 13, questions: qs });
  const answers: Record<string, boolean | null> = {};
  qs.forEach((q, i) => (answers[q.id] = i < 4 ? !q.correctAnswer : q.correctAnswer));
  const { result } = await submitExamSession(session.id, payload(qs, answers));
  assert.equal(result.errorCount, 4);
  assert.equal(result.passed, false);
});

test("sessione: non risposta = errore", async () => {
  const qs = await pick30(17);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 17, questions: qs });
  const answers: Record<string, boolean | null> = {};
  qs.forEach((q, i) => (answers[q.id] = i === 0 ? null : q.correctAnswer));
  const { result } = await submitExamSession(session.id, payload(qs, answers));
  assert.equal(result.unansweredCount, 1);
  assert.equal(result.errorCount, 1);
  assert.equal(result.answers[0].unanswered, true);
});

test("sessione: domanda estranea rifiutata", async () => {
  const qs = await pick30(19);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 19, questions: qs });
  const answers = payload(qs, {});
  answers.answers.push({ questionId: "99999999-9999-4999-8999-999999999999", selectedAnswer: true });
  await assert.rejects(() => submitExamSession(session.id, answers), (e: unknown) => e instanceof ExamSubmissionError && e.code === "QUESTION_MISMATCH");
});

test("sessione: domanda duplicata rifiutata", async () => {
  const qs = await pick30(23);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 23, questions: qs });
  const answers = payload(qs, {});
  answers.answers.push({ questionId: qs[0].id, selectedAnswer: true });
  await assert.rejects(() => submitExamSession(session.id, answers), (e: unknown) => e instanceof ExamSubmissionError && e.code === "QUESTION_MISMATCH");
});

test("sessione: submit idempotente (stessa consegna)", async () => {
  const qs = await pick30(29);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 29, questions: qs });
  const correct: Record<string, boolean> = {};
  for (const q of qs) correct[q.id] = q.correctAnswer;
  const first = await submitExamSession(session.id, payload(qs, correct));
  assert.equal(first.alreadySubmittedSame, false);
  const second = await submitExamSession(session.id, payload(qs, correct));
  assert.equal(second.alreadySubmittedSame, true);
  assert.equal(second.result.correctCount, 30);
});

test("sessione: seconda consegna differente rifiutata (409)", async () => {
  const qs = await pick30(31);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 31, questions: qs });
  const correct: Record<string, boolean> = {};
  for (const q of qs) correct[q.id] = q.correctAnswer;
  await submitExamSession(session.id, payload(qs, correct));
  const wrong: Record<string, boolean> = {};
  qs.forEach((q, i) => (wrong[q.id] = i === 0 ? !q.correctAnswer : q.correctAnswer));
  await assert.rejects(() => submitExamSession(session.id, payload(qs, wrong)), (e: unknown) => e instanceof ExamSubmissionError && e.code === "ALREADY_SUBMITTED");
});

test("sessione: sessione scaduta corretta comunque", async () => {
  const qs = await pick30(37);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 37, questions: qs });
  // rendi la sessione scaduta
  await db
    .update(examSessions)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(examSessions.id, session.id));
  const correct: Record<string, boolean> = {};
  for (const q of qs) correct[q.id] = q.correctAnswer;
  const { result } = await submitExamSession(session.id, payload(qs, correct));
  assert.equal(result.correctCount, 30);
});

test("sessione: payload invalido rifiutato", async () => {
  const qs = await pick30(41);
  const { session } = await createExamSession({ catalogVersionId: catalogId, seed: 41, questions: qs });
  await assert.rejects(() => submitExamSession(session.id, { version: 999, answers: [] }), (e: unknown) => e instanceof ExamSubmissionError && e.code === "INVALID_PAYLOAD");
  await assert.rejects(() => submitExamSession(session.id, { version: siteConfig.payloadVersion, answers: [{ questionId: "x", selectedAnswer: "vero" }] }), (e: unknown) => e instanceof ExamSubmissionError && e.code === "INVALID_PAYLOAD");
});

test("sessione: sessione inesistente -> SESSION_NOT_FOUND", async () => {
  await assert.rejects(
    () =>
      submitExamSession("88888888-8888-4888-8888-888888888888", {
        version: siteConfig.payloadVersion,
        answers: [{ questionId: "88888888-8888-4888-8888-888888888888", selectedAnswer: true }],
        flagged: [],
      }),
    (e: unknown) => e instanceof ExamSubmissionError && e.code === "SESSION_NOT_FOUND",
  );
});

test("sessione: toPublicQuestion non espone correctAnswer", () => {
  const q = toPublicQuestion(
    { id: "x", groupCode: "G1", imageRef: null, mediaStatus: null, statement: "s", correctAnswer: true, officialQuestionCode: "1", topicId: null, topicName: null, mediaLocalPath: null, mediaMime: null, mediaWidth: null, mediaHeight: null },
    1,
  );
  assert.ok(!JSON.stringify(q).includes("correctAnswer"));
});
