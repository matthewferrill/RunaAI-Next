import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createNativeCandidateConfig, assertNativeCandidateConfig } from "./native-candidate-config.mjs";
import { controlWatchdogLeaseMethodNames } from "./control-watchdog-host.mjs";
import { admitControlCoordinatorStartup, runControlCoordinatorChild } from "./control-coordinator-child.mjs";
import { admitPublicGitMaterializerStartup, runPublicGitMaterializerChild } from "./public-git-materializer-child.mjs";
import { ServerWorkspaceService } from "./service.mjs";
import { windowsNativeHostMethodNames } from "./windows-native-host.mjs";

const SOURCE_ID = "source-00000000-0000-4000-8000-000000000001";
const CONTEXT = Object.freeze({ principalId: "principal", projectId: "project", sessionId: "session" });
const SOURCE_DEFINITION = Object.freeze({ environmentId: "environment_0001", displayName: "Public fixture",
  repositoryHttpsUrl: "https://example.com/org/repository.git", requestedRef: "refs/heads/main",
  expectedCommitOid: "1".repeat(40) });

function service(materializer = null) {
  return new ServerWorkspaceService({ store: { async connectPublicGit() {} }, materializer,
    sourceDefinition: SOURCE_DEFINITION, authorizeContext: async () => true });
}

test("candidate configuration is default off, strict, and rejects structurally similar unbranded values", async () => {
  assert.equal(await createNativeCandidateConfig({ enabled: false,
    protectedWorkspaceParent: "D:\\RunaWorkspaces" }), null);
  await assert.rejects(() => createNativeCandidateConfig({ enabled: false,
    protectedWorkspaceParent: "D:\\RunaWorkspaces", watchdogEndpoint: "attacker" }));
  assert.throws(() => assertNativeCandidateConfig({ schemaVersion: "runa-public-git-native-candidate-config/v1",
    enabled: true, releaseManifestPath: "D:\\release\\manifest.json", releaseRoot: "D:\\release",
    protectedWorkspaceParent: "D:\\workspaces", watchdogEndpoint: String.raw`\\.\pipe\runa-m1-s2b1-control-watchdog`,
    watchdogSigningKeyId: "control-watchdog-authority-0001", watchdogSigningKeyVersion: 1,
    watchdogPublicKey: "forged", watchdogIdentitySha256: "1".repeat(64),
    workerReleaseSha256: "2".repeat(64) }));
});

test("service keeps materialization unavailable before intent when default off", async () => {
  await assert.rejects(() => service().materialize(CONTEXT, { sourceId: SOURCE_ID }),
    /server-workspace-materializer-unavailable/);
});

test("service forwards only authenticated context and source ID to the already constructed port", async () => {
  let observed;
  const candidate = service({ async materialize(input) { observed = input; return { accepted: true }; } });
  assert.deepEqual(await candidate.materialize(CONTEXT, { sourceId: SOURCE_ID }), { accepted: true });
  assert.deepEqual(observed, { context: CONTEXT, sourceId: SOURCE_ID });
  await assert.rejects(() => candidate.materialize(CONTEXT, { sourceId: SOURCE_ID,
    executablePath: "C:\\attacker.exe" }));
});

test("child startup admits only opaque operation and startup resource identifiers", async () => {
  const startup = { schemaVersion: "runa-public-git-child-startup/v1",
    operationId: "operation-00000000-0000-4000-8000-000000000001",
    startupResourceId: "native-resource-00000001" };
  assert.deepEqual(admitControlCoordinatorStartup(startup), startup);
  assert.deepEqual(admitPublicGitMaterializerStartup(startup), startup);
  assert.throws(() => admitControlCoordinatorStartup({ ...startup, modulePath: "C:\\attacker.mjs" }));
  assert.throws(() => admitPublicGitMaterializerStartup({ ...startup, endpoint: "https://attacker" }));
  await assert.rejects(() => runControlCoordinatorChild(startup), /native-bootstrap-unavailable/);
  await assert.rejects(() => runPublicGitMaterializerChild(startup), /native-bootstrap-unavailable/);
});

