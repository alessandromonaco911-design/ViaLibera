import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { renderPageAsImage, getDocumentProxy } from "unpdf";
import { OFFICIAL_SOURCES } from "../data/sources";
import { STRICT_FIGURE_RE, LOOSE_SIGN_RE } from "../data/figure-audit";
import type { ImageLike } from "../data/lib/types";
import { loadReviewsFile, saveReviewsFile, REVIEWS_PATH, type ReviewEvent } from "./reviews-store";

/**
 * Local visual review gallery (dev-only, localhost).
 *   npm run review:gallery [port]
 *
 * Serves a static HTML page + JSON API. Reviews are appended to
 * data/reviews/reviews.json (versionable file). Nothing is ever marked
 * visually_verified without an explicit human action here.
 */

const ROOT = process.cwd();
const CATALOG_ID = "ab-2025-04-23";
const PORT = parseInt(process.argv[2] ?? "8787", 10);
const PDF_PATH = join(ROOT, "data", "official", OFFICIAL_SOURCES.find((s) => s.id === "pda-2025-ab-it")!.localFilename);
const PAGE_CACHE_DIR = join(ROOT, "data", "reports", ".gallery-pages", CATALOG_ID);

interface Review {
  assetHash: string;
  questionIds: string[];
  decision: "confirmed" | "ambiguous" | "rejected";
  timestamp: string;
  method: string;
  reviewerType: "human";
  note?: string;
  catalogId: string;
}

async function loadReviews(): Promise<ReviewEvent[]> {
  const file = await loadReviewsFile();
  return file.reviews;
}

async function saveReview(review: Review): Promise<void> {
  const file = await loadReviewsFile();
  const event: ReviewEvent = {
    id: `gallery:${review.assetHash}:${Date.now().toString(36)}`,
    catalogId: review.catalogId,
    assetHash: review.assetHash,
    questionIds: review.questionIds,
    decision: review.decision,
    reviewerType: "human",
    reviewerLabel: "revisore umano (galleria locale)",
    reviewedAt: new Date().toISOString(),
    method: "gallery",
    note: review.note,
    sourceBatch: undefined,
  };
  file.reviews.push(event);
  await saveReviewsFile(file);
  console.log(`[review] ${event.decision} ${(event.assetHash ?? "").slice(0, 12)}… (${event.questionIds.length} q) [human]`);
}

const pageCache = new Map<number, Buffer>();
async function renderPage(n: number): Promise<Buffer> {
  if (pageCache.has(n)) return pageCache.get(n)!;
  await mkdir(PAGE_CACHE_DIR, { recursive: true });
  const cacheFile = join(PAGE_CACHE_DIR, `p${n}.png`);
  if (existsSync(cacheFile)) {
    const buf = await readFile(cacheFile);
    pageCache.set(n, buf);
    return buf;
  }
  const buf = await readFile(PDF_PATH);
  const proxy = await getDocumentProxy(new Uint8Array(buf));
  const out = await renderPageAsImage(proxy, n, {
    canvasImport: async () => (await import("@napi-rs/canvas")) as never,
    scale: 1.5,
  });
  const png = Buffer.from(out);
  await writeFile(cacheFile, png);
  pageCache.set(n, png);
  return png;
}

