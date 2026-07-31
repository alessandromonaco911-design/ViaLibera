import { test } from "node:test";
import assert from "node:assert/strict";
import { mapImagesToQuestions, overlapRatio, centeringFactor, bboxWithinPage } from "../scripts/data/lib/mapping";
import { parseDocument } from "../scripts/data/lib/text-parser";
import type { CellLike, ImageLike, ParsedQuestion } from "../scripts/data/lib/types";

/** Build a question list from fixture text (rows without images). */
function questionsFrom(text: string): ParsedQuestion[] {
  return parseDocument([{ page: 1, text }]).out.questions;
}

function cells(...rows: [string, number][]): CellLike[] {
  return rows.map(([str, y]) => ({ page: 1, str, x: 22, y }));
}

function img(name: string, y: number, h: number, hash: string, x = 465): ImageLike {
  return { page: 1, name, x, y, w: 80, h, hash };
}

const PAGE_TEXT =
  "Quesito n° 3001 - Argomento immagini\n" +
  "21830 Prima domanda con immagine VERO\n" +
  "21831 Seconda domanda senza immagine FALSO\n";

test("6. domanda senza immagine + 7. domanda con immagine (mapping 1:1)", () => {
  const questions = questionsFrom(PAGE_TEXT);
  const result = mapImagesToQuestions(questions, [img("im1", 600, 80, "hash-a")], cells(["21830", 672], ["21831", 586]));
  assert.equal(result.matched, 1);
  assert.equal(result.ambiguous.length, 0);
  const q30 = questions.find((q) => q.questionNumber === "21830")!;
  const q31 = questions.find((q) => q.questionNumber === "21831")!;
  assert.equal(q30.imageRef, "hash-a");
  assert.equal(q31.imageRef, null);
  assert.ok(q30.imageBBox);
  assert.equal(q30.imageBBox!.page, 1);
  assert.ok(q30.structuralConfidence !== null && q30.structuralConfidence > 0.5);
});

test("8. più immagini sulla stessa pagina", () => {
  const text =
    "Quesito n° 3002 - Argomento più immagini\n" +
    "21832 Prima domanda VERO\n21833 Seconda domanda FALSO\n21834 Terza domanda VERO\n";
  const questions = questionsFrom(text);
  const result = mapImagesToQuestions(
    questions,
    [img("im1", 600, 80, "hash-1"), img("im2", 514, 80, "hash-2"), img("im3", 428, 80, "hash-3")],
    cells(["21832", 672], ["21833", 586], ["21834", 500]),
  );
  assert.equal(result.matched, 3);
  assert.deepEqual(
    questions.map((q) => q.imageRef),
    ["hash-1", "hash-2", "hash-3"],
  );
});

test("12. immagine duplicata per hash (stesso segnale ripetuto su più righe)", () => {
  const text =
    "Quesito n° 3003 - Argomento segnale ripetuto\n" +
    "21835 Prima domanda sul segnale VERO\n21836 Seconda domanda sul segnale FALSO\n";
  const questions = questionsFrom(text);
  const result = mapImagesToQuestions(
    questions,
    [img("im1", 600, 80, "same-hash"), img("im2", 514, 80, "same-hash")],
    cells(["21835", 672], ["21836", 586]),
  );
  assert.equal(result.matched, 2);
  assert.equal(questions[0].imageRef, "same-hash");
  assert.equal(questions[1].imageRef, "same-hash");
});

test("14. associazione ambigua (due immagini che si sovrappongono alla stessa banda)", () => {
  const text = "Quesito n° 3004 - Argomento ambiguo\n21837 Domanda A VERO\n21838 Domanda B FALSO\n";
  const questions = questionsFrom(text);
  // dense rows (spacing 50): A baseline 650, B baseline 600
  const result = mapImagesToQuestions(
    questions,
    [img("im1", 620, 60, "hash-x"), img("im2", 560, 60, "hash-y")],
    cells(["21837", 650], ["21838", 600]),
  );
  assert.equal(result.ambiguous.length, 1, "una riga deve risultare ambigua");
  assert.equal(questions.find((q) => q.questionNumber === "21837")!.structuralConfidence! < 0.55, true);
});

test("overlapRatio e centeringFactor (unità)", () => {
  const band = { bottom: 596, top: 682 };
  assert.equal(overlapRatio(600, 80, band), 1); // fully contained
  assert.equal(overlapRatio(500, 50, band), 0); // no overlap
  assert.equal(overlapRatio(640, 60, band), 0.7); // partial: overlap 42/60
  // image center 640 vs band center 639 -> offset 1/86 -> factor ~0.988
  const cf = centeringFactor(600, 80, band);
  assert.ok(Math.abs(cf - 0.9884) < 0.01, `expected ~0.988, got ${cf}`);
  const off = centeringFactor(620, 40, band); // center 640 vs 639
  assert.ok(off > 0.9);
});

test("bboxWithinPage", () => {
  const dim = { page: 1, width: 595, height: 842 };
  assert.equal(bboxWithinPage({ x: 465, y: 100, w: 80, h: 80 }, dim), true);
  assert.equal(bboxWithinPage({ x: 465, y: 900, w: 80, h: 80 }, dim), false);
  assert.equal(bboxWithinPage({ x: 465, y: 100, w: 80, h: 800 }, dim), false);
});
