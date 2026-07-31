import { createHash } from "node:crypto";

/**
 * Pure exam scoring (server-side). The client payload is never trusted for
 * correctness: solutions come from the database at submit time.
 *
 * Rules (exam-format compatible):
 * - a correct answer counts 1 correct;
 * - an incorrect answer counts 1 error;
 * - an unanswered question counts as an error;
 * - passed when errorCount <= allowedErrors.
 */

export interface ScoreAnswerInput {
  questionId: string;
  position: number;
  selectedAnswer: boolean | null;
  correctAnswer: boolean;
}

export interface ScoreInput {
  totalQuestions: number;
  allowedErrors: number;
  answers: ScoreAnswerInput[];
}

export interface ScoreOutput {
  correctCount: number;
  errorCount: number;
  unansweredCount: number;
  passed: boolean;
}

export function scoreSubmission(input: ScoreInput): ScoreOutput {
  let correctCount = 0;
  let errorCount = 0;
  let unansweredCount = 0;
  for (const a of input.answers) {
    if (a.selectedAnswer === null || a.selectedAnswer === undefined) {
      unansweredCount++;
      errorCount++;
    } else if (a.selectedAnswer === a.correctAnswer) {
      correctCount++;
    } else {
      errorCount++;
    }
  }
  return {
    correctCount,
    errorCount,
    unansweredCount,
    passed: errorCount <= input.allowedErrors,
  };
}

/** Deterministic hash of a submission — idempotency/anti-replay key. */
export function submissionResultHash(input: {
  sessionId: string;
  answers: { questionId: string; selectedAnswer: boolean | null }[];
  flagged: string[];
}): string {
  const sorted = [...input.answers].sort((a, b) => (a.questionId < b.questionId ? -1 : 1));
  const flagged = [...input.flagged].sort();
  return createHash("sha256")
    .update(JSON.stringify({ sessionId: input.sessionId, answers: sorted, flagged }))
    .digest("hex");
}
