import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ImageLike, ParsedQuestion } from "./lib/types";

/**
 * Figure-reference audit (FASE 5).
 * Finds questions whose text mentions figures/signs but which have NO image
 * association, and classifies each case with evidence.
 *
 * Two patterns:
 * - strictFigureRef: genuine figure references (raffigurato, in figura, di figura,
 *   illustrato, il simbolo) — a match here with no image is serious.
 * - looseSignRef: generic mentions of signs/panels (il segnale, il pannello)
 *   that are often linguistic uses rather than figure references.
 */

export const STRICT_FIGURE_RE =
  /\b(raffigurato|raffigurata|illustrato|illustrata|simbolo)\b|in figura|di figura|come in figura|nella figura/i;
export const LOOSE_SIGN_RE = /\bil segnale\b|\bil pannello\b|\bil simbolo\b/i;

export type FigureClassification =
  | "no_image_expected"
  | "likely_missing"
  | "positional_mapping_failure"
  | "textual_false_positive"
  | "ambiguous";

export interface FigureCase {
  officialQuestionCode: string;
  officialGroupCode: string;
  statement: string;
  page: number;
  pageHasImages: boolean;
  nearbyImages: { name: string; x: number; y: number; w: number; h: number; hash: string }[];
  mediaRelation: string | null;
  reason: string;
  classification: FigureClassification;
  evidence: string[];
  requiresHumanReview: boolean;
}

/** Pure classification used by the audit report and by tests. */
export function classifyFigureCase(
  q: ParsedQuestion,
  pageHasImages: boolean,
  nearbyImages: ImageLike[],
  strictRef: boolean,
): Pick<FigureCase, "classification" | "reason" | "evidence" | "requiresHumanReview"> {
  const evidence: string[] = [];
  if (!pageHasImages) evidence.push("la pagina non contiene alcuna immagine (verificato sulle posizioni estratte)");
  if (strictRef) evidence.push("il testo contiene un riferimento esplicito a figura (raffigurato/in figura/di figura/illustrato/simbolo)");
  else evidence.push("il testo contiene solo un uso generico di 'il segnale'/'il pannello' (nessun riferimento esplicito a figura)");
  if (nearbyImages.length === 0 && pageHasImages) evidence.push("nessuna immagine vicina alla banda della riga");
  else if (nearbyImages.length > 0) evidence.push(`immagini vicine presenti ma non sovrapposte alla banda: ${nearbyImages.length}`);

  if (strictRef && pageHasImages) {
    if (nearbyImages.length > 0) {
      return {
        classification: "positional_mapping_failure",
        reason: "riferimento esplicito a figura su pagina con immagini ma nessuna immagine sovrapposta alla banda di riga",
        evidence,
        requiresHumanReview: true,
      };
    }
    return {
      classification: "likely_missing",
      reason: "riferimento esplicito a figura su pagina con immagini, nessun candidato nella banda",
      evidence,
      requiresHumanReview: true,
    };
  }
  if (strictRef && !pageHasImages) {
    return {
      classification: "likely_missing",
      reason: "riferimento esplicito a figura ma la pagina non contiene immagini (possibile problema di estrazione)",
      evidence,
      requiresHumanReview: true,
    };
  }
  if (!strictRef && pageHasImages) {
    return {
      classification: "ambiguous",
      reason: "uso generico di 'il segnale'/'il pannello' su pagina con immagini: da confermare visivamente",
      evidence,
      requiresHumanReview: true,
    };
  }
  return {
    classification: "textual_false_positive",
    reason: "uso linguistico generico di 'il segnale'/'il pannello' su pagina senza immagini (nessuna figura attesa)",
    evidence,
    requiresHumanReview: false,
  };
}

