import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePositional } from "../scripts/data/lib/position-parser";

/**
 * Regression tests for the two known statement-contamination bugs:
 *  1. short questions where the PDF concatenates VERO/FALSO inside the
 *     statement cell (x≈77.5) — the token must be stripped and converted
 *     into correctAnswer, never left in the official text;
 *  2. PDF column headers ("Testo domanda") that fall inside the previous
 *     question row band — they must be filtered out of the statement.
 */

function item(page: number, s: string, x: number, y: number) {
  return { page, s, x, y };
}

test("position parser: strips trailing VERO/FALSO concatenated in the statement cell", () => {
  const items = [
    item(1, "Quesito n° 4000 - Segnali di indicazione", 20, 700),
    item(1, "10001", 22, 600),
    item(1, "Il segnale raffigurato riporta le località con le relative distanze in chilometri VERO", 77.5, 600),
    item(1, "10002", 22, 500),
    item(1, "Il segnale raffigurato consente di circolare a 160 km/h in tutte e tre le corsie FALSO", 77.5, 500),
  ];
  const numberCells = [
    { page: 1, str: "10001", x: 22, y: 600 },
    { page: 1, str: "10002", x: 22, y: 500 },
  ];
  const { questions, unrecognized } = parsePositional(items, numberCells);

  assert.equal(questions.length, 2, "both rows parsed");
  assert.equal(unrecognized.length, 0);

  const q1 = questions.find((q) => q.questionNumber === "10001");
  assert.equal(q1?.statement, "Il segnale raffigurato riporta le località con le relative distanze in chilometri");
  assert.equal(q1?.correctAnswer, true);

  const q2 = questions.find((q) => q.questionNumber === "10002");
  assert.equal(q2?.statement, "Il segnale raffigurato consente di circolare a 160 km/h in tutte e tre le corsie");
  assert.equal(q2?.correctAnswer, false);
});

test("position parser: filters 'Testo domanda' column header inside a row band", () => {
  const items = [
    item(1, "Quesito n° 4000 - Segnali di indicazione", 20, 700),
    item(1, "10001", 22, 600),
    item(1, "Prima riga dello statement", 77.5, 600),
    item(1, "seconda riga dello statement", 77.5, 590),
    item(1, "FALSO", 355, 600),
    // the repeated column header row lands inside the band of row 10001
    item(1, "Testo domanda", 77.5, 575),
    item(1, "10002", 22, 500),
    item(1, "Altro quesito", 77.5, 500),
    item(1, "VERO", 355, 500),
  ];
  const numberCells = [
    { page: 1, str: "10001", x: 22, y: 600 },
    { page: 1, str: "10002", x: 22, y: 500 },
  ];
  const { questions, unrecognized } = parsePositional(items, numberCells);

  assert.equal(unrecognized.length, 0);
  const q1 = questions.find((q) => q.questionNumber === "10001");
  assert.equal(q1?.statement, "Prima riga dello statement seconda riga dello statement");
  assert.equal(q1?.correctAnswer, false);
  assert.ok(!q1?.statement.includes("Testo domanda"), "header never leaks into the statement");

  const q2 = questions.find((q) => q.questionNumber === "10002");
  assert.equal(q2?.statement, "Altro quesito");
  assert.equal(q2?.correctAnswer, true);
});
