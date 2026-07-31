import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument, createParseState, parsePageText } from "../scripts/data/lib/text-parser";
import { contentHash } from "../scripts/data/lib/hashes";

const fixtures = JSON.parse(readFileSync(join(__dirname, "fixtures", "scenarios.json"), "utf-8")) as {
  pages: Record<string, { page: number; text: string }[]>;
};

function parseScenario(name: string) {
  return parseDocument(fixtures.pages[name]).out;
}

test("1. parsing di una domanda VERO", () => {
  const { questions } = parseScenario("vero");
  assert.equal(questions.length, 1);
  assert.equal(questions[0].questionNumber, "21810");
  assert.equal(questions[0].correctAnswer, true);
  assert.equal(questions[0].groupCode, "1001");
  assert.equal(questions[0].statement, "Il segnale raffigurato preavvisa confine di Stato");
});

test("2. parsing di una domanda FALSO", () => {
  const { questions } = parseScenario("falso");
  assert.equal(questions.length, 1);
  assert.equal(questions[0].questionNumber, "21811");
  assert.equal(questions[0].correctAnswer, false);
});

test("3. testo su più righe", () => {
  const { questions } = parseScenario("multiline");
  assert.equal(questions.length, 1);
  assert.equal(
    questions[0].statement,
    "Il segnale raffigurato preavvisa la distanza dal confine con uno Stato che fa parte dell'Unione Europea",
  );
  assert.equal(questions[0].sourceLineStart, 2);
  assert.equal(questions[0].sourceLineEnd, 3);
});

test("4. gruppo che continua nella pagina successiva", () => {
  const { questions, groups } = parseScenario("groupContinuation");
  assert.equal(questions.length, 3);
  assert.deepEqual(
    questions.map((q) => q.groupCode),
    ["1004", "1004", "1004"],
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].topic, "Argomento continuato");
});

test("5. intestazione di tabella ripetuta", () => {
  const { questions, unrecognized } = parseScenario("repeatedHeader");
  assert.equal(questions.length, 2);
  assert.equal(unrecognized.length, 0);
});

test("9. più gruppi sulla stessa pagina", () => {
  const { questions, groups } = parseScenario("multiGroup");
  assert.equal(questions.length, 2);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    questions.map((q) => q.groupCode),
    ["1006", "1007"],
  );
});

test("10. contenuto duplicato con codice differente", () => {
  const { questions } = parseScenario("duplicateContent");
  assert.equal(questions.length, 2);
  assert.notEqual(questions[0].questionNumber, questions[1].questionNumber);
  assert.equal(questions[0].statement, questions[1].statement);
  assert.equal(questions[0].correctAnswer, questions[1].correctAnswer);
  // contentHash identical but codes differ -> natural key (code) still unique
  const h0 = contentHash(questions[0].statement, questions[0].correctAnswer, null);
  const h1 = contentHash(questions[1].statement, questions[1].correctAnswer, null);
  assert.equal(h0, h1);
  assert.notEqual(questions[0].questionNumber, questions[1].questionNumber);
});

test("11. codice domanda duplicato illegittimo", () => {
  const { questions } = parseScenario("duplicateCode");
  assert.equal(questions.length, 2);
  const seen = new Set(questions.map((q) => q.questionNumber));
  assert.equal(seen.size, 1, "entrambe le righe hanno lo stesso codice ufficiale -> violazione chiave naturale");
});

test("13. riga malformata", () => {
  const { questions, unrecognized } = parseScenario("malformed");
  assert.equal(questions.length, 1);
  assert.equal(unrecognized.length, 1);
  assert.match(unrecognized[0].text, /riga completamente malformata/);
});

test("15. esecuzione ripetuta senza variazioni nell'output", () => {
  const a = JSON.stringify(parseScenario("multiline"));
  const b = JSON.stringify(parseScenario("multiline"));
  assert.equal(a, b);
});

test("16. encoding e newline differenti", () => {
  const crlf = parseDocument(fixtures.pages.crlfEncoded);
  const lf = parseDocument(
    fixtures.pages.crlfEncoded.map((p) => ({ page: p.page, text: p.text.replace(/\r\n/g, "\n") })),
  );
  assert.equal(JSON.stringify(crlf), JSON.stringify(lf));
});

test("17. parser che non modifica il testo ufficiale", () => {
  const { questions } = parseScenario("officialText");
  assert.equal(
    questions[0].statement,
    "L'attenzione alla guida è importante solo quando si compiono manovre pericolose quali, ad esempio, un sorpasso",
  );
  // original accents/apostrophes preserved verbatim
  assert.ok(questions[0].statement.includes("L'attenzione"));
  assert.ok(questions[0].statement.includes("quali, ad esempio,"));
});

test("18. contentHash deterministico", () => {
  const s = "Il segnale raffigurato preavvisa confine di Stato";
  const h1 = contentHash(s, true, null);
  const h2 = contentHash(s, true, null);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  const h3 = contentHash(s, false, null);
  assert.notEqual(h1, h3, "risposta diversa -> hash diverso");
  const h4 = contentHash(s, true, "abc");
  assert.notEqual(h1, h4, "immagine diversa -> hash diverso");
});

test("parse state resets between documents", () => {
  const state = createParseState();
  parsePageText(1, "Quesito n° 2000 - Solo gruppo\n", state);
  assert.equal(state.out.groups.length, 1);
});
