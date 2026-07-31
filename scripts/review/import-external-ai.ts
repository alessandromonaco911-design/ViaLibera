import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../src/lib/db";
import { mediaAssets } from "../../src/lib/db/schema";
import type { ParsedQuestion } from "../data/lib/types";
import {
  loadReviewsFile,
  reviewEventId,
  isHumanConflict,
  type ReviewEvent,
  type ReviewsFile,
} from "./reviews-store";
import { persistReportHistory } from "./report-history";

/**
 * Import external AI visual-review decisions (offline review export feedback).
 *
 * Usage:
 *   npm run review:import -- --file <path> --dry-run
 *   npm run review:import -- --file <path> --apply
 *
 * Rules:
 *   - reviewerType is ALWAYS kept as "external_ai_visual_review" (never "human");
 *   - nothing is ever marked "visually_verified" (that stays reserved for human review);
 *   - the 74 confirmed assets get the dedicated technical status
 *     "ai_visually_verified" in the DB (structurally_verified is preserved where no AI review);
 *   - review events are appended to data/reviews/reviews.json (v2, atomic write, idempotent);
 *   - 20848 / 21213 are recorded as figure-reference cases with decision
 *     "no_image_expected" (no asset), keeping their note and origin;
 *   - identical existing events -> "unchanged", never duplicated;
 *   - a later/conflicting HUMAN decision is never overwritten: both events are kept
 *     and the conflict is reported.
 */

const ROOT = process.cwd();
const CATALOG_ID = "ab-2025-04-23";
const DEFAULT_FILE = join(ROOT, "data", "exports", `external-ai-review-decisions-${CATALOG_ID}.json`);
const P_DIR = join(ROOT, "data", "processed", CATALOG_ID);

// ---------------------------------------------------------------------------
// zod schema for the external decisions file
// ---------------------------------------------------------------------------

