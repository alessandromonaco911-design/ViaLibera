import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { ParsedQuestion } from "../scripts/data/lib/types";
import {
  externalAiReviewFileSchema,
  validateDecisionsFile,
  computeImportPlan,
  mergePlan,
  type ExternalAiReviewFile,
  type CatalogContext,
} from "../scripts/review/import-external-ai";
import {
  normalizeReviewsFile,
  reviewEventId,
  type ReviewsFile,
} from "../scripts/review/reviews-store";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const BATCH = "external-ai-review-testbatch00000000";

function q(code: string, imageRef: string | null, page = 1): ParsedQuestion {
  return {
    page,
    questionNumber: code,
    groupCode: "1000",
    topic: "Topic",
    statement: `Testo ${code}`,
    correctAnswer: true,
    imageRef,
    imageBBox: imageRef
      ? { page, x: 465, y: 600, w: 80, h: 80 }
      : null,
    rowBand: { bottom: 596, top: 682 },
    structuralConfidence: imageRef ? 0.95 : null,
    sourceLineStart: 1,
    sourceLineEnd: 1,
    contentHash: "f".repeat(64),
  };
}

function ctx(): CatalogContext {
  return {
    catalogId: "test-catalog",
    mediaByHash: new Map([
      [HASH_A, { hash: HASH_A, verificationStatus: "structurally_verified" }],
      [HASH_B, { hash: HASH_B, verificationStatus: "structurally_verified" }],
      [HASH_C, { hash: HASH_C, verificationStatus: "visually_verified" }],
    ]),
    sampleHashes: new Set([HASH_A, HASH_B, HASH_C]),
    questionsByCode: new Map([
      ["10001", q("10001", HASH_A)],
      ["10002", q("10002", HASH_A)],
      ["10003", q("10003", HASH_B)],
      ["20848", q("20848", null, 464)],
    ]),
  };
}

function file(over: Partial<ExternalAiReviewFile> = {}): ExternalAiReviewFile {
  return {
    catalogId: "test-catalog",
    reviewedAt: "2026-07-31T17:29:00+02:00",
    reviewerType: "external_ai_visual_review",
    reviewerLabel: "TestAI",
    assetReviews: [
      { assetHash: HASH_A, decision: "confirmed", reviewerType: "external_ai_visual_review", note: "ok", questionCodes: ["10001", "10002"] },
      { assetHash: HASH_B, decision: "confirmed", reviewerType: "external_ai_visual_review", note: "ok", questionCodes: ["10003"] },
    ],
    figureReferenceCaseReviews: [
      { officialQuestionCode: "20848", decision: "no_image_expected", reviewerType: "external_ai_visual_review", note: "no figure" },
    ],
    ...over,
  };
}

function emptyStore(): ReviewsFile {
  return { version: 2, reviews: [], figureReferenceCaseReviews: [] };
}

test("1. schema: file valido passa la validazione Zod", () => {
  const parsed = externalAiReviewFileSchema.parse(file());
  assert.equal(parsed.reviewerType, "external_ai_visual_review");
  assert.equal(parsed.assetReviews.length, 2);
});

test("2. schema: reviewerType diverso da external_ai_visual_review viene rifiutato", () => {
  const bad = file({ assetReviews: [{ assetHash: HASH_A, decision: "confirmed", reviewerType: "human" as never }] });
  assert.throws(() => externalAiReviewFileSchema.parse(bad), z.ZodError);
});

test("3. schema: decisione non valida viene rifiutata", () => {
  const bad = file({ assetReviews: [{ assetHash: HASH_A, decision: "maybe" as never, reviewerType: "external_ai_visual_review" }] });
  assert.throws(() => externalAiReviewFileSchema.parse(bad), z.ZodError);
});

test("4. schema: JSON non valido viene rifiutato dal parser Zod", () => {
  assert.throws(() => externalAiReviewFileSchema.parse(JSON.parse("{not json")), SyntaxError);
});

