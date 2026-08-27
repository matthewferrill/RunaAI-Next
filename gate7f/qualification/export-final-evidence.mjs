import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const candidates = ["incumbent", "gemma26"];
export const FINAL_EXPORT_FILES = ["power-before.json", "power-applied.json", "power-result.json",
  ...candidates.flatMap(candidate => ["qualification/capture-" + candidate + "/events.jsonl",
    "qualification/capture-" + candidate + "/result.json"])];

// Export facts even for a failed arm or failed restoration; never hide an unsuccessful observation.
export function finalExportManifest(root, expectedPackageSha256, time = new Date().toISOString()) {
  root = realpathSync(root);
  assert.match(expectedPackageSha256, /^[a-f0-9]{64}$/);
  assert.equal(sha(readFileSync(path.join(root, "package-manifest.json"))), expectedPackageSha256,
    "final-export-package-pin");
  const files = {}, bytesByName = new Map();
  for (const name of FINAL_EXPORT_FILES) {
    const file = path.resolve(root, name);
    assert.ok(file.startsWith(root + path.sep) && lstatSync(file).isFile()
      && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file, "final-export-file-boundary");
    const bytes = readFileSync(file); bytesByName.set(name, bytes);
    files[name] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  const operator = JSON.parse(bytesByName.get("power-result.json"));
  assert.equal(operator.schemaVersion, "runa2-qualification-controlled-power/v1");
  assert.equal(typeof operator.powerRestored, "boolean");
  assert.ok(Array.isArray(operator.arms) && operator.arms.length === 2, "final-export-arm-count");
  assert.deepEqual(operator.arms.map(arm => arm.candidate).sort(), [...candidates].sort(), "final-export-arm-set");
  assert.ok(Number.isFinite(Date.parse(time)) && Date.parse(time) >= Date.parse(operator.time), "final-export-clock");
  const captureResults = candidates.map(candidate => {
    const result = JSON.parse(bytesByName.get("qualification/capture-" + candidate + "/result.json"));
    assert.equal(result.schemaVersion, "runa2-qualification-capture-result/v1");
    assert.equal(result.candidate, candidate); assert.equal(result.phase, "acceptance-power-v2");
    assert.equal(typeof result.passed, "boolean"); assert.equal(typeof result.cleanupVerified, "boolean");
    assert.ok(Date.parse(operator.time) >= Date.parse(result.endedAt), "final-export-result-clock");
    const arm = operator.arms.find(value => value.candidate === candidate);
    assert.deepEqual(arm.result, result, "final-export-operator-result-mismatch");
    assert.equal(arm.exitCode === 0, result.passed, "final-export-exit-mismatch");
    return { candidate, passed: result.passed, observed: result.observed, cleanupVerified: result.cleanupVerified };
  });
  return { schemaVersion: "runa2-qualification-home-export/v1", host: "RUNA-HOME", time,
    files, packageManifestSha256: expectedPackageSha256, operatorPowerRestored: operator.powerRestored,
    operatorFailure: operator.failure, captureResults, answersPrinted: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(hostname().toUpperCase(), "RUNA-HOME", "final-export-wrong-host");
  const root = "C:\\Users\\codex-audit\\AppData\\Local\\RunaQualification\\20260827-acceptance-power-v2";
  const target = path.join(root, "FINAL-HOME-EXPORT.json");
  assert.ok(!existsSync(target), "final-export-already-exists");
  const manifest = finalExportManifest(root, "d54cfb2ade6ba912328889566449b4647ac752ff8deffa221cc1f4d5040db91a");
  writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ target, manifestSha256: sha(readFileSync(target)), files: FINAL_EXPORT_FILES.length,
    operatorPowerRestored: manifest.operatorPowerRestored, captureResults: manifest.captureResults, answersPrinted: false }));
}
