import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { examSessionQuestions, examSessions, mediaAssets, questions, topics } from "../db/schema";
import { siteConfig } from "../../config/site";
import type { DbCandidate } from "../exam/generator";
import { fetchCandidates } from "../exam/generator";
import { generatePracticeQuestions, getTopic, PracticeGenerationError } from "./generator";
import type { AnswerCheckResult, PracticeMode, PracticeResult } from "./types";

/**
 * Practice (allenamento) + mistakes (ripasso errori) session service.
 *
 * Sessions reuse exam_sessions / exam_session_questions with:
 *   mode          = 'practice' | 'mistakes'
 *   feedbackMode  = 'immediate'
 *   durationSeconds = 0  (untimed: no expiry)
 *   topicId / sourceSessionId / requestedQuestionCount / practiceStatus
 *
 * All scoring is server-side; the client payload is never trusted for
 * correctness. A correct answer is revealed ONLY by the single-answer
 * verification endpoint, never by GET.
 */

export class PracticeServiceError extends Error {
  code:
    | "SESSION_NOT_FOUND"
    | "NOT_PRACTICE"
    | "QUESTION_NOT_IN_SESSION"
    | "ALREADY_VERIFIED"
    | "SESSION_COMPLETED"
    | "INVALID_PAYLOAD"
    | "NO_MISTAKES"
    | "SOURCE_NOT_COMPLETED"
    | "INSUFFICIENT_QUESTIONS";
  constructor(code: PracticeServiceError["code"], message: string) {
    super(message);
    this.name = "PracticeServiceError";
    this.code = code;
  }
}

export const PRACTICE_MODES: ReadonlySet<string> = new Set(["practice", "mistakes"]);

// ---------------------------------------------------------------------------
// session rows (light, no questions)
// ---------------------------------------------------------------------------

export interface PracticeSessionRow {
  id: string;
  catalogVersionId: string;
  mode: string;
  status: string;
  topicId: string | null;
  sourceSessionId: string | null;
  feedbackMode: string | null;
  requestedQuestionCount: number | null;
  practiceStatus: string | null;
  totalQuestions: number;
  allowedErrors: number;
  durationSeconds: number;
  startedAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  completedAt: Date | null;
  correctCount: number | null;
  errorCount: number | null;
  unansweredCount: number | null;
  passed: boolean | null;
  selectionSeed: number;
  resultHash: string | null;
  environment: string;
}

export async function getPracticeSession(sessionId: string): Promise<PracticeSessionRow | null> {
  const rows = await db.select().from(examSessions).where(eq(examSessions.id, sessionId)).limit(1);
  return rows[0] ? (rows[0] as PracticeSessionRow) : null;
}

/** Guard: only practice/mistakes sessions are usable here. */
function assertPracticeMode(s: PracticeSessionRow): void {
  if (!PRACTICE_MODES.has(s.mode)) {
    throw new PracticeServiceError("NOT_PRACTICE", "la sessione non è una sessione di allenamento");
  }
}

/** Public alias for route handlers (session must be practice/mistakes). */
export function assertPracticeSessionMode(s: PracticeSessionRow): void {
  assertPracticeMode(s);
}

// ---------------------------------------------------------------------------
// question rows joined with the official statement + solution (server-side only)
// ---------------------------------------------------------------------------

export interface PracticeQuestionRow {
  sessionQuestionId: string;
  questionId: string;
  position: number;
  statement: string;
  correctAnswer: boolean;
  officialQuestionCode: string | null;
  groupCode: string | null;
  topic: string | null;
  imageRef: string | null;
  selectedAnswer: boolean | null;
  answerVerified: boolean | null;
  verifiedAt: Date | null;
  mediaLocalPath: string | null;
  mediaMime: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
}