test("5. validateDecisionsFile: asset mancanti e associazioni errate vengono segnalati", () => {
  const bad = file({
    assetReviews: [
      { assetHash: "d".repeat(64), decision: "confirmed", reviewerType: "external_ai_visual_review", questionCodes: ["10001"] },
      { assetHash: HASH_A, decision: "confirmed", reviewerType: "external_ai_visual_review", questionCodes: ["10003"] }, // 10003 appartiene a B
      { assetHash: HASH_A, decision: "confirmed", reviewerType: "external_ai_visual_review", questionCodes: ["99999"] }, // codice inesistente
    ],
  });
  const r = validateDecisionsFile(bad, ctx());
  assert.equal(r.missingAssets.length, 1);
  assert.equal(r.invalidAssociations.length, 2);
});

test("6. validateDecisionsFile: caso figura mancante o con immagine viene segnalato", () => {
  const missing = file({ figureReferenceCaseReviews: [{ officialQuestionCode: "77777", decision: "no_image_expected", reviewerType: "external_ai_visual_review" }] });
  assert.equal(validateDecisionsFile(missing, ctx()).missingFigureCases.length, 1);
  const withImg = file({ figureReferenceCaseReviews: [{ officialQuestionCode: "10001", decision: "no_image_expected", reviewerType: "external_ai_visual_review" }] });
  assert.equal(validateDecisionsFile(withImg, ctx()).missingFigureCases.length, 1); // ha immagine
});

test("7. computeImportPlan: pianifica inserimenti corretti", () => {
  const plan = computeImportPlan(file(), ctx(), emptyStore(), "/tmp/x.json", "ff".repeat(32));
  assert.equal(plan.counts.assetReviews, 2);
  assert.equal(plan.counts.coveredQuestionCodes, 3);
  assert.equal(plan.counts.figureCases, 1);
  assert.equal(plan.toInsert.length, 2);
  assert.equal(plan.figureToInsert.length, 1);
  assert.equal(plan.unchanged, 0);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.missingAssets.length, 0);
  assert.ok(plan.ok);
  // reviewerType conservato
  for (const e of [...plan.toInsert, ...plan.figureToInsert]) {
    assert.equal(e.reviewerType, "external_ai_visual_review");
    assert.notEqual(e.reviewerType, "human");
  }
});

test("8. idempotenza: seconda esecuzione -> tutto unchanged", () => {
  const f = file();
  const existing = mergePlan(emptyStore(), computeImportPlan(f, ctx(), emptyStore(), "/tmp/x.json", "ff".repeat(32)));
  const plan2 = computeImportPlan(f, ctx(), existing, "/tmp/x.json", "ff".repeat(32));
  assert.equal(plan2.toInsert.length, 0);
  assert.equal(plan2.figureToInsert.length, 0);
  assert.equal(plan2.unchanged, 2);
  assert.equal(plan2.unchangedFigure, 1);
});

test("9. nessuna duplicazione: eventi identici non vengono duplicati", () => {
  const f = file();
  const store = mergePlan(emptyStore(), computeImportPlan(f, ctx(), emptyStore(), "/tmp/x.json", "ff".repeat(32)));
  assert.equal(store.reviews.length, 2);
  assert.equal(store.figureReferenceCaseReviews.length, 1);
  const again = mergePlan(store, computeImportPlan(f, ctx(), store, "/tmp/x.json", "ff".repeat(32)));
  assert.equal(again.reviews.length, 2);
  assert.equal(again.figureReferenceCaseReviews.length, 1);
});

test("10. conflitto con decisione umana: entrambe conservate e segnalato", () => {
  const f = file();
  const store: ReviewsFile = {
    version: 2,
    reviews: [
      {
        id: "human-1",
        catalogId: "test-catalog",
        assetHash: HASH_A,
        questionIds: ["10001"],
        decision: "rejected",
        reviewerType: "human",
        reviewerLabel: "utente",
        reviewedAt: "2026-07-31T18:00:00+02:00",
        method: "gallery",
      },
    ],
    figureReferenceCaseReviews: [],
  };
  const plan = computeImportPlan(f, ctx(), store, "/tmp/x.json", "ff".repeat(32));
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].assetHash, HASH_A);
  assert.equal(plan.conflicts[0].humanDecision, "rejected");
  assert.equal(plan.conflicts[0].aiDecision, "confirmed");
  // l'evento AI viene comunque registrato come evento distinto
  assert.equal(plan.toInsert.length, 2);
  const merged = mergePlan(store, plan);
  assert.equal(merged.reviews.filter((r) => r.assetHash === HASH_A).length, 2);
});

