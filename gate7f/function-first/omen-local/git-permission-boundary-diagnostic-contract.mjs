import { createHash } from "node:crypto";

export const PLANNED_OPERATIONS = Object.freeze(["branches", "show", "diffstat", "status"]);
export const EMPTY_SHA256 = createHash("sha256").update(Buffer.alloc(0)).digest("hex");

const KINDS = new Set(["dubious-ownership", "repository-not-found", "working-directory", "configuration",
  "index-or-object-read", "option-or-usage", "permission-denied", "unknown"]);
const ERROR_CODES = new Set(["diagnostic-preflight-failed", "diagnostic-fixture-failed",
  "diagnostic-observer-failed", "diagnostic-cleanup-failed", "diagnostic-contract-invalid"]);
const STAGES = new Set(["preflight", "create-owned-repository", "confirm-owned-git-root",
  "contained-git-branches", "contained-git-show", "contained-git-diffstat", "contained-git-status",
  "cleanup", "publication"]);
const ATTEMPT_KEYS = ["operation", "outcome", "exitCode", "failureKind", "stderrBytes", "stderrSha256",
  "repositoryUnchanged", "wrapperTerminal", "witnessesTerminal", "guardReleased"];
const HEX = /^[a-f0-9]{64}$/u;

const coded = code => Object.assign(new Error(code), { code });
const exactKeys = (value, keys) => value && Object.keys(value).length === keys.length
  && Object.keys(value).every((key, index) => key === keys[index]);
const validInteger = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum;

function validAttempt(value, expectedOperation) {
  if (!exactKeys(value, ATTEMPT_KEYS) || value.operation !== expectedOperation
      || value.repositoryUnchanged !== true || value.wrapperTerminal !== true
      || value.witnessesTerminal !== true || value.guardReleased !== true) return false;
  if (value.outcome === "succeeded") return value.exitCode === 0 && value.failureKind === null
    && value.stderrBytes === 0 && value.stderrSha256 === EMPTY_SHA256;
  return value.outcome === "git-fatal" && validInteger(value.exitCode, 1, 0xffff_ffff)
    && KINDS.has(value.failureKind) && validInteger(value.stderrBytes, 1, 256 * 1024)
    && HEX.test(value.stderrSha256 ?? "");
}

function validAttemptPrefix(attempts) {
  if (!Array.isArray(attempts) || attempts.length > PLANNED_OPERATIONS.length) return false;
  let fatalSeen = false;
  return attempts.every((attempt, index) => {
    if (fatalSeen || !validAttempt(attempt, PLANNED_OPERATIONS[index])) return false;
    fatalSeen = attempt.outcome === "git-fatal";
    return true;
  });
}

export function createPermissionBoundaryCoordinator(baselineDigest) {
  if (!HEX.test(baselineDigest ?? "")) throw coded("omen-git-permission-diagnostic-baseline-invalid");
  const attempts = [];
  let operationCount = 0, activeOperation = null, successorAfterFailure = false, finalBaselineVerified = false;
  const snapshot = () => Object.freeze({ operationCount, successorAfterFailure,
    attempts: frozenAttempts(attempts), repositoryUnchanged: finalBaselineVerified });
  return Object.freeze({
    begin(operation, beforeDigest) {
      if (activeOperation !== null || operation !== PLANNED_OPERATIONS[operationCount]) {
        throw coded("omen-git-permission-diagnostic-sequence-invalid");
      }
      if (attempts.at(-1)?.outcome === "git-fatal") {
        successorAfterFailure = true;
        throw coded("omen-git-permission-diagnostic-successor-invalid");
      }
      if (beforeDigest !== baselineDigest) throw coded("omen-git-permission-diagnostic-repository-changed");
      activeOperation = operation;
      operationCount += 1;
    },
    complete({ operation, observation, afterDigest, wrapperCount, witnessCount, guardCount,
      wrapperTerminal, witnessesTerminal, guardReleased }) {
      if (activeOperation !== operation || afterDigest !== baselineDigest) {
        activeOperation = null;
        throw coded(afterDigest !== baselineDigest ? "omen-git-permission-diagnostic-repository-changed"
          : "omen-git-permission-diagnostic-sequence-invalid");
      }
      if (wrapperCount !== 1 || witnessCount !== 2 || guardCount !== 1 || wrapperTerminal !== true
          || witnessesTerminal !== true || guardReleased !== true) {
        activeOperation = null;
        throw coded("omen-git-permission-diagnostic-lifecycle-invalid");
      }
      const next = { operation, ...observation, repositoryUnchanged: true,
        wrapperTerminal: true, witnessesTerminal: true, guardReleased: true };
      if (!validAttempt(next, operation)) {
        activeOperation = null;
        throw coded("omen-git-permission-diagnostic-observation-invalid");
      }
      attempts.push(next);
      activeOperation = null;
      return Object.freeze({ ...next });
    },
    finish(finalDigest) {
      if (activeOperation !== null || attempts.length !== operationCount
          || attempts.length < 1 || attempts.length > PLANNED_OPERATIONS.length
          || attempts.at(-1).outcome !== "git-fatal" && attempts.length !== PLANNED_OPERATIONS.length) {
        throw coded("omen-git-permission-diagnostic-sequence-invalid");
      }
      if (finalDigest !== baselineDigest) throw coded("omen-git-permission-diagnostic-repository-changed");
      finalBaselineVerified = true;
      return frozenAttempts(attempts);
    },
    snapshot,
  });
}

