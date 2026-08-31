import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, sha256 } from "../../../gate4/canonical.mjs";
import { MODEL_CASES, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { validateRuntimeSeal } from "./runner-contract.mjs";
import { createR13RuntimeSeal, R13_SEAL_AUTHORITIES } from "./r13-runtime-seal.mjs";
import { CAMPAIGN_V2_EXTENDED_POLICY } from "../readiness/lease-v2-contract.mjs";
import { readGitArchiveCommit } from "./source-archive.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((result, value, index, all) => {
  if (index % 2 === 0) result.push([value, all[index + 1]]); return result;
}, []));
assert.deepEqual(Object.keys(args).sort(), ["--output-dir", "--prior-seal", "--prior-seal-sha256",
  "--prior-telemetry", "--source-archive"].sort());
assert.match(args["--prior-seal-sha256"], /^[a-f0-9]{64}$/u);
const outputDirectory = await realpath(path.resolve(args["--output-dir"]));
assert((await stat(outputDirectory)).isDirectory());
const sourceArchivePath = await realpath(path.resolve(args["--source-archive"]));
const priorPath = await realpath(path.resolve(args["--prior-seal"]));
const priorTelemetryPath = await realpath(path.resolve(args["--prior-telemetry"]));
const packageLockPath = await realpath(path.join(root, "package-lock.json"));
const criteriaPath = await realpath(R13_SEAL_AUTHORITIES.criteriaPath);
const readinessPath = await realpath(path.join(root,
  "gate7f/function-first/readiness/evidence/20260828-functional-prerequisites.json"));
const [sourceArchiveBytes, priorBytes, priorTelemetryBytes, packageLockBytes, criteriaBytes, readinessBytes] = await Promise.all([
  readFile(sourceArchivePath), readFile(priorPath), readFile(priorTelemetryPath), readFile(packageLockPath),
  readFile(criteriaPath), readFile(readinessPath),
]);
assert.equal(sha256(priorBytes), args["--prior-seal-sha256"]);
const prior = validateRuntimeSeal(JSON.parse(priorBytes));
assert.equal(prior.schemaVersion, "runaai-m1-functional-runtime-seal/v8");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
assert.equal(readGitArchiveCommit({ archiveBytes: sourceArchiveBytes, cwd: root }), sourceCommit,
  "source archive is not the exact committed source");
const telemetry = JSON.parse(priorTelemetryBytes);
telemetry.createdAt = new Date().toISOString();
telemetry.sourceCommit = sourceCommit;
telemetry.classification = R13_SEAL_AUTHORITIES.telemetryClassification;
telemetry.inferenceOwnership = "root-functional-driver-and-browser-only";
telemetry.leaseOwnership = "root";
const telemetryBytes = Buffer.from(`${JSON.stringify(telemetry, null, 2)}\n`);
const telemetryPath = path.join(outputDirectory, "campaign-hardware-plan.json");
await writeFile(telemetryPath, telemetryBytes, { flag: "wx" });
const suites = Object.fromEntries(MODEL_CASES.flatMap(item => (item.setup.suites ?? [])
  .map(suite => [suite.suiteId, sha256(canonicalJson(suite))])));
const normalize = bytes => Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));
const seal = { ...structuredClone(prior), schemaVersion: "runaai-m1-functional-runtime-seal/v9", sourceCommit,
  caseBundleSha256: CASE_BUNDLE_SHA256, maximumBatchMs: CAMPAIGN_V2_EXTENDED_POLICY.maximumBatchMs,
  runtime: { ...structuredClone(prior.runtime), sourceArchiveSha256: sha256(sourceArchiveBytes),
    packageLockSha256: sha256(packageLockBytes) },
  residency: { ...structuredClone(prior.residency), readinessEvidenceSha256: sha256(readinessBytes),
    effectiveReasoningEvidenceSha256: sha256(readinessBytes), telemetryPolicySha256: sha256(telemetryBytes) },
  suites, evaluatorId: "codex-r13-sealed-functional-evaluation-20260831",
  qualificationCriteria: { schemaVersion: "runaai-m1-r13-qualification-criteria/v1",
    path: R13_SEAL_AUTHORITIES.criteriaRelativePath, sha256: sha256(criteriaBytes),
    normalizedSha256: sha256(normalize(criteriaBytes)), rubricVersion: R13_SEAL_AUTHORITIES.rubricVersion } };
const manifest = { schemaVersion: "runaai-m1-r13-runtime-seal-input/v1",
  campaignId: R13_SEAL_AUTHORITIES.campaignId, seal,
  files: { sourceArchivePath, packageLockPath, criteriaPath, readinessPath,
    effectiveReasoningPath: readinessPath, telemetryPath },
  declaration: { createdBeforeInference: true, sourceArchiveCreatedBeforeInference: true, observedR13Attempts: 0,
    importedAttemptCount: 0, selectiveReplacement: false, expectedAnswerTuning: false, partialRoster: false,
    inheritedRuntimeSealSha256: null, productionRoutingChanged: false, protectedDataIncluded: false },
  privateValuesIncluded: false };
const inputPath = path.join(outputDirectory, "runtime-seal-input.json");
const sealPath = path.join(outputDirectory, "runtime-seal.json");
await writeFile(inputPath, `${canonicalJson(manifest)}\n`, { flag: "wx" });
const published = await createR13RuntimeSeal({ manifestPath: inputPath, outputPath: sealPath });
const identity = { schemaVersion: "runaai-m1-source-identity/v1", sourceCommit,
  sourceArchiveSha256: seal.runtime.sourceArchiveSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
  qdrantSha256: seal.runtime.qdrantSha256, productionChanged: false };
await writeFile(path.join(outputDirectory, "SOURCE-IDENTITY.json"), `${JSON.stringify(identity, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ schemaVersion: "runaai-m1-r13-common-build/v1", sourceCommit,
  sourceArchiveSha256: identity.sourceArchiveSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
  runtimeSealSha256: published.runtimeSealSha256, telemetrySha256: sha256(telemetryBytes),
  productionChanged: false, protectedDataIncluded: false, privateValuesIncluded: false }));