export async function buildFigureAudit(catalogId: string, pdf: {
  images: ImageLike[];
  numberCells: { page: number; str: string; x: number; y: number }[];
}): Promise<FigureCase[]> {
  const ROOT = process.cwd();
  const pDir = join(ROOT, "data", "processed", catalogId);
  const lines = (await readFile(join(pDir, "questions.jsonl"), "utf-8")).split("\n").filter(Boolean);
  const questions = lines.map((l) => JSON.parse(l) as ParsedQuestion);

  const paintPages = new Set<number>();
  for (const im of pdf.images) if (im.x > 350) paintPages.add(im.page);

  const cellsByPage = new Map<number, Map<string, number>>();
  for (const c of pdf.numberCells) {
    if (!cellsByPage.has(c.page)) cellsByPage.set(c.page, new Map());
    cellsByPage.get(c.page)!.set(c.str, c.y);
  }

  const cases: FigureCase[] = [];
  for (const q of questions) {
    if (q.imageRef) continue;
    const strict = STRICT_FIGURE_RE.test(q.statement);
    const loose = LOOSE_SIGN_RE.test(q.statement);
    if (!strict && !loose) continue;

    const pageHasImages = paintPages.has(q.page);
    const baseline = cellsByPage.get(q.page)?.get(q.questionNumber);
    let nearby: ImageLike[] = [];
    if (baseline !== undefined) {
      nearby = pdf.images
        .filter((im) => im.page === q.page && im.x > 350 && Math.abs(im.y + im.h / 2 - baseline) < 90)
        .map((im) => ({ ...im, data: undefined as never }));
    }

    const verdict = classifyFigureCase(q, pageHasImages, nearby, strict);
    cases.push({
      officialQuestionCode: q.questionNumber,
      officialGroupCode: q.groupCode,
      statement: q.statement,
      page: q.page,
      pageHasImages,
      nearbyImages: nearby.map(({ name, x, y, w, h, hash }) => ({ name, x, y, w, h, hash })),
      mediaRelation: q.imageRef,
      reason: verdict.reason,
      classification: verdict.classification,
      evidence: verdict.evidence,
      requiresHumanReview: verdict.requiresHumanReview,
    });
  }
  return cases;
}

async function main() {
  const catalogId = process.argv[2] ?? "ab-2025-04-23";
  const cache = JSON.parse(
    await readFile(join(process.cwd(), "data", "processed", ".cache", catalogId, "positions.json"), "utf-8"),
  ) as { images: ImageLike[]; numberCells: { page: number; str: string; x: number; y: number }[] };

  if (!existsSync(join(process.cwd(), "data", "processed", catalogId, "questions.jsonl"))) {
    console.error("processed output mancante; eseguire npm run data:parse");
    process.exit(1);
  }

  const cases = await buildFigureAudit(catalogId, cache);
  const byClass = new Map<string, number>();
  for (const c of cases) byClass.set(c.classification, (byClass.get(c.classification) ?? 0) + 1);

  const report = {
    catalogId,
    generatedAt: new Date().toISOString(),
    patterns: {
      strictFigureRef: STRICT_FIGURE_RE.source,
      looseSignRef: LOOSE_SIGN_RE.source,
    },
    summary: Object.fromEntries(byClass),
    requiresHumanReview: cases.filter((c) => c.requiresHumanReview).length,
    cases,
  };

  const reportDir = join(process.cwd(), "data", "reports");
  await mkdir(reportDir, { recursive: true });
  const out = join(reportDir, `figure-reference-audit-${catalogId}.json`);
  await writeFile(out, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n=== FIGURE-REFERENCE AUDIT ===");
  console.log("cases:", cases.length, "| by class:", JSON.stringify(Object.fromEntries(byClass)));
  console.log("requiresHumanReview:", report.requiresHumanReview);
  console.log("Report:", out);
}

const isMain =
  process.argv[1] !== undefined &&
  (import.meta.url === pathToFileURL(process.argv[1]).href ||
    // fallback: tsx/Windows may pass a differently-cased path
    process.argv[1].replace(/\\/g, "/").endsWith("scripts/data/figure-audit.ts"));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
