import type { GroupHeader, ParsedQuestion, UnrecognizedLine } from "./types";

/**
 * Position-based parser for the official question PDF.
 *
 * The real layout (verified via pdf.js positions):
 * - group header "Quesito n° {code} - {topic}" can wrap over several lines,
 *   and the wrap can continue on the NEXT page;
 * - a page can contain multiple stacked table sections, each with its own
 *   group header and repeated column header;
 * - every row: number cell (x≈22), statement column (x≈77.5), answer column
 *   (x≈355). The answer (VERO/FALSO) sits on the FIRST line of the row
 *   (same baseline as the number), NOT necessarily at the end of the text;
 * - the statement can span several lines below the first one.
 *
 * Parsing is therefore based on positions (row bands), not on reading order
 * of the extracted text lines.
 */

export interface PositionItem {
  page: number;
  s: string;
  x: number;
  y: number;
}

export interface NumberCellLike {
  page: number;
  str: string;
  x: number;
  y: number;
}

export interface PositionParseResult {
  questions: ParsedQuestion[];
  groups: GroupHeader[];
  unrecognized: UnrecognizedLine[];
}

export const SKIP_VALUES = new Set([
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

export function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

interface Row {
  page: number;
  number: string;
  baseline: number;
  bandBottom: number;
  bandTop: number;
  statementItems: PositionItem[];
  answerItems: PositionItem[];
  group: GroupHeader | null;
}

export function parsePositional(items: PositionItem[], numberCells: NumberCellLike[]): PositionParseResult {
  const questions: ParsedQuestion[] = [];
  const groups: GroupHeader[] = [];
  const unrecognized: UnrecognizedLine[] = [];

  const cellsByPage = new Map<number, NumberCellLike[]>();
  for (const c of numberCells) {
    if (!cellsByPage.has(c.page)) cellsByPage.set(c.page, []);
    cellsByPage.get(c.page)!.push(c);
  }

  const itemsByPage = new Map<number, PositionItem[]>();
  for (const it of items) {
    if (!itemsByPage.has(it.page)) itemsByPage.set(it.page, []);
    itemsByPage.get(it.page)!.push(it);
  }

  const pages = [...new Set([...itemsByPage.keys(), ...cellsByPage.keys()])].sort((a, b) => a - b);

  // group carried across pages (the last header seen on previous pages)
  let carriedGroup: GroupHeader | null = null;

  for (const page of pages) {
    const pageItems = (itemsByPage.get(page) ?? []).sort((a, b) => b.y - a.y || a.x - b.x);
    const rowsRaw = (cellsByPage.get(page) ?? []).sort((a, b) => b.y - a.y);

    // row bands (PDF y grows upward)
    const rows: Row[] = rowsRaw.map((c, i) => {
      const baseline = c.y;
      const bandBottom = i < rowsRaw.length - 1 ? rowsRaw[i + 1].y + 10 : baseline - 76;
      const bandTop = baseline + 10;
      return {
        page,
        number: c.str,
        baseline,
        bandBottom,
        bandTop,
        statementItems: [],
        answerItems: [],
        group: null,
      };
    });

    // band membership for every item
    const bandOf = new Map<PositionItem, Row | null>();
    for (const it of pageItems) {
      let row: Row | null = null;
      for (const r of rows) {
        if (it.y >= r.bandBottom && it.y <= r.bandTop) {
          row = r;
          break;
        }
      }
      bandOf.set(it, row);
      if (row) {
        if (it.x > 50 && it.x < 340) row.statementItems.push(it);
        else if (it.x > 340 && /^(VERO|FALSO)$/.test(it.s)) row.answerItems.push(it);
      }
    }
    for (const r of rows) {
      r.statementItems.sort((a, b) => b.y - a.y || a.x - b.x);
      r.answerItems.sort((a, b) => b.y - a.y);
    }

    const rowByBaseline = new Map<number, Row>();
    for (const r of rows) rowByBaseline.set(r.baseline, r);

    let currentGroup: GroupHeader | null = carriedGroup;
    let groupHasRows = false;
    let lineCounter = 0;
    let lastY: number | null = null;

    const pushUnrecognized = (it: PositionItem) => {
      unrecognized.push({ page, line: lineCounter, text: it.s.slice(0, 120) });
    };

    for (const it of pageItems) {
      if (lastY === null || Math.abs(it.y - lastY) > 2) {
        lineCounter++;
        lastY = it.y;
      }
      // header
      const gm = it.s.match(GROUP_RE);
      if (gm) {
        currentGroup = { code: gm[1], topic: normalizeLine(gm[2]), page, line: lineCounter };
        carriedGroup = currentGroup;
        groups.push(currentGroup);
        groupHasRows = false;
        continue;
      }
      // row start (question number cell)
      const row = rowByBaseline.get(it.y);
      if (row && it.x < 50) {
        row.group = currentGroup;
        groupHasRows = true;
        const statement = normalizeLine(row.statementItems.map((s) => s.s).join(" "));
        let answer: boolean | null = null;
        if (row.answerItems.length > 0) {
          answer = row.answerItems[0].s === "VERO";
        } else {
          const m = statement.match(/\s*(VERO|FALSO)\s*$/);
          if (m) answer = m[1] === "VERO";
        }
        if (answer === null) {
          unrecognized.push({ page, line: lineCounter, text: `domanda ${row.number}: risposta non rilevata (${statement.slice(0, 80)})` });
        } else if (row.group) {
          questions.push({
            page,
            questionNumber: row.number,
            groupCode: row.group.code,
            topic: row.group.topic,
            statement,
            correctAnswer: answer,
            imageRef: null,
            imageBBox: null,
            rowBand: { bottom: row.bandBottom, top: row.bandTop },
            structuralConfidence: null,
            sourceLineStart: lineCounter,
            sourceLineEnd: lineCounter,
            contentHash: "",
          });
        } else {
          unrecognized.push({ page, line: lineCounter, text: `domanda ${row.number}: nessun gruppo attivo` });
        }
        continue;
      }
      // consumed row content (statement/answer items within a row band)
      if (bandOf.get(it) && (it.x > 50)) continue;
      if (SKIP_VALUES.has(it.s)) continue;
      if (it.x < 50 && currentGroup && !groupHasRows) {
        currentGroup.topic = normalizeLine(currentGroup.topic + " " + it.s);
        continue;
      }
      pushUnrecognized(it);
    }
  }

  return { questions, groups, unrecognized };
}