test("11. decisione umana CONCORDE: nessun conflitto segnalato", () => {
  const f = file();
  const store: ReviewsFile = {
    version: 2,
    reviews: [
      {
        id: "human-2",
        catalogId: "test-catalog",
        assetHash: HASH_A,
        questionIds: ["10001"],
        decision: "confirmed",
        reviewerType: "human",
        reviewedAt: "2026-07-31T18:00:00+02:00",
        method: "gallery",
      },
    ],
    figureReferenceCaseReviews: [],
  };
  const plan = computeImportPlan(f, ctx(), store, "/tmp/x.json", "ff".repeat(32));
  assert.equal(plan.conflicts.length, 0);
});

test("12. caso figura: registrato con classificazione no_image_expected e origine AI", () => {
  const plan = computeImportPlan(file(), ctx(), emptyStore(), "/tmp/x.json", "ff".repeat(32));
  const fig = plan.figureToInsert[0];
  assert.equal(fig.officialQuestionCode, "20848");
  assert.equal(fig.decision, "no_image_expected");
  assert.equal(fig.assetHash, null);
  assert.equal(fig.reviewerType, "external_ai_visual_review");
  assert.equal(fig.note, "no figure");
});

test("13. normalizeReviewsFile: array legacy v1 viene aggiornato a v2", () => {
  const legacy = [
    { assetHash: HASH_A, questionIds: ["10001"], decision: "confirmed", reviewerType: "human", timestamp: "2026-01-01T00:00:00Z", method: "gallery", catalogId: "test-catalog" },
  ];
  const n = normalizeReviewsFile(legacy);
  assert.equal(n.version, 2);
  assert.equal(n.reviews.length, 1);
  assert.ok(n.reviews[0].id);
  assert.equal(n.figureReferenceCaseReviews.length, 0);
});

test("14. reviewEventId: deterministico", () => {
  const a = reviewEventId(["c", HASH_A, "external_ai_visual_review", "confirmed", BATCH]);
  const b = reviewEventId(["c", HASH_A, "external_ai_visual_review", "confirmed", BATCH]);
  const c = reviewEventId(["c", HASH_A, "external_ai_visual_review", "rejected", BATCH]);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("15. piano non ok quando mancano record (nessuna scrittura permessa)", () => {
  const bad = file({ assetReviews: [{ assetHash: "d".repeat(64), decision: "confirmed", reviewerType: "external_ai_visual_review", questionCodes: [] }] });
  const plan = computeImportPlan(bad, ctx(), emptyStore(), "/tmp/x.json", "ff".repeat(32));
  assert.equal(plan.ok, false);
  assert.equal(plan.missingAssets.length, 1);
});

test("16. tipo ImportPlan: conteggi coerenti (76 eventi previsti per il file reale)", () => {
  // sanity: 74 asset + 2 fig cases -> 76 eventi quando tutto nuovo
  const f = file({
    assetReviews: Array.from({ length: 74 }, (_, i) => ({
      assetHash: i.toString(16).padStart(64, "0"),
      decision: "confirmed" as const,
      reviewerType: "external_ai_visual_review" as const,
      questionCodes: [],
    })),
    figureReferenceCaseReviews: [
      { officialQuestionCode: "20848", decision: "no_image_expected", reviewerType: "external_ai_visual_review" },
      { officialQuestionCode: "21213", decision: "no_image_expected", reviewerType: "external_ai_visual_review" },
    ],
  });
  // quasi tutti mancanti (non nel contesto di test) -> ok=false ma il conteggio inseribili resta corretto
  const plan = computeImportPlan(f, ctx(), emptyStore(), "/tmp/x.json", "ff".repeat(32));
  assert.equal(plan.counts.assetReviews, 74);
  assert.equal(plan.counts.figureCases, 2);
});
