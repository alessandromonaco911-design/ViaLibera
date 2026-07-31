import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, sql } from "../src/lib/db";
import {
  examSessions,
  examSessionQuestions,
  mediaAssets,
  questionCatalogVersions,
  questions,
  topics,
} from "../src/lib/db/schema";
import {
  createPracticeSession,
  createMistakesSession,
  verifyPracticeAnswer,
  completePracticeSession,
  getPracticeSession,
  getPracticeSessionQuestions,
  PracticeServiceError,
} from "../src/lib/practice/service";
import { buildPublicPracticePayload } from "../src/lib/practice/payload";
import { generatePracticeQuestions, listPracticeTopics, getTopic } from "../src/lib/practice/generator";

const FIX_LICENSE = "ZZ";
const FIX_VERSION = "practice-fixture";
const HASH_MEDIA = "cd".repeat(32);

let catalogId: string;
let topicA: string;
let topicB: string;
let topicSmall: string;
let questionRows: { id: string; correctAnswer: boolean; groupCode: string | null; topicId: string }[] = [];

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
  const ts = await db.select({ id: topics.id }).from(topics).where(eq(topics.code, "PRACTICE-FIX-A")).limit(1);
  if (ts[0]) await db.delete(topics).where(eq(topics.id, ts[0].id));
  const tsB = await db.select({ id: topics.id }).from(topics).where(eq(topics.code, "PRACTICE-FIX-B")).limit(1);
  if (tsB[0]) await db.delete(topics).where(eq(topics.id, tsB[0].id));
  const tsS = await db.select({ id: topics.id }).from(topics).where(eq(topics.code, "PRACTICE-FIX-S")).limit(1);
  if (tsS[0]) await db.delete(topics).where(eq(topics.id, tsS[0].id));
}

async function deletePracticeSession(sessionId: string) {
  await db.delete(examSessionQuestions).where(eq(examSessionQuestions.sessionId, sessionId));
  await db.delete(examSessions).where(eq(examSessions.id, sessionId));
}

before(async () => {
  await cleanup();
  const [tA] = await db.insert(topics).values({ code: "PRACTICE-FIX-A", name: "Topic practice A" }).returning();
  const [tB] = await db.insert(topics).values({ code: "PRACTICE-FIX-B", name: "Topic practice B" }).returning();
  const [tS] = await db.insert(topics).values({ code: "PRACTICE-FIX-S", name: "Topic practice piccolo" }).returning();
  topicA = tA.id;
  topicB = tB.id;
  topicSmall = tS.id;

  const [cat] = await db
    .insert(questionCatalogVersions)
    .values({
      licenseCategory: FIX_LICENSE,
      officialName: "Fixture practice",
      versionCode: FIX_VERSION,
      status: "imported",
      importedAt: new Date(),
    })
    .returning();
  catalogId = cat.id;

  await db.insert(mediaAssets).values({
    catalogVersionId: catalogId,
    officialReference: "practice-ref-1",
    originalFilename: "fixture.png",
    localPath: `data/media/ab-2025-04-23/${HASH_MEDIA}.png`,
    mimeType: "image/png",
    sha256: HASH_MEDIA,
    verificationStatus: "structurally_verified",
  });

  // topicA: 6 groups x 5 = 30 questions; topicB: 3 groups x 5 = 15; topicSmall: 3
  const rows: { id: string; correctAnswer: boolean; groupCode: string | null; topicId: string }[] = [];
  for (let g = 1; g <= 6; g++) {
    for (let n = 1; n <= 5; n++) {
      const withImage = n % 2 === 0;
      const [q] = await db
        .insert(questions)
        .values({
          catalogVersionId: catalogId,
          officialGroupCode: `PA${g}`,
          officialQuestionCode: `PA${g}${n}000`,
          statement: `Domanda practice A ${g}-${n}`,
          correctAnswer: n % 2 === 0,
          imageReference: withImage ? HASH_MEDIA : null,
          topicId: topicA,
          status: "imported",
          contentHash: `hA${g}${n}`.padEnd(64, "0"),
        })
        .returning();
      rows.push({ id: q.id, correctAnswer: q.correctAnswer, groupCode: q.officialGroupCode, topicId: topicA });
    }
  }
  for (let g = 1; g <= 3; g++) {
    for (let n = 1; n <= 5; n++) {
      const [q] = await db
        .insert(questions)
        .values({
          catalogVersionId: catalogId,
          officialGroupCode: `PB${g}`,
          officialQuestionCode: `PB${g}${n}000`,
          statement: `Domanda practice B ${g}-${n}`,
          correctAnswer: g % 2 === 0,
          imageReference: null,
          topicId: topicB,
          status: "imported",
          contentHash: `hB${g}${n}`.padEnd(64, "0"),
        })
        .returning();
      rows.push({ id: q.id, correctAnswer: q.correctAnswer, groupCode: q.officialGroupCode, topicId: topicB });
    }
  }
  for (let n = 1; n <= 3; n++) {
    const [q] = await db
      .insert(questions)
      .values({
        catalogVersionId: catalogId,
        officialGroupCode: `PS${n}`,
        officialQuestionCode: `PS${n}000`,
        statement: `Domanda practice small ${n}`,
        correctAnswer: true,
        imageReference: null,
        topicId: topicSmall,
        status: "imported",
        contentHash: `hS${n}`.padEnd(64, "0"),
      })
      .returning();
    rows.push({ id: q.id, correctAnswer: q.correctAnswer, groupCode: q.officialGroupCode, topicId: topicSmall });
  }
  questionRows = rows;
});

