import { createHash } from "node:crypto";
import bank from "@/data/practice-explanations.json";
import type { PracticeExplanation } from "./types";

export interface ExplanationEntry extends PracticeExplanation {
  status: "draft" | "verified_sources";
  officialQuestionCode: string;
  verifiedAt: string | null;
}

export function explanationKey(question: { statement: string; correctAnswer: boolean; imageRef: string | null }): string {
  return createHash("sha256").update(`${question.statement.replace(/\s+/g, " ").trim()}|${question.correctAnswer ? "V" : "F"}|${question.imageRef ?? "none"}`).digest("hex");
}

/** Content binding prevents reuse when the official statement, solution or figure changes. */
export function getPracticeExplanation(question: { statement: string; correctAnswer: boolean; imageRef: string | null }): PracticeExplanation | null {
  const entry = (bank.entries as Record<string, ExplanationEntry>)[explanationKey(question)];
  if (!entry || entry.status !== "verified_sources" || !entry.verifiedAt) return null;
  return { text: entry.text, remember: entry.remember, sourceLabel: entry.sourceLabel, sourceUrl: entry.sourceUrl };
}
