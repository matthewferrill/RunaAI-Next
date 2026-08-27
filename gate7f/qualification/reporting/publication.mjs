import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash, verifyPackage } from "../runtime.mjs";
import { verifyTransfer } from "../verify-transfer.mjs";
import { completedFunctionalPrefix } from "../export-review-prefix.mjs";
import { anonymousResponses, expectedAcceptanceIds } from "../make-review-packets.mjs";
import { summarizeCapture } from "../summarize-capture.mjs";
import { loadAcceptanceCorpus } from "../acceptance/corpus.mjs";
import { renderAcceptanceInputs } from "../acceptance/inputs.mjs";
import { verifyAcceptanceSeal } from "../acceptance/seal.mjs";
import { acceptanceSealDigest, expectedTurnIdentities } from "./judgments.mjs";
import { validateJudgmentBundleSource } from "./source-binding.mjs";
import { aggregateJudgments } from "./aggregate.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const sha = value => assert.match(value, /^[a-f0-9]{64}$/, "publication-pin-required");
const parse = bytes => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const same = (actual, expected, code) => assert.deepEqual(actual, expected, "publication-" + code);
const sorted = values => [...values].sort();

function pinned({ file, sha256 }) {
  sha(sha256);
  const bytes = readFileSync(file);
  assert.equal(hash(bytes), sha256, "publication-pinned-bytes-changed");
  return { bytes, value: parse(bytes), sha256 };
}

function transfer(input) {
  const manifest = pinned(input.manifest);
  const verification = verifyTransfer(input.root, manifest.value, input.expectedFiles);
  assert.ok(Number.isFinite(Date.parse(manifest.value.time)), "publication-transfer-clock");
  return { ...manifest, verification };
}

function frozenAcceptance(repositoryRoot, runSeal) {
  const verified = verifyAcceptanceSeal(repositoryRoot);
  assert.equal(verified.passed, true, "publication-frozen-acceptance-drift");
  assert.equal(verified.sealSha256, runSeal.acceptanceSealSha256, "publication-run-acceptance-seal");
  assert.equal(verified.sealSha256, acceptanceSealDigest(), "publication-loaded-acceptance-seal");
  // A supplied byte-exact repository root may solve checkout line-ending differences, but it must
  // not conceal changes to the frozen modules actually imported by this reporting process.
  const seal = parse(readFileSync(path.join(repositoryRoot, "gate7f/qualification/acceptance/SEAL.json")));
  for (const entry of seal.files.filter(item => item.path.endsWith(".mjs"))) {
    assert.equal(hash(readFileSync(path.join(repo, entry.path))), entry.sha256, "publication-loaded-frozen-module-drift");
  }
  return verified;
}

function acceptanceRows(functionalBytes, reviewExportTime) {
  const rows = functionalBytes.toString("utf8").split(/\r?\n/).filter(line => line.trim()).map(JSON.parse);
  const completedAt = Date.parse(rows.at(-1)?.time);
  assert.ok(Number.isFinite(completedAt) && Date.parse(reviewExportTime) >= completedAt,
    "publication-review-export-clock");
  const markers = rows.filter(row => row.type === "acceptance-complete");
  assert.equal(markers.length, 1, "publication-acceptance-marker-count");
  assert.equal(markers[0].requests, 117, "publication-acceptance-marker-requests");
  return rows.slice(0, rows.indexOf(markers[0]) + 1);
}

/**
 * Offline, read-only final publication composition. `mapping` is the root's private explicit
 * {"blind-candidate-a":"incumbent", "blind-candidate-b":"gemma26"} (or reversed) mapping;
 * it is never derived from prose and only its digest is returned. Every file pin must be retained
 * independently before this call, not freshly generated from whichever file happens to be present.
 *
 * runSeal/packet/judgments/manifest are {file,sha256}. Each transfer is
 * {root,manifest,expectedFiles}; reviewTransfer contains the two raw functional-prefix files.
 * Each arm is {armId,transfer,packet,judgments}. Capture/prefix names are derived from the private
 * candidate mapping. Final captures must be immutable while verified. No summary boolean, grading
 * callback, replacement output, or model invocation can be supplied.
 */
