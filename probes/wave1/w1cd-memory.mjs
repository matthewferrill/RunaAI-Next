// Wave 1 W1-C/W1-D — memory configuration matrix at the preregistered tiered n, plus the
// working-memory template dump that decides whether the anomaly gets a mechanism or stays UNEXPLAINED.
//
// Cases are the SEALED corpus v2 recall-depth cases, unchanged and re-run — not redesigned. The runner
// records raw answers only; grading against the sealed labels is a separate step, so the runner never
// sees the answer key. Checkpointed per run, because a depth-100 cell is ~100 model turns and the
// session-death lesson is already paid for.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { agentFor, memoryFor } from "../stack2.mjs";
import { loadEntries, appendEntry } from "../checkpoint.mjs";

process.env.SEAL = "probes/SEAL-v2.md"; process.env.CORPUS = "probes/corpus2";
execSync("node probes/verify-seal.mjs", { stdio: "inherit" });
execSync("node probes/wave1/verify-seal-wave1.mjs", { stdio: "inherit" });

const { cases } = JSON.parse(readFileSync("probes/corpus2/questions.json", "utf8"));
const recall = cases.filter((c) => c.probe === "memory" && c.axis === "recall-depth");

// The preregistered tier table. depth -> config -> n. Anything absent is not run in this wave.
const TIERS = {
  2:   { default: 3, window40: 3, semantic: 3, working: 3 },
  10:  { default: 10, semantic: 10, window40: 3 },
  25:  { default: 10, semantic: 10, window40: 3 },
  50:  { semantic: 5, working: 5, window40: 3 },
  100: { semantic: 5, working: 5 },
};

const CKPT = "probes/results/w1cd-partial.jsonl";
mkdirSync("probes/results", { recursive: true });
mkdirSync("storage", { recursive: true });
const done = new Set(loadEntries(CKPT).map((e) => e.runKey));
const R = "probe-user";

// Working-memory dump: the API surface differs across versions, so try the documented paths and record
// which one answered. A dump that could not be taken is recorded as null with its reason — never as
// "the fact was absent", which would turn a missing instrument into a finding.
const dumpWorkingMemory = async (memory, threadId) => {
  for (const [label, fn] of [
    ["getWorkingMemory", () => memory.getWorkingMemory?.({ threadId, resourceId: R })],
    ["getWorkingMemory.format", () => memory.getWorkingMemory?.({ threadId, resourceId: R, format: "json" })],
  ]) {
    try {
      const v = await fn();
      if (v !== undefined) return { via: label, content: typeof v === "string" ? v.slice(0, 2000) : JSON.stringify(v).slice(0, 2000) };
    } catch (e) { /* try the next shape */ }
  }
  return { via: null, content: null, reason: "no working-memory read API answered on this version" };
};

let ran = 0;
for (const c of recall) {
  const depth = c.fillerTurns ?? 0;
  const tier = TIERS[depth];
  const n = tier?.[c.config];
  if (!n) continue;

  for (let rep = 1; rep <= n; rep++) {
    const runKey = `${c.caseId}#${rep}`;
    if (done.has(runKey)) { process.stdout.write(`${runKey}(skip) `); continue; }
    const dbPath = `storage/w1cd-${c.caseId}-${rep}.db`;
    rmSync(dbPath, { force: true });
    const db = `file:${dbPath}`;
    const thread = `${c.caseId}-${rep}`;
    const entry = { runKey, scenario: "W1-C", caseId: c.caseId, config: c.config, depth, rep, n };
    try {
      const memory = memoryFor(c.config, db);
      const a = agentFor(c.config, db);
      const opts = { memory: { thread, resource: R } };
      const say = async (t) => String((await a.generate(t, opts)).text ?? "");
      await say(c.teach);
      for (let i = 0; i < depth; i++) await say(`Filler ${i + 1}: one color, one word.`);
      // W1-D: dump the template BEFORE asking, so the dump describes the state the answer came from.
      if (c.config === "working") { entry.scenario = "W1-C+D"; entry.workingMemoryDump = await dumpWorkingMemory(memory, thread); }
      entry.answer = await say(c.ask);
    } catch (e) {
      entry.answer = `(error: ${String(e.message).slice(0, 140)})`;
      entry.environmentError = true; // excluded from verdicts by the grader, never a framework finding
    }
    rmSync(dbPath, { force: true });
    appendEntry(CKPT, entry);
    ran++;
    process.stdout.write(`${runKey} `);
  }
  console.log();
}

const all = loadEntries(CKPT);
writeFileSync("probes/results/w1cd-outputs.json", JSON.stringify({ scenario: "W1-C/D", ranAt: new Date().toISOString(), tiers: TIERS, runs: all }, null, 1));
console.log(`\nW1-C/D: ${ran} new runs this pass, ${all.length} total recorded`);