after(async () => {
  await cleanup();
  await sql.end();
});

function seedFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h + 1;
}

// ---------------------------------------------------------------------------
// generator integration
// ---------------------------------------------------------------------------

test("practice: genera 10 domande del topic corretto", async () => {
  const { questions: qs, topic } = await generatePracticeQuestions({ catalogId, topicId: topicA, seed: seedFor("a10"), total: 10 });
  assert.equal(qs.length, 10);
  assert.equal(topic.id, topicA);
  assert.ok(qs.every((q) => q.topicId === topicA), "tutte le domande devono appartenere al topic");
});

test("practice: genera 20 domande del topic corretto", async () => {
  const { questions: qs } = await generatePracticeQuestions({ catalogId, topicId: topicA, seed: seedFor("a20"), total: 20 });
  assert.equal(qs.length, 20);
  assert.ok(qs.every((q) => q.topicId === topicA));
});

test("practice: genera 30 domande del topic corretto", async () => {
  const { questions: qs } = await generatePracticeQuestions({ catalogId, topicId: topicA, seed: seedFor("a30"), total: 30 });
  assert.equal(qs.length, 30);
  assert.ok(qs.every((q) => q.topicId === topicA));
});

test("practice: nessuna duplicazione nel set", async () => {
  const { questions: qs } = await generatePracticeQuestions({ catalogId, topicId: topicA, seed: seedFor("uniq"), total: 30 });
  assert.equal(new Set(qs.map((q) => q.id)).size, 30);
});

test("practice: determinismo (stesso seed -> stesso set)", async () => {
  const a = await generatePracticeQuestions({ catalogId, topicId: topicA, seed: seedFor("det"), total: 10 });
  const b = await generatePracticeQuestions({ catalogId, topicId: topicA, seed: seedFor("det"), total: 10 });
  assert.deepEqual(a.questions.map((q) => q.id), b.questions.map((q) => q.id));
});

test("practice: topic inesistente -> errore", async () => {
  await assert.rejects(
    () => generatePracticeQuestions({ catalogId, topicId: "99999999-9999-4999-8999-999999999999", seed: 1, total: 10 }),
    (e: unknown) => e instanceof Error && e.name === "PracticeGenerationError",
  );
});

