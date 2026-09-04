import { verify } from "node:crypto";

import { canonicalStringify, publicGitOperationAuthoritySchema } from "./materialization-contracts.mjs";
import { assertNativeCandidateConfig } from "./native-candidate-config.mjs";

const fail = code => Object.assign(new Error(code), { code });

export const controlWatchdogLeaseMethodNames = Object.freeze([
  "issueAndArmOperationAuthority", "settleUnissuedFailure", "verifyUnissuedSettlement", "closeUnused",
  "verifyUnusedClosure", "runForward", "beginImmediateTeardown", "recover", "verifyOwnershipReceipt",
  "completeSuccessCleanup", "runReadyCas", "runTerminalCas", "runUnknownCas", "release",
]);

const attestationBytes = authority => Buffer.from(canonicalStringify({
  domain: "runa-public-git-operation-authority-attestation/v1",
  authorityDigest: authority.authorityDigest,
  signingKeyId: authority.attestation.signingKeyId,
  signingKeyVersion: authority.attestation.signingKeyVersion,
  watchdogIdentitySha256: authority.attestation.watchdogIdentitySha256,
}));

/** Synchronous verifier injected into PostgreSQL; it performs no IPC while a transaction is open. */
export function createWatchdogAuthorityVerifier(configuration) {
  const config = assertNativeCandidateConfig(configuration);
  return Object.freeze(function verifyWatchdogAuthority(rawAuthority) {
    let authority, signatureValid = false;
    try {
      authority = publicGitOperationAuthoritySchema.parse(rawAuthority);
      signatureValid = authority.attestation.signingKeyId === config.watchdogSigningKeyId
        && authority.attestation.signingKeyVersion === config.watchdogSigningKeyVersion
        && authority.attestation.watchdogIdentitySha256 === config.watchdogIdentitySha256
        && authority.workerReleaseSha256 === config.workerReleaseSha256
        && verify(null, attestationBytes(authority), config.watchdogPublicKey,
          Buffer.from(authority.attestation.signatureBase64, "base64"));
    } catch { signatureValid = false; }
    if (!signatureValid
        || authority.attestation.signingKeyId !== config.watchdogSigningKeyId
        || authority.attestation.signingKeyVersion !== config.watchdogSigningKeyVersion
        || authority.attestation.watchdogIdentitySha256 !== config.watchdogIdentitySha256
        || authority.workerReleaseSha256 !== config.workerReleaseSha256) {
      throw fail("watchdog-operation-authority-attestation-invalid");
    }
    return true;
  });
}

/**
 * Interface-only gate-1 client. The authenticated named-pipe transport is intentionally unavailable until the later
 * native source/build/hash gate replaces this fail-closed implementation on the same reviewed interface.
 */
export function createControlWatchdogClient(configuration) {
  const config = assertNativeCandidateConfig(configuration);
  const unavailable = async () => { throw fail("control-watchdog-native-transport-unavailable"); };
  return Object.freeze({
    endpoint: config.watchdogEndpoint,
    beginOperation: unavailable,
    openRetainedOperation: unavailable,
    resumeRetainedRecovery: unavailable,
    close: async () => {},
  });
}

export const controlWatchdogHostProofBoundary = Object.freeze({
  deterministicInterfaceOnly: true,
  authenticatedNativeTransportRequired: true,
  watchdogPrivateKeyAccessible: false,
  requestSelectableEndpoint: false,
  retainedRecoveryEntryRequired: true,
  actualTimerAndWaitProofRequired: true,
});
