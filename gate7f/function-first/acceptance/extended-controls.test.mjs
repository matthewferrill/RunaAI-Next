import test from "node:test";
import assert from "node:assert/strict";
import { CONTROL_CASES } from "./cases.mjs";
import { SUPPORTED_CONTROLS, runModelFreeControl } from "./model-free-controls.mjs";
import { newObservation, ObservationLedger } from "./runner-contract.mjs";
import { evaluateControl } from "./assertions.mjs";

test("every frozen control has an actual driver; browser proof remains separate", () => {
  assert.deepEqual([...SUPPORTED_CONTROLS].sort(), CONTROL_CASES.map(item => item.id).sort());
});

test("all real outbound adapters deny307/308 before a second owned destination", async () => {
  const item = CONTROL_CASES.find(item => item.id === "control-04-outbound-redirect"), seal = "a".repeat(64);
  const ledger = new ObservationLedger(newObservation({ ...item, role: "control" }, { runtimeSealSha256: seal }));
  const observation = await runModelFreeControl({ host: null, item, ledger });
  assert.equal(observation.status, "completed", JSON.stringify(observation.failures));
  const grade = evaluateControl(item, observation, { runtimeSealSha256: seal });
  assert.equal(grade.status, "pass", JSON.stringify(grade));
  assert.equal(observation.provider.calls.length, 0);
});
