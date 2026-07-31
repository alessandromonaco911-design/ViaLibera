/** Shared types for the official catalog data pipeline. */

export interface GroupHeader {
  code: string;
  topic: string;
  page: number;
  line: number;
}

export interface ImageBBox {
  page: number;
  x: number; // bottom-left, PDF points
  y: number;
  w: number;
  h: number;
}

export interface RowBand {
  /** PDF y (grows upward) */
  bottom: number;
  top: number;
}

export interface ParsedQuestion {
  page: number;
  questionNumber: string;
  groupCode: string;
  topic: string;
  statement: string;
  correctAnswer: boolean;
  /** media asset sha256, null if no image associated */
  imageRef: string | null;
  /** position of the image on the PDF page (filled by the mapper) */
  imageBBox: ImageBBox | null;
  /** vertical band of the question row (filled by the mapper) */
  rowBand: RowBand | null;
  /**
   * Structural confidence 0..1, reproducible:
   * overlapRatio * ambiguityFactor (see lib/mapping.ts). Never implies visual verification.
   */
  structuralConfidence: number | null;
  sourceLineStart: number;
  sourceLineEnd: number;
  contentHash: string;
}

export interface UnrecognizedLine {
  page: number;
  line: number;
  text: string;
}

export interface ParseOutput {
  questions: ParsedQuestion[];
  groups: GroupHeader[];
  unrecognized: UnrecognizedLine[];
}

export interface ParseState {
  out: ParseOutput;
  group: GroupHeader | null;
  globalLineOffset: number;
}

export interface ImageLike {
  page: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hash: string;
}

export interface CellLike {
  page: number;
  str: string;
  x: number;
  y: number;
}

export interface PageDim {
  page: number;
  width: number;
  height: number;
}

export type VerificationStatus =
  | "extracted"
  | "structurally_verified"
  | "visually_verified"
  | "ambiguous"
  | "missing"
  | "rejected";
