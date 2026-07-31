import type { CellLike, ImageLike, PageDim, ParsedQuestion, RowBand } from "./types";

/**
 * Geometry: maps embedded PDF images to question rows and computes a
 * reproducible structural confidence.
 *
 * Row band: [nextRowBaseline + 10, thisBaseline + 10] in PDF points (y grows upward).
 * An image [y, y+h] belongs to a row iff its range overlaps the row band.
 *
 * Confidence scale (0..1), documented and reproducible:
 *   confidence = overlapRatio * centeringFactor * ambiguityFactor
 *   - overlapRatio   : clamp(overlap(imageRange, rowBand) / imageHeight, 0, 1)
 *   - centeringFactor: 1 - clamp(|imageCenter - bandCenter| / bandHeight, 0, 0.5)
 *                      (penalizes images not vertically centered on their row)
 *   - ambiguityFactor : 1.0 if exactly one candidate image overlaps the band,
 *                      0.5 if two or more candidates overlap (ambiguous association)
 * This is a STRUCTURAL score only; it never implies visual verification.
 */

/** Image vertical range that overlaps a band, 0..1 as fraction of image height. */
export function overlapRatio(imY: number, imH: number, band: RowBand): number {
  if (imH <= 0) return 0;
  const overlap = Math.max(0, Math.min(imY + imH, band.top) - Math.max(imY, band.bottom));
  return Math.min(1, overlap / imH);
}

/** Centering penalty: 1 when the image is vertically centered on its row band. */
export function centeringFactor(imY: number, imH: number, band: RowBand): number {
  const bandHeight = band.top - band.bottom;
  if (bandHeight <= 0) return 1;
  const imgCenter = imY + imH / 2;
  const bandCenter = (band.bottom + band.top) / 2;
  const offset = Math.abs(imgCenter - bandCenter) / bandHeight;
  return 1 - Math.min(0.5, offset);
}

export function structuralConfidence(im: { y: number; h: number }, band: RowBand, ambiguous: boolean): number {
  const c =
    overlapRatio(im.y, im.h, band) * centeringFactor(im.y, im.h, band) * (ambiguous ? 0.5 : 1);
  return Number(c.toFixed(3));
}

export interface MappingResult {
  matched: number;
  ambiguous: { page: number; questionNumber: string; candidates: string[] }[];
}

/**
 * Map images to questions per page using row-band overlap.
 * Mutates questions: sets imageRef, imageBBox, rowBand, structuralConfidence.
 */
export function mapImagesToQuestions(
  questions: ParsedQuestion[],
  images: ImageLike[],
  cells: CellLike[],
): MappingResult {
  const cellsByPage = new Map<number, Map<string, number>>();
  for (const c of cells) {
    if (!cellsByPage.has(c.page)) cellsByPage.set(c.page, new Map());
    cellsByPage.get(c.page)!.set(c.str, c.y);
  }

  const questionsByPage = new Map<number, ParsedQuestion[]>();
  for (const q of questions) {
    if (!questionsByPage.has(q.page)) questionsByPage.set(q.page, []);
    questionsByPage.get(q.page)!.push(q);
  }

  const result: MappingResult = { matched: 0, ambiguous: [] };

  for (const [page, pageQuestions] of questionsByPage) {
    // question images live in the right-hand column; the only non-question image
    // in the official PDF is the MIT logo at x≈275
    const pageImages = images.filter((im) => im.page === page && im.x > 350);
    const cellsPage = cellsByPage.get(page) ?? new Map();
    const rows = pageQuestions
      .map((q) => ({ q, baselineY: cellsPage.get(q.questionNumber) }))
      .filter((r): r is { q: ParsedQuestion; baselineY: number } => r.baselineY !== undefined)
      .sort((a, b) => b.baselineY - a.baselineY);

    for (let i = 0; i < rows.length; i++) {
      const { q, baselineY } = rows[i];
      const band: RowBand = {
        bottom: i < rows.length - 1 ? rows[i + 1].baselineY + 10 : baselineY - 76,
        top: baselineY + 10,
      };
      q.rowBand = band;
      const candidates = pageImages.filter((im) => im.y <= band.top && im.y + im.h >= band.bottom);
      if (candidates.length === 1) {
        const im = candidates[0];
        q.imageRef = im.hash;
        q.imageBBox = { page, x: im.x, y: im.y, w: im.w, h: im.h };
        q.structuralConfidence = structuralConfidence(im, band, false);
        result.matched++;
      } else if (candidates.length > 1) {
        const im = candidates[0];
        q.imageRef = im.hash;
        q.imageBBox = { page, x: im.x, y: im.y, w: im.w, h: im.h };
        q.structuralConfidence = structuralConfidence(im, band, true);
        result.ambiguous.push({ page, questionNumber: q.questionNumber, candidates: candidates.map((c) => c.name) });
      }
    }
  }
  return result;
}

/** True if the image bbox lies within the page bounds (with a small tolerance). */
export function bboxWithinPage(im: { x: number; y: number; w: number; h: number }, dim: PageDim | undefined): boolean {
  if (!dim) return false;
  const tol = 2;
  return (
    im.x >= -tol && im.y >= -tol && im.x + im.w <= dim.width + tol && im.y + im.h <= dim.height + tol
  );
}
