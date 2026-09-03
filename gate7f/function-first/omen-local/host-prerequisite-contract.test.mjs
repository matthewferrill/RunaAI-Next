import test from "node:test";
import assert from "node:assert/strict";
import { completedHostPrerequisites, failedHostPrerequisites, validateHostPrerequisiteRecord }
  from "./host-prerequisite-contract.mjs";
import { invalidTransitionRecord, transitionRecord, validateTransitionRecord }
  from "./system-drive-transition-contract.mjs";

test("host prerequisite completed record is exact and conjunctive", () => {
  for (const system of [false, true]) for (const device of [false, true]) {
    const value = completedHostPrerequisites(system, device);
    assert.deepEqual(Object.keys(value), ["schemaVersion", "outcome", "systemDrivePrepared",
      "nullDevicePrepared", "ready", "privateValuesIncluded"]);
    assert.equal(value.ready, system && device);
    assert.equal(validateHostPrerequisiteRecord({ ...value, ready: !value.ready }), false);
  }
});

test("host prerequisite error pairs and child bounds fail closed", () => {
  const pin = failedHostPrerequisites({ stage: "pins", code: "pin-drift" });
  assert.deepEqual(Object.keys(pin), ["schemaVersion", "outcome", "stage", "code", "childExitCode",
    "childOutputBytes", "privateValuesIncluded"]);
  const child = failedHostPrerequisites({ stage: "null-device", code: "child-exit-invalid",
    childExitCode: 0xffffffff, childOutputBytes: 8192 });
  assert.equal(validateHostPrerequisiteRecord(child), true);
  for (const invalid of [
    { ...pin, stage: "null-device" },
    { ...pin, privateValuesIncluded: true },
    { ...child, childExitCode: 0x100000000 },
    { ...child, childOutputBytes: 8193 },
    { ...child, privatePath: "C:\\private" },
  ]) assert.equal(validateHostPrerequisiteRecord(invalid), false);
});

test("transition contract accepts every frozen representative and rejects mixed fields", () => {
  const prepared = transitionRecord({ operation: "prepare", outcome: "prepared", stage: "complete",
    code: "prepared", systemDriveState: "prepared", rollbackAttempted: false, rollbackVerified: false,
    journalState: "retained", targetOnlyProbePassed: true });
  assert.deepEqual(Object.keys(prepared), ["schemaVersion", "operation", "outcome", "stage", "code",
    "systemDriveState", "rollbackAttempted", "rollbackVerified", "journalState",
    "targetOnlyProbePassed", "privateValuesIncluded"]);
  assert.equal(validateTransitionRecord({ ...prepared, journalState: "removed" }), false);
  const restored = transitionRecord({ operation: "prepare", outcome: "restored", stage: "complete",
    code: "prepare-failed-restored", systemDriveState: "unprepared", rollbackAttempted: true,
    rollbackVerified: true, journalState: "removed", targetOnlyProbePassed: true });
  assert.equal(validateTransitionRecord({ ...restored, rollbackVerified: false }), false);
  assert.equal(invalidTransitionRecord("deprovision").code, "result-invalid");
  assert.throws(() => invalidTransitionRecord("private"), { code: "system-drive-transition-result-invalid" });
});

test("transition records never accept private or unknown fields", () => {
  const invalid = invalidTransitionRecord("prepare");
  assert.equal(validateTransitionRecord({ ...invalid, privateValuesIncluded: true }), false);
  assert.equal(validateTransitionRecord({ ...invalid, stderr: "secret" }), false);
  assert.equal(JSON.stringify(invalid).includes("path"), false);
});

test("transition preflight can stop before the disposable probe", () => {
  assert.equal(validateTransitionRecord(transitionRecord({ operation: "prepare", outcome: "error",
    stage: "preflight", code: "precondition-failed", systemDriveState: "unknown", rollbackAttempted: false,
    rollbackVerified: false, journalState: "absent", targetOnlyProbePassed: false })), true);
});

test("mutex busy, wrong-security, and abandoned publications are exact for both operations", () => {
  for (const operation of ["prepare", "deprovision"]) {
    const journalState = operation === "prepare" ? "absent" : "unknown";
    assert.equal(validateTransitionRecord(transitionRecord({ operation, outcome: "error", stage: "preflight",
      code: "precondition-failed", systemDriveState: "unknown", rollbackAttempted: false,
      rollbackVerified: false, journalState, targetOnlyProbePassed: false })), true);
    assert.equal(validateTransitionRecord(transitionRecord({ operation, outcome: "error", stage: "complete",
      code: "reconciliation-required", systemDriveState: "unknown", rollbackAttempted: false,
      rollbackVerified: false, journalState: "unknown", targetOnlyProbePassed: false })), true);
  }
});
