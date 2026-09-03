import { createHash } from "node:crypto";

const KINDS = new Set(["dubious-ownership", "repository-not-found", "working-directory", "configuration",
  "index-or-object-read", "option-or-usage", "permission-denied", "unknown"]);
const ERROR_CODES = new Set(["diagnostic-preflight-failed", "diagnostic-fixture-failed",
  "diagnostic-observer-failed", "diagnostic-cleanup-failed", "diagnostic-contract-invalid"]);
const STAGES = new Set(["preflight", "create-owned-repository", "confirm-owned-git-root",
  "contained-git-status", "cleanup", "publication"]);
const EMPTY_SHA256 = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
const HEX = /^[a-f0-9]{64}$/u;

const coded = code => Object.assign(new Error(code), { code });
const validFatal = value => Number.isInteger(value?.exitCode) && value.exitCode >= 1
  && value.exitCode <= 0xffff_ffff && KINDS.has(value.failureKind)
  && Number.isInteger(value.stderrBytes) && value.stderrBytes >= 1 && value.stderrBytes <= 256 * 1024
  && HEX.test(value.stderrSha256 ?? "");

function lifecycle(state) {
  return {
    repositoryUnchanged: state?.repositoryUnchanged === true,
    wrapperTerminal: state?.wrapperTerminal === true,
    witnessesTerminal: state?.witnessesTerminal === true,
    guardReleased: state?.guardReleased === true,
    fixtureRemoved: state?.fixtureRemoved === true,
  };
}

export function completedGitFatalDiagnostic(observation, state) {
  const life = lifecycle(state);
  if (state?.operationCount !== 1 || state?.successorStarted !== false
      || state?.wrapperCount !== 1 || state?.witnessCount !== 2 || state?.guardCount !== 1
      || !Object.values(life).every(Boolean)) throw coded("diagnostic-contract-invalid");
  const fatal = observation?.outcome === "git-fatal";
  const succeeded = observation?.outcome === "status-succeeded";
  if (!fatal && !succeeded || fatal && !validFatal(observation)
      || succeeded && (observation.exitCode !== 0 || observation.failureKind !== null
        || observation.stderrBytes !== 0 || observation.stderrSha256 !== EMPTY_SHA256)) {
    throw coded("diagnostic-contract-invalid");
  }
  return Object.freeze({
    schemaVersion: "runaai-m1-omen-git-fatal-diagnostic/v1",
    outcome: observation.outcome,
    operation: "status",
    operationCount: 1,
    successorStarted: false,
    exitCode: observation.exitCode,
    failureKind: observation.failureKind,
    stderrBytes: observation.stderrBytes,
    stderrSha256: observation.stderrSha256,
    ...life,
    privateValuesIncluded: false,
    productionChanged: false,
    modelCalled: false,
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

export function failedGitFatalDiagnostic(error, state = {}) {
  if (![0, 1].includes(state.operationCount) || state.successorStarted !== false) {
    throw coded("diagnostic-contract-invalid");
  }
  const stage = STAGES.has(state.stage) ? state.stage : "publication";
  const fatalSource = validFatal(state.fatalObservation) ? state.fatalObservation
    : error?.code === "omen-git-process-failed" && validFatal(error) ? error : null;
  const wrapperTerminal = state.wrapperTerminal === true;
  const witnessesTerminal = state.witnessesTerminal === true;
  const guardReleased = state.guardReleased === true;
  const fixtureRemoved = state.fixtureRemoved === true;
  return Object.freeze({
    schemaVersion: "runaai-m1-omen-git-fatal-diagnostic-error/v1",
    errorCode: publicErrorCode(error, stage),
    stage,
    exitCode: fatalSource ? fatalSource.exitCode : null,
    failureKind: fatalSource ? fatalSource.failureKind : null,
    stderrBytes: fatalSource ? fatalSource.stderrBytes : null,
    stderrSha256: fatalSource ? fatalSource.stderrSha256 : null,
    wrapperTerminal,
    witnessesTerminal,
    guardReleased,
    fixtureDisposition: wrapperTerminal && witnessesTerminal && guardReleased && fixtureRemoved
      ? "removed" : "retained",
    operationCount: state.operationCount,
    successorStarted: state.successorStarted,
    privateValuesIncluded: false,
  });
}

export { EMPTY_SHA256 };