async function loadData() {
  const pDir = join(ROOT, "data", "processed", CATALOG_ID);
  const lines = (await readFile(join(pDir, "questions.jsonl"), "utf-8")).split("\n").filter(Boolean);
  const questions = lines.map((l) => JSON.parse(l));
  const groups = JSON.parse(await readFile(join(pDir, "groups.json"), "utf-8")) as { code: string; topic: string }[];
  const media = JSON.parse(await readFile(join(pDir, "media.json"), "utf-8")) as {
    hash: string;
    ext: string;
    width: number;
    height: number;
    questions: string[];
    verificationStatus: string;
    minConfidence: number;
    pageFirstSeen: number;
  }[];
  const positions = JSON.parse(
    await readFile(join(ROOT, "data", "processed", ".cache", CATALOG_ID, "positions.json"), "utf-8"),
  ) as {
    pageDims: { page: number; width: number; height: number }[];
    images: ImageLike[];
  };
  const reviews = await loadReviews();
  const figureReviews = (await loadReviewsFile()).figureReferenceCaseReviews;
  const groupByCode = new Map(groups.map((g) => [g.code, g]));
  const reviewByHash = new Map<string, ReviewEvent[]>();
  for (const r of reviews) {
    if (!r.assetHash) continue;
    const arr = reviewByHash.get(r.assetHash) ?? [];
    arr.push(r);
    reviewByHash.set(r.assetHash, arr);
  }

  const assets = media
    .map((m) => {
      const assoc = questions
        .filter((q) => q.imageRef === m.hash)
        .map((q) => ({
          questionNumber: q.questionNumber,
          statement: q.statement,
          correctAnswer: q.correctAnswer,
          groupCode: q.groupCode,
          topic: q.topic,
          page: q.page,
          rowBand: q.rowBand,
          imageBBox: q.imageBBox,
          confidence: q.structuralConfidence,
        }));
      const revs = (reviewByHash.get(m.hash) ?? []).sort((a, b) => (a.reviewedAt < b.reviewedAt ? -1 : 1));
      const latestHuman = [...revs].reverse().find((r) => r.reviewerType === "human");
      const latestAi = [...revs].reverse().find((r) => r.reviewerType === "external_ai_visual_review");
      const humanDecisions = new Set(revs.filter((r) => r.reviewerType === "human").map((r) => r.decision));
      const aiDecisions = new Set(revs.filter((r) => r.reviewerType === "external_ai_visual_review").map((r) => r.decision));
      const conflict = humanDecisions.size > 0 && aiDecisions.size > 0 && [...humanDecisions].some((d) => !aiDecisions.has(d));
      // display status = review-derived when a recorded decision exists, else technical pipeline state
      const displayStatus = conflict
        ? "conflict"
        : latestHuman
          ? latestHuman.decision === "confirmed" ? "visually_verified" : latestHuman.decision
          : latestAi
            ? latestAi.decision === "confirmed" ? "ai_visually_verified" : latestAi.decision
            : m.verificationStatus;
      return {
        hash: m.hash,
        ext: m.ext,
        width: m.width,
        height: m.height,
        status: m.verificationStatus,
        displayStatus,
        minConfidence: m.minConfidence,
        pageFirstSeen: m.pageFirstSeen,
        questionCount: m.questions.length,
        otherQuestionCodes: m.questions,
        associations: assoc,
        review: latestHuman ?? null, // legacy field kept for the human action buttons
        reviews: revs,
        hasAiReview: revs.some((r) => r.reviewerType === "external_ai_visual_review"),
        hasHumanReview: revs.some((r) => r.reviewerType === "human"),
        conflict,
      };
    })
    .sort((a, b) => a.minConfidence - b.minConfidence);

  // questions without image that reference figures (loose pattern) -> "in figura" view
  const noImage = questions
    .filter((q) => !q.imageRef && (STRICT_FIGURE_RE.test(q.statement) || LOOSE_SIGN_RE.test(q.statement)))
    .map((q) => {
      const figReview = figureReviews.find((r) => r.officialQuestionCode === q.questionNumber) ?? null;
      return {
        questionNumber: q.questionNumber,
        groupCode: q.groupCode,
        topic: q.topic,
        page: q.page,
        statement: q.statement,
        correctAnswer: q.correctAnswer,
        figReview: figReview ?? null,
      };
    });

  const mediaFiles = await readdir(join(ROOT, "data", "media", CATALOG_ID));

  return {
    catalogId: CATALOG_ID,
    pageDims: positions.pageDims,
    assets,
    noImage,
    figureReviews,
    groups: groups.map((g) => ({ code: g.code, topic: g.topic })),
    groupNames: Object.fromEntries([...groupByCode].map(([k, v]) => [k, v.topic])),
    mediaFiles,
    pdfPath: PDF_PATH,
  };
}

async function sendJson(res: import("node:http").ServerResponse, obj: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function main() {
  const html = await readFile(join(__dirname, "gallery.html"), "utf-8");
  const dataPromise = loadData();

  const server = createServer(async (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      const path = url.pathname;

      if (path === "/" || path === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (path === "/api/data") {
        return sendJson(res, await dataPromise);
      }
      if (path === "/api/reviews") {
        return sendJson(res, await loadReviews());
      }
      if (path === "/api/sample") {
        const samplePath = join(ROOT, "data", "reports", `review-sample-${CATALOG_ID}.json`);
        if (!existsSync(samplePath)) return sendJson(res, { sample: [] });
        return sendJson(res, JSON.parse(await readFile(samplePath, "utf-8")));
      }
      if (path === "/api/reviews" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body);
        const review: Review = {
          assetHash: payload.assetHash,
          questionIds: payload.questionIds ?? [],
          decision: payload.decision,
          timestamp: new Date().toISOString(),
          method: "gallery",
          reviewerType: "human",
          note: payload.note,
          catalogId: CATALOG_ID,
        };
        if (!["confirmed", "ambiguous", "rejected"].includes(review.decision)) {
          return sendJson(res, { error: "invalid decision" }, 400);
        }
        await saveReview(review);
        console.log(`[review] ${review.decision} ${review.assetHash.slice(0, 12)}… (${review.questionIds.length} q)`);
        return sendJson(res, { ok: true });
      }
      if (path.startsWith("/api/page/")) {
        const n = parseInt(path.split("/").pop() ?? "", 10);
        if (!n || n < 1) return sendJson(res, { error: "bad page" }, 400);
        const png = await renderPage(n);
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=3600" });
        res.end(png);
        return;
      }
      if (path.startsWith("/media/")) {
        const name = decodeURIComponent(path.split("/").pop() ?? "");
        const file = join(ROOT, "data", "media", CATALOG_ID, name);
        if (!existsSync(file)) return sendJson(res, { error: "not found" }, 404);
        const ext = extname(name).slice(1);
        const mime = ext === "png" ? "image/png" : "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": "max-age=3600" });
        res.end(await readFile(file));
        return;
      }
      sendJson(res, { error: "not found" }, 404);
    } catch (err) {
      console.error(err);
      sendJson(res, { error: String(err) }, 500);
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\nGalleria di revisione visiva: http://127.0.0.1:${PORT}`);
    console.log(`Catalogo: ${CATALOG_ID} | recensioni: ${REVIEWS_PATH}`);
    console.log("Non è una pagina pubblica: solo uso locale di sviluppo.\n");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
