import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreSubmission, submissionResultHash } from "../src/lib/exam/scoring";

const ID = (n: number) => `${n}`.padStart(3, "0").repeat(8);

function answers(rows: { selectedAnswer: boolean | null; correctAnswer: boolean }[]) {
  return rows.map((r, i) => ({
    questionId: ID(i),
    position: i + 1,
    selectedAnswer: r.selectedAnswer,
    correctAnswer: r.correctAnswer,
  }));
}

test("correzione: 30 corrette = superato", () => {
  const r = scoreSubmission({
    totalQuestions: 30,
    allowedErrors: 3,
    answers: answers(Array.from({ length: 30 }, () => ({ selectedAnswer: true, correctAnswer: true }))),
  });
  assert.equal(r.correctCount, 30);
  assert.equal(r.errorCount, 0);
  assert.equal(r.passed, true);
});

test("correzione: 3 errori = superato (soglia)", () => {
  const rows = Array.from({ length: 30 }, () => ({ selectedAnswer: true, correctAnswer: true }));
  rows[0] = { selectedAnswer: false, correctAnswer: true };
  rows[1] = { selectedAnswer: false, correctAnswer: true };
  rows[2] = { selectedAnswer: false, correctAnswer: true };
  const r = scoreSubmission({ totalQuestions: 30, allowedErrors: 3, answers: answers(rows) });
  assert.equal(r.errorCount, 3);
  assert.equal(r.correctCount, 27);
  assert.equal(r.passed, true);
});

test("correzione: 4 errori = non superato", () => {
  const rows = Array.from({ length: 30 }, () => ({ selectedAnswer: true, correctAnswer: true }));
  rows[0] = { selectedAnswer: false, correctAnswer: true };
  rows[1] = { selectedAnswer: false, correctAnswer: true };
  rows[2] = { selectedAnswer: false, correctAnswer: true };
  rows[3] = { selectedAnswer: false, correctAnswer: true };
  const r = scoreSubmission({ totalQuestions: 30, allowedErrors: 3, answers: answers(rows) });
  assert.equal(r.errorCount, 4);
  assert.equal(r.passed, false);
});

test("correzione: non risposta = errore", () => {
  const rows: { selectedAnswer: boolean | null; correctAnswer: boolean }[] = Array.from({ length: 30 }, () => ({
    selectedAnswer: true,
    correctAnswer: true,
  }));
  rows[0] = { selectedAnswer: null, correctAnswer: true };
  const r = scoreSubmission({ totalQuestions: 30, allowedErrors: 3, answers: answers(rows) });
  assert.equal(r.unansweredCount, 1);
  assert.equal(r.errorCount, 1);
});

test("correzione: risultato hash deterministico e sensibile al payload", () => {
  const base = { sessionId: "s1", answers: [{ questionId: "q1", selectedAnswer: true }], flagged: [] };
  const a = submissionResultHash(base);
  const b = submissionResultHash({ ...base, answers: [{ questionId: "q1", selectedAnswer: true }] });
  const c = submissionResultHash({ ...base, answers: [{ questionId: "q1", selectedAnswer: false }] });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
