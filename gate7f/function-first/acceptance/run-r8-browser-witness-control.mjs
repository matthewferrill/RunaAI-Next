import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MODEL_CASES, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { assertOwnedStage, fail, newObservation, ObservationLedger, sha256, validateRuntimeSeal } from "./runner-contract.mjs";
import { createOwnedControlResources, fileSha256 } from "./owned-control-resources.mjs";
import { createFunctionalTestbed } from "./functional-testbed.mjs";
import { FunctionalHttpJourney } from "./http-journey.mjs";
import { AcceptanceFaultController, AGENT05_POST_RECEIPT_HOLD_MS } from "./fault-actions.mjs";
import { AGENT05_IN_FLIGHT_OBSERVATION_MS, createBrowserCheckpoint } from "./browser-checkpoint.mjs";
import { healthCaptureDiagnostics } from "./capture-transport.mjs";

const stamp = () => new Date().toISOString();
const safeCode = error => /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "m1-r8-browser-control-failed";

export function parseR8BrowserControlArguments(argv) {
  const allowed = new Set(["owned-root", "source-commit", "runtime-seal", "browser-checkpoints"]), result = {}, seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const raw = argv[index], value = argv[index + 1], key = raw?.slice(2);
    if (!raw?.startsWith("--") || !allowed.has(key) || !value || value.startsWith("--") || seen.has(key)) throw fail("m1-r8-browser-control-argument-invalid");
    seen.add(key); result[key] = value;
  }
  if (seen.size !== allowed.size || result["browser-checkpoints"] !== "true" || !/^[a-f0-9]{40}$/u.test(result["source-commit"] ?? "")) {
    throw fail("m1-r8-browser-control-argument-invalid");
  }
  return result;
}