export const externalAiReviewFileSchema = z.object({
  catalogId: z.string().min(1),
  reviewedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "reviewedAt deve essere una data ISO valida"),
  reviewerType: z.literal("external_ai_visual_review"),
  reviewerLabel: z.string().optional(),
  scope: z
    .object({
      assetsReviewed: z.number().int().nonnegative().optional(),
      questionAssociationsReviewed: z.number().int().nonnegative().optional(),
      figureReferenceCasesReviewed: z.number().int().nonnegative().optional(),
    })
    .optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  summary: z
    .object({
      confirmedAssets: z.number().int().nonnegative().optional(),
      ambiguousAssets: z.number().int().nonnegative().optional(),
      rejectedAssets: z.number().int().nonnegative().optional(),
      noImageExpectedCases: z.number().int().nonnegative().optional(),
      remainingCasesInExport: z.number().int().nonnegative().optional(),
    })
    .optional(),
  assetReviews: z
    .array(
      z.object({
        assetHash: z.string().regex(/^[a-f0-9]{64}$/, "assetHash deve essere sha256 esadecimale"),
        decision: z.enum(["confirmed", "ambiguous", "rejected"]),
        reviewerType: z.literal("external_ai_visual_review"),
        note: z.string().optional(),
        questionCodes: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  figureReferenceCaseReviews: z
    .array(
      z.object({
        officialQuestionCode: z.string().min(1),
        decision: z.enum(["confirmed", "ambiguous", "rejected", "no_image_expected"]),
        reviewerType: z.literal("external_ai_visual_review"),
        note: z.string().optional(),
      }),
    )
    .optional(),
});

export type ExternalAiReviewFile = z.infer<typeof externalAiReviewFileSchema>;

// ---------------------------------------------------------------------------
// catalog context (read from processed output)
// ---------------------------------------------------------------------------

export interface CatalogContext {
  catalogId: string;
  mediaByHash: Map<string, { hash: string; verificationStatus: string }>;
  sampleHashes: Set<string>;
  questionsByCode: Map<string, ParsedQuestion>;
}

export async function loadCatalogContext(catalogId: string = CATALOG_ID): Promise<CatalogContext> {
  const [mediaRaw, questionsRaw, sampleRaw] = await Promise.all([
    readFile(join(P_DIR, "media.json"), "utf-8"),
    readFile(join(P_DIR, "questions.jsonl"), "utf-8"),
    readFile(join(ROOT, "data", "reports", `review-sample-${catalogId}.json`), "utf-8"),
  ]);
  const media = JSON.parse(mediaRaw) as { hash: string; verificationStatus: string }[];
  const questions = questionsRaw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ParsedQuestion);
  const sample = JSON.parse(sampleRaw) as { sample: { hash: string }[] };
  return {
    catalogId,
    mediaByHash: new Map(media.map((m) => [m.hash, m])),
    sampleHashes: new Set(sample.sample.map((s) => s.hash)),
    questionsByCode: new Map(questions.map((q) => [q.questionNumber, q])),
  };
}

// ---------------------------------------------------------------------------
// pure validation + plan computation (unit-testable)
// ---------------------------------------------------------------------------

export interface ImportPlan {
  sourceFilePath: string;
  sourceSha256: string;
  catalogId: string;
  reviewerType: "external_ai_visual_review";
  reviewerLabel?: string;
  reviewedAt: string;
  sourceBatch: string;
  counts: {
    assetReviews: number;
    coveredQuestionCodes: number;
    figureCases: number;
    decisions: Record<string, number>;
  };
  toInsert: ReviewEvent[];
  figureToInsert: ReviewEvent[];
  unchanged: number;
  unchangedFigure: number;
  conflicts: { assetHash: string; humanDecision: string; aiDecision: string; note: string }[];
  missingAssets: string[];
  missingFigureCases: string[];
  invalidAssociations: { assetHash: string; questionCode: string; reason: string }[];
  invalid: string[];
  ok: boolean;
}

export function validateDecisionsFile(
  file: ExternalAiReviewFile,
  ctx: CatalogContext,
): { missingAssets: string[]; missingFigureCases: string[]; invalidAssociations: { assetHash: string; questionCode: string; reason: string }[] } {
  const missingAssets: string[] = [];
  const missingFigureCases: string[] = [];
  const invalidAssociations: { assetHash: string; questionCode: string; reason: string }[] = [];

  for (const a of file.assetReviews) {
    const media = ctx.mediaByHash.get(a.assetHash);
    if (!media) {
      missingAssets.push(a.assetHash);
      continue;
    }
    if (!ctx.sampleHashes.has(a.assetHash)) {
      missingAssets.push(`${a.assetHash} (non nel campione)`);
      continue;
    }
    for (const code of a.questionCodes ?? []) {
      const q = ctx.questionsByCode.get(code);
      if (!q) {
        invalidAssociations.push({ assetHash: a.assetHash, questionCode: code, reason: "codice domanda inesistente" });
      } else if (q.imageRef !== a.assetHash) {
        invalidAssociations.push({
          assetHash: a.assetHash,
          questionCode: code,
          reason: `la domanda è associata all'asset ${q.imageRef?.slice(0, 12) ?? "null"} (non ${a.assetHash.slice(0, 12)})`,
        });
      }
    }
  }

  for (const c of file.figureReferenceCaseReviews ?? []) {
    const q = ctx.questionsByCode.get(c.officialQuestionCode);
    if (!q) missingFigureCases.push(c.officialQuestionCode);
    else if (q.imageRef) missingFigureCases.push(`${c.officialQuestionCode} (ha immagine: ${q.imageRef.slice(0, 12)})`);
  }

  return { missingAssets, missingFigureCases, invalidAssociations };
}

export function computeImportPlan(
  file: ExternalAiReviewFile,
  ctx: CatalogContext,
  existing: ReviewsFile,
  sourceFilePath: string,
  sourceSha256: string,
): ImportPlan {
  const sourceBatch = `external-ai-review-${sourceSha256.slice(0, 12)}`;
  const { missingAssets, missingFigureCases, invalidAssociations } = validateDecisionsFile(file, ctx);

  const existingIds = new Set(
    [...existing.reviews, ...existing.figureReferenceCaseReviews].map((r) => r.id),
  );

  const toInsert: ReviewEvent[] = [];
  const figureToInsert: ReviewEvent[] = [];
  let unchanged = 0;
  let unchangedFigure = 0;
  const conflicts: ImportPlan["conflicts"] = [];

  for (const a of file.assetReviews) {
    if (missingAssets.includes(a.assetHash)) continue;
    const event: ReviewEvent = {
      id: reviewEventId([file.catalogId, a.assetHash, a.reviewerType, a.decision, sourceBatch]),
      catalogId: file.catalogId,
      assetHash: a.assetHash,
      questionIds: a.questionCodes ?? [],
      decision: a.decision,
      reviewerType: "external_ai_visual_review",
      reviewerLabel: file.reviewerLabel,
      reviewedAt: file.reviewedAt,
      method: "external_ai_import",
      note: a.note,
      sourceBatch,
    };
    if (existingIds.has(event.id)) {
      unchanged++;
    } else {
      if (isHumanConflict(existing.reviews, event)) {
        const humans = existing.reviews.filter(
          (r) => r.reviewerType === "human" && r.assetHash === a.assetHash && r.decision !== event.decision,
        );
        for (const h of humans) {
          conflicts.push({
            assetHash: a.assetHash,
            humanDecision: h.decision,
            aiDecision: event.decision,
            note: `decisione umana (${h.reviewedAt}) diversa dalla decisione AI: entrambe conservate`,
          });
        }
      }
      toInsert.push(event);
    }
  }

  for (const c of file.figureReferenceCaseReviews ?? []) {
    if (missingFigureCases.includes(c.officialQuestionCode)) continue;
    const event: ReviewEvent = {
      id: reviewEventId([file.catalogId, `fig:${c.officialQuestionCode}`, c.reviewerType, c.decision, sourceBatch]),
      catalogId: file.catalogId,
      assetHash: null,
      officialQuestionCode: c.officialQuestionCode,
      questionIds: [c.officialQuestionCode],
      decision: c.decision,
      reviewerType: "external_ai_visual_review",
      reviewerLabel: file.reviewerLabel,
      reviewedAt: file.reviewedAt,
      method: "external_ai_import",
      note: c.note,
      sourceBatch,
    };
    if (existingIds.has(event.id)) {
      unchangedFigure++;
    } else {
      if (isHumanConflict(existing.figureReferenceCaseReviews, event)) {
        conflicts.push({
          assetHash: `fig:${c.officialQuestionCode}`,
          humanDecision: "human review exists",
          aiDecision: event.decision,
          note: "figura-reference case con decisione umana preesistente: entrambe conservate",
        });
      }
      figureToInsert.push(event);
    }
  }

  const coveredQuestionCodes = new Set<string>();
  for (const a of file.assetReviews) for (const c of a.questionCodes ?? []) coveredQuestionCodes.add(c);
  const decisions: Record<string, number> = {};
  for (const a of file.assetReviews) decisions[a.decision] = (decisions[a.decision] ?? 0) + 1;
  for (const c of file.figureReferenceCaseReviews ?? []) {
    decisions[`fig:${c.decision}`] = (decisions[`fig:${c.decision}`] ?? 0) + 1;
  }

  return {
    sourceFilePath,
    sourceSha256,
    catalogId: file.catalogId,
    reviewerType: "external_ai_visual_review",
    reviewerLabel: file.reviewerLabel,
    reviewedAt: file.reviewedAt,
    sourceBatch,
    counts: {
      assetReviews: file.assetReviews.length,
      coveredQuestionCodes: coveredQuestionCodes.size,
      figureCases: file.figureReferenceCaseReviews?.length ?? 0,
      decisions,
    },
    toInsert,
    figureToInsert,
    unchanged,
    unchangedFigure,
    conflicts,
    missingAssets,
    missingFigureCases,
    invalidAssociations,
    invalid: [],
    ok: missingAssets.length === 0 && missingFigureCases.length === 0 && invalidAssociations.length === 0,
  };
}

export function mergePlan(existing: ReviewsFile, plan: ImportPlan): ReviewsFile {
  const byId = (arr: ReviewEvent[]) => new Set(arr.map((r) => r.id));
  const reviews = [
    ...existing.reviews.filter((r) => !byId(plan.toInsert).has(r.id)),
    ...plan.toInsert,
  ];
  const figures = [
    ...existing.figureReferenceCaseReviews.filter((r) => !byId(plan.figureToInsert).has(r.id)),
    ...plan.figureToInsert,
  ];
  // stable order: by reviewedAt then assetHash
  const sortEvents = (arr: ReviewEvent[]) =>
    arr.sort((a, b) => (a.reviewedAt < b.reviewedAt ? -1 : a.reviewedAt > b.reviewedAt ? 1 : (a.assetHash ?? "").localeCompare(b.assetHash ?? "")));
  return { version: 2, reviews: sortEvents(reviews), figureReferenceCaseReviews: sortEvents(figures) };
}

// ---------------------------------------------------------------------------
// DB update (technical status), separate from review events
// ---------------------------------------------------------------------------

export interface DbUpdateResult {
  requested: number;
  updatedToAiVerified: number;
  alreadyAiVerified: number;
  humanVerifiedProtected: number;
  missingRows: number;
}

export async function updateMediaStatuses(
  hashes: string[],
  reviewedAt: string,
): Promise<DbUpdateResult> {
  if (hashes.length === 0) {
    return { requested: 0, updatedToAiVerified: 0, alreadyAiVerified: 0, humanVerifiedProtected: 0, missingRows: 0 };
  }
  let requested = 0;
  let updatedToAiVerified = 0;
  let alreadyAiVerified = 0;
  let humanVerifiedProtected = 0;
  let missingRows = 0;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ hash: mediaAssets.sha256, status: mediaAssets.verificationStatus })
      .from(mediaAssets)
      .where(inArray(mediaAssets.sha256, hashes));
    const rowByHash = new Map(rows.map((r) => [r.hash, r.status]));
    const toUpgrade: string[] = [];
    for (const h of hashes) {
      const status = rowByHash.get(h);
      if (status === undefined) {
        missingRows++;
      } else if (status === "ai_visually_verified") {
        alreadyAiVerified++;
      } else if (status === "visually_verified") {
        humanVerifiedProtected++; // never downgrade/overwrite a human visual verification
      } else if (status === "structurally_verified" || status === "extracted" || status === "ambiguous") {
        toUpgrade.push(h);
      } else {
        humanVerifiedProtected++;
      }
    }
    requested = hashes.length;
    if (toUpgrade.length) {
      const res = await tx
        .update(mediaAssets)
        .set({
          verificationStatus: "ai_visually_verified",
          verificationMethod: "external_ai_import",
          verifiedByType: "external_ai_visual_review",
          verifiedAt: new Date(reviewedAt),
          updatedAt: new Date(),
        })
        .where(inArray(mediaAssets.sha256, toUpgrade))
        .returning({ sha256: mediaAssets.sha256 });
      updatedToAiVerified = res.length;
    }
  });

  return { requested, updatedToAiVerified, alreadyAiVerified, humanVerifiedProtected, missingRows };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "--apply") {
      flags.add(a.slice(2));
    } else if (a.startsWith("--file=")) {
      args.file = a.slice("--file=".length);
    } else if (a === "--file") {
      args.file = argv[++i];
    } else if (a.startsWith("--")) {
      flags.add(a.slice(2));
    }
  }
  return { file: args.file, mode: flags.has("apply") ? ("apply" as const) : flags.has("dry-run") ? ("dry-run" as const) : null };
}

