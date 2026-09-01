import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CASE_BUNDLE_SHA256 } from "../../gate7f/function-first/acceptance/cases.mjs";
import {
  CANDIDATE_BLIND_ORDER_VERSION,
  candidateBlindAttemptOrder,
  semanticChecksForCase,
} from "../../gate7f/function-first/acceptance/independent-semantic-review.mjs";

const runtimeSealSha256 = "abf15d75fd33df9f4f7b9966e450075d93b6cd18dd275c89afabece76f3bca87";
const sourceCommit = "d0b8f23db1bcc149764e19936559a8a9df468205";
const packetRoot = path.resolve("artifacts/m1-readiness/20260901-r13-valid-campaigns");
const outputRoot = path.resolve("artifacts/independent-semantic-r13");
const expectedResultHashes = Object.freeze({
  "gemma4-26b-a4b": "9ff72556d987e564ccf773f97743d30ed3dec957e1528ca9ded7094e7467e3fd",
  "qwen3-coder-30b-a3b": "72acf8b01c9c56a9fcaa62dfb9e0400e75d0122afd32532819141fd8f799bebb",
  "qwen36-27b-mtp": "16dcad14af943bf6a3d4580696c6da3bc7b5b244b59084a59ddd51b3d50f1940",
});
const sha256 = value => createHash("sha256").update(value).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
const jsonSha256 = value => sha256(Buffer.from(JSON.stringify(value), "utf8"));

const outputText = call => {
  const response = call?.response;
  if (response === null || response === undefined) return null;
  const message = response?.choices?.[0]?.message;
  return typeof message?.content === "string" ? message.content
    : typeof response?.text === "string" ? response.text : JSON.stringify(response);
};

