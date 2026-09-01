export const CAMPAIGN_FAILURE_SCHEMA_VERSION = "runaai-m1-campaign-failure/v1";

const CATEGORY = Object.freeze({
  APPLICATION: "application",
  BROWSER: "browser-witness",
  HARNESS: "harness",
  MODEL: "model",
  OPERATOR: "operator-publication",
  STOP: "operator-stop",
  TIMEOUT: "timeout",
});

const PREFIXES = Object.freeze([
  ["m1-model-", CATEGORY.MODEL],
  ["m1-provider-", CATEGORY.MODEL],
  ["m1-semantic-", CATEGORY.MODEL],
  ["m1-browser-ack-publication-", CATEGORY.OPERATOR],
  ["m1-browser-ack-", CATEGORY.OPERATOR],
  ["browser-ack-helper-", CATEGORY.OPERATOR],
  ["browser-witness-ack-helper-", CATEGORY.OPERATOR],
  ["r13-ack-watcher-", CATEGORY.OPERATOR],
  ["m1-browser-", CATEGORY.BROWSER],
  ["m1-campaign-live-", CATEGORY.TIMEOUT],
  ["m1-campaign-publication-", CATEGORY.TIMEOUT],
  ["m1-campaign-batch-hard-stop", CATEGORY.TIMEOUT],
  ["m1-campaign-deadline", CATEGORY.TIMEOUT],
  ["m1-campaign-launch-window-", CATEGORY.TIMEOUT],
  ["m1-campaign-lease-", CATEGORY.TIMEOUT],
  ["m1-campaign-attempt-undrained", CATEGORY.HARNESS],
  ["m1-campaign-owned-cleanup-", CATEGORY.HARNESS],
  ["m1-campaign-output-", CATEGORY.HARNESS],
  ["m1-campaign-containment-", CATEGORY.HARNESS],
  ["m1-capture-", CATEGORY.HARNESS],
  ["m1-health-capture-", CATEGORY.HARNESS],
  ["m1-campaign-operator-stop", CATEGORY.STOP],
]);

const APPLICATION_INVARIANTS = new Set([
  "m1-original-pending-proposal-missing",
  "m1-pending-state-inconsistent",
  "m1-resume-state-inconsistent",
  "m1-restored-state-inconsistent",
  "m1-ui-outcome-source-invalid",
]);

const WINDOWS_PUBLICATION = new Set(["EBUSY", "ENOENT", "EPERM"]);
const MODEL_DEADLINES = new Set(["m1-planning-deadline"]);

function codeOf(errorOrCode) {
  if (typeof errorOrCode === "string") return errorOrCode;
  return typeof errorOrCode?.code === "string" ? errorOrCode.code
    : typeof errorOrCode?.message === "string" ? errorOrCode.message.split(":", 1)[0]
      : "m1-campaign-unknown-failure";
}

export function classifyCampaignFailure(errorOrCode, { phase = null } = {}) {
  const code = codeOf(errorOrCode);
  // Fail closed for candidate attribution. Only an explicitly model/provider/
  // semantic-prefixed failure may consume and grade an attempt. New application
  // or harness codes therefore pause until they are deliberately classified.
  let category = CATEGORY.HARNESS;
  if (WINDOWS_PUBLICATION.has(code) && phase?.includes("browser")) category = CATEGORY.OPERATOR;
  else if (APPLICATION_INVARIANTS.has(code)) category = CATEGORY.APPLICATION;
  else {
    const match = PREFIXES.find(([prefix]) => code.startsWith(prefix));
    if (match) category = match[1];
    else if (["action", "application"].includes(phase)) category = CATEGORY.APPLICATION;
  }
  const pauseCampaign = category !== CATEGORY.MODEL;
  return Object.freeze({ schemaVersion: CAMPAIGN_FAILURE_SCHEMA_VERSION, code, category,
    attribution: pauseCampaign ? "non-model" : "model", pauseCampaign, consumeAttempt: !pauseCampaign,
    gradeModel: !pauseCampaign });
}

function provedModelDeadline(code) {
  return Object.freeze({ schemaVersion: CAMPAIGN_FAILURE_SCHEMA_VERSION, code, category: CATEGORY.MODEL,
    attribution: "model", pauseCampaign: false, consumeAttempt: true, gradeModel: true });
}

function latestDurableRunError(observation, phase) {
  const evidence = Array.isArray(observation?.evidence) ? observation.evidence : [];
  for (let index = evidence.length - 1; index >= 0; index--) {
    const item = evidence[index];
    if (item?.kind !== "durable-task-state" || item?.phase !== phase) continue;
    if (typeof item.data?.run?.errorCode === "string") return item.data.run.errorCode;
  }
  return null;
}

export function classifyCapturedProviderFailure(value, observation) {
  const rawCode = typeof value?.errorCode === "string" ? value.errorCode : value?.errorCode;
  if (rawCode === "m1-capture-downstream-disconnected") {
    const applicationError = latestDurableRunError(observation, value?.phase);
    if (MODEL_DEADLINES.has(applicationError)) return provedModelDeadline(applicationError);
  }
  return classifyCampaignFailure(rawCode, { phase: "capture" });
}

export function pauseableObservationFailure(observation) {
  for (const failure of observation?.failures ?? []) {
    const durableError = latestDurableRunError(observation, failure?.phase);
    const classified = MODEL_DEADLINES.has(failure?.errorCode) && durableError === failure.errorCode
      ? provedModelDeadline(failure.errorCode)
      : classifyCampaignFailure(failure?.errorCode, { phase: failure?.phase });
    if (classified.pauseCampaign) return classified;
  }
  return null;
}

export { CATEGORY as CAMPAIGN_FAILURE_CATEGORY };