test("practice: topic senza abbastanza domande -> errore", async () => {
  // topicSmall ha 3 domande, ne chiediamo 10
  await assert.rejects(
    () => generatePracticeQuestions({ catalogId, topicId: topicSmall, seed: seedFor("small"), total: 10 }),
    (e: unknown) => e instanceof Error && e.name === "PracticeGenerationError" && /topic insufficiente/.test(e.message),
  );
});

test("practice: listPracticeTopics espone solo topic con domande e conteggi reali", async () => {
  const list = await listPracticeTopics(catalogId);
  const a = list.find((t) => t.id === topicA);
  const b = list.find((t) => t.id === topicB);
  assert.ok(a && b, "topicA e topicB presenti");
  assert.equal(a!.questionCount, 30);
  assert.equal(a!.imageCount, 12); // 2 immagini per gruppo x 6 gruppi (n pari)
  assert.equal(b!.questionCount, 15);
});

test("practice: payload pubblico non espone correctAnswer", async () => {
  const { questions: qs, topic } = await generatePracticeQuestions({ catalogId, topicId: topicA, seed: seedFor("payload"), total: 10 });
  const { session } = await createPracticeSession({ catalogVersionId: catalogId, topicId: topicA, questionCount: 10, seed: seedFor("payload") });
  const payload = buildPublicPracticePayload({
    sessionId: session.id,
    mode: "practice",
    status: "in_progress",
    topic,
    requestedQuestionCount: 10,
    totalQuestions: session.totalQuestions,
    startedAt: session.startedAt,
    seed: seedFor("payload"),
    sourceSessionId: null,
    questions: qs,
  });
  assert.ok(!JSON.stringify(payload).includes("correctAnswer"));
  await deletePracticeSession(session.id);
});

// ---------------------------------------------------------------------------
// create + answer
// ---------------------------------------------------------------------------

test("practice: create session untimed con topic e count", async () => {
  const { session } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("create"),
    environment: "test",
  });
  assert.equal(session.mode, "practice");
  assert.equal(session.feedbackMode, "immediate");
  assert.equal(session.totalQuestions, 10);
  assert.equal(session.durationSeconds, 0);
  assert.equal(session.requestedQuestionCount, 10);
  assert.equal(session.topicId, topicA);
  assert.equal(session.status, "in_progress");
  const rows = await getPracticeSessionQuestions(session.id);
  assert.equal(rows.length, 10);
  await deletePracticeSession(session.id);
});

test("practice: answer corretta verificata server-side", async () => {
  const { session, questions: qs } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("correct"),
    environment: "test",
  });
  const q = qs[0];
  const res = await verifyPracticeAnswer(session.id, { questionId: q.id, selectedAnswer: q.correctAnswer });
  assert.equal(res.isCorrect, true);
  assert.equal(res.correctAnswer, q.correctAnswer);
  assert.equal(res.questionId, q.id);
  // bloccata dopo verifica
  await assert.rejects(
    () => verifyPracticeAnswer(session.id, { questionId: q.id, selectedAnswer: !q.correctAnswer }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "ALREADY_VERIFIED",
  );
  await deletePracticeSession(session.id);
});

test("practice: answer errata verifica isCorrect=false", async () => {
  const { session, questions: qs } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("wrong"),
    environment: "test",
  });
  const q = qs[0];
  const res = await verifyPracticeAnswer(session.id, { questionId: q.id, selectedAnswer: !q.correctAnswer });
  assert.equal(res.isCorrect, false);
  await deletePracticeSession(session.id);
});

test("practice: idempotenza sulla stessa risposta verificata", async () => {
  const { session, questions: qs } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("idem"),
    environment: "test",
  });
  const q = qs[0];
  await verifyPracticeAnswer(session.id, { questionId: q.id, selectedAnswer: q.correctAnswer });
  const again = await verifyPracticeAnswer(session.id, { questionId: q.id, selectedAnswer: q.correctAnswer });
  assert.equal(again.isCorrect, true);
  await deletePracticeSession(session.id);
});

