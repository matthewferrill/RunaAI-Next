const coded = (code, message) => Object.assign(new Error(message), { code });

function matchingPreference(preferences, task, capabilityId, decision) {
  return preferences
    .filter(item => item.participantId === task.participantId
      && item.projectId === task.projectId
      && item.environmentId === task.environment.environmentId
      && item.capabilityId === capabilityId
      && item.decision === decision
      && (item.scope === "project" || item.sessionId === task.sessionId))
    .sort((left, right) => (left.scope === "session" ? -1 : 1) - (right.scope === "session" ? -1 : 1))[0] ?? null;
}

export function evaluateAgentPolicy({ task, capability, preferences = [] }) {
  if (!capability) throw coded("agent-capability-unknown", "The capability is not registered.");
  if (task.environment.environmentKind !== capability.environmentKind) {
    return { result: "deny", basis: "environment-capability-mismatch" };
  }

  const denied = matchingPreference(preferences, task, capability.capabilityId, "deny");
  if (denied) return { result: "deny", basis: `remembered-${denied.scope}-deny` };

  const profile = task.profile;
  if (profile.id === "custom" && !profile.allowedCapabilityIds.includes(capability.capabilityId)) {
    return { result: "deny", basis: "custom-capability-not-allowed" };
  }
  if (profile.id === "read-only" && capability.effectful) {
    return { result: "deny", basis: "read-only-effect-denied" };
  }

  const allowed = matchingPreference(preferences, task, capability.capabilityId, "allow");
  if (allowed) return { result: "automatic", basis: `remembered-${allowed.scope}-allow` };

  if (profile.id === "custom") {
    return profile.automaticCapabilityIds.includes(capability.capabilityId)
      ? { result: "automatic", basis: "profile-custom-automatic" }
      : { result: "approval-required", basis: "profile-custom-review" };
  }
  if (!capability.effectful) return { result: "automatic", basis: "profile-non-effect" };
  if (profile.id === "ask-every-time") return { result: "approval-required", basis: "profile-ask-every-time" };
  if (profile.id === "safe-autopilot") {
    return capability.safeAutomatic
      ? { result: "automatic", basis: "profile-safe-autopilot" }
      : { result: "approval-required", basis: "profile-safe-autopilot-review" };
  }
  if (profile.id === "full-project-autopilot") {
    return { result: "automatic", basis: "profile-full-project-autopilot" };
  }
  return { result: "deny", basis: "profile-unrecognized" };
}

export function approvalBasisForPolicy(policyBasis) {
  if (policyBasis === "remembered-session-allow") return "remembered-session";
  if (policyBasis === "remembered-project-allow") return "remembered-project";
  return "profile";
}
