import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

/**
 * Shared review-events store (v2 format).
 *
 * Reviews are stored as immutable EVENTS in data/reviews/reviews.json — distinct from the
 * technical media verification status (media_assets.verification_status in PostgreSQL).
 *
 * reviewerType is explicit and never coerced:
 *   - "human":                     explicit action in the local review gallery
 *   - "external_ai_visual_review": external AI visual-review decisions imported from file
 *
 * An event is identified by a deterministic id = sha256(catalogId|assetKey|reviewerType|decision|sourceBatch),
 * which is what makes the import idempotent (same event -> unchanged, never duplicated).
 *
 * File layout (v2):
 *   {
 *     "version": 2,
 *     "reviews": [ ...asset review events... ],
 *     "figureReferenceCaseReviews": [ ...figure-case events (no asset)... ]
 *   }
 * Legacy v1 (plain array of asset events) is accepted on read and upgraded on write.
 */

export const REVIEWS_PATH = join(process.cwd(), "data", "reviews", "reviews.json");

export type ReviewerType = "human" | "external_ai_visual_review";
export type ReviewDecision = "confirmed" | "ambiguous" | "rejected" | "no_image_expected";

export interface ReviewEvent {
  /** deterministic id (idempotency key) */
  id: string;
  catalogId: string;
  /** asset sha256 (null only for figure-reference cases) */
  assetHash: string | null;
  /** set for figure-reference cases (no asset) */
  officialQuestionCode?: string;
  questionIds: string[];
  decision: ReviewDecision;
  reviewerType: ReviewerType;
  reviewerLabel?: string;
  /** ISO timestamp of the decision (from the source for imported events) */
  reviewedAt: string;
  /** how it was recorded: "gallery" | "external_ai_import" */
  method: string;
  note?: string;
  /** import batch identifier (e.g. source file sha256 short) */
  sourceBatch?: string;
}

export interface ReviewsFile {
  version: 2;
  reviews: ReviewEvent[];
  figureReferenceCaseReviews: ReviewEvent[];
}

export function reviewEventId(parts: (string | number | null | undefined)[]): string {
  return createHash("sha256").update(parts.filter((p) => p != null).join("|")).digest("hex");
}

/** Human review (by any decision) for the same asset. */
export function humanReviewsFor(reviews: ReviewEvent[], assetHash: string | null, code?: string): ReviewEvent[] {
  return reviews.filter((r) => r.reviewerType === "human" && (assetHash != null ? r.assetHash === assetHash : r.officialQuestionCode === code));
}

/** True when a human review exists for the asset and disagrees with the incoming event. */
export function isHumanConflict(existing: ReviewEvent[], incoming: ReviewEvent): boolean {
  const humans = humanReviewsFor(existing, incoming.assetHash, incoming.officialQuestionCode);
  return humans.length > 0 && humans.some((h) => h.decision !== incoming.decision);
}

/** Normalize legacy v1 (plain array) into v2. */
export function normalizeReviewsFile(raw: unknown): ReviewsFile {
  if (Array.isArray(raw)) {
    const reviews = raw as Array<Partial<ReviewEvent> & { timestamp?: string }>;
    return {
      version: 2,
      reviews: reviews.map((r) => ({
        id: r.id ?? reviewEventId([r.catalogId ?? "", r.assetHash ?? "", r.reviewerType ?? "", r.decision ?? "", r.sourceBatch ?? ""]),
        catalogId: r.catalogId ?? "",
        assetHash: r.assetHash ?? null,
        questionIds: r.questionIds ?? [],
        decision: r.decision ?? "confirmed",
        reviewerType: r.reviewerType ?? "human",
        reviewerLabel: r.reviewerLabel,
        reviewedAt: r.reviewedAt ?? r.timestamp ?? new Date(0).toISOString(),
        method: r.method ?? "gallery",
        note: r.note,
        sourceBatch: r.sourceBatch,
      })),
      figureReferenceCaseReviews: [],
    };
  }
  const obj = raw as Partial<ReviewsFile>;
  return {
    version: 2,
    reviews: Array.isArray(obj.reviews) ? (obj.reviews as ReviewEvent[]) : [],
    figureReferenceCaseReviews: Array.isArray(obj.figureReferenceCaseReviews)
      ? (obj.figureReferenceCaseReviews as ReviewEvent[])
      : [],
  };
}

export async function loadReviewsFile(path: string = REVIEWS_PATH): Promise<ReviewsFile> {
  if (!existsSync(path)) return { version: 2, reviews: [], figureReferenceCaseReviews: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf-8"));
  } catch {
    // unreadable/corrupt -> treat as empty (never destroy the file on write errors)
    return { version: 2, reviews: [], figureReferenceCaseReviews: [] };
  }
  return normalizeReviewsFile(raw);
}

/** Atomic write: temp file in the same directory + rename. */
export async function saveReviewsFile(data: ReviewsFile, path: string = REVIEWS_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  await rename(tmp, path);
}
