import { test } from "node:test";
import assert from "node:assert/strict";
import { siteConfig } from "../src/config/site";
import {
  emptyPracticeState,
  parsePersistedPracticeState,
  savePersistedPracticeState,
  loadPersistedPracticeState,
  clearPersistedPracticeState,
  registerPracticeSession,
  unregisterPracticeSession,
  listInProgressPractice,
  practiceStorageKeyFor,
  practiceRegistryKey,
  type PersistedPracticeState,
  type StorageLike,
} from "../src/lib/practice/local-state";

class MemStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

function sampleState(sessionId = "11111111-1111-4111-8111-111111111111"): PersistedPracticeState {
  return emptyPracticeState({
    sessionId,
    mode: "practice",
    topicId: "22222222-2222-4222-8222-222222222222",
    topicName: "Segnali di pericolo",
    requestedQuestionCount: 10,
    totalQuestions: 10,
    startedAt: new Date().toISOString(),
  });
}

test("practice state: chiave separata e versionata", () => {
  const sid = "11111111-1111-4111-8111-111111111111";
  assert.equal(practiceStorageKeyFor(sid), `vialibera:practice:v1:${sid}`);
  assert.equal(practiceRegistryKey(), "vialibera:practice:v1:__registry__");
  // NON deve collidere con la chiave exam
  assert.notEqual(practiceStorageKeyFor(sid), `vialibera:exam:v1:${sid}`);
});

test("practice state: roundtrip salva e carica", () => {
  const storage = new MemStorage();
  const state = sampleState();
  state.selected["q1"] = true;
  state.verified["q2"] = { selectedAnswer: false, isCorrect: true };
  state.currentPosition = 3;
  assert.equal(savePersistedPracticeState(storage, state), true);
  const loaded = loadPersistedPracticeState(storage, state.sessionId);
  assert.ok(loaded);
  assert.equal(loaded!.currentPosition, 3);
  assert.deepEqual(loaded!.selected, { q1: true });
  assert.deepEqual(loaded!.verified, { q2: { selectedAnswer: false, isCorrect: true } });
  assert.equal(loaded!.payloadVersion, siteConfig.payloadVersion);
});

test("practice state: refresh preserva risposta singola verificata", () => {
  const storage = new MemStorage();
  const state = sampleState();
  state.verified["q1"] = { selectedAnswer: true, isCorrect: false };
  savePersistedPracticeState(storage, state);
  const loaded = loadPersistedPracticeState(storage, state.sessionId);
  assert.deepEqual(loaded!.verified["q1"], { selectedAnswer: true, isCorrect: false });
});

test("practice state: payload incompatibile scartato", () => {
  const storage = new MemStorage();
  storage.setItem(practiceStorageKeyFor("x"), JSON.stringify({ sessionId: "x", payloadVersion: 999, selected: {} }));
  assert.equal(loadPersistedPracticeState(storage, "x"), null);
});

test("practice state: JSON corrotto scartato senza throw", () => {
  const storage = new MemStorage();
  storage.setItem(practiceStorageKeyFor("x"), "{not json");
  assert.equal(loadPersistedPracticeState(storage, "x"), null);
});

test("practice state: localStorage non disponibile non crasha", () => {
  const broken: StorageLike = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  };
  assert.equal(loadPersistedPracticeState(broken, "x"), null);
  assert.equal(savePersistedPracticeState(broken, sampleState()), false);
  clearPersistedPracticeState(broken, "x"); // non deve lanciare
});

test("practice state: registry + listInProgressPractice", () => {
  const storage = new MemStorage();
  const s1 = sampleState("11111111-1111-4111-8111-111111111111");
  const s2 = sampleState("22222222-2222-4222-8222-222222222222");
  s2.mode = "mistakes";
  savePersistedPracticeState(storage, s1);
  savePersistedPracticeState(storage, s2);
  registerPracticeSession(storage, s1.sessionId);
  registerPracticeSession(storage, s2.sessionId);
  const list = listInProgressPractice(storage);
  assert.equal(list.length, 2);
  // completata -> rimossa dalla lista se unregister
  unregisterPracticeSession(storage, s2.sessionId);
  const list2 = listInProgressPractice(storage);
  assert.equal(list2.length, 1);
  assert.equal(list2[0].sessionId, s1.sessionId);
});

test("practice state: stato completato marcato (rimozione esplicita)", () => {
  const storage = new MemStorage();
  const state = sampleState();
  savePersistedPracticeState(storage, state);
  clearPersistedPracticeState(storage, state.sessionId);
  assert.equal(loadPersistedPracticeState(storage, state.sessionId), null);
});

test("practice state: parse tolerante a campi mancanti", () => {
  const raw = JSON.stringify({
    sessionId: "33333333-3333-4333-8333-333333333333",
    payloadVersion: siteConfig.payloadVersion,
    // senza currentPosition/selected/verified
  });
  const parsed = parsePersistedPracticeState(raw);
  assert.ok(parsed);
  assert.equal(parsed!.currentPosition, 1);
  assert.deepEqual(parsed!.selected, {});
  assert.deepEqual(parsed!.verified, {});
});
