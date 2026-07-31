/**
 * Public/exchange types for the practice (allenamento) and mistakes
 * (ripasso errori) modes.
 *
 * The PUBLIC payload deliberately contains NO correct answers for questions
 * that have not been verified yet. The only place where a correct answer can
 * be revealed is the single-answer verification endpoint.
 */

export type PracticeMode = "practice" | "mistakes";

export interface PublicPracticeImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface PublicPracticeQuestion {
  id: string;
  position: number;
  statement: string;
  image: PublicPracticeImage | null;
  officialQuestionCode: string | null;
  groupCode: string | null;
  topic: string | null;
}

export interface PracticeTopicSummary {
  id: string;
  name: string;
  /** short stable code (e.g. 'segnali-pericolo') */
  code: string;
  questionCount: number;
  imageCount: number;
}

export interface PublicPracticePayload {
  sessionId: string;
  version: number;
  mode: PracticeMode;
  status: "in_progress" | "completed";
  topic: PracticeTopicSummary;
  /** how many questions the user asked for (10/20/30) */
  requestedQuestionCount: number;
  totalQuestions: number;
  /** true for practice modes (no timer, no expiry) */
  untimed: true;
  startedAt: string;
  seed: number;
  /** source session for mistakes mode, null otherwise */
  sourceSessionId: string | null;
  questions: PublicPracticeQuestion[];
}

/** Per-question state returned by GET (verification state, no hidden solutions). */
export interface PracticeQuestionState {
  questionId: string;
  position: number;
  selectedAnswer: boolean | null;
  /** true once the answer has been verified server-side */
  verified: boolean;
  /** present only for verified questions */
  isCorrect: boolean | null;
}

export interface PracticeStateResponse extends PublicPracticePayload {
  questions: PublicPracticeQuestion[];
  states: PracticeQuestionState[];
}

/** Single-answer verification result (the ONLY place a solution is revealed). */
export interface AnswerCheckResult {
  questionId: string;
  selectedAnswer: boolean;
  correctAnswer: boolean;
  isCorrect: boolean;
}

/** Final practice summary (idempotent). */
export interface PracticeResult {
  sessionId: string;
  mode: PracticeMode;
  topic: PracticeTopicSummary;
  totalQuestions: number;
  correctCount: number;
  errorCount: number;
  unansweredCount: number;
  /** correct / answered (answered = correct + errors); 0 when nothing answered */
  percentage: number;
  /** seconds elapsed since start */
  timeUsedSeconds: number;
  completedAt: string;
  answers: PracticeResultAnswer[];
}

export interface PracticeResultAnswer {
  questionId: string;
  position: number;
  statement: string;
  topic: string | null;
  officialQuestionCode: string | null;
  groupCode: string | null;
  image: { url: string; width: number | null; height: number | null } | null;
  selectedAnswer: boolean | null;
  correctAnswer: boolean;
  isCorrect: boolean;
  unanswered: boolean;
}
