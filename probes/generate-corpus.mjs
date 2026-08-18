// Generate the probe corpus: questions the harness runs, labels the grader checks.
//
// Facts are planted at random from word lists, so no model can know them from training and grading is
// exact substring match — no judgment calls, nothing for a grader to bend. The generator does not store
// its choices anywhere except the label file, which is sealed by digest the moment it is written.
import { randomInt } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const NOUNS = ["kettle", "harbor", "lantern", "walnut", "compass", "meadow", "anchor", "thimble", "orchard", "canyon", "beacon", "saddle", "quarry", "willow", "ledger", "chisel", "falcon", "tunnel", "marble", "cinder"];
const NAMES = ["Ansel", "Briony", "Caldwell", "Delphine", "Ezra", "Fenwick", "Greta", "Halloran", "Imogen", "Jasper", "Kerensa", "Lowell", "Maren", "Nikolai", "Odette", "Pruitt", "Quill", "Rosalind", "Sutter", "Tamsin"];
const pick = (list) => list[randomInt(list.length)];
const code = () => `${pick(NOUNS)}-${pick(NOUNS)}-${randomInt(100, 999)}`;

const questions = [];
const labels = [];
const docs = [];
let id = 0;
const add = (probe, axis, tier, question, expect, note = "") => {
  id += 1;
  const caseId = `${probe}-${String(id).padStart(3, "0")}`;
  questions.push({ caseId, probe, axis, tier, ...question });
  labels.push({ caseId, expect, note });
};

// ---- memory ladder: recall depth, contradiction, isolation, restart, ordering -------------------------
for (const depth of [2, 10, 25, 50]) {
  const fact = code();
  add("memory", "recall-depth", depth,
    { teach: `My locker code is ${fact}. Please remember it.`, fillerTurns: depth - 2, ask: "What is my locker code?" },
    { mustContain: fact });
}
{
  const first = code(), second = code();
  add("memory", "contradiction", 1,
    { teach: `My locker code is ${first}.`, revise: `Correction — my locker code is actually ${second}.`, fillerTurns: 6, ask: "What is my locker code?" },
    { mustContain: second, mustNotContain: first }, "the revision wins; repeating the old value is the failure");
}
{
  const fact = code();
  add("memory", "thread-isolation", 1,
    { teach: `The project password is ${fact}.`, askInOtherThread: "What is the project password?" },
    { mustNotContain: fact }, "absence is the pass: leakage across threads is the failure");
}
{
  const fact = code();
  add("memory", "restart-survival", 1,
    { teach: `The cellar key is kept under the ${pick(NOUNS)} — code ${fact}.`, restartProcess: true, ask: "What code opens the cellar?" },
    { mustContain: fact });
}
{
  const a = code(), b = code();
  add("memory", "temporal-order", 1,
    { teach: `First code: ${a}.`, then: `Second code: ${b}.`, ask: "Which code did I give you first?" },
    { mustContain: a }, "answering with the later one is recency masquerading as memory");
}

// ---- retrieval ladder: paraphrase distance, hard negatives, staleness ---------------------------------
// A fixture corpus of 60 documents with planted facts; distractors share vocabulary with the targets.
for (let d = 0; d < 60; d += 1) {
  const owner = pick(NAMES), item = pick(NOUNS);
  docs.push({ docId: `doc-${String(d).padStart(3, "0")}`, text: `${owner} manages the ${item} inventory. Routine notes: the ${pick(NOUNS)} shipment arrives when scheduled, and ${pick(NAMES)} reviews the ${pick(NOUNS)} ledger quarterly.` });
}
const plant = (text) => { const docId = `doc-${String(randomInt(60)).padStart(3, "0")}`; const doc = docs.find((x) => x.docId === docId); doc.text += ` ${text}`; return docId; };
{
  const fact = code(); const docId = plant(`The vault combination is ${fact}.`);
  add("retrieval", "verbatim", 1, { query: "What is the vault combination?" }, { mustContain: fact, fromDoc: docId });
}
{
  const fact = code(); const docId = plant(`Emergency generator fuel is stored in bay ${fact}.`);
  add("retrieval", "paraphrase", 2, { query: "If the power goes out, where do we get fuel for backup electricity?" }, { mustContain: fact, fromDoc: docId });
}
{
  const fact = code(); const docId = plant(`The visiting engineer parks in space ${fact}.`);
  add("retrieval", "conceptual", 3, { query: "A contractor is coming tomorrow — where should their car go?" }, { mustContain: fact, fromDoc: docId });
}
{
  const right = code(), wrong = code();
  const rightDoc = plant(`CURRENT as of this quarter: the loading dock keypad is ${right}.`);
  const wrongDoc = plant(`OUTDATED, kept for records: the loading dock keypad was ${wrong} before the change.`);
  add("retrieval", "hard-negative", 3, { query: "What is the loading dock keypad code?" }, { mustContain: right, mustNotContain: wrong, fromDoc: rightDoc, distractorDoc: wrongDoc }, "the distractor document says outdated on its face");
}

// ---- tools ladder: chained work, mid-chain failure ----------------------------------------------------
{
  const fact = code();
  add("tools", "chained-read", 2, { setupFile: { name: "inner/deep/target.txt", content: `The retrieval token is ${fact}.` }, ask: "Find the file that mentions a retrieval token and tell me the token." },
    { mustContain: fact });
}
add("tools", "missing-file", 2, { ask: "Read the file called does-not-exist.txt and tell me its third line." },
  { mustSayUnavailable: true, mustNotInvent: true }, "the failure is a confident third line from a file that is not there");

// ---- model ladder: instruction retention, structured validity ------------------------------------------
{
  const word = pick(NOUNS);
  add("model", "instruction-retention", 2, { instruction: `End every reply with the word "${word}".`, fillerTurns: 12, ask: "Summarize our conversation in one sentence." },
    { mustEndWithWord: word });
}
add("model", "structured-validity", 1, { ask: "List three colors as a JSON array of strings, nothing else.", trials: 10 },
  { mustParseAsJsonArray: true, trials: 10 }, "reported as valid/attempted, per the denominator rule");

// ---- workflow invariants: crash boundaries — behavioral labels ----------------------------------------
add("workflow", "resume-no-reexecute", 3, { scenario: "suspend at approval, kill the process, resume in a fresh process" },
  { invariant: "step one executes exactly once across both processes; resume completes from the snapshot" });
add("workflow", "reject-tampered-snapshot", 3, { scenario: "edit the persisted snapshot's inputData between suspend and resume" },
  { invariant: "the run must not silently act on tampered data — an error or refusal both pass; acting passes only if the store detects and reports" });

mkdirSync("probes/corpus", { recursive: true });
writeFileSync("probes/corpus/questions.json", JSON.stringify({ schemaVersion: "runalab-probe-corpus/v1", generated: "2026-08-18", cases: questions, retrievalDocs: docs }, null, 1));
writeFileSync("probes/corpus/labels.json", JSON.stringify({ schemaVersion: "runalab-probe-labels/v1", generated: "2026-08-18", rule: "LOCKED. Never widened, never edited. Grading checks against this file verbatim; the grader refuses to run if its digest does not match SEAL.md. Changes after testing go into a new sealed version.", labels }, null, 1));
console.log(`generated: ${questions.length} cases, ${docs.length} retrieval docs`);
