const TARGET_PHASES = new Set(["promoted", "live-verified", "observing", "closed"]);
const coded = (code, message) => Object.assign(new Error(message), { code });

export function selectedAuthorityStatus({ mode, cutover, targetGeneration }) {
  const enabled = mode === "active" && TARGET_PHASES.has(cutover?.phase)
    && cutover?.authorityGeneration === targetGeneration;
  return Object.freeze({
    schemaVersion: "runa2-gate6b-selected-authority/v1",
    mode,
    enabled,
    phase: cutover?.phase ?? "unavailable",
    revision: Number.isInteger(cutover?.revision) ? cutover.revision : null,
    authorityGeneration: cutover?.authorityGeneration ?? null,
    targetGeneration,
    privateValuesIncluded: false,
  });
}

export function assertSelectedAuthority(input) {
  const status = selectedAuthorityStatus(input);
  if (!status.enabled) throw coded("candidate-shadow-authority", "The parallel candidate is not the selected authority.");
  return status;
}

