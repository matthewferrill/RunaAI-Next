import test from "node:test";
import assert from "node:assert/strict";
import { completedPermissionBoundaryDiagnostic, createPermissionBoundaryCoordinator, EMPTY_SHA256,
  failedPermissionBoundaryDiagnostic, PLANNED_OPERATIONS }
  from "./git-permission-boundary-diagnostic-contract.mjs";

const attempt = (operation, outcome = "succeeded") => ({
  operation,
  outcome,
  exitCode: outcome === "succeeded" ? 0 : 128,
  failureKind: outcome === "succeeded" ? null : "permission-denied",
  stderrBytes: outcome === "succeeded" ? 0 : 50,
  stderrSha256: outcome === "succeeded" ? EMPTY_SHA256 : "a".repeat(64),
  repositoryUnchanged: true,
  wrapperTerminal: true,
  witnessesTerminal: true,
  guardReleased: true,
});

const completedState = operationCount => ({ operationCount, successorAfterFailure: false,
  repositoryUnchanged: true, wrapperCount: operationCount, witnessCount: operationCount * 2,
  guardCount: operationCount, wrappersTerminal: true, witnessesTerminal: true,
  guardsReleased: true, fixtureRemoved: true });

const BASELINE = "b".repeat(64);
const finishOperation = (coordinator, operation, outcome = "succeeded", afterDigest = BASELINE,
  resources = {}) => {
  coordinator.begin(operation, BASELINE);
  return coordinator.complete({ operation, observation: attempt(operation, outcome), afterDigest,
    wrapperCount: 1, witnessCount: 2, guardCount: 1, wrapperTerminal: true,
    witnessesTerminal: true, guardReleased: true, ...resources });
};

test("completed permission diagnostic publishes exact all-success and first-fatal schemas", () => {
  const successes = PLANNED_OPERATIONS.map(operation => attempt(operation));
  const all = completedPermissionBoundaryDiagnostic(successes, completedState(4));
  assert.deepEqual(Object.keys(all), ["schemaVersion", "plannedOperations", "outcome", "operationCount",
    "successorAfterFailure", "attempts", "repositoryUnchanged", "wrapperCount", "witnessCount", "guardCount",
    "wrappersTerminal", "witnessesTerminal", "guardsReleased", "fixtureRemoved", "privateValuesIncluded",
    "productionChanged", "modelCalled"]);
  assert.equal(all.outcome, "all-succeeded");
  assert.deepEqual(all.plannedOperations, ["branches", "show", "diffstat", "status"]);
  assert.deepEqual(Object.keys(all.attempts[0]), ["operation", "outcome", "exitCode", "failureKind",
    "stderrBytes", "stderrSha256", "repositoryUnchanged", "wrapperTerminal", "witnessesTerminal",
    "guardReleased"]);
  const fatal = completedPermissionBoundaryDiagnostic([attempt("branches", "git-fatal")], completedState(1));
  assert.equal(fatal.outcome, "first-fatal");
  assert.equal(fatal.attempts.length, 1);
  assert.equal(fatal.successorAfterFailure, false);
  assert.equal(fatal.privateValuesIncluded, false);
});

