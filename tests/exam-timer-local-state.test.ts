import { test } from "node:test";
import assert from "node:assert/strict";
import { remainingMs, formatClock, timerTone, isExpired } from "../src/lib/exam/timer";
import {
  emptyState,
  parsePersistedState,
  savePersistedState,
  loadPersistedState,
  clearPersistedState,
  listInProgressSessions,
  registerSession,
  unregisterSession,
  storageKeyFor,
  type StorageLike,
  type PersistedExamState,
} from "../src/lib/exam/local-state";

function mockStorage(): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
}

const SID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("timer: remainingMs calcolato da expiresAt (non da contatore)", () => {
  assert.equal(remainingMs("2026-01-01T00:10:00Z", Date.parse("2026-01-01T00:00:00Z")), 600_000);
  assert.equal(remainingMs("2026-01-01T00:00:00Z", Date.parse("2026-01-01T00:01:00Z")), 0);
  assert.equal(remainingMs("invalid", Date.now()), 0);
  assert.ok(isExpired("2026-01-01T00:00:00Z", Date.parse("2026-01-01T00:01:00Z")));
});

test("timer: formatClock 19:42 e stati critici", () => {
  assert.equal(formatClock(19 * 60_000 + 42 * 1000), "19:42");
  assert.equal(formatClock(59_000), "00:59");
  assert.equal(formatClock(0), "00:00");
  assert.equal(timerTone(10 * 60_000), "normal");
  assert.equal(timerTone(4 * 60_000), "warning");
  assert.equal(timerTone(59_000), "critical");
});

test("local-state: salvataggio e ripristino dopo refresh", () => {
  const s = mockStorage();
  const st = emptyState(SID, "2026-01-01T00:00:00Z", "2026-01-01T00:20:00Z");
  st.answers = { q1: true, q2: false };
  st.flagged = ["q3"];
  st.currentPosition = 4;
  assert.ok(savePersistedState(s, st));
  const loaded = loadPersistedState(s, SID);
  assert.ok(loaded);
  assert.equal(loaded!.currentPosition, 4);
  assert.equal(loaded!.answers.q1, true);
  assert.deepEqual(loaded!.flagged, ["q3"]);
  assert.equal(loaded!.expiresAt, "2026-01-01T00:20:00Z");
});

test("local-state: stato corrotto -> null, nessun crash", () => {
  const s = mockStorage();
  s.setItem(storageKeyFor(SID), "{not json");
  assert.equal(parsePersistedState(s.getItem(storageKeyFor(SID))), null);
  s.setItem(storageKeyFor(SID), JSON.stringify({ sessionId: 123 }));
  assert.equal(loadPersistedState(s, SID), null);
});

test("local-state: stato incompatibile (versione diversa) scartato", () => {
  const s = mockStorage();
  s.setItem(storageKeyFor(SID), JSON.stringify({ ...emptyState(SID, "x", "y"), version: 999 }));
  assert.equal(loadPersistedState(s, SID), null);
});

test("local-state: sessione completata non ripristinata come in corso", () => {
  const s = mockStorage();
  const st = emptyState(SID, "2026-01-01T00:00:00Z", "2026-01-01T00:20:00Z");
  st.status = "completed";
  savePersistedState(s, st);
  const loaded = loadPersistedState(s, SID);
  assert.equal(loaded!.status, "completed");
});

test("local-state: scadenza -> sessione esclusa dal ripristino", () => {
  const s = mockStorage();
  const st = emptyState(SID, "2026-01-01T00:00:00Z", "2026-01-01T00:20:00Z");
  savePersistedState(s, st);
  registerSession(s, SID);
  const inProgress = listInProgressSessions(s, Date.parse("2026-01-01T01:00:00Z"));
  assert.equal(inProgress.length, 0);
});

test("local-state: lista sessioni in corso + rimozione", () => {
  const s = mockStorage();
  const st = emptyState(SID, "2026-01-01T00:00:00Z", "2026-01-01T00:20:00Z");
  savePersistedState(s, st);
  registerSession(s, SID);
  const now = Date.parse("2026-01-01T00:05:00Z");
  const list = listInProgressSessions(s, now);
  assert.equal(list.length, 1);
  assert.equal(list[0].sessionId, SID);
  unregisterSession(s, SID);
  assert.equal(listInProgressSessions(s, now).length, 0);
  clearPersistedState(s, SID);
  assert.equal(loadPersistedState(s, SID), null);
});

test("local-state: localStorage non disponibile -> nessun crash", () => {
  const broken: StorageLike = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(savePersistedState(broken, emptyState(SID, "x", "y")), false);
  assert.equal(loadPersistedState(broken, SID), null);
  assert.doesNotThrow(() => clearPersistedState(broken, SID));
  assert.deepEqual(listInProgressSessions(broken, Date.now()), []);
});

test("local-state: il payload persistito non contiene soluzioni", () => {
  const s = mockStorage();
  const st = emptyState(SID, "2026-01-01T00:00:00Z", "2026-01-01T00:20:00Z");
  savePersistedState(s, st);
  const raw = s.getItem(storageKeyFor(SID)) ?? "";
  assert.ok(!raw.includes("correctAnswer"));
  assert.ok(!raw.includes("solution"));
});

test("local-state: tipo PersistedExamState coerente", () => {
  const st: PersistedExamState = emptyState(SID, "2026-01-01T00:00:00Z", "2026-01-01T00:20:00Z");
  assert.equal(st.status, "in_progress");
  assert.equal(st.currentPosition, 1);
});
