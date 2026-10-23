import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const input = process.argv.find(arg => arg.startsWith("--review="))?.slice(9);
if (!input) throw new Error("Pass --review=<approved editorial JSON>. Draft collection never grants approval.");
const review = JSON.parse(await readFile(input, "utf8"));
const manifest = JSON.parse(await readFile("data/manifests/pda-ab-it-observed-2026-10-22.json", "utf8"));
const hosts = JSON.parse(await readFile("src/data/explanation-source-hosts.json", "utf8"));
const rows = (await readFile("data/processed/ab-observed-2026-10-22/questions.jsonl", "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const byCode = new Map(rows.map(q => [q.questionNumber, q]));
const hash = value => createHash("sha256").update(value).digest("hex");
const keyFor = q => hash(`${q.statement.replace(/\s+/g," ").trim()}|${q.correctAnswer?"V":"F"}|${q.imageRef??"none"}`);
const copyHash = e => hash(JSON.stringify([e.text,e.remember,e.sourceUrl,e.sourceLabel]));
const bank = JSON.parse(await readFile("src/data/practice-explanations.json", "utf8"));
const groups = new Map();
for (const q of rows) { const key=keyFor(q); const group=groups.get(key)??[];group.push(q.questionNumber);groups.set(key,group); }
// The same statement, solution and figure occur twice in these eight cases.
// Prefer the explicit reviewed canonical code, and retain every official alias.
const canonical = new Set(["20555","22950","23675","23776","24040","24143","25178","25179"]);
const approved = new Map();
for (const e of review.entries) {
  const code=String(e.officialQuestionCode),q=byCode.get(code),r=e.editorialReview;
  if (!q || e.statement!==q.statement || e.correctAnswer!==q.correctAnswer || (e.imageRef??null)!==(q.imageRef??null)) throw Error(`Binding mismatch ${code}`);
  if(e.status!=="approved" || !r?.reviewer || !r.reviewedAt || r.copySha256!==copyHash(e) || r.sourceSnapshotSha256!==manifest.sha256 || e.blockingIssue) throw Error(`Unapproved or changed copy ${code}`);
  if(!e.text?.trim() || e.text.length>900 || !e.remember?.trim() || e.remember.length>120) throw Error(`Copy bounds ${code}`);
  const source=new URL(e.sourceUrl);
  if(source.protocol!=="https:" || !hosts.includes(source.hostname) || source.username || source.password) throw Error(`Unsupported source ${code}`);
  const evidence=[...new Set((e.evidenceCodes??[]).map(String))];
  if(!evidence.length || evidence.some(c=>!byCode.has(c)))throw Error(`Missing official evidence ${code}`);
  const key=keyFor(q),aliases=groups.get(key);
  if(aliases.length>1 && !canonical.has(code))continue;
  if(approved.has(key))throw Error(`Duplicate approval ${code}`);
  approved.set(key,{
    status:"verified_sources",officialQuestionCode:code,officialQuestionCodes:aliases,
    statement:q.statement,correctAnswer:q.correctAnswer,imageRef:q.imageRef??null,
    text:e.text,remember:e.remember,sourceLabel:e.sourceLabel,sourceUrl:e.sourceUrl,verifiedAt:r.reviewedAt,
    verification:{method:r.method??"individual-source-comparison-and-editorial-review",reviewer:r.reviewer,humanReviewed:r.humanReviewed===true,sourceSnapshotSha256:manifest.sha256,evidence,evidenceScope:"Official statement, solution and figure; the explanation is editorial reasoning.",copySha256:r.copySha256,...(e.additionalSources?.length?{additionalSources:e.additionalSources}:{}),...(e.primarySourceSupplement?{primarySourceSupplement:e.primarySourceSupplement}:{}),...(e.sourceLimit?{sourceLimit:e.sourceLimit}:{}),...(e.catalogueDiscrepancy?{catalogueDiscrepancy:e.catalogueDiscrepancy}:{})}
  });
}
const reviewedCoverage=rows.filter(q=>approved.has(keyFor(q))).length;
if(process.argv.includes("--require-complete")&&reviewedCoverage!==rows.length)throw Error(`Reviewed coverage ${reviewedCoverage}/${rows.length}`);
for(const[key,e]of approved)bank.entries[key]=e;
bank.version=2;
const covered=rows.filter(q=>bank.entries[keyFor(q)]?.status==="verified_sources").length;
if(process.argv.includes("--write"))await writeFile("src/data/practice-explanations.json",JSON.stringify(bank,null,2)+"\n");
console.log(JSON.stringify({approvedContentEntries:approved.size,coveredQuestions:covered,totalQuestions:rows.length,written:process.argv.includes("--write")},null,2));
