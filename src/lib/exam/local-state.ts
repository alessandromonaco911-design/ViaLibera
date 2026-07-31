import { siteConfig } from "../../config/site";
import { isExpired } from "./timer";

/**
 * Local exam state persisted in localStorage (per session).
 * NEVER stores correct answers or solutions.
 */

export interface PersistedExamState {
  sessionId: string;
  version: number;
  status: "in_progress" | "completed";
  currentPosition: number;
  /** questionId -> selected answer (absent = unanswered) */
  answers: Record<string, boolean>;
  flagged: string[];
  startedAt: string;
  expiresAt: string;
  lastSavedAt: string;
}

/** Minimal storage adapter (localStorage in the browser, mock in tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function storageKeyFor(sessionId: string): string {
  return `${siteConfig.storageKeyPrefix}:${sessionId}`;
}

export function emptyState(sessionId: string, startedAt: string, expiresAt: string): PersistedExamState {
  return {
    sessionId,
    version: siteConfig.payloadVersion,
    status: "in_progress",
    currentPosition: 1,
    answers: {},
    flagged: [],
    startedAt,
    expiresAt,
    lastSavedAt: new Date().toISOString(),
  };
}

/** Safe parse: returns null on corrupt/incompatible/foreign data (never throws). */
export function parsePersistedState(raw: string | null): PersistedExamState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PersistedExamState>;
    if (!v || typeof v !== "object") return null;
    if (v.sessionId !== undefined && typeof v.sessionId !== "string") return null;
    if (v.version !== siteConfig.payloadVersion) return null; // incompatible payload version
    if (v.answers !== undefined && (typeof v.answers !== "object" || v.answers === null)) return null;
    if (Array.isArray(v.flagged) === false && v.flagged !== undefined) return null;
    if (v.currentPosition !== undefined && (typeof v.currentPosition !== "number" || !Number.isInteger(v.currentPosition))) return null;
    // tolerate missing optional fields
    return {
      sessionId: typeof v.sessionId === "string" ? v.sessionId : "",
      version: siteConfig.payloadVersion,
      status: v.status === "completed" ? "completed" : "in_progress",
      currentPosition: typeof v.currentPosition === "number" ? v.currentPosition : 1,
      answers: (v.answers as Record<string, boolean>) ?? {},
      flagged: Array.isArray(v.flagged) ? v.flagged.filter((x) => typeof x === "string") : [],
      startedAt: typeof v.startedAt === "string" ? v.startedAt : "",
      expiresAt: typeof v.expiresAt === "string" ? v.expiresAt : "",
      lastSavedAt: typeof v.lastSavedAt === "string" ? v.lastSavedAt : "",
    };
  } catch {
    return null;
  }
}

export function savePersistedState(storage: StorageLike, state: PersistedExamState): boolean {
  try {
    storage.setItem(storageKeyFor(state.sessionId), JSON.stringify(state));
    return true;
  } catch {
    return false; // localStorage disabled / quota — never crash
  }
}

export function loadPersistedState(storage: StorageLike, sessionId: string): PersistedExamState | null {
  try {
    return parsePersistedState(storage.getItem(storageKeyFor(sessionId)));
  } catch {
    return null;
  }
}

export function clearPersistedState(storage: StorageLike, sessionId: string): void {
  try {
    storage.removeItem(storageKeyFor(sessionId));
  } catch {
    /* ignore */
  }
}

/** All persisted in-progress sessions (for the homepage resume card), newest first. */
export function listInProgressSessions(storage: StorageLike, nowMs: number): PersistedExamState[] {
  const out: PersistedExamState[] = [];
  try {
    const registry = storage.getItem(`${siteConfig.storageKeyPrefix}:__registry__`);
    if (registry) {
      const ids = JSON.parse(registry) as string[];
      for (const id of ids) {
        const st = loadPersistedState(storage, id);
        if (!st) continue;
        if (st.status === "in_progress" && !isExpired(st.expiresAt, nowMs)) out.push(st);
      }
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => (a.lastSavedAt < b.lastSavedAt ? 1 : -1));
}

/** Registry of session ids — kept in sync by the exam runner so the homepage can resume. */
export function registerSession(storage: StorageLike, sessionId: string): void {
  try {
    const key = `${siteConfig.storageKeyPrefix}:__registry__`;
    const cur = JSON.parse(storage.getItem(key) ?? "[]") as string[];
    if (!cur.includes(sessionId)) {
      cur.push(sessionId);
      storage.setItem(key, JSON.stringify(cur.slice(-20)));
    }
  } catch {
    /* ignore */
  }
}

export function unregisterSession(storage: StorageLike, sessionId: string): void {
  try {
    const key = `${siteConfig.storageKeyPrefix}:__registry__`;
    const cur = JSON.parse(storage.getItem(key) ?? "[]") as string[];
    storage.setItem(key, JSON.stringify(cur.filter((x) => x !== sessionId)));
  } catch {
    /* ignore */
  }
}
