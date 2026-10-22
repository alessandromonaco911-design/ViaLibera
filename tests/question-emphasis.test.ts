import { test } from "node:test";
import assert from "node:assert/strict";
import { questionEmphasis } from "../src/lib/practice/question-emphasis";

test("reading cues preserve exact official text, punctuation and case", () => {
  const text = "La sosta NON è consentita, purché sia rispettato il limite di 50 km/h.";
  const parts = questionEmphasis(text);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.deepEqual(parts.filter((part) => part.emphasized).map((part) => part.text), ["sosta", "NON", "consentita", "purché", "50 km/h"]);
});

test("reading cues match full words and never create an answer hint from word fragments", () => {
  const text = "Nonostante il solo riferimento al minimo, il veicolo prosegue.";
  const parts = questionEmphasis(text);
  assert.deepEqual(parts.filter((part) => part.emphasized).map((part) => part.text), ["solo", "minimo"]);
  assert.equal(parts.map((part) => part.text).join(""), text);
});
