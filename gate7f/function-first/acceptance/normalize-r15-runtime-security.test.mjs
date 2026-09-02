import test from "node:test";
import assert from "node:assert/strict";

import { normalizeR15RuntimeSecurity } from "./normalize-r15-runtime-security.mjs";

const root = "C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-11111111111111111111111111111111";
const successful = Object.freeze({
  ready: true,
  receipt: { status: "executed", errorCode: null, exitCode: 0, systemStamped: true,
    output: { stdout: "runa2-sandbox-ready\n", stderr: "" }, effects: [] },
  startupObservation: null
});

test("R15 runtime normalization is exactly one no-model process-container preflight", async () => {
  let options;
  const value = await normalizeR15RuntimeSecurity({ root, executorFactory: supplied => {
    options = supplied;
    return { preflight: async () => structuredClone(successful) };
  } });
  assert.equal(options.runtimeRoot, `${root}\\sandbox-runtime`);
  assert.equal(options.runnerPath, `${root}\\sandbox-runtime\\quickjs-child.mjs`);
  assert.equal(options.nodeExecutable, `${root}\\runtime\\node.exe`);
  assert.equal(options.temporaryRoot, `${root}\\transient`);
  assert.deepEqual(value, {
    schemaVersion: "runaai-m1-r15-runtime-security-normalization/v1",
    ready: true,
    receiptStatus: "executed",
    exitCode: 0,
    effects: 0,
    modelsInvoked: false,
    productionChanged: false,
    privateValuesIncluded: false
  });
});

for (const [name, mutate] of [
  ["not ready", value => { value.ready = false; }],
  ["failed receipt", value => { value.receipt.status = "unavailable"; }],
  ["reported effect", value => { value.receipt.effects.push({ kind: "write" }); }],
  ["nonzero exit", value => { value.receipt.exitCode = 1; }],
  ["wrong startup output", value => { value.receipt.output.stdout = "not-ready\n"; }],
  ["startup failure observation", value => { value.startupObservation = {
    schemaVersion: "runa2-sandbox-startup-observation/v1", processStarted: true,
    exitCode: 1, classifiedErrorCode: "sandbox-start-failed", privateValuesIncluded: false
  }; }]
]) test(`R15 runtime normalization rejects ${name}`, async () => {
  const result = structuredClone(successful); mutate(result);
  await assert.rejects(normalizeR15RuntimeSecurity({ root,
    executorFactory: () => ({ preflight: async () => result }) }), /r15-runtime-security-normalization-preflight/u);
});
