const registryEntries = [
  { capabilityId: "workspace.inspect", riskClass: "observe", effectful: false, safeAutomatic: true },
  { capabilityId: "workspace.preview-change", riskClass: "draft", effectful: false, safeAutomatic: true },
  { capabilityId: "workspace.apply-synthetic-change", riskClass: "reversible-local-change",
    effectful: true, safeAutomatic: true },
  { capabilityId: "workspace.restore-synthetic-change", riskClass: "reversible-local-change",
    effectful: true, safeAutomatic: true },
  { capabilityId: "workspace.verify-synthetic", riskClass: "observe", effectful: false, safeAutomatic: true },
];

export const AGENT_CAPABILITY_REGISTRY = Object.freeze(Object.fromEntries(
  registryEntries.map(entry => [entry.capabilityId, Object.freeze({ ...entry,
    environmentKind: "synthetic-memory" })]),
));

export function agentCapability(capabilityId) {
  return AGENT_CAPABILITY_REGISTRY[capabilityId] ?? null;
}

