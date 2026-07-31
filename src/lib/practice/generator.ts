import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { questions, topics } from "../db/schema";
import { siteConfig } from "../../config/site";
import { fetchCandidates, type DbCandidate } from "../exam/generator";
import { isMediaUsable } from "../media/policy";

/**
 * Practice (allenamento) question generator.
 *
 * Deterministic per (seed, topicId): same inputs produce the same session.
 * Filters strictly by topic, keeps only active/imported questions whose
 * referenced media passes the centralized media policy, never duplicates.
 *
 * Group cap: relaxed cap (siteConfig.selection.practiceMaxPerGroup) is applied
 * first to avoid needless concentration of one official group; if the requested
 * size cannot be reached under that cap, a second deterministic pass WITHOUT a
 * group cap selects the remainder. If still insufficient, an error is thrown.
 */

export class PracticeGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeGenerationError";
  }
}

/** Deterministic ordering key, shared with the exam generator (sha256(seed:id)). */
function orderKey(seed: number, id: string): string {
  return createHash("sha256").update(`${seed}:${id}`, "utf8").digest("hex");
}

/** Pure deterministic selection of `total` candidates (DB-agnostic, testable). */
export function selectPracticeQuestions<T extends { id: string; groupCode: string | null }>(
  candidates: T[],
  opts: { seed: number; total: number; maxPerGroup: number },
): { selected: T[] } {
  const { seed, total, maxPerGroup } = opts;
  if (!Number.isInteger(seed) || seed < siteConfig.selection.seedMin || seed > siteConfig.selection.seedMax) {
    throw new PracticeGenerationError(`seed non valido: ${seed}`);
  }
  if (!Number.isInteger(total) || total < 1) {
    throw new PracticeGenerationError(`total non valido: ${total}`);
  }

  const pick = (cap: number): T[] => {
    const ordered = [...candidates]
      .map((c) => ({ c, key: orderKey(seed, c.id) }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.c.id.localeCompare(b.c.id)));
    const groupCount = new Map<string, number>();
    const selected: T[] = [];
    const seen = new Set<string>();
    for (const { c } of ordered) {
      if (selected.length >= total) break;
      if (seen.has(c.id)) continue;
      const g = c.groupCode ?? "no-group";
      if ((groupCount.get(g) ?? 0) >= cap) continue;
      groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
      seen.add(c.id);
      selected.push(c);
    }
    return selected;
  };

  let selected = pick(maxPerGroup);
  if (selected.length < total) {
    // second deterministic pass without a group cap (same seed => same result)
    selected = pick(Number.MAX_SAFE_INTEGER);
  }
  return { selected };
}

/** Fetch a topic row by id (throws PracticeGenerationError when missing). */
export async function getTopic(topicId: string): Promise<{ id: string; code: string; name: string }> {
  const rows = await db.select({ id: topics.id, code: topics.code, name: topics.name }).from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!rows[0]) throw new PracticeGenerationError("topic inesistente");
  return rows[0];
}

/**
 * Generate a practice session question set for one topic.
 * Returns full DbCandidates (server-side only, solutions included) and the
 * topic summary. Never returns fewer than `total` usable questions.
 */
export async function generatePracticeQuestions(input: {
  catalogId: string;
  topicId: string;
  seed: number;
  total: number;
}): Promise<{ questions: DbCandidate[]; topic: { id: string; code: string; name: string } }> {
  const topic = await getTopic(input.topicId);
  const all = await fetchCandidates(input.catalogId);
  const inTopic = all.filter((q) => q.topicId === input.topicId);

  // media policy is enforced by the shared candidate fetch (usable check happens
  // in the exam selector); for practice we re-apply the centralized policy so
  // rejected/missing/ambiguous assets are never selected.
  const usable = inTopic.filter((q) => (q.imageRef ? isMediaUsable(q.mediaStatus) : true));

  const { selected } = selectPracticeQuestions(usable, {
    seed: input.seed,
    total: input.total,
    maxPerGroup: siteConfig.selection.practiceMaxPerGroup,
  });

  if (selected.length < input.total) {
    throw new PracticeGenerationError(
      `topic insufficiente: ${selected.length}/${input.total} domande selezionabili (${usable.length} disponibili)`,
    );
  }
  return { questions: selected, topic };
}

/**
 * Topic listing for /allenamento: one aggregated query (no N+1).
 * Only topics with at least one usable question are returned; ordering is
 * stable by name. imageCount counts questions whose referenced media passes
 * the centralized policy (structurally/ai/human verified).
 */
export async function listPracticeTopics(catalogId: string): Promise<
  { id: string; code: string; name: string; questionCount: number; imageCount: number }[]
> {
  const rows = await db
    .select({
      id: topics.id,
      code: topics.code,
      name: topics.name,
      questionCount: sql<number>`count(distinct ${questions.id})::int`,
      imageCount: sql<number>`count(distinct case when ${questions.imageReference} is not null then ${questions.id} end)::int`,
    })
    .from(topics)
    .innerJoin(questions, and(eq(questions.topicId, topics.id), eq(questions.status, "imported")))
    .where(eq(questions.catalogVersionId, catalogId))
    .groupBy(topics.id, topics.code, topics.name)
    .orderBy(topics.name);

  // media usability filter: count only questions whose referenced asset is usable
  const all = await fetchCandidates(catalogId);
  const usableIds = new Set(
    all.filter((q) => (q.imageRef ? isMediaUsable(q.mediaStatus) : true)).map((q) => q.id),
  );
  return rows
    .filter((r) => r.questionCount > 0)
    .map((r) => {
      // per-topic usable counts require the candidate scan above (single pass)
      const usableOfTopic = all.filter((q) => q.topicId === r.id && usableIds.has(q.id));
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        questionCount: usableOfTopic.length,
        imageCount: usableOfTopic.filter((q) => q.imageRef).length,
      };
    })
    .filter((r) => r.questionCount > 0);
}