test("practice: domanda estranea rifiutata", async () => {
  const { session } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("foreign"),
    environment: "test",
  });
  await assert.rejects(
    () => verifyPracticeAnswer(session.id, { questionId: "99999999-9999-4999-8999-999999999999", selectedAnswer: true }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "QUESTION_NOT_IN_SESSION",
  );
  await deletePracticeSession(session.id);
});

test("practice: payload non booleano rifiutato", async () => {
  const { session } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("bool"),
    environment: "test",
  });
  await assert.rejects(
    () => verifyPracticeAnswer(session.id, { questionId: questionRows[0].id, selectedAnswer: "vero" }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "INVALID_PAYLOAD",
  );
  await assert.rejects(
    () => verifyPracticeAnswer(session.id, { questionId: "not-a-uuid", selectedAnswer: true }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "INVALID_PAYLOAD",
  );
  await deletePracticeSession(session.id);
});

test("practice: sessione inesistente -> SESSION_NOT_FOUND", async () => {
  await assert.rejects(
    () => verifyPracticeAnswer("88888888-8888-4888-8888-888888888888", { questionId: questionRows[0].id, selectedAnswer: true }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "SESSION_NOT_FOUND",
  );
});

// ---------------------------------------------------------------------------
// complete
// ---------------------------------------------------------------------------

test("practice: complete calcola corrette/errate/non risposte", async () => {
  const { session, questions: qs } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("comp"),
    environment: "test",
  });
  // 3 corrette, 2 errate, 5 non risposte
  for (let i = 0; i < 3; i++) await verifyPracticeAnswer(session.id, { questionId: qs[i].id, selectedAnswer: qs[i].correctAnswer });
  for (let i = 3; i < 5; i++) await verifyPracticeAnswer(session.id, { questionId: qs[i].id, selectedAnswer: !qs[i].correctAnswer });
  const result = await completePracticeSession(session.id);
  assert.equal(result.totalQuestions, 10);
  assert.equal(result.correctCount, 3);
  assert.equal(result.errorCount, 2);
  assert.equal(result.unansweredCount, 5);
  assert.equal(result.percentage, 60); // 3/(3+2)
  const loaded = await getPracticeSession(session.id);
  assert.equal(loaded!.status, "completed");
  assert.equal(loaded!.practiceStatus, "completed");
  await deletePracticeSession(session.id);
});

test("practice: complete idempotente", async () => {
  const { session, questions: qs } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("comp2"),
    environment: "test",
  });
  await verifyPracticeAnswer(session.id, { questionId: qs[0].id, selectedAnswer: qs[0].correctAnswer });
  const first = await completePracticeSession(session.id);
  const second = await completePracticeSession(session.id);
  assert.equal(second.correctCount, first.correctCount);
  assert.equal(second.totalQuestions, 10);
  await deletePracticeSession(session.id);
});

test("practice: complete su sessione inesistente -> errore", async () => {
  await assert.rejects(
    () => completePracticeSession("88888888-8888-4888-8888-888888888888"),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "SESSION_NOT_FOUND",
  );
});

test("practice: non risposta NON conta come errore (riepilogo separato)", async () => {
  const { session, questions: qs } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("unans"),
    environment: "test",
  });
  await verifyPracticeAnswer(session.id, { questionId: qs[0].id, selectedAnswer: qs[0].correctAnswer });
  const result = await completePracticeSession(session.id);
  assert.equal(result.correctCount, 1);
  assert.equal(result.errorCount, 0);
  assert.equal(result.unansweredCount, 9);
  await deletePracticeSession(session.id);
});

// ---------------------------------------------------------------------------
// mistakes
// ---------------------------------------------------------------------------

