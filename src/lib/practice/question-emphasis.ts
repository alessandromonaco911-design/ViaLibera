/** Reading cues only: independent of the correct answer and faithful to the source text. */
export function questionEmphasis(statement: string): { text: string; emphasized: boolean }[] {
  const cues = /(?<![\p{L}\p{N}_])(?:a condizione che|solo se|purché|non|mai|sempre|soltanto|solo|esclusivamente|almeno|massim[oaie]|minim[oaie]|vietat[oaie]|consentit[oaie]|obbligatori[oaie]|obbligo|occorre|precedenza|sosta|fermata|\d+(?:[.,]\d+)?\s*(?:km\/h|metri|secondi|minuti|ore))(?![\p{L}\p{N}_])/giu;
  const parts: { text: string; emphasized: boolean }[] = [];
  let start = 0;
  for (const match of statement.matchAll(cues)) {
    if (match.index > start) parts.push({ text: statement.slice(start, match.index), emphasized: false });
    parts.push({ text: match[0], emphasized: true });
    start = match.index + match[0].length;
  }
  if (start < statement.length) parts.push({ text: statement.slice(start), emphasized: false });
  return parts;
}
