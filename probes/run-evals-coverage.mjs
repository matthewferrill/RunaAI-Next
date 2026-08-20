import { readFileSync, writeFileSync } from "node:fs";
import { createContentSimilarityScorer } from "@mastra/evals/scorers/prebuilt";
import { createAgentTestRun, createTestMessage } from "@mastra/evals/scorers/utils";
import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["probes/verify-seal-evals-coverage.mjs"], { stdio: "inherit" });

const pkg = JSON.parse(readFileSync("node_modules/@mastra/evals/package.json", "utf8"));
const scorer = createContentSimilarityScorer({ ignoreCase: true, ignoreWhitespace: true });
const input = "Paris is the capital of France.";
const arms = [
  { id: "identical", output: input },
  { id: "normalized", output: "  PARIS   IS THE CAPITAL OF FRANCE.  " },
  { id: "related", output: "France's capital is Paris." },
  { id: "unrelated", output: "Saturn has many rings." },
];

const rows = [];
for (const arm of arms) {
  for (let repetition = 1; repetition <= 5; repetition++) {
    const run = createAgentTestRun({
      inputMessages: [createTestMessage({ content: input, role: "user" })],
      output: [createTestMessage({ content: arm.output, role: "assistant" })],
      runId: `evals-${arm.id}-${repetition}`,
    });
    const result = await scorer.run(run);
    rows.push({ arm: arm.id, repetition, score: result.score });
  }
}

const byArm = Object.fromEntries(arms.map(({ id }) => [id, rows.filter(row => row.arm === id).map(row => row.score)]));
const numeric = rows.every(row => Number.isFinite(row.score));
const deterministic = Object.values(byArm).every(scores => new Set(scores).size === 1);
const score = Object.fromEntries(Object.entries(byArm).map(([id, scores]) => [id, scores[0]]));
const thresholds = score.identical === 1 && score.normalized >= 0.95 && score.unrelated <= 0.20;
const ordering = score.identical > score.related && score.related > score.unrelated;
const pass = rows.length === 20 && numeric && deterministic && thresholds && ordering;

const evidence = {
  schema: "runa-lab-evals-coverage-v1",
  capturedAt: new Date().toISOString(),
  package: `@mastra/evals@${pkg.version}`,
  scorerId: scorer.id,
  rows,
  controls: { numeric, deterministic, thresholds, ordering },
  decision: pass ? "selected-for-deterministic-evaluation-plumbing" : "rejected",
};
writeFileSync("probes/results/evals-coverage.json", `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ scores: score, controls: evidence.controls, decision: evidence.decision }));
if (!pass) process.exit(1);
