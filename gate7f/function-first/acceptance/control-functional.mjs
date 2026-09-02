import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CASE_BUNDLE_SHA256, CONTROL_CASES } from "./cases.mjs";
import { inventory, newObservation, ObservationLedger, fail, assertOwnedStage, sha256, validateRuntimeSeal } from "./runner-contract.mjs";
import { createOwnedControlResources, fileSha256 } from "./owned-control-resources.mjs";
import { createFunctionalTestbed } from "./functional-testbed.mjs";
import { runModelFreeControl, SUPPORTED_CONTROLS } from "./model-free-controls.mjs";
import { evaluateControl } from "./assertions.mjs";
import { createBrowserCheckpoint, HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS } from "./browser-checkpoint.mjs";
import { healthCaptureDiagnostics } from "./capture-transport.mjs";

// The owned PostgreSQL/Qdrant watchdog must outlive the complete browser
// checkpoint plus setup, the preceding controls and the successor controls.
// Equal deadlines can kill the testbed while a still-valid witness is pending.
export const CONTROL_RESOURCE_MAXIMUM_MS = HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS + 900000;

export function parseArguments(args) {
  const result = { mode: "inventory" }, seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    if (!["--mode", "--owned-root", "--source-commit", "--case-id", "--browser-checkpoints", "--runtime-seal"].includes(args[index]) || !args[index + 1]) throw fail("m1-runner-argument-invalid");
    const key = args[index].slice(2); if (seen.has(key)) throw fail("m1-runner-duplicate-argument"); seen.add(key); result[key] = args[index + 1];
  }
  if (!["inventory", "controls"].includes(result.mode)) throw fail("m1-scored-runner-readiness-not-yet-sealed");
  if (result["browser-checkpoints"] !== undefined && result["browser-checkpoints"] !== "true") throw fail("m1-browser-checkpoint-argument-invalid");
  return result;
}

export function bindControlRuntimeSeal(campaign, control, bytes) {
  const parsed = validateRuntimeSeal(campaign, { sourceCommit: control.sourceCommit });
  for (const key of ["sourceArchiveSha256", "packageLockSha256", "nodeSha256", "qdrantSha256"]) {
    if (parsed.runtime[key] !== control[key]) throw fail(`m1-control-runtime-${key}-mismatch`);
  }
  return { runtimeSealSha256: sha256(bytes), campaign: parsed };
}