test("practice: mistakes contiene solo gli errori della sessione sorgente", async () => {
  const { session, questions: qs } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("mist"),
    environment: "test",
  });
  // 4 errate (indici 0..3 risposte sbagliate), 3 corrette, 3 non risposte
  for (let i = 0; i < 4; i++) await verifyPracticeAnswer(session.id, { questionId: qs[i].id, selectedAnswer: !qs[i].correctAnswer });
  for (let i = 4; i < 7; i++) await verifyPracticeAnswer(session.id, { questionId: qs[i].id, selectedAnswer: qs[i].correctAnswer });
  await completePracticeSession(session.id);

  const { session: m, questions: mqs, totalErrors } = await createMistakesSession({ sourceSessionId: session.id, seed: seedFor("m1") });
  assert.equal(m.mode, "mistakes");
  assert.equal(m.sourceSessionId, session.id);
  assert.equal(m.topicId, topicA);
  assert.equal(totalErrors, 4);
  assert.equal(mqs.length, 4);
  const ids = new Set(qs.slice(0, 4).map((q) => q.id));
  assert.ok(mqs.every((q) => ids.has(q.id)), "solo domande errate della sorgente");
  assert.equal(new Set(mqs.map((q) => q.id)).size, 4, "nessun duplicato");
  await deletePracticeSession(m.id);
  await deletePracticeSession(session.id);
});

test("practice: mistakes con zero errori -> NO_MISTAKES", async () => {
  const { session, questions: qs } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicB,
    questionCount: 10,
    seed: seedFor("zero"),
    environment: "test",
  });
  for (const q of qs) await verifyPracticeAnswer(session.id, { questionId: q.id, selectedAnswer: q.correctAnswer });
  await completePracticeSession(session.id);
  await assert.rejects(
    () => createMistakesSession({ sourceSessionId: session.id, seed: seedFor("z1") }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "NO_MISTAKES",
  );
  await deletePracticeSession(session.id);
});

test("practice: mistakes da sessione non completata -> SOURCE_NOT_COMPLETED", async () => {
  const { session } = await createPracticeSession({
    catalogVersionId: catalogId,
    topicId: topicA,
    questionCount: 10,
    seed: seedFor("nocomp"),
    environment: "test",
  });
  await assert.rejects(
    () => createMistakesSession({ sourceSessionId: session.id, seed: seedFor("n1") }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "SOURCE_NOT_COMPLETED",
  );
  await deletePracticeSession(session.id);
});

// ---------------------------------------------------------------------------
// sicurezza incrociata
// ---------------------------------------------------------------------------

test("practice: sessione simulazione non utilizzabile come practice", async () => {
  const [cat] = await db
    .select({ id: questionCatalogVersions.id })
    .from(questionCatalogVersions)
    .where(eq(questionCatalogVersions.id, catalogId))
    .limit(1);
  const now = new Date();
  const [sess] = await db
    .insert(examSessions)
    .values({
      catalogVersionId: cat!.id,
      mode: "simulation",
      status: "in_progress",
      environment: "test",
      totalQuestions: 30,
      allowedErrors: 3,
      durationSeconds: 1200,
      startedAt: now,
      expiresAt: new Date(now.getTime() + 1200_000),
      selectionSeed: 1,
    })
    .returning();
  await assert.rejects(
    () => verifyPracticeAnswer(sess.id, { questionId: questionRows[0].id, selectedAnswer: true }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "NOT_PRACTICE",
  );
  await deletePracticeSession(sess.id);
});

test("practice: getTopic lancia errore per topic inesistente", async () => {
  await assert.rejects(() => getTopic("99999999-9999-4999-8999-999999999999"), (e: unknown) => e instanceof Error && e.name === "PracticeGenerationError");
});

test("practice: questionCount non valido rifiutato", async () => {
  await assert.rejects(
    () => createPracticeSession({ catalogVersionId: catalogId, topicId: topicA, questionCount: 7, seed: 1, environment: "test" }),
    (e: unknown) => e instanceof PracticeServiceError && e.code === "INVALID_PAYLOAD",
  );
});
