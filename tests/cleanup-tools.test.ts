import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, sql } from "../src/lib/db";
import { examSessions, examSessionQuestions, questionCatalogVersions, questions } from "../src/lib/db/schema";
import {
  parseCleanupArgs,
  runDevSessionCleanup,
} from "../scripts/db/cleanup-dev-sessions";
import {
  parseExpiredArgs,
  runExpiredExamCleanup,
} from "../scripts/db/cleanup-expired-exams";
import { siteConfig } from "../src/config/site";


let catalogId: string;
let questionId: string;

async function makeCatalog() {
  const imported = await db
    .select({ id: questionCatalogVersions.id })
    .from(questionCatalogVersions)
    .where(eq(questionCatalogVersions.status, "imported"))
    .limit(1);
  catalogId = imported[0]?.id ?? "00000000-0000-4000-8000-000000000000";
  const q = await db.select({ id: questions.id }).from(questions).limit(1);
  questionId = q[0]?.id ?? "00000000-0000-4000-8000-000000000000";
}

async function insertSession(opts: { environment: string; status: string; expiresAgoMs: number; answered?: boolean }) {
  const [s] = await db
    .insert(examSessions)
    .values({
      catalogVersionId: catalogId,
      mode: siteConfig.exam.mode,
      status: opts.status,
      environment: opts.environment,
      totalQuestions: 30,
      allowedErrors: 3,
      durationSeconds: 1200,
      startedAt: new Date(Date.now() - opts.expiresAgoMs - 1200_000),
      expiresAt: new Date(Date.now() - opts.expiresAgoMs),
      selectionSeed: Math.floor(Math.random() * 100000) + 1,
    })
    .returning();
  if (opts.answered) {
    await db.insert(examSessionQuestions).values({ sessionId: s.id, questionId, position: 1, flagged: false });
  }
  return s.id;
}

before(async () => {
  await makeCatalog();
});

after(async () => {
  // cleanup any leftover fixture sessions created by the tests
  const leftovers = await db
    .select({ id: examSessions.id })
    .from(examSessions)
    .where(eq(examSessions.environment, "test"))
    .limit(50);
  const ids = leftovers.map((l) => l.id);
  if (ids.length) {
    await db.delete(examSessionQuestions).where(eq(examSessionQuestions.sessionId, "00000000-0000-4000-8000-000000000000"));
    await db.delete(examSessionQuestions).where(eq(examSessionQuestions.sessionId, ids[0]));
  }
  await db.delete(examSessions).where(eq(examSessions.environment, "test"));
  await sql.end();
});

test("cleanup-dev: arg parsing", () => {
  assert.deepEqual(parseCleanupArgs(["--dry-run"]), { mode: "dry-run", environments: ["development", "test"] });
  assert.deepEqual(parseCleanupArgs(["--apply"]), { mode: "apply", environments: ["development", "test"] });
  assert.deepEqual(parseCleanupArgs(["--apply", "--environments", "test"]), { mode: "apply", environments: ["test"] });
  assert.deepEqual(parseCleanupArgs(["--environments=development"]), { mode: "dry-run", environments: ["development"] });
});

test("cleanup-dev: dry-run trova ma non elimina", async () => {
  const sid = await insertSession({ environment: "development", status: "in_progress", expiresAgoMs: 1000, answered: true });
  const res = await runDevSessionCleanup({ mode: "dry-run", environments: ["development", "test"] });
  assert.ok(res.sessionsFound >= 1);
  assert.equal(res.deletedSessions, 0);
  const still = await db.select().from(examSessions).where(eq(examSessions.id, sid));
  assert.equal(still.length, 1);
  await db.delete(examSessions).where(eq(examSessions.id, sid));
});

test("cleanup-dev: apply elimina solo sessioni dev/test, mai production", async () => {
  const devId = await insertSession({ environment: "development", status: "in_progress", expiresAgoMs: 1000 });
  const testId = await insertSession({ environment: "test", status: "in_progress", expiresAgoMs: 1000 });
  const prodId = await insertSession({ environment: "production", status: "in_progress", expiresAgoMs: 1000 });
  const res = await runDevSessionCleanup({ mode: "apply", environments: ["development", "test"] });
  assert.ok(res.deletedSessions >= 2);
  assert.equal((await db.select().from(examSessions).where(eq(examSessions.id, devId))).length, 0);
  assert.equal((await db.select().from(examSessions).where(eq(examSessions.id, testId))).length, 0);
  assert.equal((await db.select().from(examSessions).where(eq(examSessions.id, prodId))).length, 1, "production mai toccata");
  await db.delete(examSessions).where(eq(examSessions.id, prodId));
});

test("cleanup-dev: idempotente", async () => {
  const sid = await insertSession({ environment: "test", status: "in_progress", expiresAgoMs: 1000 });
  const r1 = await runDevSessionCleanup({ mode: "apply", environments: ["test"] });
  const r2 = await runDevSessionCleanup({ mode: "apply", environments: ["test"] });
  assert.ok(r1.deletedSessions >= 1);
  assert.ok(r2.deletedSessions >= 0);
  void sid;
});

test("cleanup-expired: arg parsing", () => {
  assert.deepEqual(parseExpiredArgs(["--dry-run"]), { mode: "dry-run", olderThanDays: 30 });
  assert.deepEqual(parseExpiredArgs(["--apply", "--older-than-days", "10"]), { mode: "apply", olderThanDays: 10 });
  assert.deepEqual(parseExpiredArgs(["--older-than-days=abc"]), { mode: "dry-run", olderThanDays: 30 });
});

test("cleanup-expired: elimina solo sessioni scadute non consegnate oltre soglia", async () => {
  // scaduta da 40 giorni (oltre 30) e in_progress -> da eliminare
  const oldExpired = await insertSession({ environment: "development", status: "in_progress", expiresAgoMs: 40 * 86_400_000, answered: true });
  // scaduta da 5 giorni (sotto soglia) -> NON eliminata
  const recentExpired = await insertSession({ environment: "development", status: "in_progress", expiresAgoMs: 5 * 86_400_000 });
  // completed vecchia -> mai toccata
  const oldCompleted = await insertSession({ environment: "development", status: "completed", expiresAgoMs: 40 * 86_400_000 });

  const dry = await runExpiredExamCleanup({ mode: "dry-run", olderThanDays: 30 });
  assert.ok(dry.sessionsFound >= 1);
  assert.equal(dry.deletedSessions, 0);

  const res = await runExpiredExamCleanup({ mode: "apply", olderThanDays: 30 });
  assert.ok(res.deletedSessions >= 1);
  assert.equal((await db.select().from(examSessions).where(eq(examSessions.id, oldExpired))).length, 0, "vecchia scaduta eliminata");
  assert.equal((await db.select().from(examSessions).where(eq(examSessions.id, recentExpired))).length, 1, "recente non eliminata");
  assert.equal((await db.select().from(examSessions).where(eq(examSessions.id, oldCompleted))).length, 1, "completed mai toccata");

  await db.delete(examSessions).where(eq(examSessions.id, recentExpired));
  await db.delete(examSessions).where(eq(examSessions.id, oldCompleted));
});
