import { z } from "zod";

/** Shared zod schemas for the pipeline outputs (questions.jsonl, media.json, ...). */

export const questionSchema = z.object({
  page: z.number().int().positive(),
  questionNumber: z.string().regex(/^\d{5}$/, "officialQuestionCode deve essere di 5 cifre"),
  groupCode: z.string().regex(/^\d+$/, "officialGroupCode deve essere numerico"),
  topic: z.string().min(1),
  statement: z.string().min(1),
  correctAnswer: z.boolean(),
  imageRef: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  imageBBox: z
    .object({
      page: z.number().int().positive(),
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    })
    .nullable(),
  rowBand: z.object({ bottom: z.number(), top: z.number() }).nullable(),
  structuralConfidence: z.number().min(0).max(1).nullable(),
  sourceLineStart: z.number().int().positive(),
  sourceLineEnd: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const groupSchema = z.object({
  code: z.string().regex(/^\d+$/),
  topic: z.string().min(1),
  page: z.number().int().positive(),
  line: z.number().int().positive(),
});

export const topicSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const mediaSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.string(),
  ext: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  questions: z.array(z.string()),
  verificationStatus: z.enum([
    "extracted",
    "structurally_verified",
    "visually_verified",
    "ambiguous",
    "missing",
    "rejected",
  ]),
  verificationMethod: z.string(),
  minConfidence: z.number().min(0).max(1),
  pageFirstSeen: z.number().int().positive(),
});

export type ParsedQuestionInput = z.infer<typeof questionSchema>;
export type MediaAssetInput = z.infer<typeof mediaSchema>;