export async function getPracticeSessionQuestions(sessionId: string): Promise<PracticeQuestionRow[]> {
  const rows = await db
    .select({
      sessionQuestionId: examSessionQuestions.id,
      questionId: examSessionQuestions.questionId,
      position: examSessionQuestions.position,
      statement: questions.statement,
      correctAnswer: questions.correctAnswer,
      officialQuestionCode: questions.officialQuestionCode,
      groupCode: questions.officialGroupCode,
      topic: topics.name,
      imageRef: questions.imageReference,
      selectedAnswer: examSessionQuestions.selectedAnswer,
      answerVerified: examSessionQuestions.answerVerified,
      verifiedAt: examSessionQuestions.verifiedAt,
      mediaLocalPath: mediaAssets.localPath,
      mediaMime: mediaAssets.mimeType,
      mediaWidth: mediaAssets.width,
      mediaHeight: mediaAssets.height,
    })
    .from(examSessionQuestions)
    .innerJoin(questions, eq(questions.id, examSessionQuestions.questionId))
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .leftJoin(
      mediaAssets,
      and(
        eq(mediaAssets.sha256, questions.imageReference),
        eq(mediaAssets.catalogVersionId, questions.catalogVersionId),
      ),
    )
    .where(eq(examSessionQuestions.sessionId, sessionId))
    .orderBy(asc(examSessionQuestions.position));
  return rows.map((r) => ({ ...r }));
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export interface CreatePracticeInput {
  catalogVersionId: string;
  topicId: string;
  questionCount: number;
  seed: number;
  environment?: string;
}

/** Create an untimed practice session for one topic (10/20/30 questions). */
export async function createPracticeSession(input: CreatePracticeInput): Promise<{
  session: PracticeSessionRow;
  questions: DbCandidate[];
  topic: { id: string; code: string; name: string };
}> {
  if (!siteConfig.practice.questionCounts.includes(input.questionCount as (typeof siteConfig.practice.questionCounts)[number])) {
    throw new PracticeServiceError("INVALID_PAYLOAD", `numero di domande non valido: ${input.questionCount}`);
  }
  const { questions, topic } = await generatePracticeQuestions({
    catalogId: input.catalogVersionId,
    topicId: input.topicId,
    seed: input.seed,
    total: input.questionCount,
  });

  const now = new Date();
  // untimed: far-future expiry; durationSeconds = 0 signals "no timer"
  const expiresAt = new Date(now.getTime() + 100 * 365 * 24 * 3600 * 1000);

  const created = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(examSessions)
      .values({
        catalogVersionId: input.catalogVersionId,
        mode: siteConfig.practice.mode,
        status: "in_progress",
        environment: input.environment ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
        topicId: input.topicId,
        feedbackMode: "immediate",
        requestedQuestionCount: input.questionCount,
        practiceStatus: "in_progress",
        totalQuestions: input.questionCount,
        allowedErrors: 0,
        durationSeconds: siteConfig.practice.durationSeconds,
        startedAt: now,
        expiresAt,
        selectionSeed: input.seed,
      })
      .returning();
    const rows = questions.map((q, i) => ({
      sessionId: session.id,
      questionId: q.id,
      position: i + 1,
      flagged: false,
    }));
    if (rows.length) await tx.insert(examSessionQuestions).values(rows);
    return session;
  });

  return { session: created as PracticeSessionRow, questions, topic };
}

// ---------------------------------------------------------------------------
// mistakes (ripasso errori) — derived from a completed practice session
// ---------------------------------------------------------------------------

/**
 * Build a mistakes session from the ERROR questions of a completed practice
 * session. Only errors are included; correct and unanswered are excluded.
 * Throws NO_MISTAKES when the source session had zero errors.
 */
