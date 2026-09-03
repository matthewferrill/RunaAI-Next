import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { WindowsNativeBridge } from "./native-bridge.mjs";
import { loadOmenReleasePins } from "./release-pins.mjs";
import { startRepositoryWitness, startUiWitness } from "./windows-witness.mjs";

const coded = code => Object.assign(new Error(code), { code });
async function bounded(promise, milliseconds, code) {
  let timer;
  return Promise.race([promise, new Promise((_done, fail) => {
    timer = setTimeout(() => fail(coded(code)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

async function identity(bridge, path) {
  const inspected = await bridge.inspectRoot(path);
  return { path: inspected.finalPath, gitFinalPath: join(inspected.finalPath, ".git"),
    volumeId: inspected.volumeId, fileId: inspected.fileId };
}

function trackWitness(active, witness) {
  const record = { witness, exited: false, exitCode: null };
  witness.exit.then(exitCode => { record.exited = true; record.exitCode = exitCode; });
  active.push(record); return witness;
}

async function cleanRepositoryWitness(pins, bridge, root, active) {
  const operationId = randomUUID();
  const witness = trackWitness(active, startRepositoryWitness({ powershellPath: pins.powershellPath,
    scriptPath: pins.repositoryWitnessPath, operationId, root: await identity(bridge, root) }));
  await bounded(witness.ready, 10_000, "witness-preflight-ready-timeout");
  witness.complete();
  const result = await bounded(witness.result, 15_000, "witness-preflight-result-timeout");
  const exitCode = await bounded(witness.exit, 3_000, "witness-preflight-exit-timeout");
  assert.equal(exitCode, 0); assert.equal(result.securityEqual, true);
  assert.deepEqual(result.counts, { name: 0, content: 0, metadata: 0,
    security: result.counts.security, errors: 0 });
  return result;
}

export async function runActualWitnessPreflight() {
  if (process.env.RUNA_ACTUAL_WITNESS_PREFLIGHT !== "1") throw coded("actual-witness-preflight-not-enabled");
  const pins = await loadOmenReleasePins();
  for (const [path, expected] of [[pins.repositoryWitnessPath, pins.repositoryWitnessSha256],
    [pins.uiWitnessPath, pins.uiWitnessSha256]]) {
    const actual = createHash("sha256").update(await readFile(path)).digest("hex");
    if (actual !== expected) throw coded("actual-witness-preflight-pin-mismatch");
  }
  const bridge = new WindowsNativeBridge({ powershellPath: resolve(pins.powershellPath),
    scriptPath: pins.nativeScriptPath, expectedScriptSha256: pins.nativeScriptSha256,
    expectedPowerShellSha256: pins.powershellSha256 });
  const parent = await mkdtemp(join(tmpdir(), "runa-omen-witness-preflight-"));
  const exactParent = resolve(parent); const checks = {}, active = [];
  try {
    const external = join(parent, "external"), cleanRoot = join(parent, "clean-root");
    await mkdir(join(cleanRoot, ".git"), { recursive: true }); await mkdir(external);
    await writeFile(join(external, "must-not-follow.txt"), "outside witness root\n");
    await symlink(external, join(cleanRoot, "external-junction"), "junction");
    const clean = await cleanRepositoryWitness(pins, bridge, cleanRoot, active);
    checks.staticJunctionNotFollowed = clean.securityEqual === true && clean.securityEntries === 3;

    const changedRoot = join(parent, "changed-root"), replaceable = join(changedRoot, "replaceable");
    await mkdir(join(changedRoot, ".git"), { recursive: true }); await mkdir(replaceable);
    await writeFile(join(replaceable, "inside.txt"), "inside\n");
    const operationId = randomUUID();
    const changed = trackWitness(active, startRepositoryWitness({ powershellPath: pins.powershellPath,
      scriptPath: pins.repositoryWitnessPath, operationId, root: await identity(bridge, changedRoot) }));
    await bounded(changed.ready, 10_000, "witness-preflight-ready-timeout");
    changed.complete();
    const held = join(changedRoot, "replaceable-held");
    await rename(replaceable, held); await symlink(external, replaceable, "junction");
    const failure = await bounded(changed.abort, 10_000, "witness-preflight-abort-timeout");
    const changedResult = await bounded(changed.result, 15_000, "witness-preflight-result-timeout");
    const changedExit = await bounded(changed.exit, 3_000, "witness-preflight-exit-timeout");
    checks.completionBoundaryReplacementDetected = failure.code === "omen-git-source-changed"
      && changedExit !== 0 && (changedResult.counts.name > 0 || changedResult.securityEqual === false);

    const ui = trackWitness(active, startUiWitness({ powershellPath: pins.powershellPath,
      scriptPath: pins.uiWitnessPath, operationId: randomUUID(), mxcImage: pins.mxcExecutorPath,
      gitImage: pins.gitPath }));
    await bounded(ui.ready, 10_000, "ui-witness-preflight-ready-timeout");
    ui.cancelBeforeBind();
    checks.uiPreBindCancellationCloses = await bounded(ui.exit, 3_000,
      "ui-witness-preflight-exit-timeout") === 0;
  } finally {
    let allTerminal = true;
    for (const record of active) {
      if (record.exited) continue;
      record.witness.terminate();
      try { await bounded(record.witness.exit, 3_000, "actual-witness-preflight-terminal-unresolved"); }
      catch { allTerminal = false; }
    }
    if (!allTerminal || active.some(record => !record.exited)) {
      throw coded("actual-witness-preflight-terminal-unresolved");
    }
    if (resolve(parent) !== exactParent || !exactParent.startsWith(resolve(tmpdir()) + sep)
        || !parent.includes("runa-omen-witness-preflight-")) throw coded("actual-witness-preflight-cleanup-invalid");
    await rm(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    checks.fixtureRemoved = !existsSync(parent);
  }
  return { schemaVersion: "runa-omen-witness-preflight/v1", passed: Object.values(checks).every(Boolean),
    checks, privateValuesIncluded: false, productionChanged: false, modelCalled: false };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runActualWitnessPreflight().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`); if (!result.passed) process.exitCode = 1;
  }, error => {
    process.stderr.write(`${JSON.stringify({ schemaVersion: "runa-omen-witness-preflight-error/v1",
      errorCode: error?.code ?? "actual-witness-preflight-failed", privateValuesIncluded: false })}\n`);
    process.exitCode = 1;
  });
}
