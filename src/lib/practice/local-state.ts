import { siteConfig } from "../../config/site";
import type { PracticeExplanation } from "./types";

/**
 * Local practice state persisted in localStorage (per session).
 * Key: vialibera:practice:v1:{sessionId} — SEPARATE from exam state.
 *
 * NEVER stores correct answers: only the verification result of questions
 * the user already verified (which they already saw from the server).
 */

export interface VerifiedPracticeResult {
  /** selected answer at verification time */
  selectedAnswer: boolean;
  isCorrect: boolean;
  explanation?: PracticeExplanation | null;
}

export interface PersistedPracticeState {
  seed?: number;
  sessionId: string;
  /** 0 = practice, 1 = mistakes */
  mode: "practice" | "mistakes";
  topicId: string;
  topicName: string;
  /** 1-based current position */
  currentPosition: number;
  /** questionId -> selected answer (NOT yet verified) */
  selected: Record<string, boolean>;
  /** questionId -> verification result (locked after verify) */
  verified: Record<string, VerifiedPracticeResult>;
  requestedQuestionCount: number;
  totalQuestions: number;
  startedAt: string;
  lastSavedAt: string;
  payloadVersion: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function practiceStorageKeyFor(sessionId: string): string {
  return `${siteConfig.practiceStorageKeyPrefix}:${sessionId}`;
}

export function practiceRegistryKey(): string {
  return `${siteConfig.practiceStorageKeyPrefix}:__registry__`;
}

export function emptyPracticeState(input: {
  sessionId: string;
  mode: "practice" | "mistakes";
  topicId: string;
  topicName: string;
  requestedQuestionCount: number;
  totalQuestions: number;
  startedAt: string;
}): PersistedPracticeState {
  return {
    sessionId: input.sessionId,
    mode: input.mode,
    topicId: input.topicId,
    topicName: input.topicName,
    currentPosition: 1,
    selected: {},
    verified: {},
    requestedQuestionCount: input.requestedQuestionCount,
    totalQuestions: input.totalQuestions,
    startedAt: input.startedAt,
    lastSavedAt: new Date().toISOString(),
    payloadVersion: siteConfig.payloadVersion,
  };
}

/** Safe parse: null on corrupt/incompatible data (never throws). */
export function parsePersistedPracticeState(raw: string | null): PersistedPracticeState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PersistedPracticeState>;
    if (!v || typeof v !== "object") return null;
    if (typeof v.sessionId !== "string") return null;
    if (v.payloadVersion !== siteConfig.payloadVersion) return null; // incompatible
    if (v.selected !== undefined && (typeof v.selected !== "object" || v.selected === null)) return null;
    if (v.verified !== undefined && (typeof v.verified !== "object" || v.verified === null)) return null;
    return {
      seed: typeof v.seed === "number" ? v.seed : undefined,
      sessionId: v.sessionId,
      mode: v.mode === "mistakes" ? "mistakes" : "practice",
      topicId: typeof v.topicId === "string" ? v.topicId : "",
      topicName: typeof v.topicName === "string" ? v.topicName : "",
      currentPosition: typeof v.currentPosition === "number" ? v.currentPosition : 1,
      selected: (v.selected as Record<string, boolean>) ?? {},
      verified: (v.verified as Record<string, VerifiedPracticeResult>) ?? {},
      requestedQuestionCount: typeof v.requestedQuestionCount === "number" ? v.requestedQuestionCount : 0,
      totalQuestions: typeof v.totalQuestions === "number" ? v.totalQuestions : 0,
      startedAt: typeof v.startedAt === "string" ? v.startedAt : "",
      lastSavedAt: typeof v.lastSavedAt === "string" ? v.lastSavedAt : "",
      payloadVersion: siteConfig.payloadVersion,
    };
  } catch {
    return null;
  }
}

export function savePersistedPracticeState(storage: StorageLike, state: PersistedPracticeState): boolean {
  try {
    storage.setItem(practiceStorageKeyFor(state.sessionId), JSON.stringify(state));
    return true;
  } catch {
    return false; // localStorage disabled/quota — never crash
  }
}

export function loadPersistedPracticeState(storage: StorageLike, sessionId: string): PersistedPracticeState | null {
  try {
    return parsePersistedPracticeState(storage.getItem(practiceStorageKeyFor(sessionId)));
  } catch {
    return null;
  }
}

export function clearPersistedPracticeState(storage: StorageLike, sessionId: string): void {
  try {
    storage.removeItem(practiceStorageKeyFor(sessionId));
  } catch {
    /* ignore */
  }
}

/** All persisted in-progress practice sessions (homepage resume card), newest first. */
export function listInProgressPractice(storage: StorageLike): PersistedPracticeState[] {
  const out: PersistedPracticeState[] = [];
  try {
    const registry = storage.getItem(practiceRegistryKey());
    if (registry) {
      const ids = JSON.parse(registry) as string[];
      for (const id of ids) {
        const st = loadPersistedPracticeState(storage, id);
        if (!st) continue;
        out.push(st);
      }
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => (a.lastSavedAt < b.lastSavedAt ? 1 : -1));
}

export function registerPracticeSession(storage: StorageLike, sessionId: string): void {
  try {
    const key = practiceRegistryKey();
    const cur = JSON.parse(storage.getItem(key) ?? "[]") as string[];
    if (!cur.includes(sessionId)) {
      cur.push(sessionId);
      storage.setItem(key, JSON.stringify(cur.slice(-20)));
    }
  } catch {
    /* ignore */
  }
}

export function unregisterPracticeSession(storage: StorageLike, sessionId: string): void {
  try {
    const key = practiceRegistryKey();
    const cur = JSON.parse(storage.getItem(key) ?? "[]") as string[];
    storage.setItem(key, JSON.stringify(cur.filter((x) => x !== sessionId)));
  } catch {
    /* ignore */
  }
}
