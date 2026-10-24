import { siteConfig } from "../../config/site";
import { mediaUrlFor } from "../exam/payload";
import { getPracticeExplanation } from "./explanations";
import type { DbCandidate } from "../exam/generator";
import type {
  PracticeMode,
  PracticeQuestionState,
  PracticeTopicSummary,
  PublicPracticePayload,
  PublicPracticeQuestion,
} from "./types";

/**
 * Maps DB rows -> public practice payload. Deliberately NEVER exposes
 * correctAnswer for unverified questions: solutions are revealed only by
 * the single-answer verification endpoint.
 */

export function toPublicPracticeQuestion(c: DbCandidate, position: number): PublicPracticeQuestion {
  return {
    id: c.id,
    position,
    statement: c.statement,
    image: c.imageRef
      ? {
          url: mediaUrlFor(c.imageRef)!,
          width: c.mediaWidth,
          height: c.mediaHeight,
        }
      : null,
    officialQuestionCode: c.officialQuestionCode,
    groupCode: c.groupCode,
    topic: c.topicName,
  };
}

export function toTopicSummary(input: { id: string; code: string; name: string; questionCount: number; imageCount: number }): PracticeTopicSummary {
  return {
    id: input.id,
    name: input.name,
    code: input.code,
    questionCount: input.questionCount,
    imageCount: input.imageCount,
  };
}

export function buildPublicPracticePayload(input: {
  sessionId: string;
  mode: PracticeMode;
  status: "in_progress" | "completed";
  topic: { id: string; code: string; name: string; questionCount?: number; imageCount?: number };
  requestedQuestionCount: number;
  totalQuestions: number;
  startedAt: Date;
  seed: number;
  sourceSessionId: string | null;
  questions: DbCandidate[];
  continuous?: boolean;
}): PublicPracticePayload {
  return {
    ...(input.continuous ? {continuous:true} : {}),
    sessionId: input.sessionId,
    version: siteConfig.payloadVersion,
    mode: input.mode,
    status: input.status,
    topic: toTopicSummary({
      id: input.topic.id,
      code: input.topic.code,
      name: input.topic.name,
      questionCount: input.topic.questionCount ?? input.totalQuestions,
      imageCount: input.topic.imageCount ?? 0,
    }),
    requestedQuestionCount: input.requestedQuestionCount,
    totalQuestions: input.totalQuestions,
    untimed: true,
    startedAt: input.startedAt.toISOString(),
    seed: input.seed,
    sourceSessionId: input.sourceSessionId,
    questions: input.questions.map((q, i) => toPublicPracticeQuestion(q, i + 1)),
  };
}

/**
 * Per-question verification state for GET. For verified questions we also
 * return isCorrect (the user already saw the solution via /answer); for
 * unverified questions NO correctAnswer is ever exposed here.
 */
export function toQuestionStates(
  rows: {
    sessionQuestionId?: string;
    verifiedAt?: Date | null;
    questionId: string;
    position: number;
    selectedAnswer: boolean | null;
    answerVerified: boolean | null;
    correctAnswer: boolean;
    statement?: string;
    imageRef?: string | null;
  }[],
): PracticeQuestionState[] {
  return rows.map((r) => ({
    ...(r.answerVerified === true && r.sessionQuestionId ? { attemptId:r.sessionQuestionId } : {}),
    ...(r.answerVerified === true && r.verifiedAt ? { verifiedAt:r.verifiedAt.toISOString() } : {}),
    questionId: r.questionId,
    position: r.position,
    selectedAnswer: r.selectedAnswer,
    verified: r.answerVerified === true,
    isCorrect: r.answerVerified === true ? (r.selectedAnswer ?? false) === r.correctAnswer : null,
    ...(r.answerVerified === true && r.statement ? { explanation: getPracticeExplanation({ statement: r.statement, correctAnswer: r.correctAnswer, imageRef: r.imageRef ?? null }) } : {}),
  }));
}
