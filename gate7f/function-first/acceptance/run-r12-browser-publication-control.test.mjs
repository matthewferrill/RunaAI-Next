import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseR12BrowserControlArguments } from "./run-r12-browser-publication-control.mjs";

const commit = "a".repeat(40), suffix = "b".repeat(16);
const valid = ["--owned-root", "C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-" + "c".repeat(32),
  "--source-commit", commit, "--runtime-seal", "runtime-seal.json", "--browser-checkpoints", "true",
  "--campaign-directory", `campaign-qwen3-coder-30b-a3b-${suffix}`];

test("R12 model-free combined-publication control has one exact invocation surface", () => {
  assert.deepEqual(parseR12BrowserControlArguments(valid), { "owned-root": valid[1], "source-commit": commit,
    "runtime-seal": "runtime-seal.json", "browser-checkpoints": "true", "campaign-directory": valid[9] });
  for (const changed of [valid.slice(0, -2), [...valid, "--case-id", "agent-05-cancel-drain"],
    valid.with(7, "false"), valid.with(3, "not-a-commit"), valid.with(9, "campaign-invalid")]) {
    assert.throws(() => parseR12BrowserControlArguments(changed), /m1-r12-browser-control-argument-invalid/u);
  }
});

test("R12 control is model-free and requires ordered on-time publication, consumption, and bounded release", async () => {
  const source = await readFile(new URL("./run-r12-browser-publication-control.mjs", import.meta.url), "utf8");
  assert.match(source, /runaai-m1-functional-runtime-seal\/v8/u);
  assert.match(source, /mode: "controls"/u);
  assert.match(source, /ledger\.observation\.provider\.calls\.length !== 0/u);
  assert.match(source, /publicationAt <= observationDeadline/u);
  assert.match(source, /witnessAt <= publicationAt/u);
  assert.match(source, /consumed\.checkpointId === ticket\.checkpointId/u);
  assert.match(source, /ledger\.observation\.browserExercised === true/u);
  assert.match(source, /AGENT05_POST_RECEIPT_HOLD_MS/u);
  assert.doesNotMatch(source, /observation\.native\.receipts\.push/u,
    "the observing executor is the only authority that records the native receipt");
});
