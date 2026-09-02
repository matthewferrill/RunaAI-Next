import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { CASE_BUNDLE_SHA256, MODEL_CASES } from "../gate7f/function-first/acceptance/cases.mjs";
import { normalizedRuntimeSealBytes } from "../gate7f/function-first/acceptance/r7-runtime-seal.mjs";
import { validateRuntimeSeal } from "../gate7f/function-first/acceptance/runner-contract.mjs";
import { assertCanonicalGitArchive, extractVerifiedArchiveBytes,
  readGitArchiveCommit } from "../gate7f/function-first/acceptance/source-archive.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (index % 2 === 0) pairs.push([value, values[index + 1]]);
  return pairs;
}, []));
assert.deepEqual(Object.keys(args).sort(), ["--output-dir", "--prior-seal", "--prior-seal-sha256",
  "--source-archive"].sort());
assert.match(args["--prior-seal-sha256"], /^[a-f0-9]{64}$/u);

const outputDirectory = await realpath(path.resolve(args["--output-dir"]));
assert((await stat(outputDirectory)).isDirectory());
const sourceArchivePath = await realpath(path.resolve(args["--source-archive"]));
const priorSealPath = await realpath(path.resolve(args["--prior-seal"]));
const packageLockPath = await realpath(path.join(root, "package-lock.json"));
const criteriaRelativePath = "gate7f/function-first/M1-S2-R15-AGENT-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md";
const criteriaPath = await realpath(path.join(root, criteriaRelativePath));
const readinessPath = await realpath(path.join(root,
  "gate7f/function-first/readiness/evidence/20260828-functional-prerequisites.json"));
const [sourceArchiveBytes, priorSealBytes, packageLockBytes, criteriaBytes, readinessBytes]
  = await Promise.all([readFile(sourceArchivePath), readFile(priorSealPath),
    readFile(packageLockPath), readFile(criteriaPath), readFile(readinessPath)]);
assert.equal(sha256(priorSealBytes), args["--prior-seal-sha256"]);

const prior = validateRuntimeSeal(JSON.parse(priorSealBytes));
assert.equal(prior.schemaVersion, "runaai-m1-functional-runtime-seal/v11");
assert.equal(prior.sourceCommit, "8830702386b6a904a42fe097ec1b02615bf30249");
assert.equal(prior.caseBundleSha256, CASE_BUNDLE_SHA256);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
assert.equal(readGitArchiveCommit({ archiveBytes: sourceArchiveBytes, cwd: root }), sourceCommit);
assertCanonicalGitArchive({ archiveBytes: sourceArchiveBytes, commit: sourceCommit, cwd: root });

const telemetryPath = path.join(outputDirectory, "campaign-hardware-plan.json");
const extractedRoot = await mkdtemp(path.join(tmpdir(), "runa-r15-source-"));
let telemetryBytes, telemetry;
try {
  extractVerifiedArchiveBytes({ archiveBytes: sourceArchiveBytes, target: extractedRoot });
  const hardwareBuilderPath = await realpath(path.join(extractedRoot,
    "gate7f/function-first/readiness/build-campaign-hardware-v2.mjs"));
  execFileSync(process.execPath, [hardwareBuilderPath, telemetryPath,
    "prospective-r15-hardware-only-not-functional-qualification", sourceCommit], {
    cwd: extractedRoot, stdio: "pipe",
  });
  telemetryBytes = await readFile(telemetryPath); telemetry = JSON.parse(telemetryBytes);
  for (const [name, expected] of Object.entries(telemetry.sourceFiles)) {
    const filename = name === "gguf-metadata.mjs"
      ? path.join(extractedRoot, "gate7f/evaluation/home", name)
      : path.join(extractedRoot, "gate7f/function-first/readiness", name);
    assert.equal(sha256(await readFile(filename)), expected, name);
  }
  for (const [name, expected] of Object.entries(telemetry.operatorFiles)) {
    assert.equal(sha256(await readFile(path.join(extractedRoot,
      "gate7f/function-first/readiness", name))), expected, name);
  }
} finally {
  await rm(extractedRoot, { recursive: true, force: true });
}
assert.equal(telemetry.sourceCommit, sourceCommit);
assert.equal(telemetry.classification, "prospective-r15-hardware-only-not-functional-qualification");
assert.equal(telemetry.createdBeforeLoads, true);
assert.equal(telemetry.inferenceOwnership, "root-functional-driver-and-browser-only");
assert.equal(telemetry.productionRoutingChanged, false);
assert.equal(telemetry.protectedDataIncluded, false);

