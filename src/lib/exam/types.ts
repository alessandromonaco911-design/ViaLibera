import { siteConfig } from "../../config/site";

/**
 * Public/exchange types for the exam vertical slice.
 * The PUBLIC payload deliberately contains NO correct answers, NO parser
 * metadata, NO filesystem paths, NO PDF coordinates, NO review internals.
 */

// ---------------------------------------------------------------------------
// public quiz payload (what the client is allowed to see pre-submission)
// ---------------------------------------------------------------------------

export interface PublicExamImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface PublicExamQuestion {
  id: string;
  position: number;
  statement: string;
  image: PublicExamImage | null;
  officialQuestionCode: string | null;
  groupCode: string | null;
  topic: string | null;
}

export interface ExamTimes {
  startedAt: string;
  expiresAt: string;
  durationSeconds: number;
}

export interface PublicExamPayload extends ExamTimes {
  sessionId: string;
  version: number;
  status: "in_progress" | "submitted" | "completed" | "expired";
  totalQuestions: number;
  allowedErrors: number;
  seed: number;
  questions: PublicExamQuestion[];
}

/** GET state: adds the currently persisted per-question state (empty pre-submit). */
export interface ExamStateResponse extends PublicExamPayload {
  answers: { position: number; selectedAnswer: boolean | null; flagged: boolean }[];
}

// ---------------------------------------------------------------------------
// submit payload (from the client)
// ---------------------------------------------------------------------------

export const SUBMIT_SCHEMA_REF = `vialibera:submit:v${siteConfig.payloadVersion}`;

export interface SubmitAnswerInput {
  questionId: string;
  /** null = unanswered */
  selectedAnswer: boolean | null;
}

export interface SubmitExamInput {
  version: number;
  answers: SubmitAnswerInput[];
  flagged: string[]; // questionIds flagged by the user
}

// ---------------------------------------------------------------------------
// correction result (server-computed)
// ---------------------------------------------------------------------------

export interface ResultAnswerDetail {
  position: number;
  questionId: string;
  selectedAnswer: boolean | null;
  correctAnswer: boolean;
  correct: boolean;
  unanswered: boolean;
}

export interface ExamResult {
  sessionId: string;
  version: number;
  status: "completed";
  submittedAt: string;
  completedAt: string;
  totalQuestions: number;
  correctCount: number;
  errorCount: number;
  unansweredCount: number;
  allowedErrors: number;
  passed: boolean;
  timeUsedSeconds: number;
  answers: ResultAnswerDetail[];
}
