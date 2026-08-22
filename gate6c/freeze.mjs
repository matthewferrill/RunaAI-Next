import { assertBinding, assertFreezeLease, bindingDigest } from "./contracts.mjs";
import { GATE6C_FREEZE_VERSION, GATE6C_REQUIRED_DOMAINS } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const safeId = value => /^[A-Za-z0-9._:-]{1,160}$/.test(String(value));

export function issueFreezeLease({ binding, leaseId, now = new Date(), durationMinutes = 30 }) {
  const accepted = assertBinding(binding);
  if (!safeId(leaseId) || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 120) {
    throw coded("gate6c-freeze-request-invalid", "The freeze lease request is invalid.");
  }
  return Object.freeze({ schemaVersion: GATE6C_FREEZE_VERSION, bindingDigest: bindingDigest(accepted),
    leaseId, sourceGeneration: accepted.sourceGeneration,
    selectedDomains: GATE6C_REQUIRED_DOMAINS, selectedWritesFrozen: true, legacyReadsAvailable: true,
    issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
    status: "active", privateValuesIncluded: false });
}

export function renewFreezeLease(lease, { binding, now = new Date(), durationMinutes = 30 }) {
  const active = assertFreezeLease(lease, { binding, now });
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 120) {
    throw coded("gate6c-freeze-request-invalid", "The freeze renewal duration is invalid.");
  }
  return Object.freeze({ ...active, issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString() });
}

export function releaseFreezeLease(lease, { binding, now = new Date(), reason }) {
  const active = assertFreezeLease(lease, { binding, now });
  if (!["verified-rollback", "gate6-closed"].includes(reason)) {
    throw coded("gate6c-freeze-release-denied", "The selected-write freeze may be released only after verified rollback or Gate 6 close.");
  }
  return Object.freeze({ ...active, selectedWritesFrozen: false, status: "released",
    releasedAt: now.toISOString(), releaseReason: reason });
}