const suites = Object.fromEntries(MODEL_CASES.flatMap(item => (item.setup.suites ?? [])
  .map(suite => [suite.suiteId, sha256(canonicalJson(suite))])));
const seal = validateRuntimeSeal({ ...structuredClone(prior), schemaVersion: "runaai-m1-functional-runtime-seal/v11",
  sourceCommit, caseBundleSha256: CASE_BUNDLE_SHA256,
  runtime: { ...structuredClone(prior.runtime), sourceArchiveSha256: sha256(sourceArchiveBytes),
    packageLockSha256: sha256(packageLockBytes) },
  residency: { ...structuredClone(prior.residency), readinessEvidenceSha256: sha256(readinessBytes),
    effectiveReasoningEvidenceSha256: sha256(readinessBytes), telemetryPolicySha256: sha256(telemetryBytes) },
  suites, evaluatorId: "codex-r15-sealed-functional-evaluation-20260901",
  qualificationCriteria: { schemaVersion: "runaai-m1-r15-qualification-criteria/v1",
    path: criteriaRelativePath, sha256: sha256(criteriaBytes),
    normalizedSha256: sha256(normalizedRuntimeSealBytes(criteriaBytes)),
    rubricVersion: "2026-09-01.r15-agent-review-correction" },
  productionRoutingChanged: false });
assert.equal(seal.roles.review.maximumOutputTokens, 1024);
assert.equal(seal.roles.agent.maximumOutputTokens, 1536);

const manifest = { schemaVersion: "runaai-m1-r15-runtime-seal-input/v1",
  campaignId: "m1-r15-agent-review-correction", seal,
  files: { sourceArchivePath, packageLockPath, criteriaPath, readinessPath,
    effectiveReasoningPath: readinessPath, telemetryPath },
  declaration: { createdBeforeInference: true, sourceArchiveCreatedBeforeInference: true,
    observedR15Attempts: 0, importedAttemptCount: 0, selectiveReplacement: false,
    expectedAnswerTuning: false, partialRoster: false, inheritedRuntimeSealSha256: null,
    productionRoutingChanged: false, protectedDataIncluded: false },
  privateValuesIncluded: false };
const sealBytes = Buffer.from(`${canonicalJson(seal)}\n`);
await writeFile(path.join(outputDirectory, "runtime-seal-input.json"), `${canonicalJson(manifest)}\n`, { flag: "wx" });
await writeFile(path.join(outputDirectory, "runtime-seal.json"), sealBytes, { flag: "wx" });
const identity = { schemaVersion: "runaai-m1-source-identity/v1", sourceCommit,
  sourceArchiveSha256: seal.runtime.sourceArchiveSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
  qdrantSha256: seal.runtime.qdrantSha256, productionChanged: false };
await writeFile(path.join(outputDirectory, "SOURCE-IDENTITY.json"), `${JSON.stringify(identity, null, 2)}\n`, { flag: "wx" });

const priorControl = JSON.parse(await readFile(path.join(import.meta.dirname,
  "m1-readiness/20260831-campaign-r13-common-v1/CONTROL-REGRESSION-INPUT.json")));
const archiveEntries = execFileSync("tar", ["-tf", "-"], {
  input: sourceArchiveBytes, encoding: "utf8", maxBuffer: 8_000_000,
})
  .split(/\r?\n/u).filter(entry => entry && !entry.endsWith("/")).length;
const control = { ...structuredClone(priorControl), runId: randomUUID().replaceAll("-", ""),
  source: { ...structuredClone(priorControl.source), commit: sourceCommit,
    archiveSha256: seal.runtime.sourceArchiveSha256, packageLockSha256: seal.runtime.packageLockSha256,
    extractedFiles: archiveEntries, caseBundleSha256: CASE_BUNDLE_SHA256 } };
await writeFile(path.join(outputDirectory, "CONTROL-REGRESSION-INPUT.json"),
  `${JSON.stringify(control, null, 2)}\n`, { flag: "wx" });

console.log(JSON.stringify({ schemaVersion: "runaai-m1-r15-common-build/v1", sourceCommit,
  sourceArchiveSha256: seal.runtime.sourceArchiveSha256, runtimeSealSha256: sha256(sealBytes),
  criteriaSha256: seal.qualificationCriteria.sha256, telemetrySha256: sha256(telemetryBytes),
  extractedFiles: archiveEntries, productionChanged: false, protectedDataIncluded: false,
  privateValuesIncluded: false }));
