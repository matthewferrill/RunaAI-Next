import { canonicalJson } from "./tasks/contracts.mjs";

export const PLAN_PROTOCOL_VERSION = "runaai-m1-plan-protocol/v1";
export const WORK_INTENTS = Object.freeze(["analysis-only", "preview-only", "effect-requested"]);

export function describePlanProtocol(capabilityIds = [], workIntent = "effect-requested") {
  const available = new Set(Array.isArray(capabilityIds) ? capabilityIds : []);
  return Object.freeze({
    schemaVersion: PLAN_PROTOCOL_VERSION,
    workIntent,
    previewApplyPairing: workIntent === "effect-requested"
      && available.has("project.preview-change") && available.has("project.apply-change")
      ? "Each preview must be followed by one apply with byte-identical arguments, and each apply must have a preceding matching preview. A preview-only request must use a grant that omits project.apply-change."
      : "not-required-by-this-grant",
    correctionLimit: 1,
    correctionAuthority: "advisory-only; correction never executes, approves, or expands the grant",
  });
}

export function planProtocolViolations(plan, capabilityIds = [], workIntent = "effect-requested") {
  const available = new Set(Array.isArray(capabilityIds) ? capabilityIds : []);
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  if (workIntent === "analysis-only") {
    return steps.some(step => step?.capabilityId !== "project.inspect") ? ["analysis-only-plan-has-non-inspection-step"] : [];
  }
  if (workIntent === "preview-only") {
    return steps.some(step => !["project.inspect", "project.preview-change"].includes(step?.capabilityId))
      ? ["preview-only-plan-has-effect-step"] : [];
  }
  if (!available.has("project.preview-change") || !available.has("project.apply-change")) return [];
  const previews = [], applies = [];
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index], key = canonicalJson(step?.arguments);
    if (step?.capabilityId === "project.preview-change") previews.push({ index, key });
    if (step?.capabilityId === "project.apply-change") applies.push({ index, key });
  }
  const usedApplies = new Set(), violations = [];
  for (const preview of previews) {
    const apply = applies.find(candidate => !usedApplies.has(candidate.index)
      && candidate.index > preview.index && candidate.key === preview.key);
    if (apply) usedApplies.add(apply.index);
    else violations.push("preview-without-matching-later-apply");
  }
  for (const apply of applies) {
    if (!usedApplies.has(apply.index)) violations.push("apply-without-matching-earlier-preview");
  }
  return [...new Set(violations)];
}
