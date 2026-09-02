import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS } from "./browser-checkpoint.mjs";
import { BROWSER_PUBLICATION_RESOURCE_MAXIMUM_MS } from "./run-r12-browser-publication-control.mjs";
import { parseR15BrowserControlArguments } from "./run-r15-browser-publication-control.mjs";

const commit = "a".repeat(40), suffix = "b".repeat(16);
const valid = ["--owned-root", "C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-" + "c".repeat(32),
  "--source-commit", commit, "--runtime-seal", "runtime-seal.json", "--browser-checkpoints", "true",
  "--campaign-directory", `campaign-qwen3-coder-30b-a3b-${suffix}`];

test("R15 model-free actual-browser control has one exact invocation surface", () => {
  assert.deepEqual(parseR15BrowserControlArguments(valid), { "owned-root": valid[1], "source-commit": commit,
    "runtime-seal": "runtime-seal.json", "browser-checkpoints": "true", "campaign-directory": valid[9] });
  for (const changed of [valid.slice(0, -2), [...valid, "--case-id", "agent-05-cancel-drain"],
    valid.with(7, "false"), valid.with(3, "not-a-commit"), valid.with(9, "campaign-invalid")]) {
    assert.throws(() => parseR15BrowserControlArguments(changed), /m1-r15-browser-control-argument-invalid/u);
  }
});

test("R15 control binds v11 and reuses only the source-reviewed model-free executor", async () => {
  const source = await readFile(new URL("./run-r15-browser-publication-control.mjs", import.meta.url), "utf8");
  const executor = await readFile(new URL("./run-r12-browser-publication-control.mjs", import.meta.url), "utf8");
  assert.match(source, /runaai-m1-functional-runtime-seal\/v11/u);
  assert.match(source, /r15-model-free-browser-publication/u);
  assert.match(executor, /mode: "controls"/u);
  assert.match(executor, /ledger\.observation\.provider\.calls\.length !== 0/u);
  assert.match(executor, /publicationAt <= publicationDeadline/u);
  assert.match(executor, /witnessAt <= publicationAt/u);
  assert.match(executor, /consumed\.checkpointId === ticket\.checkpointId/u);
  assert.match(executor, /ledger\.observation\.browserExercised === true/u);
  assert.match(executor, /AGENT05_POST_RECEIPT_HOLD_MS/u);
  assert.doesNotMatch(executor, /observation\.native\.receipts\.push/u);
});

test("R15 browser proof resources outlive both permitted human checkpoints", () => {
  assert.equal(HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS, 900000);
  assert.equal(BROWSER_PUBLICATION_RESOURCE_MAXIMUM_MS, 2700000);
  assert.ok(BROWSER_PUBLICATION_RESOURCE_MAXIMUM_MS > 2 * HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS);
});
