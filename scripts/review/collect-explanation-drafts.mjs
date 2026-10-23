import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Deliberately produces a review artifact only. It cannot approve or publish copy.
const inputs = process.argv.slice(2);
if (!inputs.length) throw new Error("Pass editorial JSON files to collect.");
const sourceId = "ab-observed-2026-10-22";
const rows = (await readFile(`data/processed/${sourceId}/questions.jsonl`, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const byCode = new Map(rows.map(q => [q.questionNumber, q]));
const entries = new Map();
const errors = [];
for (const input of inputs) {
  const document = JSON.parse(await readFile(input, "utf8"));
  const drafts = Array.isArray(document) ? document : document.entries;
  if (!Array.isArray(drafts)) throw new Error(`Expected an entries array: ${input}`);
  for (const item of drafts) {
    const code = String(item.officialQuestionCode);
    const q = byCode.get(code);
    if (!q) { errors.push(`Unknown code ${code}`); continue; }
    if (entries.has(code)) { errors.push(`Duplicate ${code}`); continue; }
    if (q.statement !== item.statement || q.correctAnswer !== item.correctAnswer || (q.imageRef ?? null) !== (item.imageRef ?? null)) errors.push(`Binding ${code}`);
    if (!item.text?.trim() || item.text.length > 900 || !item.remember?.trim() || item.remember.length > 120) errors.push(`Copy bounds ${code}`);
    for (const evidence of item.evidenceCodes ?? []) if (!byCode.has(String(evidence))) errors.push(`Missing evidence ${code}: ${evidence}`);
    const contentHash = createHash("sha256").update(`${q.statement.replace(/\s+/g," ").trim()}|${q.correctAnswer?"V":"F"}|${q.imageRef??"none"}`).digest("hex");
    entries.set(code, { ...item, officialQuestionCode: code, contentHash, status: "draft", editorialInput: input, humanReviewed: false });
  }
}
const report = { sourceId, total: rows.length, drafted: entries.size, missing: rows.filter(q=>!entries.has(q.questionNumber)).map(q=>q.questionNumber), errors, note: "Coverage and binding checks do not approve the meaning of a draft." };
await mkdir("data/reports", { recursive: true });
await writeFile("data/reports/explanation-editorial-drafts.json", JSON.stringify({sourceId,entries:[...entries.values()]},null,2));
await writeFile("data/reports/explanation-editorial-progress.json", JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,missing:report.missing.length},null,2));
if (errors.length) process.exitCode=1;
