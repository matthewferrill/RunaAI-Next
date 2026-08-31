import test from "node:test";
import assert from "node:assert/strict";
import { parseSupplementalArguments, REMAINING_ATTEMPTS } from "./run-qwen-r12-remaining13.mjs";

const hex = "a".repeat(64);
const base = ["--mode", "scored", "--owned-root", "C:\\synthetic-owned",
  "--source-commit", "b".repeat(40), "--runtime-seal", "runtime-seal.json", "--runtime-seal-sha256", hex,
  "--controls", "acceptance-evidence/controls.json", "--controls-sha256", hex,
  "--candidate-id", "qwen36-27b-mtp", "--home-ready", "acceptance-evidence/home-ready.json", "--home-ready-sha256", hex,
  "--hardware-plan", "campaign-hardware-plan.json", "--hardware-plan-sha256", hex,
  "--home-status", "acceptance-evidence/home-live.json", "--browser-checkpoints", "true"];

test("remaining Qwen slots are exactly the 13 unexecuted R12 attempt identities", () => {
  assert.equal(REMAINING_ATTEMPTS.length, 13);
  assert.equal(new Set(REMAINING_ATTEMPTS).size, 13);
  assert.deepEqual(REMAINING_ATTEMPTS.slice(0, 5), [
    "qwen36-27b-mtp--agent-04-revoked-plan--3",
    "qwen36-27b-mtp--agent-05-cancel-drain--3",
    "qwen36-27b-mtp--agent-06-crash-reconcile--3",
    "qwen36-27b-mtp--agent-07-lost-ack--3",
    "qwen36-27b-mtp--agent-08-undo-display--3",
  ]);
  assert.ok(REMAINING_ATTEMPTS.slice(5).every(value => /^qwen36-27b-mtp--review-0[1-8]-.+--3$/u.test(value)));
});

test("supplemental CLI separates and requires the immutable prior result binding", () => {
  const parsed = parseSupplementalArguments([...base, "--prior-result", "acceptance-evidence/prior.json", "--prior-result-sha256", hex]);
  assert.equal(parsed.campaign.mode, "scored");
  assert.equal(parsed.supplemental["prior-result-sha256"], hex);
  assert.throws(() => parseSupplementalArguments(base), /required-input/u);
  assert.throws(() => parseSupplementalArguments([...base, "--prior-result", "x", "--prior-result-sha256", "bad"]), /required-input/u);
});
