import { siteConfig } from "../../config/site";
import type { DbCandidate } from "./generator";
import type { PublicExamPayload, PublicExamQuestion } from "./types";

/**
 * Maps DB rows -> public payload. This is the ONLY place where the public
 * question shape is built: it must never leak correctAnswer, parser metadata,
 * filesystem paths, PDF coordinates or review internals.
 */

export function mediaUrlFor(imageRef: string | null): string | null {
  if (!imageRef) return null;
  // imageRef is the media sha256; served by the controlled media route
  return `/api/media/${imageRef}`;
}

export function toPublicQuestion(c: DbCandidate, position: number): PublicExamQuestion {
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

export function buildPublicPayload(input: {
  sessionId: string;
  status: "in_progress" | "submitted" | "completed" | "expired";
  seed: number;
  startedAt: Date;
  expiresAt: Date;
  questions: DbCandidate[];
}): PublicExamPayload {
  return {
    sessionId: input.sessionId,
    version: siteConfig.payloadVersion,
    status: input.status,
    totalQuestions: input.questions.length,
    allowedErrors: siteConfig.exam.allowedErrors,
    durationSeconds: siteConfig.exam.durationSeconds,
    startedAt: input.startedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    seed: input.seed,
    questions: input.questions.map((q, i) => toPublicQuestion(q, i + 1)),
  };
}