function publicErrorCode(error, stage) {
  if (ERROR_CODES.has(error?.publicCode)) return error.publicCode;
  if (stage === "preflight") return "diagnostic-preflight-failed";
  if (stage === "create-owned-repository" || stage === "confirm-owned-git-root") {
    return "diagnostic-fixture-failed";
  }
  if (stage === "cleanup") return "diagnostic-cleanup-failed";
  if (stage === "publication") return "diagnostic-contract-invalid";
  return "diagnostic-observer-failed";
}

function frozenAttempts(attempts) {
  return Object.freeze(attempts.map(attempt => Object.freeze({ ...attempt })));
}

export function completedPermissionBoundaryDiagnostic(attempts, state) {
  if (!validAttemptPrefix(attempts) || !validInteger(state?.operationCount, 1, 4)
      || attempts.length !== state.operationCount || state.successorAfterFailure !== false
      || state.repositoryUnchanged !== true || state.wrapperCount !== state.operationCount
      || state.witnessCount !== state.operationCount * 2 || state.guardCount !== state.operationCount
      || state.wrappersTerminal !== true || state.witnessesTerminal !== true
      || state.guardsReleased !== true || state.fixtureRemoved !== true) {
    throw coded("diagnostic-contract-invalid");
  }
  const finalFatal = attempts.at(-1)?.outcome === "git-fatal";
  const outcome = finalFatal ? "first-fatal" : "all-succeeded";
  if (outcome === "all-succeeded" && attempts.length !== PLANNED_OPERATIONS.length) {
    throw coded("diagnostic-contract-invalid");
  }
  return Object.freeze({
    schemaVersion: "runaai-m1-omen-git-permission-boundary-diagnostic/v1",
    plannedOperations: PLANNED_OPERATIONS,
    outcome,
    operationCount: state.operationCount,
    successorAfterFailure: false,
    attempts: frozenAttempts(attempts),
    repositoryUnchanged: true,
    wrapperCount: state.wrapperCount,
    witnessCount: state.witnessCount,
    guardCount: state.guardCount,
    wrappersTerminal: true,
    witnessesTerminal: true,
    guardsReleased: true,
    fixtureRemoved: true,
    privateValuesIncluded: false,
    productionChanged: false,
    modelCalled: false,
  });
}

export function failedPermissionBoundaryDiagnostic(error, state = {}) {
  const operationCount = state.operationCount;
  const attempts = state.attempts ?? [];
  if (!validInteger(operationCount, 0, 4) || !validAttemptPrefix(attempts)
      || !(attempts.length === operationCount || operationCount >= 1 && attempts.length === operationCount - 1)
      || attempts.at(-1)?.outcome === "git-fatal" && attempts.length !== operationCount
      || state.successorAfterFailure !== false
      || !validInteger(state.wrapperCount, attempts.length, operationCount)
      || !validInteger(state.witnessCount, attempts.length * 2, operationCount * 2)
      || !validInteger(state.guardCount, attempts.length, operationCount)
      || typeof state.wrappersTerminal !== "boolean" || typeof state.witnessesTerminal !== "boolean"
      || typeof state.guardsReleased !== "boolean") throw coded("diagnostic-contract-invalid");
  const stage = STAGES.has(state.stage) ? state.stage : "publication";
  const fixtureDisposition = state.wrappersTerminal && state.witnessesTerminal && state.guardsReleased
    && state.fixtureRemoved === true ? "removed" : "retained";
  return Object.freeze({
    schemaVersion: "runaai-m1-omen-git-permission-boundary-diagnostic-error/v1",
    errorCode: publicErrorCode(error, stage),
    stage,
    plannedOperations: PLANNED_OPERATIONS,
    operationCount,
    successorAfterFailure: false,
    attempts: frozenAttempts(attempts),
    wrapperCount: state.wrapperCount,
    witnessCount: state.witnessCount,
    guardCount: state.guardCount,
    wrappersTerminal: state.wrappersTerminal,
    witnessesTerminal: state.witnessesTerminal,
    guardsReleased: state.guardsReleased,
    fixtureDisposition,
    privateValuesIncluded: false,
  });
}