async function main() {
  const { file, mode } = parseArgs(process.argv);
  const filePath = file ?? DEFAULT_FILE;
  if (!mode) {
    console.error('Specificare --dry-run oppure --apply');
    process.exit(2);
  }
  if (!existsSync(filePath)) {
    console.error(`File non trovato: ${filePath}`);
    process.exit(1);
  }

  const raw = await readFile(filePath, "utf-8");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  console.log(`file: ${filePath}`);
  console.log(`sha256: ${sha256}`);
  console.log(`mode: ${mode}`);

  // 1. zod validation
  let parsed: ExternalAiReviewFile;
  try {
    parsed = externalAiReviewFileSchema.parse(JSON.parse(raw));
  } catch (e) {
    console.error("VALIDAZIONE SCHEMA FALLITA:");
    console.error(e instanceof z.ZodError ? JSON.stringify(e.issues, null, 2) : String(e));
    process.exit(1);
  }

  // 2. catalog context + plan
  const ctx = await loadCatalogContext(parsed.catalogId);
  const existing = await loadReviewsFile();
  const plan = computeImportPlan(parsed, ctx, existing, filePath, sha256);

  console.log(`catalogo: ${plan.catalogId} (${parsed.catalogId})`);
  console.log(`reviewerType: ${plan.reviewerType}${plan.reviewerLabel ? ` (${plan.reviewerLabel})` : ""}`);
  console.log(`asset present in file: ${plan.counts.assetReviews}`);
  console.log(`question associations covered: ${plan.counts.coveredQuestionCodes}`);
  console.log(`figure-reference cases: ${plan.counts.figureCases}`);
  console.log(`decisions: ${JSON.stringify(plan.counts.decisions)}`);
  console.log(`recensioni già presenti nello store: ${existing.reviews.length} asset + ${existing.figureReferenceCaseReviews.length} casi figura`);
  console.log(`da inserire: ${plan.toInsert.length} asset + ${plan.figureToInsert.length} casi figura`);
  console.log(`unchanged: ${plan.unchanged} asset + ${plan.unchangedFigure} casi figura`);
  console.log(`conflitti con decisioni umane: ${plan.conflicts.length}`);
  if (plan.conflicts.length) for (const c of plan.conflicts) console.log(`  - ${c.assetHash.slice(0, 12)}: umano=${c.humanDecision} AI=${c.aiDecision}`);
  console.log(`record non trovati: ${plan.missingAssets.length} asset + ${plan.missingFigureCases.length} casi figura`);
  for (const m of plan.missingAssets) console.log(`  - missing asset: ${m}`);
  for (const m of plan.missingFigureCases) console.log(`  - missing figure case: ${m}`);
  for (const a of plan.invalidAssociations) console.log(`  - associazione non valida: ${a.assetHash.slice(0, 12)} / ${a.questionCode}: ${a.reason}`);
  console.log(`modifiche previste: reviews.json +${plan.toInsert.length + plan.figureToInsert.length} eventi; DB media_assets: fino a ${plan.toInsert.length} righe -> ai_visually_verified`);

  if (!plan.ok) {
    console.error("\nVALIDAZIONE CONTENUTO FALLITA: nessuna scrittura eseguita.");
    process.exit(1);
  }

  if (mode === "dry-run") {
    console.log("\nDRY-RUN: nessuna scrittura su database o file di review.");
    return;
  }

  // ---- apply ----
  const merged = mergePlan(existing, plan);

  // write temp review file (final rename only after DB tx succeeds)
  const tmpPath = join(ROOT, "data", "reviews", `reviews.json.tmp-${process.pid}`);
  const reviewsDir = join(ROOT, "data", "reviews");
  await mkdir(reviewsDir, { recursive: true });
  await writeFile(tmpPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");

  let dbResult: DbUpdateResult;
  try {
    dbResult = await updateMediaStatuses(plan.toInsert.map((e) => e.assetHash!).filter(Boolean), plan.reviewedAt);
  } catch (e) {
    await rm(tmpPath, { force: true });
    console.error("ERRORE DB: rollback eseguito (file review NON toccato).", e);
    process.exit(1);
  }

  // commit review file
  await rename(tmpPath, join(reviewsDir, "reviews.json"));

  // idempotency re-check: second apply of the same events must be all-unchanged
  const after = await loadReviewsFile();
  const replan = computeImportPlan(parsed, ctx, after, filePath, sha256);

  // report
  const report = {
    sourceFilePath: filePath,
    sourceSha256: sha256,
    importedAt: new Date().toISOString(),
    catalogId: plan.catalogId,
    reviewerType: plan.reviewerType,
    reviewerLabel: plan.reviewerLabel ?? null,
    reviewedAt: plan.reviewedAt,
    sourceBatch: plan.sourceBatch,
    counts: {
      assetReviews: plan.counts.assetReviews,
      coveredQuestionCodes: plan.counts.coveredQuestionCodes,
      figureReferenceCases: plan.counts.figureCases,
      decisions: plan.counts.decisions,
      existingStoreReviews: existing.reviews.length,
      existingStoreFigureCases: existing.figureReferenceCaseReviews.length,
    },
    inserted: { assets: plan.toInsert.length, figureCases: plan.figureToInsert.length },
    unchanged: { assets: plan.unchanged, figureCases: plan.unchangedFigure },
    conflicts: plan.conflicts,
    missing: { assets: plan.missingAssets, figureCases: plan.missingFigureCases },
    invalidAssociations: plan.invalidAssociations,
    invalid: plan.invalid,
    dbUpdate: dbResult,
    idempotency: {
      secondRunInserted: replan.toInsert.length + replan.figureToInsert.length,
      secondRunUnchanged: replan.unchanged + replan.unchangedFigure,
      ok: replan.toInsert.length + replan.figureToInsert.length === 0,
    },
    ok: true,
  };
  await mkdir(join(ROOT, "data", "reports"), { recursive: true });
  const { latest, dated, migratedLegacy } = await persistReportHistory(plan.catalogId, report);

  console.log("\n=== IMPORT ESEGUITO ===");
  console.log(`inseriti: ${plan.toInsert.length} asset + ${plan.figureToInsert.length} casi figura`);
  console.log(`unchanged: ${plan.unchanged} + ${plan.unchangedFigure}`);
  console.log(`conflitti: ${plan.conflicts.length}`);
  console.log(`DB: ${dbResult.updatedToAiVerified} asset -> ai_visually_verified (già AI: ${dbResult.alreadyAiVerified}, protetti umani: ${dbResult.humanVerifiedProtected}, non trovati: ${dbResult.missingRows})`);
  console.log(`idempotenza: seconda esecuzione -> ${replan.toInsert.length + replan.figureToInsert.length} da inserire, ${replan.unchanged + replan.unchangedFigure} unchanged`);
  console.log(`Report latest: ${latest}`);
  console.log(`Report dated: ${dated}`);
  if (migratedLegacy) console.log(`Cronologia preservata: report precedente migrato in ${migratedLegacy}`);
}

const isMain =
  process.argv[1] !== undefined &&
  (import.meta.url === pathToFileURL(process.argv[1]).href ||
    process.argv[1].replace(/\\/g, "/").endsWith("scripts/review/import-external-ai.ts"));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
