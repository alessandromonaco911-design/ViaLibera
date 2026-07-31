import type { VerificationStatus } from "./types";

/**
 * Media verification model.
 *
 * Statuses (semantically distinct):
 * - extracted:            image successfully extracted from the official source
 * - structurally_verified: passed ALL automated checks below
 * - visually_verified:    content confirmed by an explicit human action in the review gallery
 * - ambiguous:            association not sufficiently certain
 * - missing:              expected image not available
 * - rejected:             invalid file or invalid association
 *
 * A resource is NEVER visually_verified without a recorded human review.
 * reviewerType is 'automated' for pipeline decisions and becomes 'human' only
 * after an explicit action in the review gallery.
 */

export interface AssetChecks {
  hash: string;
  /** decoded PNG valid (signature + IHDR + positive dimensions) */
  pngValid: boolean;
  /** extracted from the official source file */
  officialSource: boolean;
  /** mapped to at least one question */
  mapped: boolean;
  /** no association flagged ambiguous */
  noAmbiguous: boolean;
  /** minimum structural confidence across associations */
  minConfidence: number;
  /** all image bboxes within page bounds */
  bboxWithinPage: boolean;
  /** file present on disk */
  filePresent: boolean;
}

export const CONFIDENCE_THRESHOLD = 0.5;

export interface VerificationDecision {
  status: VerificationStatus;
  method: string;
  reason: string;
}

export function verifyAsset(checks: AssetChecks): VerificationDecision {
  if (!checks.filePresent) {
    return { status: "missing", method: "pipeline:auto", reason: "file assente su filesystem" };
  }
  if (!checks.pngValid) {
    return { status: "rejected", method: "pipeline:auto", reason: "PNG non valido o dimensioni nulle" };
  }
  if (!checks.officialSource) {
    return { status: "rejected", method: "pipeline:auto", reason: "provenienza non ufficiale" };
  }
  if (!checks.mapped) {
    return { status: "extracted", method: "pipeline:auto", reason: "estratta ma non associata ad alcuna domanda" };
  }
  if (!checks.noAmbiguous || checks.minConfidence < CONFIDENCE_THRESHOLD) {
    return {
      status: "ambiguous",
      method: "pipeline:auto",
      reason: `associazione incerta (ambiguous=${!checks.noAmbiguous}, minConfidence=${checks.minConfidence})`,
    };
  }
  if (!checks.bboxWithinPage) {
    return { status: "ambiguous", method: "pipeline:auto", reason: "coordinate fuori dalla pagina" };
  }
  return {
    status: "structurally_verified",
    method: "pipeline:auto",
    reason: "file valido, provenienza ufficiale, mappatura posizionale 1:1, confidence >= soglia",
  };
}

export interface ReviewRecord {
  assetHash: string;
  questionIds: string[];
  decision: "confirmed" | "ambiguous" | "rejected";
  timestamp: string;
  method: string; // e.g. 'gallery'
  reviewerType: "human";
  note?: string;
  catalogId: string;
}

/** Apply human reviews: a 'confirmed' decision promotes an asset to visually_verified. */
export function applyReviewToAsset(
  current: VerificationStatus,
  review: ReviewRecord,
): { status: VerificationStatus; method: string; verifiedByType: string; note?: string } {
  if (review.decision === "confirmed") {
    return {
      status: "visually_verified",
      method: review.method,
      verifiedByType: "human",
      note: review.note,
    };
  }
  if (review.decision === "ambiguous") {
    return { status: "ambiguous", method: review.method, verifiedByType: "human", note: review.note };
  }
  // rejected
  return { status: "rejected", method: review.method, verifiedByType: "human", note: review.note };
}

export function pngIsValid(data: Uint8Array): { valid: boolean; width: number; height: number } {
  if (data.length < 24) return { valid: false, width: 0, height: 0 };
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== sig[i]) return { valid: false, width: 0, height: 0 };
  }
  if (data[12] !== 0x49 || data[13] !== 0x48 || data[14] !== 0x44 || data[15] !== 0x52) {
    return { valid: false, width: 0, height: 0 };
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return { valid: width > 0 && height > 0, width, height };
}
