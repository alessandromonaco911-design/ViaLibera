import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Import-report history (preserve every apply run).
 *
 * Layout (per catalog):
 *   data/reports/external-ai-review-import-<catalog>/
 *     latest.json            -> the most recent run (overwritten)
 *     <importedAt>.json      -> append-only dated report per apply run
 *   data/reports/external-ai-review-import-<catalog>.json  -> legacy single file
 *
 * On the first run after this change the legacy single file (if present) is
 * copied into the history dir, so the original import is never lost.
 */

export interface ImportReportShape {
  importedAt: string;
  catalogId: string;
  inserted?: { assets: number; figureCases: number };
  unchanged?: { assets: number; figureCases: number };
  // ...any other report fields
  [k: string]: unknown;
}

export function reportHistoryDir(catalogId: string): string {
  return join(process.cwd(), "data", "reports", `external-ai-review-import-${catalogId}`);
}

export function legacyReportPath(catalogId: string): string {
  return join(process.cwd(), "data", "reports", `external-ai-review-import-${catalogId}.json`);
}

export function latestReportPath(catalogId: string): string {
  return join(reportHistoryDir(catalogId), "latest.json");
}

/** Safe filename from an ISO timestamp: colons are not allowed on Windows. */
export function sanitizeTimestamp(iso: string): string {
  return iso.replace(/[:]/g, "-").replace(/\./g, "-");
}

export function datedReportPath(catalogId: string, importedAtIso: string): string {
  return join(reportHistoryDir(catalogId), `${sanitizeTimestamp(importedAtIso)}.json`);
}

export async function ensureUniqueDatedPath(catalogId: string, importedAtIso: string): Promise<string> {
  const base = sanitizeTimestamp(importedAtIso);
  const dir = reportHistoryDir(catalogId);
  let candidate = join(dir, `${base}.json`);
  let i = 1;
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}-${i}.json`);
    i++;
  }
  return candidate;
}

/**
 * Persist a report preserving history:
 * - writes latest.json (overwrite);
 * - writes a dated append-only copy;
 * - on the very first run, migrates the legacy single file into the history dir.
 * Returns the written paths.
 */
export async function persistReportHistory(
  catalogId: string,
  report: ImportReportShape,
): Promise<{ latest: string; dated: string; migratedLegacy: string | null }> {
  const dir = reportHistoryDir(catalogId);
  await mkdir(dir, { recursive: true });

  let migratedLegacy: string | null = null;
  const legacy = legacyReportPath(catalogId);
  if (existsSync(legacy)) {
    // migrate exactly once: move into history under its own importedAt
    try {
      const legacyJson = JSON.parse(await readFile(legacy, "utf-8")) as ImportReportShape;
      const legacyDated = datedReportPath(catalogId, legacyJson.importedAt ?? report.importedAt);
      if (!existsSync(legacyDated)) {
        await rename(legacy, legacyDated);
        migratedLegacy = legacyDated;
      } else {
        await readdir(dir); // ensure dir exists
        // keep the legacy file but avoid overwriting history: leave as-is
      }
    } catch {
      // unreadable legacy: leave untouched
    }
  }

  const latest = latestReportPath(catalogId);
  const dated = await ensureUniqueDatedPath(catalogId, report.importedAt);
  await writeFile(latest, JSON.stringify(report, null, 2), "utf-8");
  await writeFile(dated, JSON.stringify(report, null, 2), "utf-8");
  return { latest, dated, migratedLegacy };
}
