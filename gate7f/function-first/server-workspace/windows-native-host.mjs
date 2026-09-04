import { assertNativeCandidateConfig } from "./native-candidate-config.mjs";

const fail = code => Object.assign(new Error(code), { code });

const METHOD_NAMES = Object.freeze([
  "preparePublicGitOperation", "closeUnintendedEndpoints", "observePreResume", "writeBootstrapChunk",
  "endBootstrap", "resumeAllChildren", "writeControlRecord", "readControlRecord", "endControlRequest",
  "readControlResponseEof", "capturePublicationAuthority", "waitForChildrenExit", "openOwnedResource",
  "observeOwnedSibling", "inspectOwnedManifestTree", "flushOwnedFile", "flushOwnedDirectoryMetadata",
  "flushAuthorityManifest", "moveOwnedSiblingNoReplaceWriteThrough", "closeOwnedResource",
]);

/** Fail-closed gate-1 surface; no native helper is loaded or process started by this source stub. */
export function createWindowsNativeWorkspaceHost(configuration) {
  assertNativeCandidateConfig(configuration);
  const host = {};
  for (const method of METHOD_NAMES) {
    host[method] = async () => { throw fail("windows-native-workspace-host-unavailable"); };
  }
  host.close = async () => {};
  return Object.freeze(host);
}

export const windowsNativeHostMethodNames = METHOD_NAMES;
export const windowsNativeHostProofBoundary = Object.freeze({
  deterministicInterfaceOnly: true,
  nativeHelperLoaded: false,
  nativeProcessStarted: false,
  rawHandleExposedToJavascript: false,
  actualWindowsJobAppContainerAndAclProofRequired: true,
});