const directories = (await readdir(packetRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && entry.name.startsWith("campaign-"))
  .map(entry => path.join(packetRoot, entry.name)).sort();
if (directories.length !== 3) throw new Error(`packet-directory-count:${directories.length}`);

const packetByAttempt = new Map(), inputs = [];
let controlsSha256 = null;
for (const directory of directories) {
  const sealBytes = await readFile(path.join(directory, "runtimeSeal.json"));
  if (sha256(sealBytes) !== runtimeSealSha256) throw new Error(`runtime-seal-hash:${directory}`);
  const seal = parse(sealBytes);
  if (seal.sourceCommit !== sourceCommit || seal.caseBundleSha256 !== CASE_BUNDLE_SHA256)
    throw new Error(`runtime-seal-binding:${directory}`);
  const resultBytes = await readFile(path.join(directory, "result.json")), result = parse(resultBytes);
  if (expectedResultHashes[result.candidateId] !== sha256(resultBytes)
      || result.runtimeSealSha256 !== runtimeSealSha256
      || !Array.isArray(result.attempts) || result.attempts.length !== 120)
    throw new Error(`result-binding:${directory}`);
  const controlBytes = await readFile(path.join(directory, "controls.json")), control = parse(controlBytes);
  if (!Array.isArray(control.attempts) || control.attempts.length !== 12
      || control.attempts.some(attempt => attempt.grade?.status !== "pass"))
    throw new Error(`control-result:${directory}`);
  controlsSha256 ??= sha256(controlBytes);
  if (controlsSha256 !== sha256(controlBytes)) throw new Error("controls-not-byte-identical");
  for (const row of result.attempts) {
    const rawBytes = await readFile(path.join(directory, row.file));
    const recordBytes = await readFile(path.join(directory, `${row.attemptId}.record.json`));
    const observation = parse(rawBytes), record = parse(recordBytes);
    if (sha256(rawBytes) !== row.sha256 || record.attemptId !== row.attemptId
        || record.sha256 !== row.sha256 || record.bytes !== rawBytes.length
        || observation.runtimeSealSha256 !== runtimeSealSha256)
      throw new Error(`attempt-binding:${row.attemptId}`);
    if (packetByAttempt.has(row.attemptId)) throw new Error(`attempt-duplicate:${row.attemptId}`);
    packetByAttempt.set(row.attemptId, { rawBytes, recordBytes, observation });
  }
  inputs.push({ candidateId: result.candidateId, directory: path.relative(".", directory).replaceAll("\\", "/"),
    resultSha256: sha256(resultBytes), attempts: result.attempts.length });
}
if (packetByAttempt.size !== 360) throw new Error(`packet-count:${packetByAttempt.size}`);

const order = candidateBlindAttemptOrder(runtimeSealSha256);
const worksheet = order.map(mapping => {
  const packet = packetByAttempt.get(mapping.attemptId);
  if (!packet) throw new Error(`packet-missing:${mapping.attemptId}`);
  const observation = packet.observation;
  return {
    blindId: mapping.blindId,
    caseId: observation.caseId,
    role: observation.role,
    repetition: observation.repetition,
    observationStatus: observation.status,
    deterministicGrade: observation.grade?.status ?? null,
    failures: observation.failures ?? [],
    unresolved: observation.unresolved ?? [],
    providerOutputs: (observation.provider?.calls ?? []).flatMap((call, index) =>
      call.response === null || call.response === undefined ? [] : [{ index, text: outputText(call) }]),
    answers: (observation.application?.requests ?? []).flatMap((request, index) =>
      request.operation === "answer" ? [{ requestIndex: index, phase: request.phase,
        answer: request.response?.answer ?? null, citations: request.response?.citations ?? null }] : []),
    planSummaries: (observation.workflow?.run?.plans ?? []).map((plan, index) => ({ index, summary: plan.summary ?? null })),
    selectedSources: (observation.sources?.selected ?? observation.sources?.canonical ?? [])
      .map((source, index) => ({ index, content: source.content ?? null })),
    semanticChecks: semanticChecksForCase(observation.caseId),
  };
});
if (worksheet.length !== 360 || new Set(worksheet.map(row => row.blindId)).size !== 360)
  throw new Error("worksheet-order-invalid");

const worksheetBytes = Buffer.from(`${JSON.stringify({
  schemaVersion: "runaai-m1-independent-semantic-review-worksheet/v1",
  evaluatorId: "independent-semantic-r13-evaluator",
  runtimeSealSha256,
  sourceCommit,
  caseBundleSha256: CASE_BUNDLE_SHA256,
  candidateIdentityOmittedFromRows: true,
  attempts: worksheet,
}, null, 2)}\n`, "utf8");
const worksheetPath = path.join(outputRoot, "review-worksheet.json");
await writeFile(worksheetPath, worksheetBytes, { flag: "wx" });

const manifest = {
  schemaVersion: "runaai-m1-independent-semantic-r13-input-manifest/v1",
  sourceCommit,
  runtimeSealSha256,
  caseBundleSha256: CASE_BUNDLE_SHA256,
  candidateBlindOrderVersion: CANDIDATE_BLIND_ORDER_VERSION,
  attemptOrderSha256: sha256(order.map(entry => entry.blindId).join("\n")),
  controlsSha256,
  controlsPassed: 12,
  inputs,
  worksheet: { path: path.relative(".", worksheetPath).replaceAll("\\", "/"),
    bytes: worksheetBytes.length, sha256: sha256(worksheetBytes) },
  rawBindingsSha256: jsonSha256([...packetByAttempt.entries()].map(([attemptId, packet]) => ({
    attemptId, rawSha256: sha256(packet.rawBytes), recordSha256: sha256(packet.recordBytes),
  })).sort((left, right) => left.attemptId.localeCompare(right.attemptId))),
  independentSemanticReviewPending: true,
  productQualificationPassed: false,
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const manifestPath = path.join(outputRoot, "review-input-manifest.json");
await writeFile(manifestPath, manifestBytes, { flag: "wx" });
console.log(JSON.stringify({ worksheetPath, worksheetSha256: sha256(worksheetBytes),
  manifestPath, manifestSha256: sha256(manifestBytes), attempts: worksheet.length }));