export async function createMistakesSession(input: {
  sourceSessionId: string;
  seed: number;
  environment?: string;
}): Promise<{ session: PracticeSessionRow; questions: DbCandidate[]; topic: { id: string; code: string; name: string }; totalErrors: number }> {
  const source = await getPracticeSession(input.sourceSessionId);
  if (!source) throw new PracticeServiceError("SESSION_NOT_FOUND", "sessione sorgente inesistente");
  if (!PRACTICE_MODES.has(source.mode)) {
    throw new PracticeServiceError("NOT_PRACTICE", "la sessione sorgente non è una sessione di allenamento");
  }
  if (source.status !== "completed" && source.practiceStatus !== "completed") {
    throw new PracticeServiceError("SOURCE_NOT_COMPLETED", "la sessione sorgente non è ancora completata");
  }
  if (!source.topicId) throw new PracticeServiceError("INVALID_PAYLOAD", "sessione sorgente senza argomento");

  const sourceRows = await getPracticeSessionQuestions(input.sourceSessionId);
  const errors = sourceRows.filter((r) => r.answerVerified === true && r.selectedAnswer !== null && r.selectedAnswer !== r.correctAnswer);
  if (errors.length === 0) {
    throw new PracticeServiceError("NO_MISTAKES", "nessun errore da ripassare");
  }

  const topic = await getTopic(source.topicId);
  const candidates: DbCandidate[] = errors.map((r) => ({
    id: r.questionId,
    groupCode: r.groupCode,
    imageRef: r.imageRef,
    mediaStatus: null, // resolved below via catalog; mistakes reuse the same assets already verified usable
    statement: r.statement,
    correctAnswer: r.correctAnswer,
    officialQuestionCode: r.officialQuestionCode,
    topicId: source.topicId,
    topicName: r.topic,
    mediaLocalPath: null,
    mediaMime: null,
    mediaWidth: null,
    mediaHeight: null,
  }));

  // media info for the mistakes payload (same centralized policy already applied at source)
  const catalogAll = await fetchCandidates(source.catalogVersionId);
  const mediaById = new Map(catalogAll.map((q) => [q.id, q]));
  const enriched = candidates.map((c) => mediaById.get(c.id) ?? c);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 100 * 365 * 24 * 3600 * 1000);

  const created = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(examSessions)
      .values({
        catalogVersionId: source.catalogVersionId,
        mode: siteConfig.practice.mistakesMode,
        status: "in_progress",
        environment: input.environment ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
        topicId: source.topicId,
        sourceSessionId: source.id,
        feedbackMode: "immediate",
        requestedQuestionCount: errors.length,
        practiceStatus: "in_progress",
        totalQuestions: errors.length,
        allowedErrors: 0,
        durationSeconds: siteConfig.practice.durationSeconds,
        startedAt: now,
        expiresAt,
        selectionSeed: input.seed,
      })
      .returning();
    const rows = enriched.map((q, i) => ({
      sessionId: session.id,
      questionId: q.id,
      position: i + 1,
      flagged: false,
    }));
    if (rows.length) await tx.insert(examSessionQuestions).values(rows);
    return session;
  });

  return { session: created as PracticeSessionRow, questions: enriched, topic, totalErrors: errors.length };
}

// ---------------------------------------------------------------------------
// single-answer verification
// ---------------------------------------------------------------------------

export const answerSchema = z.object({
  questionId: z.string().uuid(),
  selectedAnswer: z.boolean(),
});

/**
 * Verify ONE answer server-side. Idempotent for the same answer; after
 * verification the answer is locked (ALREADY_VERIFIED on further attempts,
 * even with a different value). Never returns solutions of other questions.
 */
export async function verifyPracticeAnswer(sessionId: string, input: unknown): Promise<AnswerCheckResult> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) {
    throw new PracticeServiceError("INVALID_PAYLOAD", `payload non valido: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`);
  }
  const { questionId, selectedAnswer } = parsed.data;

  const session = await getPracticeSession(sessionId);
  if (!session) throw new PracticeServiceError("SESSION_NOT_FOUND", "sessione inesistente");
  assertPracticeMode(session);
  if (session.status !== "in_progress" && session.practiceStatus !== "in_progress") {
    throw new PracticeServiceError("SESSION_COMPLETED", "sessione già completata");
  }

  const row = await db
    .select({
      sessionQuestionId: examSessionQuestions.id,
      questionId: examSessionQuestions.questionId,
      answerVerified: examSessionQuestions.answerVerified,
      selectedAnswer: examSessionQuestions.selectedAnswer,
      correctAnswer: questions.correctAnswer,
    })
    .from(examSessionQuestions)
    .innerJoin(questions, eq(questions.id, examSessionQuestions.questionId))
    .where(and(eq(examSessionQuestions.sessionId, sessionId), eq(examSessionQuestions.questionId, questionId)))
    .limit(1);

  if (!row[0]) throw new PracticeServiceError("QUESTION_NOT_IN_SESSION", "domanda non presente nella sessione");
  const q = row[0];
  if (q.answerVerified === true) {
    // idempotent replay of the SAME verified answer is allowed; any other change is blocked
    if (q.selectedAnswer === selectedAnswer) {
      return {
        questionId,
        selectedAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect: selectedAnswer === q.correctAnswer,
      };
    }
    throw new PracticeServiceError("ALREADY_VERIFIED", "risposta già verificata: non può essere modificata");
  }

  const now = new Date();
  await db
    .update(examSessionQuestions)
    .set({
      selectedAnswer,
      answeredAt: now,
      answerVerified: true,
      verifiedAt: now,
      updatedAt: now,
    })
    .where(eq(examSessionQuestions.id, q.sessionQuestionId));

  return {
    questionId,
    selectedAnswer,
    correctAnswer: q.correctAnswer,
    isCorrect: selectedAnswer === q.correctAnswer,
  };
}

