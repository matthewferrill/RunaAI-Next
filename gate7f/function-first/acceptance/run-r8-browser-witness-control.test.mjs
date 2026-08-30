import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseR8BrowserControlArguments } from "./run-r8-browser-witness-control.mjs";

const commit = "a".repeat(40);
const valid = ["--owned-root", "C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-" + "b".repeat(32),
  "--source-commit", commit, "--runtime-seal", "runtime-seal.json", "--browser-checkpoints", "true"];

test("R8 model-free browser control has one exact no-subset invocation surface", () => {
  assert.deepEqual(parseR8BrowserControlArguments(valid), { "owned-root": valid[1], "source-commit": commit,
    "runtime-seal": "runtime-seal.json", "browser-checkpoints": "true" });
  for (const changed of [valid.slice(0, -2), [...valid, "--case-id", "agent-05-cancel-drain"],
    valid.with(7, "false"), valid.with(3, "not-a-commit"), [...valid, "--runtime-seal", "other.json"]]) {
    assert.throws(() => parseR8BrowserControlArguments(changed), /m1-r8-browser-control-argument-invalid/u);
  }
});

test("R8 control is model-free and requires delayed publication actual browser and native release checks", async () => {
  const source = await readFile(new URL("./run-r8-browser-witness-control.mjs", import.meta.url), "utf8");
  assert.match(source, /mode: "controls"/u);
  assert.match(source, /ledger\.observation\.provider\.calls\.length !== 0/u);
  assert.match(source, /publicationAt > observationDeadline/u);
  assert.match(source, /ledger\.observation\.browserExercised === true/u);
  assert.match(source, /AGENT05_POST_RECEIPT_HOLD_MS/u);
  assert.doesNotMatch(source, /observation\.native\.receipts\.push/u,
    "the observing executor is the only authority that records the native receipt");
});