export async function runR8BrowserWitnessControl(args, { announce = value => process.stdout.write(`${JSON.stringify(value)}\n`) } = {}) {
  const root = assertOwnedStage(args["owned-root"]), sealPath = path.resolve(root, args["runtime-seal"]), evidenceDirectory = path.join(root, "acceptance-evidence");
  if (!sealPath.startsWith(root + path.sep)) throw fail("m1-r8-browser-control-seal-path-denied");
  const [identity, sealInfo] = await Promise.all([
    readFile(path.join(root, "SOURCE-IDENTITY.json"), "utf8").then(JSON.parse), lstat(sealPath),
  ]);
  if (!sealInfo.isFile() || sealInfo.isSymbolicLink() || sealInfo.size > 262144) throw fail("m1-r8-browser-control-seal-invalid");
  const sealBytes = await readFile(sealPath), runtimeSealSha256 = sha256(sealBytes), seal = validateRuntimeSeal(JSON.parse(sealBytes), { sourceCommit: args["source-commit"] });
  if (seal.schemaVersion !== "runaai-m1-functional-runtime-seal/v4" || identity.sourceCommit !== args["source-commit"]
      || identity.caseBundleSha256 !== CASE_BUNDLE_SHA256 || identity.sourceArchiveSha256 !== await fileSha256(path.join(root, "source.tar"))) {
    throw fail("m1-r8-browser-control-source-mismatch");
  }
  await mkdir(evidenceDirectory, { recursive: true });
  const item = MODEL_CASES.find(value => value.id === "agent-05-cancel-drain");
  const report = { schemaVersion: "runaai-m1-r8-browser-witness-control/v1", sourceCommit: identity.sourceCommit,
    sourceArchiveSha256: identity.sourceArchiveSha256, caseBundleSha256: CASE_BUNDLE_SHA256, runtimeSealSha256,
    startedAt: stamp(), modelsInvoked: false, actualBrowserExercised: false, witnessOnTime: false,
    fullPublicationAfterObservationDeadline: false, nativeReleaseWithinCeiling: false,
    productionChanged: false, protectedDataRead: false, privateValuesIncluded: false };
  let resources, testbed, pending = null, ledger = new ObservationLedger(newObservation(item,
    { candidateId: null, repetition: 0, runtimeSealSha256 }));
  ledger.observation.sourceCommit = identity.sourceCommit;
  const checkpoints = [];
  try {
    resources = await createOwnedControlResources({ root, maximumMs: 900000 });
    if (resources.report.nodeSha256 !== seal.runtime.nodeSha256 || resources.report.qdrantArtifact.sha256 !== seal.runtime.qdrantSha256
        || await fileSha256(path.join(root, "package-lock.json")) !== seal.runtime.packageLockSha256) throw fail("m1-r8-browser-control-runtime-mismatch");
    const faults = new AcceptanceFaultController({ getLedger: () => ledger, nativeReceiptHoldMs: AGENT05_POST_RECEIPT_HOLD_MS });
    testbed = await createFunctionalTestbed({ resources, mode: "controls", getLedger: () => ledger, faults, taskHooks: faults.taskHooks });
    const checkpoint = createBrowserCheckpoint({ directory: evidenceDirectory, announce: value => {
      checkpoints.push(value); announce({ schemaVersion: "runaai-m1-browser-checkpoint-ready/v1", ...value });
    } });
    const journey = new FunctionalHttpJourney({ host: testbed.host, item, ledger,
      identitySeed: `${runtimeSealSha256}/r8-model-free-browser-witness`, checkpoint });
    ledger.phase = "model-free:initialize"; await journey.initialize();
    ledger.phase = "model-free:prepare-project"; await journey.prepareProject();
    ledger.phase = "model-free:browser-preparation";
    const prepared = await checkpoint({ client: journey, phase: ledger.phase, stage: "before-native-dispatch" });
    if (prepared?.preparationOnly !== true) throw fail("m1-r8-browser-control-preparation-unproven");
    ledger.phase = "model-free:native-dispatch"; faults.armNativeReceiptHold({ participantId: journey.principalId, projectId: journey.projectId });
    pending = journey.executeCapability("project.run-tests", { suiteId: "distance-v1" }); pending.catch(() => {});
    const held = await faults.waitNativeReceiptHeld();
    ledger.observation.native.receipts.push({ requestId: held.requestId, receiptId: held.receiptId, sourceSha256: held.sourceSha256,
      participantId: journey.principalId, projectId: journey.projectId });
    ledger.phase = "model-free:cancel-after-dispatch";
    const cancelled = await journey.m1("task.cancel", { taskId: journey.task.taskId });
    if (cancelled?.status !== "cancelled" || cancelled.taskId !== journey.task.taskId
        || cancelled.participantId !== journey.principalId || cancelled.projectId !== journey.projectId) throw fail("m1-r8-browser-control-cancel-invalid");
    ledger.evidence("postgresql", "fault-cancel-after-native-dispatch", { taskId: journey.task.taskId,
      result: cancelled, held, cancellationAt: cancelled.updatedAt });
    const ticket = await checkpoint({ client: journey, phase: ledger.phase, stage: "in-flight", cancellationAt: cancelled.updatedAt });
    const releasedAt = Date.now(); faults.releaseNativeReceipt(); await pending; pending = null; await ticket.publication;
    const inFlight = checkpoints.findLast(value => value.stage === "in-flight"), requestBytes = await readFile(inFlight.requestPath), request = JSON.parse(requestBytes);
    const witness = ledger.observation.evidence.findLast(value => value.kind === "browser-observation-witness-received")?.data;
    const publication = ledger.observation.evidence.findLast(value => value.kind === "browser-observation-received")?.data;
    const witnessAt = Date.parse(witness?.receivedAt), publicationAt = Date.parse(publication?.receivedAt), observationDeadline = Date.parse(request.observationDeadline);
    report.actualBrowserExercised = ledger.observation.browserExercised === true;
    report.witnessOnTime = Number.isFinite(witnessAt) && witnessAt <= observationDeadline && ticket.witnessReceivedAt === witness.receivedAt;
    report.fullPublicationAfterObservationDeadline = Number.isFinite(publicationAt) && publicationAt > observationDeadline && publicationAt <= Date.parse(request.expiresAt);
    report.nativeReleaseWithinCeiling = releasedAt - Date.parse(held.heldAt) <= AGENT05_POST_RECEIPT_HOLD_MS;
    report.observation = { preparationCheckpointId: prepared.checkpointId, inFlightCheckpointId: ticket.checkpointId,
      requestSha256: sha256(requestBytes), observationWindowMs: AGENT05_IN_FLIGHT_OBSERVATION_MS,
      witnessReceivedAt: witness.receivedAt, observationDeadline: request.observationDeadline,
      publicationReceivedAt: publication.receivedAt, publicationDeadline: request.expiresAt,
      nativeHeldAt: held.heldAt, nativeReleasedAt: new Date(releasedAt).toISOString() };
    report.modelsInvoked = ledger.observation.provider.calls.length !== 0;
    if (!report.actualBrowserExercised || !report.witnessOnTime || !report.fullPublicationAfterObservationDeadline
        || !report.nativeReleaseWithinCeiling || report.modelsInvoked) throw fail("m1-r8-browser-control-criteria-unmet");
    report.passed = true;
  } catch (error) {
    report.passed = false; report.errorCode = safeCode(error);
  } finally {
    try { if (pending) await pending; } catch {}
    try { await testbed?.close(); await resources?.close(); } catch (error) { report.cleanupError = safeCode(error); }
    report.healthDiagnostics = healthCaptureDiagnostics(testbed?.transports);
    report.finishedAt = stamp();
    const filename = `r8-browser-witness-control-${Date.now()}.json`;
    await writeFile(path.join(evidenceDirectory, filename), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    report.evidenceFile = `acceptance-evidence/${filename}`;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await runR8BrowserWitnessControl(parseR8BrowserControlArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ schemaVersion: report.schemaVersion, passed: report.passed,
      errorCode: report.errorCode ?? null, cleanupError: report.cleanupError ?? null, evidenceFile: report.evidenceFile,
      modelsInvoked: report.modelsInvoked, productionChanged: false })}\n`);
    if (!report.passed || report.cleanupError) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-r8-browser-witness-control-error/v1",
      passed: false, errorCode: safeCode(error), modelsInvoked: false, productionChanged: false })}\n`); process.exitCode = 1;
  }
}
