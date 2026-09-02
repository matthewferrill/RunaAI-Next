import test from "node:test";
import assert from "node:assert/strict";

import { parseR15GemmaBlindReviewFinalizationArguments, validateR15GemmaHomeLifecycle }
  from "./finalize-r15-gemma-blind-review.mjs";

const h = value => value.repeat(64), lease = "20260829-campaign-gemma-r99";
test("finalizer requires every provenance-bearing file and its distinct digest", () => {
  const files = ["eligibility-manifest", "batch-result", "completion-validation", "runtime-seal", "source-tree-manifest",
    "hardware-plan", "controls", "browser-proof", "home-ready", "home-completion-preflight", "home-completion-receipt",
    "home-terminal-status", "home-before-state", "home-final-state", "home-export", "home-completion-publication",
    "home-completion-verification", "review-manifest", "worksheet", "decisions"];
  const input = { "owned-root": `C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-${"f".repeat(32)}`,
    "eligibility-manifest-sha256": h("e"), output: "acceptance-evidence/operator-review-binding/candidate-eligibility.json" };
  for (const [index, name] of files.entries()) {
    input[name === "eligibility-manifest" ? "eligibility-manifest-file-sha256" : `${name}-sha256`] = h((index % 10).toString());
  }
  const prefix = input["runtime-seal-sha256"].slice(0, 16), campaign = `acceptance-evidence/campaign-gemma4-26b-a4b-${prefix}`;
  Object.assign(input, { "eligibility-manifest": "acceptance-evidence/r15-gemma-eligibility-arm.json",
    "batch-result": `${campaign}/result.json`, "completion-validation": `${campaign}/eligibility-validation.json`,
    "runtime-seal": "runtime-seal.json", "source-tree-manifest": "SOURCE-TREE-MANIFEST.json",
    "hardware-plan": "campaign-hardware-plan.json", controls: "acceptance-evidence/controls-1.json",
    "browser-proof": "acceptance-evidence/r15-browser-publication-control-1.json",
    "home-ready": "acceptance-evidence/home-ready-gemma-r99.json",
    "home-completion-preflight": `${campaign}/home-completion-preflight.json`,
    "home-completion-receipt": `${campaign}/home-completion-receipt.json`,
    "home-terminal-status": `${campaign}/home-terminal-status.json`,
    "home-before-state": `${campaign}/home-before-cleanup-state.json`, "home-final-state": `${campaign}/home-final-state.json`,
    "home-export": `${campaign}/home-export.json`, "home-completion-publication": `${campaign}/home-completion-publication.json`,
    "home-completion-verification": `${campaign}/home-completion-verification.json`,
    "review-manifest": "acceptance-evidence/operator-review-binding/review-manifest.json",
    worksheet: "acceptance-evidence/candidate-blind-review/review-worksheet.json",
    decisions: "acceptance-evidence/candidate-blind-review/review-decisions.json" });
  const argv = Object.entries(input).flatMap(([key, value]) => [`--${key}`, value]);
  assert.equal(parseR15GemmaBlindReviewFinalizationArguments(argv).output, input.output);
  assert.throws(() => parseR15GemmaBlindReviewFinalizationArguments(argv.slice(0, -2)));
  const colocated = argv.map(value => value === "acceptance-evidence/candidate-blind-review/review-worksheet.json"
    ? "acceptance-evidence/operator-review-binding/review-worksheet.json" : value);
  assert.throws(() => parseR15GemmaBlindReviewFinalizationArguments(colocated), /r15-gemma-review-finalize-argument-invalid/u);
});

test("Home lifecycle requires completed receipt, restored residency, and current task retirement", () => {
  const arm = { homeLeaseId: lease, homeLeaseSealSha256: h("c"), modelId: "primary", auxiliaryEmbedding: { modelId: "embedding" } };
  const hardware = { policy: { gpuUuids: ["gpu-1", "gpu-2"], originalPowerWatts: 450 } };
  const observation = tasks => ({ schemaVersion: "runa-m1-campaign-final-observation/v2", time: "2026-09-02T07:02:00Z",
    host: "RUNA-HOME", models: [{ key: "primary", loadedInstances: [] }, { key: "embedding", loadedInstances: [] }],
    gpus: ["0, gpu-1, 450, 30, 1, 0", "1, gpu-2, 450, 30, 1, 0"], ownedTaskRegistrations: tasks,
    listeners: [{ LocalAddress: "127.0.0.1", LocalPort: 1234 }], readOnly: true, protectedDataIncluded: false });
  const receipt = { schemaVersion: "runaai-atomic-completion-publication/v2", leaseId: lease, sealSha256: h("c"),
    markerSha256: h("d"), reason: "completed", published: true, time: "2026-09-02T07:00:00Z",
    lifecycleCalled: false, privateValuesIncluded: false };
  const terminal = { taskState: "Ready", taskExit: 0, ready: { leaseId: lease, sealSha256: h("c") },
    result: { leaseId: lease, sealSha256: h("c"), completion: "completed", cleanupVerified: true, powerRestored: true,
      failure: null, ambiguousLoad: null, productionRoutingChanged: false, protectedDataIncluded: false },
    supervisor: { exitCode: 0, failure: null, zeroResidencyAndPowerRestored: true, productionRoutingChanged: false }, lastEvent: null };
  const before = observation([{ TaskName: `Runa-M1-${lease}`, State: "Ready" }]), after = observation([]);
  after.time = "2026-09-02T07:03:00Z";
  assert.equal(validateR15GemmaHomeLifecycle({ receipt, terminal, before, after, arm, hardware }), true);
  const loaded = structuredClone(after); loaded.models[0].loadedInstances.push({ id: "still-loaded" });
  assert.throws(() => validateR15GemmaHomeLifecycle({ receipt, terminal, before, after: loaded, arm, hardware }));
  const registered = structuredClone(after); registered.ownedTaskRegistrations.push({ TaskName: `Runa-M1-${lease}` });
  assert.throws(() => validateR15GemmaHomeLifecycle({ receipt, terminal, before, after: registered, arm, hardware }));
  const wrongGpu = structuredClone(after); wrongGpu.gpus[0] = "0, wrong-gpu, 999, 30, 1, 0";
  assert.throws(() => validateR15GemmaHomeLifecycle({ receipt, terminal, before, after: wrongGpu, arm, hardware }));
  const running = structuredClone(terminal); running.taskState = "Running"; running.taskExit = 1;
  assert.throws(() => validateR15GemmaHomeLifecycle({ receipt, terminal: running, before, after, arm, hardware }));
});
