import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { assertBinding, bindingDigest, rejectPrivateFields } from "./contracts.mjs";
import { GATE6C_CEREMONY_VERSION, GATE6C_OWNER_STEPS } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const safeId = value => /^[A-Za-z0-9._:-]{1,160}$/.test(String(value));
const methods = new Set(["webauthn", "passkey", "fido2", "windows-hello"]);

function validateEvidence(command, evidence) {
  rejectPrivateFields(evidence);
  if (evidence?.passed !== true || !/^[a-f0-9]{64}$/.test(String(evidence?.evidenceDigest ?? ""))) {
    throw coded("gate6c-owner-evidence-invalid", `Owner evidence is invalid for ${command}.`);
  }
  if (["enroll-primary-credential", "verify-sign-in", "verify-fresh-step-up",
    "enroll-recovery-credential", "verify-recovery"].includes(command) && !methods.has(evidence.method)) {
    throw coded("gate6c-owner-method-invalid", `${command} requires a user-verified WebAuthn or passkey method.`);
  }
  if (command === "verify-revocation" && (evidence.sessionsRevoked !== true || evidence.capabilitiesRevoked !== true)) {
    throw coded("gate6c-owner-revocation-invalid", "Owner revocation evidence is incomplete.");
  }
}

export function createOwnerCeremonyState(binding) {
  const accepted = assertBinding(binding);
  return Object.freeze({ schemaVersion: GATE6C_CEREMONY_VERSION, bindingDigest: bindingDigest(accepted),
    phase: "planned", nextStep: GATE6C_OWNER_STEPS[0], revision: 0, events: Object.freeze([]),
    primaryCredentialEnrolled: false, recoveryCredentialEnrolled: false,
    signInVerified: false, freshStepUpVerified: false, revocationVerified: false,
    recoveryVerified: false, complete: false, privateValuesIncluded: false });
}

export function advanceOwnerCeremony(state, { operationId, command, evidence, observedAt }) {
  if (!safeId(operationId)) throw coded("gate6c-owner-operation-invalid", "A bounded owner operation id is required.");
  if (state.complete) throw coded("gate6c-owner-ceremony-complete", "The owner ceremony is already complete.");
  const expected = GATE6C_OWNER_STEPS[state.revision];
  if (command !== expected) throw coded("gate6c-owner-step-order-invalid", `Expected ${expected}.`);
  if (!Number.isFinite(Date.parse(observedAt))) throw coded("gate6c-owner-time-invalid", "The owner evidence time is invalid.");
  validateEvidence(command, evidence);
  const inputDigest = sha256(canonicalJson({ command, evidence, observedAt }));
  if (state.events.some(event => event.operationId === operationId)) throw coded("gate6c-owner-operation-reused", "The owner operation id was already used.");
  const revision = state.revision + 1;
  const next = { ...structuredClone(state), revision,
    phase: revision === GATE6C_OWNER_STEPS.length ? "complete" : "in-progress",
    nextStep: GATE6C_OWNER_STEPS[revision] ?? null,
    events: [...state.events, { sequence: revision, operationId, command, inputDigest, observedAt }] };
  if (command === "enroll-primary-credential") next.primaryCredentialEnrolled = true;
  if (command === "verify-sign-in") next.signInVerified = true;
  if (command === "verify-fresh-step-up") next.freshStepUpVerified = true;
  if (command === "verify-revocation") next.revocationVerified = true;
  if (command === "enroll-recovery-credential") next.recoveryCredentialEnrolled = true;
  if (command === "verify-recovery") next.recoveryVerified = true;
  next.complete = revision === GATE6C_OWNER_STEPS.length;
  return Object.freeze({ ...next, events: Object.freeze(next.events) });
}

export function assertOwnerCeremonyComplete(state, binding) {
  if (state?.schemaVersion !== GATE6C_CEREMONY_VERSION || state.bindingDigest !== bindingDigest(binding)
      || state.phase !== "complete" || state.complete !== true || state.revision !== GATE6C_OWNER_STEPS.length
      || !state.primaryCredentialEnrolled || !state.recoveryCredentialEnrolled || !state.signInVerified
      || !state.freshStepUpVerified || !state.revocationVerified || !state.recoveryVerified
      || state.privateValuesIncluded !== false) {
    throw coded("gate6c-owner-ceremony-incomplete", "The target owner ceremony is not complete.");
  }
  rejectPrivateFields(state);
  return Object.freeze(structuredClone(state));
}
