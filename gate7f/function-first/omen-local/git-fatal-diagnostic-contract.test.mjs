import test from "node:test";
import assert from "node:assert/strict";
import { completedGitFatalDiagnostic, EMPTY_SHA256, failedGitFatalDiagnostic }
  from "./git-fatal-diagnostic-contract.mjs";

const terminal = { operationCount: 1, successorStarted: false, repositoryUnchanged: true,
  wrapperCount: 1, witnessCount: 2, guardCount: 1, wrapperTerminal: true, witnessesTerminal: true,
  guardReleased: true, fixtureRemoved: true };

test("completed fatal diagnostic has exact safe schema for fatal and successful status", () => {
  const digest = "a".repeat(64);
  const fatal = completedGitFatalDiagnostic({ outcome: "git-fatal", exitCode: 128,
    failureKind: "configuration", stderrBytes: 67, stderrSha256: digest }, terminal);
  assert.deepEqual(Object.keys(fatal), ["schemaVersion", "outcome", "operation", "operationCount",
    "successorStarted", "exitCode", "failureKind", "stderrBytes", "stderrSha256",
    "repositoryUnchanged", "wrapperTerminal", "witnessesTerminal", "guardReleased", "fixtureRemoved",
    "privateValuesIncluded", "productionChanged", "modelCalled"]);
  assert.equal(fatal.failureKind, "configuration");
  const success = completedGitFatalDiagnostic({ outcome: "status-succeeded", exitCode: 0,
    failureKind: null, stderrBytes: 0, stderrSha256: EMPTY_SHA256 }, terminal);
  assert.equal(success.outcome, "status-succeeded");
});

test("completed diagnostic rejects invalid nulls, bounds, successor, and incomplete cleanup", () => {
  const base = { outcome: "git-fatal", exitCode: 128, failureKind: "unknown",
    stderrBytes: 1, stderrSha256: "b".repeat(64) };
  assert.throws(() => completedGitFatalDiagnostic({ ...base, failureKind: null }, terminal),
    { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedGitFatalDiagnostic({ ...base, stderrBytes: 0 }, terminal),
    { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedGitFatalDiagnostic(base, { ...terminal, successorStarted: true }),
    { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedGitFatalDiagnostic(base, { ...terminal, witnessesTerminal: false }),
    { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedGitFatalDiagnostic(base, { ...terminal, witnessCount: 1 }),
    { code: "diagnostic-contract-invalid" });
});

test("error diagnostic is fixed-schema and never serializes private input", () => {
  const privateError = Object.assign(new Error("C:\\Users\\private\\secret-token"), {
    code: "some-private-code", diagnostic: "credential=secret-token",
  });
  const record = failedGitFatalDiagnostic(privateError, { ...terminal, stage: "contained-git-status" });
  assert.deepEqual(Object.keys(record), ["schemaVersion", "errorCode", "stage", "exitCode", "failureKind",
    "stderrBytes", "stderrSha256", "wrapperTerminal", "witnessesTerminal", "guardReleased",
    "fixtureDisposition", "operationCount", "successorStarted", "privateValuesIncluded"]);
  assert.equal(record.errorCode, "diagnostic-observer-failed");
  assert.equal(record.fixtureDisposition, "removed");
  assert.doesNotMatch(JSON.stringify(record), /Users\\\\private|secret-token|credential=/u);
});

test("error diagnostic preserves only a validated Git fatal tuple", () => {
  const error = { code: "omen-git-process-failed", exitCode: 128, failureKind: "dubious-ownership",
    stderrBytes: 67, stderrSha256: "c".repeat(64) };
  const record = failedGitFatalDiagnostic(error, { ...terminal, stage: "cleanup" });
  assert.equal(record.errorCode, "diagnostic-cleanup-failed");
  assert.equal(record.failureKind, "dubious-ownership");
  const invalid = failedGitFatalDiagnostic({ ...error, failureKind: "private-path" },
    { ...terminal, stage: "cleanup", fixtureRemoved: false });
  assert.equal(invalid.failureKind, null);
  assert.equal(invalid.fixtureDisposition, "retained");
  const laterCleanupFailure = failedGitFatalDiagnostic({ code: "cleanup-private-message" },
    { ...terminal, stage: "cleanup", fatalObservation: error });
  assert.equal(laterCleanupFailure.failureKind, "dubious-ownership");
  assert.equal(laterCleanupFailure.exitCode, 128);
  assert.throws(() => failedGitFatalDiagnostic(error, { ...terminal, operationCount: 2 }),
    { code: "diagnostic-contract-invalid" });
  assert.throws(() => failedGitFatalDiagnostic(error, { ...terminal, successorStarted: true }),
    { code: "diagnostic-contract-invalid" });
});
