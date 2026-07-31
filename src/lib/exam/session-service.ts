import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { examSessionQuestions, examSessions, questions, topics } from "../db/schema";
import { siteConfig } from "../../config/site";
import type { DbCandidate } from "./generator";
import { scoreSubmission, submissionResultHash, type ScoreAnswerInput } from "./scoring";
import type { ExamResult, ResultAnswerDetail } from "./types";

/**
 * Session persistence + submission service.
 * Sessions are anonymous in this phase (no user dependency).
 */

export interface SessionRow extends DbCandidate {
  position: number;
}

export interface ExamSessionData {
  id: string;
  catalogVersionId: string;
  mode: string;
  status: string;
  environment: string;
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
}

export async function createExamSession(input: {
  catalogVersionId: string;
  seed: number;
  questions: DbCandidate[];
  environment?: string;
}): Promise<{ session: ExamSessionData; rows: { position: number; questionId: string }[] }> {
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + siteConfig.exam.durationSeconds * 1000);
  const total = input.questions.length;

  const created = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(examSessions)
      .values({
        catalogVersionId: input.catalogVersionId,
        mode: siteConfig.exam.mode,
        status: "in_progress",
        environment: input.environment ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
        totalQuestions: total,
        allowedErrors: siteConfig.exam.allowedErrors,
        durationSeconds: siteConfig.exam.durationSeconds,
        startedAt,
        expiresAt,
        selectionSeed: input.seed,
      })
      .returning();
    const rows = input.questions.map((q, i) => ({
      sessionId: session.id,
      questionId: q.id,
      position: i + 1,
      flagged: false,
    }));
    if (rows.length) await tx.insert(examSessionQuestions).values(rows);
    return { session, rows };
  });

  return {
    session: mapSessionRow(created.session),
    rows: created.rows.map((r) => ({ position: r.position, questionId: r.questionId })),
  };
}

export async function getExamSession(sessionId: string): Promise<ExamSessionData | null> {
  const rows = await db.select().from(examSessions).where(eq(examSessions.id, sessionId)).limit(1);
  return rows[0] ? mapSessionRow(rows[0]) : null;
}

/** Session questions joined with the official statement + solution (server-side only). */
export async function getSessionQuestions(sessionId: string): Promise<
  { id: string; position: number; questionId: string; statement: string; correctAnswer: boolean; officialQuestionCode: string | null; groupCode: string | null; topic: string | null; imageRef: string | null; selectedAnswer: boolean | null; flagged: boolean }[]
> {
  const rows = await db
    .select({
      id: examSessionQuestions.id,
      position: examSessionQuestions.position,
      questionId: examSessionQuestions.questionId,
      statement: questions.statement,
      correctAnswer: questions.correctAnswer,
      officialQuestionCode: questions.officialQuestionCode,
      groupCode: questions.officialGroupCode,
      topic: topics.name,
      imageRef: questions.imageReference,
      selectedAnswer: examSessionQuestions.selectedAnswer,
      flagged: examSessionQuestions.flagged,
    })
    .from(examSessionQuestions)
    .innerJoin(questions, eq(questions.id, examSessionQuestions.questionId))
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .where(eq(examSessionQuestions.sessionId, sessionId))
    .orderBy(asc(examSessionQuestions.position));
  return rows;
}

export class ExamSubmissionError extends Error {
  code: "SESSION_NOT_FOUND" | "ALREADY_SUBMITTED" | "INVALID_PAYLOAD" | "QUESTION_MISMATCH" | "EXPIRED";
  constructor(code: ExamSubmissionError["code"], message: string) {
    super(message);
    this.name = "ExamSubmissionError";
    this.code = code;
  }
}

export const submitPayloadSchema = z.object({
  version: z.number().int().positive(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedAnswer: z.boolean().nullable(),
      }),
    )
    .min(1),
  flagged: z.array(z.string().uuid()).default([]),
});

