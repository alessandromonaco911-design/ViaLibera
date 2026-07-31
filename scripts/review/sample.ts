import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ImageLike } from "../data/lib/types";

/**
 * Builds a recommended review sample (>= 50 unique assets) covering the required
 * categories. The sample is NOT marked as verified: it only tells the human
 * reviewer which images to look at first.
 */

const ROOT = process.cwd();
const CATALOG_ID = process.argv[2] ?? "ab-2025-04-23";

interface SampleEntry {
  hash: string;
  categories: string[];
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const pDir = join(ROOT, "data", "processed", CATALOG_ID);
  const lines = (await readFile(join(pDir, "questions.jsonl"), "utf-8")).split("\n").filter(Boolean);
  const questions = lines.map((l) => JSON.parse(l));
  const groups = JSON.parse(await readFile(join(pDir, "groups.json"), "utf-8")) as { code: string; page: number }[];
  const media = JSON.parse(await readFile(join(pDir, "media.json"), "utf-8")) as {
    hash: string;
    questions: string[];
    width: number;
    height: number;
    minConfidence: number;
    pageFirstSeen: number;
  }[];
  const positions = JSON.parse(
    await readFile(join(ROOT, "data", "processed", ".cache", CATALOG_ID, "positions.json"), "utf-8"),
  ) as { images: ImageLike[]; numberCells: { page: number; str: string; x: number; y: number }[] };

  const byHash = new Map(media.map((m) => [m.hash, m]));

  // page density (rows per page -> spacing)
  const cellsByPage = new Map<number, number[]>();
  for (const c of positions.numberCells) {
    if (!cellsByPage.has(c.page)) cellsByPage.set(c.page, []);
    cellsByPage.get(c.page)!.push(c.y);
  }
  const densePages = new Set<number>();
  for (const [page, ys] of cellsByPage) {
    ys.sort((a, b) => b - a);
    const gaps = [];
    for (let i = 0; i < ys.length - 1; i++) gaps.push(ys[i] - ys[i + 1]);
    const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 999;
    if (avg < 60) densePages.add(page);
  }

  // pages with multiple groups
  const groupCountByPage = new Map<number, number>();
  for (const g of groups) groupCountByPage.set(g.page, (groupCountByPage.get(g.page) ?? 0) + 1);
  const multiGroupPages = new Set([...groupCountByPage].filter(([, c]) => c > 1).map(([p]) => p));

  // category tagging per asset
  const tagged = new Map<string, string[]>();
  for (const m of media) {
    const cats: string[] = [];
    const q = questions.find((x) => x.questionNumber === m.questions[0])!;
    if (m.pageFirstSeen <= 10) cats.push("early_pages");
    if (m.pageFirstSeen >= 580) cats.push("late_pages");
    if (m.pageFirstSeen >= 290 && m.pageFirstSeen <= 310) cats.push("middle_pages");
    if (densePages.has(q?.page)) cats.push("dense_page");
    if (multiGroupPages.has(q?.page)) cats.push("multi_group_page");
    if (m.width > 300 || m.height > 300) cats.push("photographic");
    else if (m.width === 200 && m.height === 200) cats.push("single_sign");
    else cats.push("diagram");
    if (m.questions.length >= 10) cats.push("heavily_reused");
    if (m.minConfidence <= 0.85) cats.push("low_confidence");
    tagged.set(m.hash, cats);
  }

  // deterministic priority order: low confidence first, then categories
  const rnd = mulberry32(20250423);
  const order = [...media].sort(
    (a, b) => a.minConfidence - b.minConfidence || rnd() - 0.5,
  );

  const sample: SampleEntry[] = [];
  const seen = new Set<string>();
  const CATEGORY_QUOTAS: Record<string, number> = {
    early_pages: 6,
    middle_pages: 6,
    late_pages: 6,
    dense_page: 10,
    multi_group_page: 6,
    photographic: 10,
    single_sign: 12,
    diagram: 6,
    heavily_reused: 6,
    low_confidence: 12,
  };

  const pick = (cat: string, n: number) => {
    for (const m of order) {
      if (n <= 0) break;
      if (seen.has(m.hash)) continue;
      if (!tagged.get(m.hash)!.includes(cat)) continue;
      const entry = sample.find((s) => s.hash === m.hash);
      if (entry) entry.categories.push(cat);
      else {
        sample.push({ hash: m.hash, categories: [cat] });
        seen.add(m.hash);
      }
      n--;
    }
  };

  for (const [cat, quota] of Object.entries(CATEGORY_QUOTAS)) pick(cat, quota);

  // fill up to at least 50 with the lowest-confidence remaining
  for (const m of order) {
    if (sample.length >= 50) break;
    if (seen.has(m.hash)) continue;
    sample.push({ hash: m.hash, categories: tagged.get(m.hash) ?? [] });
    seen.add(m.hash);
  }

  const report = {
    catalogId: CATALOG_ID,
    generatedAt: new Date().toISOString(),
    note: "Campione consigliato per revisione visiva umana. NON marcato verificato: richiede azione umana nella galleria.",
    totalUniqueImages: media.length,
    sampleSize: sample.length,
    coverage: {
      earlyPages: sample.filter((s) => tagged.get(s.hash)!.includes("early_pages")).length,
      middlePages: sample.filter((s) => tagged.get(s.hash)!.includes("middle_pages")).length,
      latePages: sample.filter((s) => tagged.get(s.hash)!.includes("late_pages")).length,
      densePages: sample.filter((s) => tagged.get(s.hash)!.includes("dense_page")).length,
      multiGroupPages: sample.filter((s) => tagged.get(s.hash)!.includes("multi_group_page")).length,
      photographic: sample.filter((s) => tagged.get(s.hash)!.includes("photographic")).length,
      diagrams: sample.filter((s) => tagged.get(s.hash)!.includes("diagram")).length,
      singleSigns: sample.filter((s) => tagged.get(s.hash)!.includes("single_sign")).length,
      heavilyReused: sample.filter((s) => tagged.get(s.hash)!.includes("heavily_reused")).length,
      lowConfidence: sample.filter((s) => tagged.get(s.hash)!.includes("low_confidence")).length,
    },
    sample: sample.map((s) => ({
      hash: s.hash,
      categories: s.categories,
      minConfidence: byHash.get(s.hash)!.minConfidence,
      questionCount: byHash.get(s.hash)!.questions.length,
      pageFirstSeen: byHash.get(s.hash)!.pageFirstSeen,
    })),
  };

  const reportDir = join(ROOT, "data", "reports");
  await mkdir(reportDir, { recursive: true });
  const out = join(reportDir, `review-sample-${CATALOG_ID}.json`);
  await writeFile(out, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n=== REVIEW SAMPLE ===");
  console.log("sample size:", sample.length);
  console.log("coverage:", JSON.stringify(report.coverage));
  console.log("Report:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
