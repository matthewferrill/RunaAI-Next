import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { CASE_BUNDLE_SHA256, MODEL_CASES } from "../gate7f/function-first/acceptance/cases.mjs";
import { normalizedRuntimeSealBytes } from "../gate7f/function-first/acceptance/r7-runtime-seal.mjs";
import { validateRuntimeSeal } from "../gate7f/function-first/acceptance/runner-contract.mjs";
import { readGitArchiveCommit } from "../gate7f/function-first/acceptance/source-archive.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (index % 2 === 0) pairs.push([value, values[index + 1]]);
  return pairs;
}, []));
assert.deepEqual(Object.keys(args).sort(), ["--output-dir", "--prior-seal", "--prior-telemetry", "--source-archive"].sort());

const outputDirectory = await realpath(path.resolve(args["--output-dir"]));
assert((await stat(outputDirectory)).isDirectory());
const sourceArchivePath = await realpath(path.resolve(args["--source-archive"]));
const priorSealPath = await realpath(path.resolve(args["--prior-seal"]));
const priorTelemetryPath = await realpath(path.resolve(args["--prior-telemetry"]));
const packageLockPath = await realpath(path.join(root, "package-lock.json"));
const criteriaRelativePath = "gate7f/function-first/M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md";
const criteriaPath = await realpath(path.join(root, criteriaRelativePath));
const readinessPath = await realpath(path.join(root,
  "gate7f/function-first/readiness/evidence/20260828-functional-prerequisites.json"));
const [sourceArchiveBytes, priorSealBytes, priorTelemetryBytes, packageLockBytes, criteriaBytes, readinessBytes]
  = await Promise.all([readFile(sourceArchivePath), readFile(priorSealPath), readFile(priorTelemetryPath),
    readFile(packageLockPath), readFile(criteriaPath), readFile(readinessPath)]);

const prior = validateRuntimeSeal(JSON.parse(priorSealBytes));
assert.equal(prior.schemaVersion, "runaai-m1-functional-runtime-seal/v9");
assert.equal(prior.sourceCommit, "d0b8f23db1bcc149764e19936559a8a9df468205");
assert.equal(prior.caseBundleSha256, CASE_BUNDLE_SHA256);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
assert.equal(readGitArchiveCommit({ archiveBytes: sourceArchiveBytes, cwd: root }), sourceCommit);

const telemetry = JSON.parse(priorTelemetryBytes);
telemetry.createdAt = new Date().toISOString();
telemetry.sourceCommit = sourceCommit;
telemetry.classification = "prospective-r14-hardware-only-not-functional-qualification";
telemetry.inferenceOwnership = "root-functional-driver-and-browser-only";
telemetry.leaseOwnership = "root";
const telemetryBytes = Buffer.from(`${JSON.stringify(telemetry, null, 2)}\n`);
const telemetryPath = path.join(outputDirectory, "campaign-hardware-plan.json");
await writeFile(telemetryPath, telemetryBytes, { flag: "wx" });

const suites = Object.fromEntries(MODEL_CASES.flatMap(item => (item.setup.suites ?? [])
  .map(suite => [suite.suiteId, sha256(canonicalJson(suite))])));
const seal = validateRuntimeSeal({ ...structuredClone(prior), schemaVersion: "runaai-m1-functional-runtime-seal/v10",
  sourceCommit, caseBundleSha256: CASE_BUNDLE_SHA256,
  runtime: { ...structuredClone(prior.runtime), sourceArchiveSha256: sha256(sourceArchiveBytes),
    packageLockSha256: sha256(packageLockBytes) },
  residency: { ...structuredClone(prior.residency), readinessEvidenceSha256: sha256(readinessBytes),
    effectiveReasoningEvidenceSha256: sha256(readinessBytes), telemetryPolicySha256: sha256(telemetryBytes) },
  suites, evaluatorId: "codex-r14-sealed-functional-evaluation-20260901",
  qualificationCriteria: { schemaVersion: "runaai-m1-r14-qualification-criteria/v1",
    path: criteriaRelativePath, sha256: sha256(criteriaBytes),
    normalizedSha256: sha256(normalizedRuntimeSealBytes(criteriaBytes)),
    rubricVersion: "2026-09-01.r14-review-stated-control" },
  productionRoutingChanged: false });
assert.equal(seal.roles.review.maximumOutputTokens, 1024);

const manifest = { schemaVersion: "runaai-m1-r14-runtime-seal-input/v1",
  campaignId: "m1-r14-review-stated-control-correction", seal,
  files: { sourceArchivePath, packageLockPath, criteriaPath, readinessPath,
    effectiveReasoningPath: readinessPath, telemetryPath },
  declaration: { createdBeforeInference: true, sourceArchiveCreatedBeforeInference: true,
    observedR14Attempts: 0, importedAttemptCount: 0, selectiveReplacement: false,
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
const archiveEntries = execFileSync("tar", ["-tf", sourceArchivePath], { encoding: "utf8", maxBuffer: 8_000_000 })
  .split(/\r?\n/u).filter(entry => entry && !entry.endsWith("/")).length;
const control = { ...structuredClone(priorControl), runId: randomUUID().replaceAll("-", ""),
  source: { ...structuredClone(priorControl.source), commit: sourceCommit,
    archiveSha256: seal.runtime.sourceArchiveSha256, packageLockSha256: seal.runtime.packageLockSha256,
    extractedFiles: archiveEntries, caseBundleSha256: CASE_BUNDLE_SHA256 } };
await writeFile(path.join(outputDirectory, "CONTROL-REGRESSION-INPUT.json"),
  `${JSON.stringify(control, null, 2)}\n`, { flag: "wx" });

console.log(JSON.stringify({ schemaVersion: "runaai-m1-r14-common-build/v1", sourceCommit,
  sourceArchiveSha256: seal.runtime.sourceArchiveSha256, runtimeSealSha256: sha256(sealBytes),
  criteriaSha256: seal.qualificationCriteria.sha256, telemetrySha256: sha256(telemetryBytes),
  extractedFiles: archiveEntries, productionChanged: false, protectedDataIncluded: false,
  privateValuesIncluded: false }));
