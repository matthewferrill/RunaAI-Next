const SCHEMA = "runa-omen-host-prerequisites/v1";
const COMPLETE_KEYS = ["schemaVersion", "outcome", "systemDrivePrepared", "nullDevicePrepared", "ready",
  "privateValuesIncluded"];
const ERROR_KEYS = ["schemaVersion", "outcome", "stage", "code", "childExitCode", "childOutputBytes",
  "privateValuesIncluded"];
const ERROR_CODES = Object.freeze({
  pins: new Set(["pin-invalid", "pin-drift"]),
  token: new Set(["token-not-elevated"]),
  "system-drive": new Set(["acl-read-failed", "acl-shape-invalid"]),
  "null-device": new Set(["child-start-failed", "child-timeout", "child-exit-invalid",
    "child-output-unexpected", "child-terminal-unresolved"]),
  result: new Set(["result-invalid"]),
});

const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && Object.keys(value).every((key, index) => key === keys[index]);
const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

export function completedHostPrerequisites(systemDrivePrepared, nullDevicePrepared) {
  const result = { schemaVersion: SCHEMA, outcome: "completed", systemDrivePrepared,
    nullDevicePrepared, ready: systemDrivePrepared === true && nullDevicePrepared === true,
    privateValuesIncluded: false };
  if (!validateHostPrerequisiteRecord(result)) throw Object.assign(new Error("host-prerequisite-result-invalid"),
    { code: "host-prerequisite-result-invalid" });
  return result;
}

export function failedHostPrerequisites({ stage, code, childExitCode = null, childOutputBytes = null }) {
  const result = { schemaVersion: SCHEMA, outcome: "error", stage, code, childExitCode, childOutputBytes,
    privateValuesIncluded: false };
  if (!validateHostPrerequisiteRecord(result)) throw Object.assign(new Error("host-prerequisite-result-invalid"),
    { code: "host-prerequisite-result-invalid" });
  return result;
}

export function validateHostPrerequisiteRecord(value) {
  if (exactKeys(value, COMPLETE_KEYS)) return value.schemaVersion === SCHEMA && value.outcome === "completed"
    && typeof value.systemDrivePrepared === "boolean" && typeof value.nullDevicePrepared === "boolean"
    && typeof value.ready === "boolean"
    && value.ready === (value.systemDrivePrepared && value.nullDevicePrepared)
    && value.privateValuesIncluded === false;
  if (!exactKeys(value, ERROR_KEYS) || value.schemaVersion !== SCHEMA || value.outcome !== "error"
      || !ERROR_CODES[value.stage]?.has(value.code) || value.privateValuesIncluded !== false) return false;
  const exitValid = value.childExitCode === null || uint32(value.childExitCode);
  const bytesValid = value.childOutputBytes === null || (Number.isInteger(value.childOutputBytes)
    && value.childOutputBytes >= 0 && value.childOutputBytes <= 8192);
  if (!exitValid || !bytesValid) return false;
  if (value.stage !== "null-device") return value.childExitCode === null && value.childOutputBytes === null;
  if (value.code === "child-start-failed" || value.code === "child-terminal-unresolved") {
    return value.childExitCode === null;
  }
  return value.childOutputBytes !== null;
}

export const HOST_PREREQUISITE_SCHEMA = SCHEMA;
