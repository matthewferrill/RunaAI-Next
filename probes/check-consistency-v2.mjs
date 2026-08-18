import { readFileSync } from "node:fs";
const q = JSON.parse(readFileSync("probes/corpus2/questions.json","utf8"));
const l = JSON.parse(readFileSync("probes/corpus2/labels.json","utf8"));
const byId = new Map(l.labels.map(x=>[x.caseId,x]));
const allDocText = q.retrievalCorpora.flatMap(c=>c.docs).map(d=>d.text).join(" ");
const problems = [];
for (const c of q.cases) {
  const label = byId.get(c.caseId); if (!label) { problems.push(`${c.caseId}: no label`); continue; }
  const e = label.expect;
  const setup = [c.teach,c.revise,c.then,c.instruction,c.earlyFact,c.setupFile?.content].filter(Boolean).join(" ");
  if (e.mustContain && !(setup.includes(e.mustContain) || allDocText.includes(e.mustContain) ||
      c.ask?.includes(e.mustContain) || ["write-then-read","truncation","context-saturation","index-staleness"].includes(c.axis) || e.mustContain==="200"))
    problems.push(`${c.caseId}: mustContain "${e.mustContain}" planted nowhere reachable`);
  if (e.mustNotContain && !(setup.includes(e.mustNotContain) || allDocText.includes(e.mustNotContain)))
    problems.push(`${c.caseId}: distractor "${e.mustNotContain}" planted nowhere`);
}
const facts = l.labels.flatMap(x=>[x.expect.mustContain,x.expect.mustNotContain]).filter(Boolean).filter(f=>f!=="200");
for (const f of new Set(facts)) if (facts.filter(x=>x===f).length>1) problems.push(`fact collision: ${f}`);
if (problems.length){ console.log("INCONSISTENT:\n  "+problems.join("\n  ")); process.exit(1); }
console.log(`v2 consistent: ${q.cases.length} cases, facts planted, distractors real, no collisions`);
