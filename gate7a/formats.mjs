export const GATE7A_POLICY_VERSION = "runa2-gate7a-client-access-policy/v1";
export const GATE7A_MATRIX_VERSION = "runa2-gate7a-client-matrix/v1";
export const GATE7A_READINESS_VERSION = "runa2-gate7a-client-access-readiness/v1";
export const GATE7A_SYNTHETIC_VERSION = "runa2-gate7a-synthetic-results/v1";
export const GATE7A_HOSTNAME_DECISION_VERSION = "runa2-gate7a-hostname-decision/v1";
export const GATE7A_HOSTNAME_READINESS_VERSION = "runa2-gate7a-hostname-readiness/v1";

export const GATE7A_CLIENT_CASES = Object.freeze([
  "member-phone-off-lan",
  "member-windows-lan",
  "owner-omen-lan",
  "owner-pc-off-lan",
  "owner-phone-lan",
]);

export const GATE7A_REQUIRED_ASSERTIONS = Object.freeze([
  "canonical-origin-only",
  "external-issuer-only",
  "fresh-governed-step-up",
  "individual-principal",
  "no-client-backend-listener",
  "no-client-home-route",
  "opaque-revocable-session",
  "ordinary-browser-trust",
  "participant-project-scope",
  "user-verified-passkey",
]);
