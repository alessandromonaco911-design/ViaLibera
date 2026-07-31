/**
 * Pure timer math. The timer is ALWAYS derived from expiresAt (never a
 * decremental counter), so sleep/tab-switch/clock-skew are handled correctly.
 */

export function remainingMs(expiresAtIso: string, nowMs: number): number {
  const end = Date.parse(expiresAtIso);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - nowMs);
}

export function isExpired(expiresAtIso: string, nowMs: number): boolean {
  return remainingMs(expiresAtIso, nowMs) <= 0;
}

/** mm:ss (e.g. 19:42), or h:mm:ss when >= 1h. */
export function formatClock(totalMs: number): string {
  const total = Math.max(0, Math.ceil(totalMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type TimerTone = "normal" | "warning" | "critical";

/** < 5 min -> warning; < 1 min -> critical. */
export function timerTone(remainingMsValue: number): TimerTone {
  if (remainingMsValue < 60_000) return "critical";
  if (remainingMsValue < 300_000) return "warning";
  return "normal";
}
