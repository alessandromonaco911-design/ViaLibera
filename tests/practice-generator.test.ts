import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPracticeQuestions, PracticeGenerationError } from "../src/lib/practice/generator";

interface T {
  id: string;
  groupCode: string | null;
}

function c(id: string, group: string | null = "G1"): T {
  return { id, groupCode: group };
}

function ids(sel: T[]): string[] {
  return sel.map((x) => x.id);
}

test("practice generator: seleziona esattamente 10 domande", () => {
  const candidates = Array.from({ length: 60 }, (_, i) => c(`q${String(i).padStart(4, "0")}`, `G${i % 12}`));
  const { selected } = selectPracticeQuestions(candidates, { seed: 42, total: 10, maxPerGroup: 6 });
  assert.equal(selected.length, 10);
});

test("practice generator: seleziona esattamente 20 domande", () => {
  const candidates = Array.from({ length: 60 }, (_, i) => c(`q${String(i).padStart(4, "0")}`, `G${i % 12}`));
  const { selected } = selectPracticeQuestions(candidates, { seed: 42, total: 20, maxPerGroup: 6 });
  assert.equal(selected.length, 20);
});

test("practice generator: seleziona esattamente 30 domande", () => {
  const candidates = Array.from({ length: 60 }, (_, i) => c(`q${String(i).padStart(4, "0")}`, `G${i % 12}`));
  const { selected } = selectPracticeQuestions(candidates, { seed: 42, total: 30, maxPerGroup: 6 });
  assert.equal(selected.length, 30);
});

test("practice generator: unicità (nessuna duplicazione)", () => {
  const candidates = Array.from({ length: 100 }, (_, i) => c(`q${i}`, `G${i % 20}`));
  const { selected } = selectPracticeQuestions(candidates, { seed: 7, total: 30, maxPerGroup: 6 });
  assert.equal(new Set(ids(selected)).size, 30);
});

test("practice generator: determinismo (stesso seed = stessa selezione)", () => {
  const candidates = Array.from({ length: 100 }, (_, i) => c(`q${i}`, `G${i % 20}`));
  const a = selectPracticeQuestions(candidates, { seed: 9, total: 20, maxPerGroup: 6 });
  const b = selectPracticeQuestions(candidates, { seed: 9, total: 20, maxPerGroup: 6 });
  assert.deepEqual(ids(a.selected), ids(b.selected));
});

test("practice generator: seed diverso -> selezione normalmente differente", () => {
  const candidates = Array.from({ length: 200 }, (_, i) => c(`q${i}`, `G${i % 40}`));
  const a = selectPracticeQuestions(candidates, { seed: 1, total: 20, maxPerGroup: 6 });
  const b = selectPracticeQuestions(candidates, { seed: 2, total: 20, maxPerGroup: 6 });
  assert.notDeepEqual(ids(a.selected), ids(b.selected));
});

test("practice generator: cap per gruppo rilassato (maxPerGroup)", () => {
  // 8 domande nello stesso gruppo, total 6 -> il primo pass col cap 6 ne prende 6
  const candidates = Array.from({ length: 8 }, (_, i) => c(`q${i}`, "G-SOLO"));
  const { selected } = selectPracticeQuestions(candidates, { seed: 3, total: 6, maxPerGroup: 6 });
  assert.equal(selected.length, 6);
});

test("practice generator: fallback senza cap quando il cap rende impossibile la sessione", () => {
  // 8 domande nello stesso gruppo, cap 6 -> con cap non si arriva a 8, il fallback le prende tutte
  const candidates = Array.from({ length: 8 }, (_, i) => c(`q${i}`, "G-UNICO"));
  const { selected } = selectPracticeQuestions(candidates, { seed: 5, total: 8, maxPerGroup: 6 });
  assert.equal(selected.length, 8);
});

test("practice generator: topic insufficiente -> meno di total", () => {
  const candidates = Array.from({ length: 5 }, (_, i) => c(`q${i}`, `G${i}`));
  const { selected } = selectPracticeQuestions(candidates, { seed: 5, total: 30, maxPerGroup: 6 });
  assert.equal(selected.length, 5);
});

test("practice generator: seed invalido -> errore", () => {
  assert.throws(() => selectPracticeQuestions([], { seed: 0, total: 30, maxPerGroup: 6 }), PracticeGenerationError);
  assert.throws(() => selectPracticeQuestions([], { seed: 1.5, total: 30, maxPerGroup: 6 }), PracticeGenerationError);
  assert.throws(() => selectPracticeQuestions([], { seed: NaN, total: 30, maxPerGroup: 6 }), PracticeGenerationError);
});

test("practice generator: total non valido -> errore", () => {
  assert.throws(() => selectPracticeQuestions([], { seed: 1, total: 0, maxPerGroup: 6 }), PracticeGenerationError);
  assert.throws(() => selectPracticeQuestions([], { seed: 1, total: -3, maxPerGroup: 6 }), PracticeGenerationError);
});
