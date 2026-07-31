import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "../../src/lib/db";
import { fetchCandidates, selectQuestions } from "../../src/lib/exam/generator";
import { isMediaUsable } from "../../src/lib/media/policy";
import { siteConfig } from "../../src/config/site";

/**
 * Exam generator distribution audit.
 *
 * Runs N deterministic simulations (default 10000, override with
 * EXAM_AUDIT_SIMULATIONS) WITHOUT creating any DB session, and measures:
 * question/group/topic frequency, image mix, per-exam group/topic counts,
 * max per group, VERO/FALSO balance, duplicates, seed collisions, never
 * selected questions, and deviation from mean frequency.
 *
 * Output: data/reports/exam-distribution-audit.json
 */

const ROOT = process.cwd();
const SIMULATIONS = parseInt(process.env.EXAM_AUDIT_SIMULATIONS ?? "10000", 10);
const TOTAL = siteConfig.exam.totalQuestions;
const MAX_PER_GROUP = siteConfig.selection.maxPerGroup;

interface Agg {
  questionFreq: Map<string, number>;
  groupFreq: Map<string, number>;
  topicFreq: Map<string, number>;
  imagesPerExam: number[];
  noImagePerExam: number[];
  groupsPerExam: number[];
  topicsPerExam: number[];
  maxPerGroupPerExam: number[];
  veroPerExam: number[];
  falsoPerExam: number[];
  examSets: Map<string, number>; // sorted question-set hash -> count (collision detection)
  neverSelected: Set<string>;
  selectedQuestionCount: number;
  duplicateInExam: number;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function avg(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}

async function main() {
  const started = Date.now();
  const catalogId = (await sql`select id from question_catalog_versions where status='imported' limit 1`)[0]?.id as string | undefined;
  if (!catalogId) {
    console.error("catalogo non importato");
    process.exit(1);
  }
  const candidates = await fetchCandidates(catalogId);
  const usable = candidates.filter((c) => !c.imageRef || isMediaUsable(c.mediaStatus));
  console.log(`candidate: ${candidates.length} | utilizzabili: ${usable.length} | simulazioni: ${SIMULATIONS}`);

  const agg: Agg = {
    questionFreq: new Map(),
    groupFreq: new Map(),
    topicFreq: new Map(),
    imagesPerExam: [],
    noImagePerExam: [],
    groupsPerExam: [],
    topicsPerExam: [],
    maxPerGroupPerExam: [],
    veroPerExam: [],
    falsoPerExam: [],
    examSets: new Map(),
    neverSelected: new Set(usable.map((c) => c.id)),
    selectedQuestionCount: 0,
    duplicateInExam: 0,
  };

  const byId = new Map(usable.map((c) => [c.id, c]));

  for (let seed = 1; seed <= SIMULATIONS; seed++) {
    const { selected } = selectQuestions(usable, { seed, total: TOTAL, maxPerGroup: MAX_PER_GROUP });
    if (selected.length < TOTAL) {
      console.warn(`seed ${seed}: solo ${selected.length}/${TOTAL} (catalogo insufficiente)`);
      continue;
    }
    const groupCount = new Map<string, number>();
    const topicCount = new Map<string, number>();
    let img = 0;
    let vero = 0;
    for (const q of selected) {
      agg.questionFreq.set(q.id, (agg.questionFreq.get(q.id) ?? 0) + 1);
      const g = q.groupCode ?? "no-group";
      groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
      if (q.topicName) topicCount.set(q.topicName, (topicCount.get(q.topicName) ?? 0) + 1);
      if (q.imageRef) img++;
      if (q.correctAnswer) vero++;
      agg.neverSelected.delete(q.id);
      agg.selectedQuestionCount++;
    }
    for (const [g, n] of groupCount) agg.groupFreq.set(g, (agg.groupFreq.get(g) ?? 0) + n);
    for (const [t, n] of topicCount) agg.topicFreq.set(t, (agg.topicFreq.get(t) ?? 0) + n);
    const maxGroup = Math.max(...groupCount.values());
    agg.imagesPerExam.push(img);
    agg.noImagePerExam.push(TOTAL - img);
    agg.groupsPerExam.push(groupCount.size);
    agg.topicsPerExam.push(topicCount.size);
    agg.maxPerGroupPerExam.push(maxGroup);
    agg.veroPerExam.push(vero);
    agg.falsoPerExam.push(TOTAL - vero);

    const setKey = selected
      .map((q) => q.id)
      .sort()
      .join(",");
    agg.examSets.set(setKey, (agg.examSets.get(setKey) ?? 0) + 1);
  }

  // ---- metrics ----
  const uniqueQuestions = new Set(agg.questionFreq.keys());
  const neverSelected = [...agg.neverSelected].sort();
  const freqList = [...agg.questionFreq.values()].sort((a, b) => a - b);
  const meanFreq = freqList.length ? freqList.reduce((a, b) => a + b, 0) / freqList.length : 0;
  const minFreq = freqList[0] ?? 0;
  const maxFreq = freqList[freqList.length - 1] ?? 0;
  const pct = (p: number) => percentile(freqList, p);
  const outliersHigh = [...agg.questionFreq.entries()].filter(([, f]) => meanFreq > 0 && f > meanFreq * 2).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const collisions = [...agg.examSets.entries()].filter(([, c]) => c > 1);
  const sortedGroups = [...agg.groupFreq.entries()].sort((a, b) => b[1] - a[1]);
  const sortedTopics = [...agg.topicFreq.entries()].sort((a, b) => b[1] - a[1]);

  const gPerPct = (p: number) => percentile([...agg.groupsPerExam].sort((a, b) => a - b), p);
  const imgPerPct = (p: number) => percentile([...agg.imagesPerExam].sort((a, b) => a - b), p);

  const warnings: string[] = [];
  if (neverSelected.length) warnings.push(`${neverSelected.length} domande mai selezionate su ${usable.length} utilizzabili`);
  if (collisions.length) warnings.push(`${collisions.length} set identici prodotti da seed diversi (max occorrenze ${Math.max(...collisions.map((c) => c[1]))})`);
  if (agg.duplicateInExam) warnings.push(`${agg.duplicateInExam} domande duplicate rilevate in singole prove`);
  if (minFreq === 0) warnings.push("almeno una domanda non è mai stata selezionata");
  if (meanFreq > 0 && maxFreq > meanFreq * 2.5) warnings.push(`frequenza massima ${maxFreq} > 2.5x media ${meanFreq.toFixed(1)}`);

  const report = {
    catalogId,
    generatedAt: new Date().toISOString(),
    simulations: SIMULATIONS,
    seedStrategy: "sha256(seed:questionId) + cap gruppo " + MAX_PER_GROUP + " + primi " + TOTAL,
    totalQuestionsPerExam: TOTAL,
    usableCandidates: usable.length,
    aggregates: {
      meanFrequency: Number(meanFreq.toFixed(3)),
      minFrequency: minFreq,
      maxFrequency: maxFreq,
      frequencyPercentiles: {
        p5: pct(5), p25: pct(25), p50: pct(50), p75: pct(75), p95: pct(95), p99: pct(99),
      },
      meanImagesPerExam: Number(avg(agg.imagesPerExam).toFixed(2)),
      imagePercentiles: { p25: imgPerPct(25), p50: imgPerPct(50), p75: imgPerPct(75), min: Math.min(...agg.imagesPerExam), max: Math.max(...agg.imagesPerExam) },
      meanNoImagePerExam: Number(avg(agg.noImagePerExam).toFixed(2)),
      meanGroupsPerExam: Number(avg(agg.groupsPerExam).toFixed(2)),
      groupsPercentiles: { p25: gPerPct(25), p50: gPerPct(50), p75: gPerPct(75), min: Math.min(...agg.groupsPerExam), max: Math.max(...agg.groupsPerExam) },
      meanTopicsPerExam: Number(avg(agg.topicsPerExam).toFixed(2)),
      maxPerGroupPerExam: { min: Math.min(...agg.maxPerGroupPerExam), max: Math.max(...agg.maxPerGroupPerExam), mean: Number(avg(agg.maxPerGroupPerExam).toFixed(2)) },
      veroPerExam: { mean: Number(avg(agg.veroPerExam).toFixed(2)), min: Math.min(...agg.veroPerExam), max: Math.max(...agg.veroPerExam) },
      falsoPerExam: { mean: Number(avg(agg.falsoPerExam).toFixed(2)) },
      uniqueQuestionsSelected: uniqueQuestions.size,
      neverSelectedCount: neverSelected.length,
      neverSelectedSample: neverSelected.slice(0, 20),
      duplicateInExam: agg.duplicateInExam,
      identicalExamSetsFromDifferentSeeds: collisions.length,
      identicalExamMaxOccurrences: collisions.length ? Math.max(...collisions.map((c) => c[1])) : 0,
    },
    topGroups: sortedGroups.slice(0, 15).map(([g, f]) => ({ group: g, selections: f })),
    topTopics: sortedTopics.slice(0, 15).map(([t, f]) => ({ topic: t, selections: f })),
    outliersHigh: outliersHigh.map(([id, f]) => ({ questionId: id, frequency: f, officialCode: byId.get(id)?.officialQuestionCode ?? null })),
    warnings,
    conclusion: [
      `su ${SIMULATIONS} simulazioni (${TOTAL} domande l'una, cap ${MAX_PER_GROUP}/gruppo): ${uniqueQuestions.size}/${usable.length} domande selezionate almeno una volta.`,
      `frequenza media per domanda ${meanFreq.toFixed(2)}, min ${minFreq}, max ${maxFreq} (p95 ${pct(95)}, p99 ${pct(99)}).`,
      `immagini per prova: media ${avg(agg.imagesPerExam).toFixed(1)} (min ${Math.min(...agg.imagesPerExam)}, max ${Math.max(...agg.imagesPerExam)}).`,
      `gruppi distinti per prova: media ${avg(agg.groupsPerExam).toFixed(1)}; topic distinti: media ${avg(agg.topicsPerExam).toFixed(1)}.`,
      `massimo domande di uno stesso gruppo per prova: ${Math.min(...agg.maxPerGroupPerExam)}..${Math.max(...agg.maxPerGroupPerExam)} (cap ${MAX_PER_GROUP}).`,
      `VERO/FALSO per prova: VERO media ${avg(agg.veroPerExam).toFixed(1)} (min ${Math.min(...agg.veroPerExam)}, max ${Math.max(...agg.veroPerExam)}).`,
      `duplicazioni intra-prova: ${agg.duplicateInExam}; set identici da seed diversi: ${collisions.length}.`,
      warnings.length ? `attenzioni: ${warnings.length}` : "nessuna attenzione rilevata.",
    ],
  };

  const reportDir = join(ROOT, "data", "reports");
  await mkdir(reportDir, { recursive: true });
  const out = join(reportDir, "exam-distribution-audit.json");
  await writeFile(out, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n=== EXAM DISTRIBUTION AUDIT ===");
  console.log(`simulazioni: ${SIMULATIONS} | candidate: ${usable.length}`);
  console.log(`freq media: ${meanFreq.toFixed(2)} | min ${minFreq} | max ${maxFreq} | p95 ${pct(95)}`);
  console.log(`immagini/prova: media ${avg(agg.imagesPerExam).toFixed(1)} | gruppi/prova: media ${avg(agg.groupsPerExam).toFixed(1)} | maxGruppo: ${Math.max(...agg.maxPerGroupPerExam)}`);
  console.log(`mai selezionate: ${neverSelected.length} | set identici da seed diversi: ${collisions.length}`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`Report: ${out}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