test("completed permission diagnostic rejects wrong order, early success, successor and invalid fatal shapes", () => {
  assert.throws(() => completedPermissionBoundaryDiagnostic([attempt("show", "git-fatal")], completedState(1)),
    { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedPermissionBoundaryDiagnostic([attempt("branches")], completedState(1)),
    { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedPermissionBoundaryDiagnostic([attempt("branches", "git-fatal"), attempt("show")],
    completedState(2)), { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedPermissionBoundaryDiagnostic([attempt("branches", "git-fatal")],
    { ...completedState(1), successorAfterFailure: true }), { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedPermissionBoundaryDiagnostic([
    { ...attempt("branches", "git-fatal"), stderrBytes: 0 }], completedState(1)),
  { code: "diagnostic-contract-invalid" });
  assert.throws(() => completedPermissionBoundaryDiagnostic([
    { ...attempt("branches"), privatePath: "C:\\private" }], completedState(1)),
  { code: "diagnostic-contract-invalid" });
});

test("error permission diagnostic publishes only exact validated prefix and cleanup aggregates", () => {
  const record = failedPermissionBoundaryDiagnostic(new Error("secret"), {
    stage: "contained-git-diffstat", operationCount: 3, successorAfterFailure: false,
    attempts: [attempt("branches"), attempt("show")], wrapperCount: 3, witnessCount: 6, guardCount: 3,
    wrappersTerminal: true, witnessesTerminal: true, guardsReleased: true, fixtureRemoved: false,
  });
  assert.deepEqual(Object.keys(record), ["schemaVersion", "errorCode", "stage", "plannedOperations",
    "operationCount", "successorAfterFailure", "attempts", "wrapperCount", "witnessCount", "guardCount",
    "wrappersTerminal", "witnessesTerminal", "guardsReleased", "fixtureDisposition", "privateValuesIncluded"]);
  assert.equal(record.schemaVersion, "runaai-m1-omen-git-permission-boundary-diagnostic-error/v1");
  assert.equal(record.errorCode, "diagnostic-observer-failed");
  assert.equal(record.fixtureDisposition, "retained");
  assert.equal(JSON.stringify(record).includes("secret"), false);
  const removed = failedPermissionBoundaryDiagnostic(Object.assign(new Error("x"),
    { publicCode: "diagnostic-cleanup-failed" }), { stage: "cleanup", operationCount: 1,
    successorAfterFailure: false, attempts: [attempt("branches", "git-fatal")], wrapperCount: 1,
    witnessCount: 2, guardCount: 1, wrappersTerminal: true, witnessesTerminal: true,
    guardsReleased: true, fixtureRemoved: true });
  assert.equal(removed.errorCode, "diagnostic-cleanup-failed");
  assert.equal(removed.fixtureDisposition, "removed");
});

test("error permission diagnostic fails closed on invalid prefixes, counts, stages and successor state", () => {
  const base = { stage: "preflight", operationCount: 0, successorAfterFailure: false, attempts: [],
    wrapperCount: 0, witnessCount: 0, guardCount: 0, wrappersTerminal: true,
    witnessesTerminal: true, guardsReleased: true, fixtureRemoved: false };
  assert.equal(failedPermissionBoundaryDiagnostic(new Error("x"), base).errorCode, "diagnostic-preflight-failed");
  for (const state of [
    { ...base, operationCount: 1, attempts: [] , wrapperCount: 2 },
    { ...base, operationCount: 1, attempts: [], successorAfterFailure: true },
    { ...base, operationCount: 2, attempts: [] },
    { ...base, operationCount: 2, attempts: [attempt("branches", "git-fatal")], wrapperCount: 1,
      witnessCount: 2, guardCount: 1 },
    { ...base, operationCount: 1, attempts: [attempt("show")] },
    { ...base, operationCount: 1, attempts: [attempt("branches")], wrapperCount: 0,
      witnessCount: 2, guardCount: 1 },
    { ...base, operationCount: 1, attempts: [attempt("branches")], witnessesTerminal: null },
  ]) assert.throws(() => failedPermissionBoundaryDiagnostic(new Error("x"), state),
    { code: "diagnostic-contract-invalid" });
  const publication = failedPermissionBoundaryDiagnostic(new Error("x"), { ...base, stage: "private-stage" });
  assert.equal(publication.stage, "publication");
  assert.equal(publication.errorCode, "diagnostic-contract-invalid");
});

test("pure coordinator stops after a fatal at every possible operation", () => {
  for (let fatalIndex = 0; fatalIndex < PLANNED_OPERATIONS.length; fatalIndex += 1) {
    const coordinator = createPermissionBoundaryCoordinator(BASELINE);
    for (let index = 0; index <= fatalIndex; index += 1) finishOperation(coordinator,
      PLANNED_OPERATIONS[index], index === fatalIndex ? "git-fatal" : "succeeded");
    const completed = coordinator.finish(BASELINE);
    assert.equal(completed.length, fatalIndex + 1);
    assert.equal(completed.at(-1).outcome, "git-fatal");
    assert.equal(coordinator.snapshot().operationCount, fatalIndex + 1);
    if (fatalIndex + 1 < PLANNED_OPERATIONS.length) {
      assert.throws(() => coordinator.begin(PLANNED_OPERATIONS[fatalIndex + 1], BASELINE),
        { code: "omen-git-permission-diagnostic-successor-invalid" });
      assert.equal(coordinator.snapshot().successorAfterFailure, true);
    }
  }
});

test("pure coordinator rejects mutation gaps, post-operation mutation and final mutation", () => {
  const gap = createPermissionBoundaryCoordinator(BASELINE);
  finishOperation(gap, "branches");
  assert.throws(() => gap.begin("show", "c".repeat(64)),
    { code: "omen-git-permission-diagnostic-repository-changed" });
  assert.deepEqual({ count: gap.snapshot().operationCount, attempts: gap.snapshot().attempts.length },
    { count: 1, attempts: 1 });

  const after = createPermissionBoundaryCoordinator(BASELINE);
  after.begin("branches", BASELINE);
  assert.throws(() => after.complete({ operation: "branches", observation: attempt("branches"),
    afterDigest: "d".repeat(64), wrapperCount: 1, witnessCount: 2, guardCount: 1,
    wrapperTerminal: true, witnessesTerminal: true, guardReleased: true }),
  { code: "omen-git-permission-diagnostic-repository-changed" });
  assert.deepEqual({ count: after.snapshot().operationCount, attempts: after.snapshot().attempts.length },
    { count: 1, attempts: 0 });

  const final = createPermissionBoundaryCoordinator(BASELINE);
  for (const operation of PLANNED_OPERATIONS) finishOperation(final, operation);
  assert.throws(() => final.finish("e".repeat(64)),
    { code: "omen-git-permission-diagnostic-repository-changed" });
  assert.equal(final.snapshot().repositoryUnchanged, false);
});

test("pure coordinator and error contract expose partial startup without false terminal or removal claims", () => {
  const partial = createPermissionBoundaryCoordinator(BASELINE);
  partial.begin("branches", BASELINE);
  assert.throws(() => partial.complete({ operation: "branches", observation: attempt("branches"),
    afterDigest: BASELINE, wrapperCount: 0, witnessCount: 1, guardCount: 0,
    wrapperTerminal: true, witnessesTerminal: false, guardReleased: true }),
  { code: "omen-git-permission-diagnostic-lifecycle-invalid" });
  const state = partial.snapshot();
  assert.deepEqual({ count: state.operationCount, attempts: state.attempts.length }, { count: 1, attempts: 0 });
  const record = failedPermissionBoundaryDiagnostic(new Error("observer-private"), {
    stage: "contained-git-branches", ...state, wrapperCount: 0, witnessCount: 1, guardCount: 0,
    wrappersTerminal: true, witnessesTerminal: false, guardsReleased: true, fixtureRemoved: false,
  });
  assert.equal(record.errorCode, "diagnostic-observer-failed");
  assert.equal(record.fixtureDisposition, "retained");
  assert.equal(JSON.stringify(record).includes("observer-private"), false);
});
