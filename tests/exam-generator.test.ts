import { test } from "node:test";
import assert from "node:assert/strict";
import { selectQuestions, ALLOWED_MEDIA_STATUSES, isValidSeed, type QuestionCandidate } from "../src/lib/exam/generator";

function c(id: string, group: string | null = "G1", imageRef: string | null = null, mediaStatus: string | null = null): QuestionCandidate {
  return { id, groupCode: group, imageRef, mediaStatus };
}

function ids(sel: { id: string }[]): string[] {
  return sel.map((x) => x.id);
}

test("generator: seleziona esattamente 30 domande uniche", () => {
  const candidates = Array.from({ length: 200 }, (_, i) => c(`q${String(i).padStart(4, "0")}`, `G${i % 40}`));
  const { selected, rejected } = selectQuestions(candidates, { seed: 42, total: 30, maxPerGroup: 4 });
  assert.equal(selected.length, 30);
  assert.equal(new Set(ids(selected)).size, 30);
  assert.equal(rejected.length, 170);
});

test("generator: seed deterministico -> stessa selezione e stesso ordine", () => {
  const candidates = Array.from({ length: 100 }, (_, i) => c(`q${i}`, `G${i % 25}`));
  const a = selectQuestions(candidates, { seed: 7, total: 30, maxPerGroup: 4 });
  const b = selectQuestions(candidates, { seed: 7, total: 30, maxPerGroup: 4 });
  assert.deepEqual(ids(a.selected), ids(b.selected));
});

test("generator: seed diverso -> selezione normalmente differente", () => {
  const candidates = Array.from({ length: 200 }, (_, i) => c(`q${i}`, `G${i % 50}`));
  const a = selectQuestions(candidates, { seed: 1, total: 30, maxPerGroup: 4 });
  const b = selectQuestions(candidates, { seed: 2, total: 30, maxPerGroup: 4 });
  // with 200 candidates and cap 4 there is plenty of space for different selections
  assert.notDeepEqual(ids(a.selected), ids(b.selected));
});

test("generator: limite per gruppo rispettato", () => {
  const candidates = Array.from({ length: 60 }, (_, i) => c(`q${i}`, "G-SOLO"));
  const { selected } = selectQuestions(candidates, { seed: 3, total: 30, maxPerGroup: 4 });
  assert.equal(selected.length, 4); // solo 4 ammessi per gruppo
});

test("generator: catalogo insufficiente -> seleziona meno di 30", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => c(`q${i}`, `G${i}`));
  const { selected, rejected } = selectQuestions(candidates, { seed: 5, total: 30, maxPerGroup: 4 });
  assert.equal(selected.length, 10); // tutto il disponibile
  assert.ok(selected.length < 30);
  assert.ok(rejected.length >= 0);
});

test("generator: stato media non valido escluso", () => {
  const candidates = [
    c("q1", "G1", "a".repeat(64), "structurally_verified"),
    c("q2", "G1", "b".repeat(64), "rejected"),
    c("q3", "G1", "c".repeat(64), "missing"),
    c("q4", "G1", "d".repeat(64), "ambiguous"),
    c("q5", "G1", "e".repeat(64), "ai_visually_verified"),
  ];
  const { selected } = selectQuestions(candidates, { seed: 1, total: 5, maxPerGroup: 4 });
  const selIds = ids(selected);
  assert.ok(selIds.includes("q1"));
  assert.ok(selIds.includes("q5"));
  assert.ok(!selIds.includes("q2"));
  assert.ok(!selIds.includes("q3"));
  assert.ok(!selIds.includes("q4"));
});

test("generator: asset di riferimento mancante -> domanda esclusa", () => {
  const candidates = [c("q1", "G1", "f".repeat(64), null)];
  const { selected, rejected } = selectQuestions(candidates, { seed: 1, total: 1, maxPerGroup: 1 });
  assert.equal(selected.length, 0);
  assert.ok(rejected.some((r) => r.reason.includes("asset di riferimento mancante")));
});

test("generator: domande senza immagine restano utilizzabili", () => {
  const candidates = [c("q1", "G1", null, null)];
  const { selected } = selectQuestions(candidates, { seed: 1, total: 1, maxPerGroup: 1 });
  assert.equal(ids(selected)[0], "q1");
});

test("generator: catalogo assente -> nessuna candidata selezionata", () => {
  const { selected } = selectQuestions([], { seed: 1, total: 30, maxPerGroup: 4 });
  assert.equal(selected.length, 0);
});

test("generator: seed invalido -> errore", () => {
  assert.throws(() => selectQuestions([], { seed: 0, total: 30, maxPerGroup: 4 }));
  assert.throws(() => selectQuestions([], { seed: 1.5, total: 30, maxPerGroup: 4 }));
  assert.throws(() => selectQuestions([], { seed: NaN, total: 30, maxPerGroup: 4 }));
  assert.ok(isValidSeed(1));
  assert.ok(!isValidSeed(0));
  assert.ok(!isValidSeed("x"));
});

test("generator: ALLOWED_MEDIA_STATUSES contiene i due stati utilizzabili", () => {
  assert.deepEqual([...ALLOWED_MEDIA_STATUSES].sort(), ["ai_visually_verified", "structurally_verified"]);
});