export async function verifyFinalPublication({ packageDir, runSeal: sealInput, repositoryRoot = repo,
  reviewTransfer, mapping, arms }) {
  const seal = pinned(sealInput);
  assert.equal(seal.value.schemaVersion, "runa2-qualification-run-seal/v1", "publication-run-seal-schema");
  const acceptanceSeal = frozenAcceptance(repositoryRoot, seal.value);
  const packageVerification = await verifyPackage(path.resolve(packageDir, "qualification"));
  assert.equal(packageVerification.sha256, seal.value.packageManifestSha256, "publication-package-pin");
  const bundleBytes = readFileSync(path.join(packageDir, "qualification/bundle.json"));
  assert.equal(hash(bundleBytes), seal.value.bundleSha256, "publication-bundle-pin");
  const bundle = parse(bundleBytes), corpus = loadAcceptanceCorpus();
  same(bundle.inputs, renderAcceptanceInputs(corpus), "frozen-inputs-mismatch");
  same(bundle.candidates, seal.value.candidates, "candidate-pins-mismatch");
  same(bundle.policies, seal.value.policies, "policy-pins-mismatch");
  assert.equal(bundle.source.commit, seal.value.sourceCommit, "publication-source-commit");
  const expectedIds = expectedAcceptanceIds(bundle), expectedIdentities = expectedTurnIdentities(corpus);
  const armIds = ["blind-candidate-a", "blind-candidate-b"], candidates = Object.keys(bundle.candidates);
  same(Object.keys(mapping).sort(), armIds, "mapping-arms");
  assert.equal(candidates.length, 2, "publication-two-candidates-required");
  same(sorted(Object.values(mapping)), sorted(candidates), "mapping-candidates");
  assert.ok(Array.isArray(arms) && arms.length === 2, "publication-two-arms-required");
  same(sorted(arms.map(arm => arm.armId)), armIds, "arm-set");
  const review = transfer(reviewTransfer);
  const prefixFiles = candidates.map(candidate => candidate + "-prefix.jsonl");
  same(sorted(reviewTransfer.expectedFiles), sorted(prefixFiles), "review-prefix-files");
  assert.equal(review.value.reviewSnapshotNotFinalCapture, true, "publication-review-snapshot-kind");
  assert.ok(Array.isArray(review.value.sourceSnapshots), "publication-review-source-snapshots");
  same(sorted(review.value.sourceSnapshots.map(row => row.file)), sorted(prefixFiles), "review-source-snapshot-files");
  for (const row of review.value.sourceSnapshots) sha(row.sourceSnapshotSha256);

  const results = [];
  for (const arm of [...arms].sort((a, b) => a.armId.localeCompare(b.armId))) {
    const candidate = mapping[arm.armId], finalTransfer = transfer(arm.transfer);
    const relativeDir = "qualification/capture-" + candidate;
    const eventName = relativeDir + "/events.jsonl", resultName = relativeDir + "/result.json";
    for (const name of [eventName, resultName]) assert.ok(arm.transfer.expectedFiles.includes(name), "publication-capture-files-required");
    const captureDir = path.resolve(arm.transfer.root, relativeDir);
    const eventBytes = readFileSync(path.join(captureDir, "events.jsonl"));
    const resultBytes = readFileSync(path.join(captureDir, "result.json"));
    assert.equal(hash(eventBytes), finalTransfer.value.files[eventName].sha256, "publication-events-transfer-binding");
    assert.equal(hash(resultBytes), finalTransfer.value.files[resultName].sha256, "publication-result-transfer-binding");
    const summary = summarizeCapture({ packageDir, captureDir, sealFile: sealInput.file });
    assert.equal(summary.candidate, candidate, "publication-capture-candidate");
    same(summary.captureHashes, { events: hash(eventBytes), result: hash(resultBytes) }, "summary-capture-binding");
    assert.ok(Date.parse(finalTransfer.value.time) >= Date.parse(summary.endedAt), "publication-final-export-clock");

    const prefixName = candidate + "-prefix.jsonl", prefixBytes = readFileSync(path.join(reviewTransfer.root, prefixName));
    assert.equal(hash(prefixBytes), review.value.files[prefixName].sha256, "publication-prefix-transfer-binding");
    same(completedFunctionalPrefix(eventBytes), prefixBytes, "functional-prefix-replaced");
    same(completedFunctionalPrefix(prefixBytes), prefixBytes, "prefix-has-extra-bytes");
    const prefixRows = acceptanceRows(prefixBytes, review.value.time);
    const packet = pinned(arm.packet), judgments = pinned(arm.judgments);
    assert.equal(packet.value.candidateLabel, arm.armId === "blind-candidate-a" ? "Candidate-A" : "Candidate-B", "publication-packet-arm");
    assert.equal(packet.value.acceptancePrefixSha256, hash(JSON.stringify(prefixRows)), "publication-packet-acceptance-prefix");
    assert.equal(packet.value.suppliedBundleSha256, hash(bundleBytes), "publication-packet-bundle");
    same(packet.value.responses, anonymousResponses(prefixRows, { expectedIds }), "packet-responses-replaced");
    const source = validateJudgmentBundleSource({ bundle: judgments.value, packetBytes: packet.bytes,
      expectedPacketSha256: arm.packet.sha256, expectedIdentities, expectedArmId: arm.armId });
    const aggregate = aggregateJudgments(judgments.value, corpus);
    // Deliberately no semantic rejudging, repair or outcome overrides between source validation and aggregation.
    results.push({ armId: arm.armId, homeExportManifestSha256: finalTransfer.sha256,
      captureHashes: summary.captureHashes, verifiedSummarySha256: hash(jsonBytes(summary)),
      functionalPrefixSha256: hash(prefixBytes), acceptancePrefixSha256: packet.value.acceptancePrefixSha256,
      packetSha256: packet.sha256, judgmentBundleSha256: judgments.sha256,
      sourceBindingSha256: hash(jsonBytes(source)), aggregateSha256: hash(jsonBytes(aggregate)), aggregate });
  }
  // A concurrent rewrite of a pinned manifest or package is not a legitimate publication input.
  pinned(sealInput);
  assert.equal((await verifyPackage(path.resolve(packageDir, "qualification"))).sha256, packageVerification.sha256, "publication-package-changed-during-verification");
  transfer(reviewTransfer);
  for (const arm of arms) { transfer(arm.transfer); pinned(arm.packet); pinned(arm.judgments); }
  return { schemaVersion: "runa2-qualification-publication-verification/v1", passed: true,
    runSealSha256: seal.sha256, packageManifestSha256: packageVerification.sha256,
    suppliedBundleSha256: hash(bundleBytes), acceptanceSealSha256: acceptanceSeal.sealSha256,
    homeReviewManifestSha256: review.sha256, privateMappingSha256: hash(jsonBytes(mapping)),
    arms: results, semanticJudgmentsAutomaticallyInferred: false, hardwareAttestation: false,
    limitation: "Source-bound aggregation of independent judgments; not a new model evaluation, cryptographic host attestation, or production qualification." };
}