export async function runControlFunctional(args, { checkpoint = null } = {}) {
  if (args.mode === "inventory") return { ...inventory(), implementedControlDrivers: SUPPORTED_CONTROLS,
    scoredCliEnabled: false, status: "unscored-scaffold; runtime/readiness seal and remaining drivers required" };
  const root = assertOwnedStage(args["owned-root"]);
  const identity = JSON.parse(await readFile(path.join(root, "SOURCE-IDENTITY.json"), "utf8"));
  if (!/^[a-f0-9]{40}$/.test(args["source-commit"] ?? "") || identity.sourceCommit !== args["source-commit"]
      || identity.caseBundleSha256 !== CASE_BUNDLE_SHA256 || identity.sourceArchiveSha256 !== await fileSha256(path.join(root, "source.tar"))) throw fail("m1-staged-source-pin-mismatch");
  const selected = args["case-id"] ? CONTROL_CASES.filter(item => item.id === args["case-id"]) : CONTROL_CASES;
  if (!selected.length) throw fail("m1-control-case-unknown");
  const report = { schemaVersion: "runaai-m1-control-functional-run/v1", sourceCommit: identity.sourceCommit,
    sourceArchiveSha256: identity.sourceArchiveSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
    scored: false, attempts: [], productQualificationPassed: false, modelsInvoked: false,
    productionChanged: false, protectedDataRead: false, startedAt: new Date().toISOString() };
  let resources, testbed, ledger = null;
  try {
    resources = await createOwnedControlResources({ root, maximumMs: CONTROL_RESOURCE_MAXIMUM_MS }); report.resources = resources.report;
    report.controlSeal = { schemaVersion: "runaai-m1-model-free-control-seal/v1", sourceCommit: identity.sourceCommit,
      sourceArchiveSha256: identity.sourceArchiveSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
      nodeSha256: resources.report.nodeSha256, qdrantSha256: resources.report.qdrantArtifact.sha256,
      packageLockSha256: await fileSha256(path.join(root, "package-lock.json")),
      runtime: resources.report.nativePreflight.receipt.runtime, isolation: resources.report.nativePreflight.receipt.isolation,
      limits: resources.report.nativePreflight.receipt.limits, modelInference: "denied-before-upstream" };
    report.controlAttestationSha256 = sha256(JSON.stringify(report.controlSeal));
    report.runtimeSealSha256 = report.controlAttestationSha256;
    report.qualificationScope = "integration-only; no common prospective campaign seal supplied";
    if (args["runtime-seal"]) {
      const sealPath = path.resolve(root, args["runtime-seal"]);
      if (!sealPath.startsWith(root + path.sep)) throw fail("m1-control-seal-path-denied");
      const info = await lstat(sealPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 262144) throw fail("m1-control-seal-file-invalid");
      const bytes = await readFile(sealPath), common = bindControlRuntimeSeal(JSON.parse(bytes.toString("utf8")), report.controlSeal, bytes);
      report.runtimeSealSha256 = common.runtimeSealSha256;
      report.campaignRuntimeSeal = common.campaign;
      report.qualificationScope = "prospectively bound common campaign; model-free controls only, no model-residency claim";
    }
    const evidenceDirectory = path.join(root, "acceptance-evidence"); await mkdir(evidenceDirectory, { recursive: true });
    checkpoint ??= args["browser-checkpoints"] === "true" ? createBrowserCheckpoint({ directory: evidenceDirectory,
      announce: value => process.stdout.write(JSON.stringify({ schemaVersion: "runaai-m1-browser-checkpoint-ready/v1", ...value }) + "\n") }) : null;
    await writeFile(path.join(evidenceDirectory, `control-seal-${report.controlAttestationSha256}.json`), JSON.stringify(report.controlSeal, null, 2) + "\n", { flag: "wx" });
    testbed = await createFunctionalTestbed({ resources, mode: "controls", getLedger: () => ledger });
    for (const item of selected) {
      ledger = new ObservationLedger(newObservation({ ...item, role: "control" }, { runtimeSealSha256: report.runtimeSealSha256 }));
      ledger.observation.sourceCommit = identity.sourceCommit;
      const observed = await runModelFreeControl({ host: testbed.host, item, ledger, support: { resources, testbed, checkpoint } });
      observed.grade = evaluateControl(item, observed, { runtimeSealSha256: report.runtimeSealSha256 }); report.attempts.push(observed);
      if (observed.provider.calls.length) report.modelsInvoked = true; // Attempted only; controls proxy never sends it upstream.
    }
  } catch (error) { report.errorCode = error.code ?? "m1-control-functional-failed"; report.diagnostic = error.diagnostic ?? null;
    report.resources ??= error.resourceReport ?? null; }
  finally {
    try { await testbed?.close(); await resources?.close(); } catch (error) { report.cleanupError = error.code ?? error.message; }
    report.healthDiagnostics = healthCaptureDiagnostics(testbed?.transports);
    report.finishedAt = new Date().toISOString();
    report.completedDrivers = report.attempts.filter(value => value.status === "completed").length;
    report.failedDrivers = report.attempts.filter(value => value.status === "failed").length;
    report.notImplemented = report.attempts.filter(value => value.status === "not-implemented").map(value => value.caseId);
    const output = path.join(root, "acceptance-evidence"); await mkdir(output, { recursive: true });
    const filename = `controls-${Date.now()}.json`; await writeFile(path.join(output, filename), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    report.evidenceFile = `acceptance-evidence/${filename}`;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseArguments(process.argv.slice(2)), report = await runControlFunctional(args);
    process.stdout.write(JSON.stringify(args.mode === "inventory" ? report : { schemaVersion: report.schemaVersion,
      completedDrivers: report.completedDrivers, failedDrivers: report.failedDrivers, notImplemented: report.notImplemented,
      errorCode: report.errorCode ?? null, cleanupError: report.cleanupError ?? null, evidenceFile: report.evidenceFile,
      modelsInvoked: report.modelsInvoked, productQualificationPassed: false, productionChanged: false }) + "\n");
    if (report.errorCode || report.cleanupError || report.failedDrivers) process.exitCode = 1;
  } catch (error) { process.stdout.write(JSON.stringify({ errorCode: error.code ?? "m1-runner-failed", modelsInvoked: false, productQualificationPassed: false }) + "\n"); process.exitCode = 1; }
}