test("fail-closed native source stubs publish the complete deterministic port surfaces", () => {
  assert.deepEqual(controlWatchdogLeaseMethodNames, ["issueAndArmOperationAuthority", "settleUnissuedFailure",
    "verifyUnissuedSettlement", "closeUnused", "verifyUnusedClosure", "runForward",
    "beginImmediateTeardown", "recover", "verifyOwnershipReceipt", "completeSuccessCleanup",
    "runReadyCas", "runTerminalCas", "runUnknownCas", "release"]);
  assert.deepEqual(windowsNativeHostMethodNames, ["preparePublicGitOperation", "closeUnintendedEndpoints",
    "observePreResume", "writeBootstrapChunk", "endBootstrap", "resumeAllChildren", "writeControlRecord",
    "readControlRecord", "endControlRequest", "readControlResponseEof", "capturePublicationAuthority",
    "waitForChildrenExit", "openOwnedResource", "observeOwnedSibling", "inspectOwnedManifestTree",
    "flushOwnedFile", "flushOwnedDirectoryMetadata", "flushAuthorityManifest",
    "moveOwnedSiblingNoReplaceWriteThrough", "closeOwnedResource"]);
});

test("top-level candidate construction is static, default-off and not steerable by request or source data", async () => {
  const composition = await readFile(new URL("../composition.mjs", import.meta.url), "utf8");
  const productionComposition = await readFile(new URL("../../../gate6b/composition.mjs", import.meta.url), "utf8");
  const watchdogHost = await readFile(new URL("./control-watchdog-host.mjs", import.meta.url), "utf8");
  assert.equal(composition.includes("import("), false);
  assert.match(composition, /import \{ assertNativeCandidateConfig \} from "\.\/server-workspace\/native-candidate-config\.mjs"/u);
  assert.match(composition, /if \(nativeCandidateConfig !== undefined && nativeCandidateConfig !== null\)/u);
  assert.match(composition, /createPublicGitControlWorkerComposition\(\{ database: workspaceStore, watchdog, nativeHost,[\s\S]*workerReleaseSha256: candidate\.workerReleaseSha256 \}\)/u);
  assert.equal(composition.indexOf("await checkpointer.setup()")
    < composition.lastIndexOf("createNativeCandidateAttachment(nativeCandidateResources"), true);
  assert.equal(composition.match(/let nativeCandidateResources = null;/gu)?.length, 1);
  assert.doesNotMatch(composition, /(?<!let )nativeCandidateResources = null;/u);
  assert.match(composition,
    /catch \(error\) \{[\s\S]*rejectNativeCandidateConstruction\(nativeCandidateResources, error\)/u);
  assert.match(productionComposition, /const m1Functions = m1 \? await m1\.attach\(application\) : null;/u);
  assert.match(productionComposition,
    /const m1 = config\.functionFirst[\s\S]*return createOwnedProductionComposition\(\{ m1, pool, build: async \(\) => \{[\s\S]*createReleaseAnswerProviders[\s\S]*await browserCeremony\.initialize\(\)[\s\S]*await ordinarySessions\.initialize\(\)[\s\S]*await m1\.attach\(application\)/u);
  assert.equal(productionComposition.indexOf("await m1.close()")
    < productionComposition.indexOf("await pool.end()"), true);
  assert.match(productionComposition, /new AggregateError\(failures, "production-composition-cleanup-failed"\)/u);
  assert.match(watchdogHost, /resumeRetainedRecovery: unavailable/u);
  for (const denied of ["sourceDefinition.native", "input.native", "request.native", "process.env"]) {
    assert.equal(composition.includes(denied), false, denied);
  }
});

test("artifact result ports remain unconditional and attach beside the native candidate", async () => {
  const composition = await readFile(new URL("../composition.mjs", import.meta.url), "utf8");
  const portsImport = "import { createPostgresArtifactResultSourcePorts } from \"./artifact-result-postgres.mjs\";";
  const portsConstruction = "const { conversationResults, taskResults } = createPostgresArtifactResultSourcePorts({ pool, cipher });";
  const nativeAdmission = "if (nativeCandidateConfig !== undefined && nativeCandidateConfig !== null)";
  assert.equal(composition.includes(portsImport), true);
  assert.equal(composition.indexOf(portsConstruction) >= 0, true);
  assert.equal(composition.indexOf(portsConstruction) < composition.indexOf(nativeAdmission), true);
  assert.match(composition,
    /createNativeCandidateAttachment\(nativeCandidateResources,[\s\S]*new M1FunctionSurface\(\{[\s\S]*serverWorkspaces, conversationResults, taskResults,/u);
  assert.match(composition,
    /const composed = \{ index, sources, tasks, orchestrator, review, health, conversationResults, taskResults,[\s\S]*attach:[\s\S]*close:/u);
});