// ---------------------------------------------------------------------------
// complete + result
// ---------------------------------------------------------------------------

/** Compute practice counts from verified rows. Unverified = unanswered (not auto-errors). */
export function computePracticeSummary(
  rows: { selectedAnswer: boolean | null; answerVerified: boolean | null; correctAnswer: boolean }[],
): { correctCount: number; errorCount: number; unansweredCount: number } {
  let correctCount = 0;
  let errorCount = 0;
  let unansweredCount = 0;
  for (const r of rows) {
    if (r.answerVerified !== true || r.selectedAnswer === null) {
      unansweredCount++;
    } else if (r.selectedAnswer === r.correctAnswer) {
      correctCount++;
    } else {
      errorCount++;
    }
  }
  return { correctCount, errorCount, unansweredCount };
}

/** Idempotent completion: already-completed sessions return the stored result. */
export async function completePracticeSession(sessionId: string): Promise<PracticeResult> {
  const session = await getPracticeSession(sessionId);
  if (!session) throw new PracticeServiceError("SESSION_NOT_FOUND", "sessione inesistente");
  assertPracticeMode(session);

  const rows = await getPracticeSessionQuestions(sessionId);
  if (session.status === "completed" && session.practiceStatus === "completed") {
    return buildPracticeResult(session, rows);
  }

  const counts = computePracticeSummary(rows);
  const now = new Date();
  await db
    .update(examSessions)
    .set({
      status: "completed",
      practiceStatus: "completed",
      submittedAt: now,
      completedAt: now,
      correctCount: counts.correctCount,
      errorCount: counts.errorCount,
      unansweredCount: counts.unansweredCount,
      passed: null,
      updatedAt: now,
    })
    .where(eq(examSessions.id, sessionId));

  const updated = await getPracticeSession(sessionId);
  return buildPracticeResult(updated ?? session, rows);
}

/** Pure summary builder (used for both fresh completion and idempotent replay). */
export function buildPracticeResult(session: PracticeSessionRow, rows: PracticeQuestionRow[]): PracticeResult {
  const counts = computePracticeSummary(rows);
  const answered = counts.correctCount + counts.errorCount;
  const percentage = answered > 0 ? Math.round((counts.correctCount / answered) * 100) : 0;
  const end = session.completedAt ?? session.submittedAt ?? new Date();
  const timeUsedSeconds = Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 1000));

  return {
    sessionId: session.id,
    mode: (session.mode as PracticeMode) ?? "practice",
    topic: {
      id: session.topicId ?? "",
      code: "",
      name: rows[0]?.topic ?? "",
      questionCount: session.totalQuestions,
      imageCount: 0,
    },
    totalQuestions: session.totalQuestions,
    correctCount: counts.correctCount,
    errorCount: counts.errorCount,
    unansweredCount: counts.unansweredCount,
    percentage,
    timeUsedSeconds,
    completedAt: (session.completedAt ?? session.submittedAt ?? new Date()).toISOString(),
    answers: rows.map((r) => ({
      questionId: r.questionId,
      position: r.position,
      statement: r.statement,
      topic: r.topic,
      officialQuestionCode: r.officialQuestionCode,
      groupCode: r.groupCode,
      image: r.imageRef ? { url: `/api/media/${r.imageRef}`, width: r.mediaWidth, height: r.mediaHeight } : null,
      selectedAnswer: r.selectedAnswer,
      correctAnswer: r.correctAnswer,
      isCorrect: r.answerVerified === true && r.selectedAnswer !== null && r.selectedAnswer === r.correctAnswer,
      unanswered: r.answerVerified !== true || r.selectedAnswer === null,
    })),
  };
}

export { PracticeGenerationError };
