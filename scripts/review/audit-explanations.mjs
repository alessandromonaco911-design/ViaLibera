import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const bank = JSON.parse(await readFile("src/data/practice-explanations.json", "utf8"));
const sourceId = "ab-observed-2026-10-22";
const rows = (await readFile(`data/processed/${sourceId}/questions.jsonl`, "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
const manifest = JSON.parse(await readFile("data/manifests/pda-ab-it-observed-2026-10-22.json", "utf8"));
const sourceHosts = JSON.parse(await readFile("src/data/explanation-source-hosts.json", "utf8"));
const errors = [];
const used = new Set();
const pending = [];
let verified = 0;
for (const q of rows) {
  const key = createHash("sha256").update(`${q.statement.replace(/\s+/g, " ").trim()}|${q.correctAnswer ? "V" : "F"}|${q.imageRef ?? "none"}`).digest("hex");
  const entry = bank.entries[key];
  if (entry) {
    used.add(key);
    if (entry.statement !== q.statement || entry.correctAnswer !== q.correctAnswer || entry.imageRef !== q.imageRef) errors.push(`Binding ${q.questionNumber}`);
    if (!entry.text?.trim() || entry.text.length > 900 || !entry.remember?.trim() || entry.remember.length > 120) errors.push(`Text bounds ${q.questionNumber}`);
    if (entry.verification?.sourceSnapshotSha256 !== manifest.sha256) errors.push(`Source snapshot ${q.questionNumber}`);
    let source;
    try { source = new URL(entry.sourceUrl); } catch { errors.push(`Source URL ${q.questionNumber}`); }
    if (source && (source.protocol !== "https:" || !sourceHosts.includes(source.hostname) || source.username || source.password)) errors.push(`Source URL ${q.questionNumber}`);
    if (entry.officialQuestionCodes && !entry.officialQuestionCodes.includes(q.questionNumber)) errors.push(`Official alias ${q.questionNumber}`);
    if (entry.verification?.copySha256 && entry.verification.copySha256 !== createHash("sha256").update(JSON.stringify([entry.text,entry.remember,entry.sourceUrl,entry.sourceLabel])).digest("hex")) errors.push(`Changed reviewed copy ${q.questionNumber}`);
    if (entry.status === "verified_sources" && entry.verifiedAt && entry.verification) verified++;
  }
  if (!entry || entry.status !== "verified_sources") pending.push({
    contentHash: key, officialQuestionCode: q.questionNumber, groupCode: q.groupCode,
    statement: q.statement, correctAnswer: q.correctAnswer, imageRef: q.imageRef,
    status: "draft", text: "", remember: "", sourceUrl: manifest.url,
    sourceSnapshotSha256: manifest.sha256, evidence: [], reviewedByHuman: false,
  });
}
for (const key of Object.keys(bank.entries)) if (!used.has(key)) errors.push(`Obsolete or unrelated entry ${key}`);
const report = { sourceId, total: rows.length, verifiedSources: verified, pending: pending.length, humanReviewed: Object.values(bank.entries).filter(e => e.verification?.humanReviewed === true).length,
  fullyCovered: verified === rows.length, structuralAuditPassed: !errors.length, errors,
  note: "Structural audit does not replace semantic, legal or human review. Empty drafts are not explanations." };
await mkdir("data/reports", { recursive: true });
await writeFile("data/reports/explanation-coverage.json", JSON.stringify(report, null, 2));
if (process.argv.includes("--export-drafts")) await writeFile("data/reports/explanation-drafts.json", JSON.stringify({ sourceId, entries: pending }, null, 2));
console.log(JSON.stringify(report, null, 2));
if (errors.length || (process.argv.includes("--require-complete") && !report.fullyCovered)) process.exitCode = 1;
