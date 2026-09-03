const SCHEMA = "runa-omen-system-drive-transition/v2";
const KEYS = ["schemaVersion", "operation", "outcome", "stage", "code", "systemDriveState",
  "rollbackAttempted", "rollbackVerified", "journalState", "targetOnlyProbePassed", "privateValuesIncluded"];
const OPERATIONS = new Set(["prepare", "deprovision"]);
const STATES = new Set(["prepared", "unprepared", "unknown"]);
const JOURNALS = new Set(["absent", "retained", "removed", "unknown"]);

const row = (operation, outcome, stage, code, state, attempted, verified, journal, probe) =>
  [operation, outcome, stage, code, state, attempted, verified, journal, probe].join("\0");

const ROWS = new Set([
  row("prepare", "error", "preflight", "probe-failed", "unknown", false, false, "absent", false),
  row("prepare", "error", "preflight", "probe-cleanup-failed", "unknown", false, false, "absent", false),
  row("prepare", "error", "preflight", "pin-drift", "unknown", false, false, "absent", false),
  row("prepare", "error", "preflight", "pin-drift", "unknown", false, false, "absent", true),
  row("prepare", "error", "preflight", "precondition-failed", "unknown", false, false, "absent", false),
  row("prepare", "error", "preflight", "precondition-failed", "unknown", false, false, "absent", true),
  row("prepare", "error", "preflight", "journal-failed", "unprepared", false, false, "unknown", true),
  row("prepare", "error", "prepare", "prepare-failed-no-change", "unprepared", false, false, "retained", true),
  row("prepare", "prepared", "complete", "prepared", "prepared", false, false, "retained", true),
  row("prepare", "restored", "complete", "prepare-failed-restored", "unprepared", true, true, "removed", true),
  row("prepare", "restored", "complete", "post-state-mismatch-restored", "unprepared", true, true, "removed", true),
  row("prepare", "error", "rollback", "journal-removal-failed", "unprepared", true, true, "retained", true),
  row("prepare", "error", "rollback", "rollback-failed", "unknown", true, false, "retained", true),
  row("prepare", "error", "complete", "reconciliation-required", "unknown", false, false, "retained", true),
  row("prepare", "error", "complete", "reconciliation-required", "unknown", false, false, "unknown", true),
  row("prepare", "error", "complete", "reconciliation-required", "unknown", false, false, "unknown", false),
  row("prepare", "error", "complete", "reconciliation-required", "unknown", true, false, "retained", true),
  row("prepare", "error", "complete", "result-invalid", "unknown", false, false, "unknown", false),
  row("deprovision", "error", "preflight", "pin-drift", "unknown", false, false, "unknown", false),
  row("deprovision", "error", "preflight", "pin-drift", "prepared", false, false, "retained", true),
  row("deprovision", "error", "preflight", "precondition-failed", "unknown", false, false, "retained", false),
  row("deprovision", "error", "preflight", "precondition-failed", "unknown", false, false, "unknown", false),
  row("deprovision", "error", "preflight", "probe-failed", "prepared", false, false, "retained", false),
  row("deprovision", "error", "preflight", "probe-cleanup-failed", "prepared", false, false, "retained", false),
  row("deprovision", "error", "preflight", "journal-failed", "prepared", false, false, "unknown", true),
  row("deprovision", "deprovisioned", "complete", "deprovisioned", "unprepared", false, false, "removed", true),
  row("deprovision", "error", "deprovision", "deprovision-failed-unprepared", "unprepared", false, false,
    "retained", true),
  row("deprovision", "error", "deprovision", "deprovision-failed-prepared", "prepared", false, false,
    "retained", true),
  row("deprovision", "error", "deprovision", "journal-removal-failed", "unprepared", false, false,
    "retained", true),
  row("deprovision", "error", "complete", "reconciliation-required", "unknown", false, false, "retained", true),
  row("deprovision", "error", "complete", "reconciliation-required", "unknown", false, false, "retained", false),
  row("deprovision", "error", "complete", "reconciliation-required", "unknown", false, false, "unknown", false),
  row("deprovision", "error", "complete", "result-invalid", "unknown", false, false, "unknown", false),
]);

export function transitionRecord(input) {
  const value = { schemaVersion: SCHEMA, operation: input.operation, outcome: input.outcome, stage: input.stage,
    code: input.code, systemDriveState: input.systemDriveState, rollbackAttempted: input.rollbackAttempted,
    rollbackVerified: input.rollbackVerified, journalState: input.journalState,
    targetOnlyProbePassed: input.targetOnlyProbePassed, privateValuesIncluded: false };
  if (!validateTransitionRecord(value)) throw Object.assign(new Error("system-drive-transition-result-invalid"),
    { code: "system-drive-transition-result-invalid" });
  return value;
}

export function invalidTransitionRecord(operation) {
  return transitionRecord({ operation, outcome: "error", stage: "complete", code: "result-invalid",
    systemDriveState: "unknown", rollbackAttempted: false, rollbackVerified: false, journalState: "unknown",
    targetOnlyProbePassed: false });
}

export function validateTransitionRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== KEYS.length
      || !Object.keys(value).every((key, index) => key === KEYS[index]) || value.schemaVersion !== SCHEMA
      || !OPERATIONS.has(value.operation) || !STATES.has(value.systemDriveState)
      || !JOURNALS.has(value.journalState) || typeof value.rollbackAttempted !== "boolean"
      || typeof value.rollbackVerified !== "boolean" || typeof value.targetOnlyProbePassed !== "boolean"
      || value.privateValuesIncluded !== false || (value.rollbackVerified && !value.rollbackAttempted)) return false;
  return ROWS.has(row(value.operation, value.outcome, value.stage, value.code, value.systemDriveState,
    value.rollbackAttempted, value.rollbackVerified, value.journalState, value.targetOnlyProbePassed));
}

export const SYSTEM_DRIVE_TRANSITION_SCHEMA = SCHEMA;
