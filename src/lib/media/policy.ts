/**
 * Centralized media usability policy.
 *
 * Single source of truth for "which media verification states may be used in
 * the exam experience" — used by the generator, the media route and any other
 * consumer. Never duplicate this logic.
 *
 * Environments:
 * - development / test: permissive (all verified states);
 * - production: configurable via MEDIA_PRODUCTION_ALLOWED_STATUSES (comma
 *   separated); default is the documented conservative set of FULLY VERIFIED
 *   states only (structurally_verified, ai_visually_verified, visually_verified).
 *   No implicit decision: any state not listed is rejected.
 */

export type AppEnvironment = "development" | "test" | "production";

export const MEDIA_STATUSES = [
  "extracted",
  "structurally_verified",
  "ai_visually_verified",
  "visually_verified",
  "ambiguous",
  "missing",
  "rejected",
] as const;

export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/** Default conservative production set: only fully verified states. */
export const DEFAULT_PRODUCTION_ALLOWED: ReadonlySet<string> = new Set([
  "structurally_verified",
  "ai_visually_verified",
  "visually_verified",
]);

/** Development/test: identical permissive policy (verified states). */
export const DEFAULT_DEV_ALLOWED: ReadonlySet<string> = DEFAULT_PRODUCTION_ALLOWED;

export function getEnvironment(): AppEnvironment {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") return "production";
  return "development";
}

export function allowedMediaStatuses(environment: AppEnvironment = getEnvironment()): ReadonlySet<string> {
  if (environment === "production") {
    const raw = process.env.MEDIA_PRODUCTION_ALLOWED_STATUSES;
    if (raw && raw.trim().length > 0) {
      const set = new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      // never allow clearly unusable states even if misconfigured
      for (const bad of ["rejected", "missing"]) set.delete(bad);
      return set;
    }
    return DEFAULT_PRODUCTION_ALLOWED;
  }
  return DEFAULT_DEV_ALLOWED;
}

/** The single predicate used everywhere. */
export function isMediaUsable(status: string | null | undefined, environment: AppEnvironment = getEnvironment()): boolean {
  if (!status) return false;
  return allowedMediaStatuses(environment).has(status);
}
