import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { questions, mediaAssets, topics } from "../db/schema";
import { siteConfig } from "../../config/site";
import { activeCatalog } from "../../config/catalog";
import { questionCatalogVersions } from "../db/schema";
import { isMediaUsable, allowedMediaStatuses, type AppEnvironment } from "../media/policy";

/**
 * Deterministic exam question generator.
 *
 * INTERNAL distribution compatible with the official exam format — NOT a
 * replica of the ministerial algorithm. The selection is deterministic for a
 * given seed and independent of the row order returned by the database.
 *
 * Algorithm:
 *   1. fetch candidate question IDs (active questions of the current catalog,
 *      with the media verification status of their referenced asset);
 *   2. filter unusable candidates (referenced asset missing / rejected / missing /
 *      ambiguous status; unknown image reference);
 *   3. order all candidates deterministically by sha256(seed + ":" + questionId);
 *   4. walk the ordered list, accepting a question only while its official group
 *      is below the per-group cap, until totalQuestions are selected.
 */

/** Candidate as seen by the pure selector (DB-agnostic). */
export interface QuestionCandidate {
  id: string;
  groupCode: string | null;
  /** media asset sha256 or null */
  imageRef: string | null;
  /** verification status of the referenced asset, or null if no asset referenced */
  mediaStatus: string | null;
}

/** Pure, DB-agnostic deterministic selection. */
export function selectQuestions<T extends QuestionCandidate>(
  candidates: T[],
  opts: {
    seed: number;
    total: number;
    maxPerGroup: number;
    /** media usability predicate (see src/lib/media/policy.ts); defaults to the current environment policy */
    isUsable?: (status: string | null | undefined, environment?: AppEnvironment) => boolean;
  },
): { selected: T[]; rejected: { id: string; reason: string }[] } {
  const { seed, total, maxPerGroup } = opts;
  const usableFn = opts.isUsable ?? isMediaUsable;
  if (!Number.isInteger(seed) || seed < 1 || seed > siteConfig.selection.seedMax) {
    throw new Error(`seed non valido: ${seed}`);
  }
  if (total < 1) throw new Error("total deve essere positivo");

  const rejected: { id: string; reason: string }[] = [];
  const rejectedIds = new Set<string>();
  const pushRejected = (id: string, reason: string) => {
    if (!rejectedIds.has(id)) {
      rejectedIds.add(id);
      rejected.push({ id, reason });
    }
  };
  const usable: T[] = [];
  for (const c of candidates) {
    if (!c.id) {
      pushRejected(c.id, "id mancante");
      continue;
    }
    if (c.imageRef) {
      if (!c.mediaStatus) {
        pushRejected(c.id, "asset di riferimento mancante nel catalogo");
        continue;
      }
      if (!usableFn(c.mediaStatus)) {
        pushRejected(c.id, `stato media non utilizzabile: ${c.mediaStatus}`);
        continue;
      }
    }
    usable.push(c);
  }

  // deterministic order independent of DB row order
  const ordered = usable
    .map((c) => ({
      c,
      key: createHash("sha256").update(`${seed}:${c.id}`, "utf8").digest("hex"),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.c.id.localeCompare(b.c.id)));

  const groupCount = new Map<string, number>();
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  for (const { c } of ordered) {
    if (selected.length >= total) break;
    const g = c.groupCode ?? "no-group";
    if ((groupCount.get(g) ?? 0) >= maxPerGroup) {
      pushRejected(c.id, `limite gruppo superato (${g})`);
      continue;
    }
    groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
    selected.push(c);
    selectedIds.add(c.id);
  }

  // report every remaining candidate (informational; counts as "scartata")
  const short = selected.length < total;
  for (const { c } of ordered) {
    if (selectedIds.has(c.id) || rejectedIds.has(c.id)) continue;
    pushRejected(c.id, short ? "catalogo insufficiente dopo i vincoli" : "oltre il numero richiesto");
  }

  return { selected, rejected };
}

/** Legacy alias (development policy). Prefer isMediaUsable/allowedMediaStatuses. */
export const ALLOWED_MEDIA_STATUSES: ReadonlySet<string> = allowedMediaStatuses();

export interface DbCandidate extends QuestionCandidate {
  statement: string;
  correctAnswer: boolean;
  officialQuestionCode: string | null;
  topicId: string | null;
  topicName: string | null;
  mediaLocalPath: string | null;
  mediaMime: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
}

/**
 * Fetch active candidates of the current imported catalog, joining the
 * verification status / path of the referenced media asset and the topic name.
 */
export async function fetchCandidates(catalogId: string, topicId?: string): Promise<DbCandidate[]> {
  const rows = await db
    .select({
      id: questions.id,
      groupCode: questions.officialGroupCode,
      imageRef: questions.imageReference,
      statement: questions.statement,
      correctAnswer: questions.correctAnswer,
      officialQuestionCode: questions.officialQuestionCode,
      topicId: questions.topicId,
      topicName: topics.name,
      mediaStatus: mediaAssets.verificationStatus,
      mediaLocalPath: mediaAssets.localPath,
      mediaMime: mediaAssets.mimeType,
      mediaWidth: mediaAssets.width,
      mediaHeight: mediaAssets.height,
    })
    .from(questions)
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .leftJoin(
      mediaAssets,
      and(
        eq(mediaAssets.sha256, questions.imageReference),
        eq(mediaAssets.catalogVersionId, questions.catalogVersionId),
      ),
    )
    .where(and(eq(questions.catalogVersionId, catalogId), eq(questions.status, "imported"), topicId ? eq(questions.topicId, topicId) : undefined));

  return rows.map((r) => ({
    id: r.id,
    groupCode: r.groupCode,
    imageRef: r.imageRef,
    mediaStatus: r.mediaStatus ?? null,
    statement: r.statement,
    correctAnswer: r.correctAnswer,
    officialQuestionCode: r.officialQuestionCode,
    topicId: r.topicId,
    topicName: r.topicName ?? null,
    mediaLocalPath: r.mediaLocalPath ?? null,
    mediaMime: r.mediaMime ?? null,
    mediaWidth: r.mediaWidth,
    mediaHeight: r.mediaHeight,
  }));
}

export async function getImportedCatalogId(catalog: { licenseCategory: string; versionCode: string } = activeCatalog): Promise<string | null> {
  const rows = await db
    .select({ id: questionCatalogVersions.id })
    .from(questionCatalogVersions)
    .where(and(
      eq(questionCatalogVersions.status, "imported"),
      eq(questionCatalogVersions.licenseCategory, catalog.licenseCategory),
      eq(questionCatalogVersions.versionCode, catalog.versionCode),
    ))
    .limit(1);
  return rows[0]?.id ?? null;
}

export function isValidSeed(seed: unknown): seed is number {
  return typeof seed === "number" && Number.isInteger(seed) && seed >= siteConfig.selection.seedMin && seed <= siteConfig.selection.seedMax;
}

/** Convenience: run the whole selection against the DB for a catalog. */
export async function generateExamQuestions(catalogId: string, seed: number, total = siteConfig.exam.totalQuestions) {
  const candidates = await fetchCandidates(catalogId);
  const { selected, rejected } = selectQuestions(candidates, {
    seed,
    total,
    maxPerGroup: siteConfig.selection.maxPerGroup,
  });
  if (selected.length < total) {
    throw new ExamGenerationError(
      `catalogo insufficiente: ${selected.length}/${total} domande selezionabili (${rejected.length} candidate scartate)`,
    );
  }
  return { questions: selected, rejected };
}

export class ExamGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExamGenerationError";
  }
}
