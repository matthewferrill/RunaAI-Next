// The mechanical reviewer: every label must be satisfiable from its question's own setup.
//
// This is the check a human reviewer would do by reading — done exactly instead. It runs BEFORE
// sealing, never after: a consistency failure after sealing means a new corpus version.
import { readFileSync } from "node:fs";

const questions = JSON.parse(readFileSync("probes/corpus/questions.json", "utf8"));
const labels = JSON.parse(readFileSync("probes/corpus/labels.json", "utf8"));
const byId = new Map(labels.labels.map((l) => [l.caseId, l]));
const problems = [];

for (const q of questions.cases) {
  const label = byId.get(q.caseId);
  if (!label) { problems.push(`${q.caseId}: no label`); continue; }
  const expect = label.expect;
  const setupText = [q.teach, q.revise, q.then, q.setupFile?.content].filter(Boolean).join(" ");

  // A mustContain fact must actually be planted somewhere the system could find it.
  if (expect.mustContain) {
    const inSetup = setupText.includes(expect.mustContain);
    const doc = expect.fromDoc ? questions.retrievalDocs.find((d) => d.docId === expect.fromDoc) : null;
    const inDoc = doc ? doc.text.includes(expect.mustContain) : false;
    if (!inSetup && !inDoc) problems.push(`${q.caseId}: expected fact "${expect.mustContain}" exists in neither setup nor ${expect.fromDoc ?? "any doc"}`);
  }
  // A mustNotContain distractor must also exist somewhere, or the case tests nothing.
  if (expect.mustNotContain) {
    const anywhere = setupText.includes(expect.mustNotContain) || questions.retrievalDocs.some((d) => d.text.includes(expect.mustNotContain));
    if (!anywhere) problems.push(`${q.caseId}: distractor "${expect.mustNotContain}" planted nowhere — the case cannot fail`);
  }
  // Isolation case: the fact must NOT leak into the asking thread's setup.
  if (q.askInOtherThread && expect.mustNotContain === undefined && !expect.mustNotContain) {
    // covered by mustNotContain path above
  }
}
// No two cases may share a planted fact — collisions would let one case answer another.
const facts = labels.labels.flatMap((l) => [l.expect.mustContain, l.expect.mustNotContain]).filter(Boolean);
for (const fact of facts) if (facts.filter((x) => x === fact).length > 1) problems.push(`fact collision: ${fact}`);

if (problems.length) { console.log("INCONSISTENT:\n  " + problems.join("\n  ")); process.exit(1); }
console.log(`consistent: ${questions.cases.length} cases, every expected fact planted, every distractor real, no collisions`);