/** Full server-side submit: validates, scores, persists, returns the result. */
export async function submitExamSession(
  sessionId: string,
  input: unknown,
): Promise<{ result: ExamResult; alreadySubmittedSame: boolean }> {
  const parsed = submitPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ExamSubmissionError("INVALID_PAYLOAD", `payload non valido: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`);
  }
  const payload = parsed.data as { version: number; answers: { questionId: string; selectedAnswer: boolean | null }[]; flagged: string[] };

  if (payload.version !== siteConfig.payloadVersion) {
    throw new ExamSubmissionError("INVALID_PAYLOAD", `versione payload attesa ${siteConfig.payloadVersion}, ricevuta ${payload.version}`);
  }

  const session = await getExamSession(sessionId);
  if (!session) throw new ExamSubmissionError("SESSION_NOT_FOUND", "sessione inesistente");

  const rows = await getSessionQuestions(sessionId);
  const byId = new Map(rows.map((r) => [r.questionId, r]));

  // duplicate / foreign question ids
  const seen = new Set<string>();
  for (const a of payload.answers) {
    if (seen.has(a.questionId)) throw new ExamSubmissionError("QUESTION_MISMATCH", `domanda duplicata: ${a.questionId}`);
    seen.add(a.questionId);
    if (!byId.has(a.questionId)) throw new ExamSubmissionError("QUESTION_MISMATCH", `domanda estranea: ${a.questionId}`);
  }
  if (seen.size !== session.totalQuestions) {
    throw new ExamSubmissionError("QUESTION_MISMATCH", `attese ${session.totalQuestions} domande, ricevute ${seen.size}`);
  }
  for (const f of payload.flagged) {
    if (!byId.has(f)) throw new ExamSubmissionError("QUESTION_MISMATCH", `contrassegno su domanda estranea: ${f}`);
  }

  // expired sessions are still scored (auto-submit path)
  const resultHash = submissionResultHash({ sessionId, answers: payload.answers, flagged: payload.flagged });

  // idempotency / anti-replay
  if (session.status !== "in_progress") {
    if (session.resultHash === resultHash && session.correctCount != null) {
      // same payload already processed -> return stored result
      return { result: storedResult(session, rows, payload), alreadySubmittedSame: true };
    }
    throw new ExamSubmissionError("ALREADY_SUBMITTED", "sessione già consegnata con payload differente");
  }

  const answerMap = new Map(payload.answers.map((a) => [a.questionId, a.selectedAnswer]));
  const flaggedSet = new Set(payload.flagged);
  const scoreInput: ScoreAnswerInput[] = rows.map((r) => ({
    questionId: r.questionId,
    position: r.position,
    selectedAnswer: answerMap.get(r.questionId) ?? null,
    correctAnswer: r.correctAnswer,
  }));
  const score = scoreSubmission({ totalQuestions: session.totalQuestions, allowedErrors: session.allowedErrors, answers: scoreInput });

  const now = new Date();
  await db.transaction(async (tx) => {
    // persist per-question answers
    for (const r of rows) {
      const sel = answerMap.get(r.questionId) ?? null;
      await tx
        .update(examSessionQuestions)
        .set({
          selectedAnswer: sel,
          answeredAt: sel === null ? null : now,
          flagged: flaggedSet.has(r.questionId),
          updatedAt: now,
        })
        .where(eq(examSessionQuestions.id, r.id));
    }
    await tx
      .update(examSessions)
      .set({
        status: "completed",
        submittedAt: now,
        completedAt: now,
        correctCount: score.correctCount,
        errorCount: score.errorCount,
        unansweredCount: score.unansweredCount,
        passed: score.passed,
        resultHash,
        updatedAt: now,
      })
      .where(eq(examSessions.id, sessionId));
  });

  return {
    result: buildResult(session, payload, rows, score, now),
    alreadySubmittedSame: false,
  };
}

function storedResult(
  session: ExamSessionData,
  rows: { position: number; questionId: string; correctAnswer: boolean }[],
  payload: { answers: { questionId: string; selectedAnswer: boolean | null }[] },
): ExamResult {
  const answerMap = new Map(payload.answers.map((a) => [a.questionId, a.selectedAnswer]));
  const details: ResultAnswerDetail[] = rows.map((r) => {
    const sel = answerMap.get(r.questionId) ?? null;
    return {
      position: r.position,
      questionId: r.questionId,
      selectedAnswer: sel,
      correctAnswer: r.correctAnswer,
      correct: sel !== null && sel === r.correctAnswer,
      unanswered: sel === null,
    };
  });
  return {
    sessionId: session.id,
    version: siteConfig.payloadVersion,
    status: "completed",
    submittedAt: (session.submittedAt ?? session.completedAt ?? new Date()).toISOString(),
    completedAt: (session.completedAt ?? session.submittedAt ?? new Date()).toISOString(),
    totalQuestions: session.totalQuestions,
    correctCount: session.correctCount ?? 0,
    errorCount: session.errorCount ?? 0,
    unansweredCount: session.unansweredCount ?? 0,
    allowedErrors: session.allowedErrors,
    passed: session.passed ?? false,
    timeUsedSeconds: computeTimeUsedSeconds(session),
    answers: details,
  };
}

function buildResult(
  session: ExamSessionData,
  payload: { answers: { questionId: string; selectedAnswer: boolean | null }[] },
  rows: { position: number; questionId: string; correctAnswer: boolean }[],
  score: ReturnType<typeof scoreSubmission>,
  now: Date,
): ExamResult {
  const answerMap = new Map(payload.answers.map((a) => [a.questionId, a.selectedAnswer]));
  return {
    sessionId: session.id,
    version: siteConfig.payloadVersion,
    status: "completed",
    submittedAt: now.toISOString(),
    completedAt: now.toISOString(),
    totalQuestions: session.totalQuestions,
    correctCount: score.correctCount,
    errorCount: score.errorCount,
    unansweredCount: score.unansweredCount,
    allowedErrors: session.allowedErrors,
    passed: score.passed,
    timeUsedSeconds: Math.max(0, Math.round((now.getTime() - session.startedAt.getTime()) / 1000)),
    answers: rows.map((r) => {
      const sel = answerMap.get(r.questionId) ?? null;
      return {
        position: r.position,
        questionId: r.questionId,
        selectedAnswer: sel,
        correctAnswer: r.correctAnswer,
        correct: sel !== null && sel === r.correctAnswer,
        unanswered: sel === null,
      };
    }),
  };
}

function computeTimeUsedSeconds(session: ExamSessionData): number {
  const end = session.completedAt ?? session.submittedAt ?? new Date();
  return Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 1000));
}

function mapSessionRow(row: {
  id: string;
  catalogVersionId: string;
  mode: string;
  status: string;
  environment: string;
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
}): ExamSessionData {
  return { ...row };
}
