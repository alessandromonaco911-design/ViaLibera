import type { GroupHeader, ParsedQuestion, ParseState, UnrecognizedLine } from "./types";

/**
 * Pure text parser for the official question PDF layout.
 * Operates on extracted text pages; keeps the official statement text unchanged
 * except for whitespace normalization (newlines -> single spaces) which is a
 * purely technical normalization of the extraction.
 */

export const SKIP_LINES = new Set([
  "Numero",
  "domanda",
  "Testo domanda",
  "Risposta",
  "Corretta",
  "Risposta Corretta",
  "Immagine",
  "domanda Testo domanda Risposta Corretta Immagine",
  "Ministero delle Infrastrutture e dei Trasporti",
]);

export const GROUP_RE = /^Quesito\s+n[°o]\s+(\d+)\s*[-–]\s*(.+)$/;
export const QUESTION_RE = /^(\d{4,7})\s+(.*)$/;

export function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function createParseState(): ParseState {
  return { out: { questions: [], groups: [], unrecognized: [] }, group: null, globalLineOffset: 0 };
}

/**
 * Parse a page of extracted text, keeping cross-page group state in `state`.
 * Returns the questions/groups/unrecognized via state.out.
 */
export function parsePageText(page: number, text: string, state: ParseState): void {
  const { out, globalLineOffset } = state;
  let group = state.group;
  const lines = text.split("\n");
  let current: { number: string; lines: string[]; lineStart: number } | null = null;
  let groupHasQuestions = false;

  const finish = () => {
    if (!current) return;
    const lastLine = current.lines[current.lines.length - 1];
    const answerTok = lastLine.match(/\s*(VERO|FALSO)\s*$/);
    if (!answerTok) {
      out.unrecognized.push({
        page,
        line: globalLineOffset + current.lineStart,
        text: current.lines.join(" ").slice(0, 120),
      });
    } else {
      const trimmedLast = lastLine.replace(/\s*(VERO|FALSO)\s*$/, "").trim();
      const all = [...current.lines.slice(0, -1), trimmedLast];
      const statementFull = normalizeLine(all.join(" "));
      if (group) {
        out.questions.push({
          page,
          questionNumber: current.number,
          groupCode: group.code,
          topic: group.topic,
          statement: statementFull,
          correctAnswer: answerTok[1] === "VERO",
          imageRef: null,
          imageBBox: null,
          rowBand: null,
          structuralConfidence: null,
          sourceLineStart: globalLineOffset + current.lineStart,
          sourceLineEnd: globalLineOffset + current.lineStart + current.lines.length - 1,
          contentHash: "",
        });
        groupHasQuestions = true;
      } else {
        out.unrecognized.push({
          page,
          line: globalLineOffset + current.lineStart,
          text: statementFull.slice(0, 120),
        });
      }
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const t = normalizeLine(lines[i]);
    if (!t) continue;

    const gm = t.match(GROUP_RE);
    if (gm) {
      finish();
      group = { code: gm[1], topic: gm[2], page, line: globalLineOffset + i + 1 };
      groupHasQuestions = false;
      out.groups.push(group);
      continue;
    }
    if (SKIP_LINES.has(t)) continue;

    const qm = t.match(QUESTION_RE);
    if (qm) {
      finish();
      current = { number: qm[1], lines: [qm[2]], lineStart: i + 1 };
      if (/VERO|FALSO$/.test(qm[2])) finish();
      continue;
    }

    if (current) {
      current.lines.push(t);
      if (/VERO|FALSO$/.test(t)) finish();
    } else if (group && !groupHasQuestions) {
      // topic continuation (long group names wrap) only before the first question
      group.topic = normalizeLine(group.topic + " " + t);
    } else {
      out.unrecognized.push({ page, line: globalLineOffset + i + 1, text: t.slice(0, 120) });
    }
  }
  finish();
  state.group = group;
}

/** Parse a full multi-page document (array of {page, text}) in order. */
export function parseDocument(pages: { page: number; text: string }[]): ParseState {
  const state = createParseState();
  for (const p of pages) {
    parsePageText(p.page, p.text, state);
    state.globalLineOffset += p.text.split("\n").length;
  }
  return state;
}

export type { GroupHeader, ParsedQuestion, UnrecognizedLine };
