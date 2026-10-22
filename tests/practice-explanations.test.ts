import { test } from "node:test";
import assert from "node:assert/strict";
import bank from "../src/data/practice-explanations.json";
import { explanationKey, getPracticeExplanation } from "../src/lib/practice/explanations";
import { toQuestionStates } from "../src/lib/practice/payload";

const question = { statement: "Il simbolo raffigurato è posto su una spia a luce blu", correctAnswer: true,
  imageRef: "436a1bf66e0ad8336d20d711af1cc0e2b8bf41eb870491573af8c01d7a2c3b7b" };

test("explanations bind statement, solution and image, including across catalogues", () => {
  assert.match(getPracticeExplanation(question)!.text, /abbaglianti/);
  assert.equal(getPracticeExplanation({ ...question, correctAnswer: false }), null);
  assert.equal(getPracticeExplanation({ ...question, imageRef: null }), null);
  assert.equal(getPracticeExplanation({ ...question, statement: "Un diverso simbolo" }), null);
  assert.equal(explanationKey({ ...question, statement: ` ${question.statement.replaceAll(" ", "  ")} ` }), explanationKey(question));
});

test("state never reveals an explanation before server-side verification", () => {
  const input = { ...question, questionId: "fixture", position: 1, selectedAnswer: false, answerVerified: false };
  assert.equal(Object.hasOwn(toQuestionStates([input])[0], "explanation"), false);
  const verified = toQuestionStates([{ ...input, answerVerified: true }])[0];
  assert.equal(verified.isCorrect, false);
  assert.match(verified.explanation!.text, /abbaglianti/);
});

test("all published entries have source evidence, bounded copy and matching bindings", () => {
  for (const [key, item] of Object.entries(bank.entries)) {
    assert.equal(explanationKey(item), key);
    assert.equal(item.status, "verified_sources");
    assert.ok(item.verifiedAt);
    assert.ok(item.text.length > 30 && item.text.length <= 900);
    assert.ok(item.remember.length > 0 && item.remember.length <= 120);
    assert.ok(item.verification.evidence.length > 0);
    assert.equal(item.verification.humanReviewed, false);
    assert.equal(new URL(item.sourceUrl).hostname, "www.ilportaledellautomobilista.it");
  }
});
