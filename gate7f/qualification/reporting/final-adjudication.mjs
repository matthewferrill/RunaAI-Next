import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAcceptanceCorpus } from "../acceptance/corpus.mjs";
import { expectedTurnIdentities, turnKey, validateJudgmentBundle } from "./judgments.mjs";
import { validateJudgmentBundleSource } from "./source-binding.mjs";
import { aggregateJudgments } from "./aggregate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = value => JSON.stringify(value, null, 2) + "\n";
const adjudicationPin = "ab7ac9865c410bfb167cc2e3414984755cf624f59a65016907d36d356cb7e997";
const pins = {
  "Candidate-A": { packet: "4be726089b5022c776dc1f7acad2206d8639f6107f0d18ea05eaf22c0ab2336a", initial: "2f78afdc750ff942b35a95493814c31208729894458e33158ef1091bda296913" },
  "Candidate-B": { packet: "54b072675c118e2739d703fc159d6b3e9889308b0427fc02f767032fd1f11847", initial: "c5517d3e7baeb2bad71485a8118efee1dca70c6a2929d35c41f679d24bd95a25" },
};
const readPinned = (file, expected) => { const bytes = readFileSync(file); assert.equal(hash(bytes), expected, "adjudication-source-pin"); return bytes; };

// Mechanically apply the separately retained reviewer decisions. This function does not judge prose.
export function applyReviewedSemantics(initial, adjudications) {
  const relevant = adjudications.filter(item => item.armId === initial.armId);
  assert.equal(relevant.length, initial.records.length, "adjudication-turn-count");
  const indexed = new Map(relevant.map(item => [turnKey(item), item]));
  assert.equal(indexed.size, relevant.length, "adjudication-duplicate-turn");
  const bundle = structuredClone(initial);
  bundle.records = initial.records.map(record => {
    const reviewed = indexed.get(turnKey(record)); assert.ok(reviewed, "adjudication-missing-turn");
    assert.equal(reviewed.candidateLabel.toLowerCase(), initial.armId.replace(/^blind-/, ""), "adjudication-arm-label");
    assert.deepEqual(reviewed.initialJudgment, record, "adjudication-prior-record-changed");
    assert.deepEqual(reviewed.initialSemantic, record.semantic, "adjudication-prior-semantic-changed");
    assert.equal(reviewed.outcomeChanged, record.semantic.outcome !== reviewed.finalSemantic.outcome, "adjudication-change-flag");
    assert.ok(typeof reviewed.reviewRationale === "string" && reviewed.reviewRationale.trim(), "adjudication-reason-required");
    const final = { ...structuredClone(record), semantic: structuredClone(reviewed.finalSemantic) };
    if (reviewed.protocolSemanticDifference !== null && reviewed.protocolSemanticDifference !== undefined)
      final.protocolSemanticDifference = reviewed.protocolSemanticDifference;
    return final;
  });
  return bundle;
}

export function buildFinalAdjudications() {
  const reportBytes = readPinned(path.join(root, "gate7f/qualification/results/BLIND-ADJUDICATION.json"), adjudicationPin);
  const report = JSON.parse(reportBytes), corpus = loadAcceptanceCorpus();
  assert.equal(report.adjudications.length, 234, "adjudication-full-two-arm-count");
  const expectedArms = Object.keys(pins).map(label => "blind-" + label.toLowerCase()).sort();
  assert.deepEqual([...new Set(report.adjudications.map(item => item.armId))].sort(), expectedArms);
  return Object.entries(pins).map(([label, pin]) => {
    const initialBytes = readPinned(path.join(root, "gate7f/qualification/initial-judgments", label + "-initial-judgments.json"), pin.initial);
    const packetBytes = readPinned(path.join(root, "gate7f/qualification/results", label + ".json"), pin.packet);
    const initial = JSON.parse(initialBytes), bundle = applyReviewedSemantics(initial, report.adjudications);
    bundle.evaluator = { ...initial.evaluator, id: "independent-evaluation-with-independent-adjudication", adjudicatorId: report.reviewerId };
    bundle.adjudication = { reportSha256: adjudicationPin, initialBundleSha256: pin.initial,
      changedSemanticTurns: bundle.records.filter((record, index) => record.semantic.outcome !== initial.records[index].semantic.outcome).length,
      modelResponsesChanged: false, frozenProtocolFindingsChanged: false };
    validateJudgmentBundle(bundle, corpus);
    const sourceVerification = validateJudgmentBundleSource({ bundle, packetBytes, expectedPacketSha256: pin.packet,
      expectedIdentities: expectedTurnIdentities(corpus), expectedArmId: initial.armId });
    const aggregate = aggregateJudgments(bundle, corpus);
    return { label, bundle, aggregate, sourceVerification,
      judgmentSha256: hash(encode(bundle)), aggregateSha256: hash(encode(aggregate)) };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = buildFinalAdjudications();
  if (process.argv.includes("--write")) {
    const files = results.flatMap(result => [
      [result.label + "-final-judgments.json", result.bundle], [result.label + "-final-aggregate.json", result.aggregate],
    ]).map(([name, value]) => [path.join(root, "gate7f/qualification/results", name), encode(value)]);
    for (const [file] of files) assert.ok(!existsSync(file), "adjudication-final-output-already-exists");
    for (const [file, value] of files) writeFileSync(file, value, { flag: "wx" });
  }
  console.log(JSON.stringify(results.map(result => ({ label: result.label, judgmentSha256: result.judgmentSha256,
    aggregateSha256: result.aggregateSha256, counts: result.aggregate.counts,
    pendingSemanticTurns: result.aggregate.semanticTurnCounts["review-required"], sourceVerified: result.sourceVerification.passed }))));
}
