import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual as same } from "node:util";
import path from "node:path";
import { CASE_BUNDLE_SHA256, MODEL_CASES } from "./cases.mjs";
import { semanticChecksForCase } from "./independent-semantic-review.mjs";

export const EQUIVALENT_REVIEW_INPUT_SCHEMA_VERSION = "runaai-m1-equivalent-campaign-review-input/v1";
export const EQUIVALENT_REVIEW_WORKSHEET_SCHEMA_VERSION = "runaai-m1-equivalent-campaign-review-worksheet/v1";
export const EQUIVALENT_REVIEW_BLIND_ORDER_VERSION = "runaai-m1-equivalent-campaign-blind-order/v1";
export const EQUIVALENT_REVIEW_TOPOLOGY_VERSION = "runaai-m1-equivalent-campaign-review-topology/v2";

const SHA256 = /^[a-f0-9]{64}$/u;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
const jsonSha256 = value => sha256(Buffer.from(JSON.stringify(value), "utf8"));

function fail(code, detail = "") {
  throw new Error(`${code}${detail ? `:${detail}` : ""}`);
}

export function parseEquivalentReviewWindowManifest(value) {
  if (value?.schemaVersion !== "runaai-m1-equivalent-campaign-review-windows/v1"
      || value.candidateId !== "qwen36-27b-mtp" || !Array.isArray(value.windows)
      || value.windows.length !== 3) fail("window-manifest-invalid");
  const keys = ["index", "label", "directory", "result", "resultSha256", "expectedAttempts"];
  const labels = new Set();
  let attempts = 0;
  value.windows.forEach((window, index) => {
    if (window === null || typeof window !== "object" || Array.isArray(window)
        || JSON.stringify(Object.keys(window).sort()) !== JSON.stringify([...keys].sort())
        || window.index !== index + 1 || typeof window.label !== "string" || !window.label
        || labels.has(window.label) || typeof window.directory !== "string" || !window.directory
        || typeof window.result !== "string" || !window.result || !SHA256.test(window.resultSha256 ?? "")
        || !Number.isInteger(window.expectedAttempts) || window.expectedAttempts < 1) {
      fail("window-manifest-invalid", String(index + 1));
    }
    labels.add(window.label); attempts += window.expectedAttempts;
  });
  if (attempts !== 120 || !same(value.windows.map(window => window.expectedAttempts), [68, 1, 51]))
    fail("window-manifest-attempt-count-invalid", String(attempts));
  return value.windows.map(window => ({ ...window }));
}

const canonicalAttemptIds = candidateId => Array.from({ length: 3 }, (_, repetition) => MODEL_CASES.map(item =>
  `${candidateId}--${item.id}--${repetition + 1}`)).flat();

export function validateEquivalentReviewTopology({ inputs, composed, audit }) {
  if (!Array.isArray(inputs) || inputs.length !== 5) fail("review-topology-input-count-invalid");
  const complete = new Map(inputs.filter(input => input.windowIndex === undefined).map(input => [input.label, input]));
  for (const [label, candidateId] of [["gemma", "gemma4-26b-a4b"], ["coder", "qwen3-coder-30b-a3b"]]) {
    const input = complete.get(label);
    if (!input || input.candidateId !== candidateId || input.attemptIds.length !== 120
        || !same(input.attemptIds, canonicalAttemptIds(candidateId))) fail("review-complete-candidate-boundary-invalid", label);
  }
  const qwen = inputs.filter(input => input.windowIndex !== undefined).sort((a, b) => a.windowIndex - b.windowIndex);
  const canonicalQwen = canonicalAttemptIds("qwen36-27b-mtp"), spans = [[1, 68], [69, 69], [70, 120]];
  if (qwen.length !== 3 || composed?.schemaVersion !== "runaai-m1-equivalence-audited-candidate-result/v1"
      || composed.candidateId !== "qwen36-27b-mtp" || composed.caseBundleSha256 !== CASE_BUNDLE_SHA256
      || composed.recordedAttempts !== 120 || !Array.isArray(composed.attempts) || composed.attempts.length !== 120
      || !same(composed.attempts.map(row => row.attemptId), canonicalQwen)
      || audit?.schemaVersion !== "runaai-m1-candidate-history-equivalence-audit/v1"
      || audit.candidateId !== "qwen36-27b-mtp" || audit.caseBundleSha256 !== CASE_BUNDLE_SHA256
      || audit.modelFacingEquivalent !== true || audit.completedPrefixImmutable !== true
      || audit.singleUninterruptedArmClaimed !== false || audit.qualificationCompositionPermitted !== true
      || audit.independentSemanticReviewPending !== true || !Array.isArray(audit.executionWindows)
      || !same(audit.executionWindows, composed.executionWindows)) fail("review-composition-boundary-invalid");
  qwen.forEach((input, index) => {
    const [startOrdinal, endOrdinal] = spans[index], window = audit.executionWindows[index];
    if (input.windowIndex !== index + 1 || input.candidateId !== "qwen36-27b-mtp"
        || !same(input.attemptIds, canonicalQwen.slice(startOrdinal - 1, endOrdinal))
        || window?.index !== index + 1 || window.startOrdinal !== startOrdinal || window.endOrdinal !== endOrdinal
        || window.recordedAttempts !== endOrdinal - startOrdinal + 1 || window.resultSha256 !== input.resultSha256
        || window.runtimeSealSha256 !== input.runtimeSealSha256) fail("review-window-composition-boundary-invalid", String(index + 1));
  });
}

function args(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) fail("argument-invalid", argv[index] ?? "missing");
    output[argv[index].slice(2)] = argv[index + 1];
  }
  return output;
}

async function boundJson(file, expectedSha256, label) {
  if (!SHA256.test(expectedSha256 ?? "")) fail("sha256-invalid", label);
  const bytes = await readFile(file);
  if (sha256(bytes) !== expectedSha256) fail("input-hash-mismatch", label);
  return { bytes, value: parse(bytes) };
}

function outputText(call) {
  const response = call?.response;
  if (response === null || response === undefined) return null;
  const message = response?.choices?.[0]?.message;
  return typeof message?.content === "string" ? message.content
    : typeof response?.text === "string" ? response.text
    : JSON.stringify(response);
}

async function packetsFromResult(directory, result, expectedRuntimeSealSha256) {
  const packets = [];
  if (!Array.isArray(result.attempts)) fail("result-attempts-invalid", directory);
  for (const row of result.attempts) {
    const rawBytes = await readFile(path.join(directory, row.file));
    const recordBytes = await readFile(path.join(directory, `${row.attemptId}.record.json`));
    if (sha256(rawBytes) !== row.sha256) fail("raw-hash-mismatch", row.attemptId);
    const observation = parse(rawBytes), record = parse(recordBytes);
    const observedAttemptId = `${observation.candidateId}--${observation.caseId}--${observation.repetition}`;
    if (observedAttemptId !== row.attemptId || observation.runtimeSealSha256 !== expectedRuntimeSealSha256
        || observation.caseBundleSha256 !== CASE_BUNDLE_SHA256 || record.attemptId !== row.attemptId
        || record.sha256 !== row.sha256 || record.bytes !== rawBytes.length)
      fail("raw-record-binding-invalid", row.attemptId);
    packets.push({ attemptId: row.attemptId, rawBytes, recordBytes, observation });
  }
  return packets;
}

function blindId(reviewBindingSha256, attemptId) {
  return `attempt-${sha256(`${EQUIVALENT_REVIEW_BLIND_ORDER_VERSION}\0${reviewBindingSha256}\0${attemptId}`).slice(0, 24)}`;
}

function worksheetRow(reviewBindingSha256, packet) {
  const observation = packet.observation;
  return {
    blindId: blindId(reviewBindingSha256, packet.attemptId),
    caseId: observation.caseId,
    role: observation.role,
    repetition: observation.repetition,
    observationStatus: observation.status,
    deterministicGrade: observation.grade?.status ?? null,
    failures: observation.failures ?? [],
    unresolved: observation.unresolved ?? [],
    providerOutputs: (observation.provider?.calls ?? []).flatMap((call, index) => call.response === null || call.response === undefined ? [] : [{
      index,
      text: outputText(call),
    }]),
    answers: (observation.application?.requests ?? []).flatMap((request, index) => request.operation === "answer" ? [{
      requestIndex: index,
      phase: request.phase,
      answer: request.response?.answer ?? null,
      citations: request.response?.citations ?? null,
    }] : []),
    planSummaries: (observation.workflow?.run?.plans ?? []).map((plan, index) => ({ index, summary: plan.summary ?? null })),
    selectedSources: (observation.sources?.selected ?? observation.sources?.canonical ?? []).map((source, index) => ({
      index,
      content: source.content ?? null,
    })),
    semanticChecks: semanticChecksForCase(observation.caseId),
  };
}

export async function prepareEquivalentCampaignReview(argv) {
  const input = args(argv);
  const required = ["gemma-directory", "gemma-result-sha256", "coder-directory", "coder-result-sha256",
    "composition-directory", "composition-result-sha256",
    "composition-audit-sha256", "worksheet-directory", "manifest-path"];
  for (const key of required) if (!input[key]) fail("argument-missing", key);

  const usesWindowManifest = Boolean(input["qwen-window-manifest"] || input["qwen-window-manifest-sha256"]);
  if (usesWindowManifest && (!input["qwen-window-manifest"] || !input["qwen-window-manifest-sha256"]))
    fail("argument-missing", "qwen-window-manifest");
  if (!usesWindowManifest) {
    for (const key of ["qwen-prior-directory", "qwen-prior-result-sha256",
      "qwen-supplemental-directory", "qwen-supplemental-result-sha256"])
      if (!input[key]) fail("argument-missing", key);
  }

  const sources = [
    { label: "gemma", directory: path.resolve(input["gemma-directory"]), result: "result.json",
      resultSha256: input["gemma-result-sha256"], expectedAttempts: 120, expectedCandidateId: "gemma4-26b-a4b" },
    { label: "coder", directory: path.resolve(input["coder-directory"]), result: "result.json",
      resultSha256: input["coder-result-sha256"], expectedAttempts: 120, expectedCandidateId: "qwen3-coder-30b-a3b" },
  ];
  let windowManifestSha256 = null;
  if (usesWindowManifest) {
    const manifestPath = path.resolve(input["qwen-window-manifest"]);
    const windowInput = await boundJson(manifestPath, input["qwen-window-manifest-sha256"], "qwen-window-manifest");
    windowManifestSha256 = input["qwen-window-manifest-sha256"];
    const base = path.dirname(manifestPath);
    sources.push(...parseEquivalentReviewWindowManifest(windowInput.value).map(window => ({
      label: window.label,
      directory: path.resolve(base, window.directory),
      result: path.resolve(base, window.result),
      resultSha256: window.resultSha256,
      expectedAttempts: window.expectedAttempts,
      expectedCandidateId: windowInput.value.candidateId,
      windowIndex: window.index,
    })));
  } else {
    sources.push(
      { label: "qwen-prior", directory: path.resolve(input["qwen-prior-directory"]), result: "result.json",
        resultSha256: input["qwen-prior-result-sha256"] },
      { label: "qwen-supplemental", directory: path.resolve(input["qwen-supplemental-directory"]), result: "result.json",
        resultSha256: input["qwen-supplemental-result-sha256"] },
    );
  }
  const packets = [], inputs = [], topologyInputs = [];
  for (const source of sources) {
    const resultPath = path.isAbsolute(source.result) ? source.result : path.join(source.directory, source.result);
    const resultInput = await boundJson(resultPath, source.resultSha256, `${source.label}-result`);
    const result = resultInput.value;
    if (!SHA256.test(result.runtimeSealSha256 ?? "") || result.caseBundleSha256 !== CASE_BUNDLE_SHA256)
      fail("result-seal-invalid", source.label);
    const sourcePackets = await packetsFromResult(source.directory, result, result.runtimeSealSha256);
    if ((source.expectedAttempts !== undefined && sourcePackets.length !== source.expectedAttempts)
        || (source.expectedCandidateId && result.candidateId !== source.expectedCandidateId))
      fail("window-result-boundary-invalid", source.label);
    packets.push(...sourcePackets);
    inputs.push({ label: source.label, candidateId: result.candidateId, resultSha256: source.resultSha256,
      runtimeSealSha256: result.runtimeSealSha256, attempts: sourcePackets.length,
      ...(source.windowIndex ? { windowIndex: source.windowIndex } : {}) });
    topologyInputs.push({ label: source.label, candidateId: result.candidateId, resultSha256: source.resultSha256,
      runtimeSealSha256: result.runtimeSealSha256, attemptIds: sourcePackets.map(packet => packet.attemptId),
      ...(source.windowIndex ? { windowIndex: source.windowIndex } : {}) });
  }
  if (packets.length !== 360 || new Set(packets.map(packet => packet.attemptId)).size !== 360) fail("campaign-packet-count-invalid", packets.length);

  const compositionDirectory = path.resolve(input["composition-directory"]);
  const composedInput = await boundJson(path.join(compositionDirectory, "qwen-composed-result.json"),
    input["composition-result-sha256"], "composition-result");
  const auditInput = await boundJson(path.join(compositionDirectory, "equivalence-audit.json"),
    input["composition-audit-sha256"], "composition-audit");
  validateEquivalentReviewTopology({ inputs: topologyInputs, composed: composedInput.value, audit: auditInput.value });
  const qwenPacketIds = packets.filter(packet => packet.observation.candidateId === composedInput.value.candidateId)
    .map(packet => packet.attemptId).sort();
  const composedIds = composedInput.value.attempts.map(row => row.attemptId).sort();
  if (JSON.stringify(qwenPacketIds) !== JSON.stringify(composedIds) || !auditInput.value.modelFacingEquivalent)
    fail("composition-packet-binding-invalid");

  const rawBindings = packets.map(packet => ({ attemptId: packet.attemptId, rawSha256: sha256(packet.rawBytes),
    recordSha256: sha256(packet.recordBytes), runtimeSealSha256: packet.observation.runtimeSealSha256 })).sort((a, b) => a.attemptId.localeCompare(b.attemptId));
  const rawBindingsSha256 = jsonSha256(rawBindings);
  const reviewBasis = {
    schemaVersion: EQUIVALENT_REVIEW_INPUT_SCHEMA_VERSION,
    caseBundleSha256: CASE_BUNDLE_SHA256,
    compositionResultSha256: input["composition-result-sha256"],
    compositionAuditSha256: input["composition-audit-sha256"],
    inputs,
    rawBindingsSha256,
    attempts: 360,
    ...(windowManifestSha256 ? { windowManifestSha256,
      topologyValidationVersion: EQUIVALENT_REVIEW_TOPOLOGY_VERSION } : {}),
  };
  const reviewBindingSha256 = jsonSha256(reviewBasis);
  const worksheet = packets.map(packet => worksheetRow(reviewBindingSha256, packet))
    .sort((left, right) => left.blindId.localeCompare(right.blindId));
  if (new Set(worksheet.map(row => row.blindId)).size !== 360) fail("blind-id-collision");

  const worksheetDirectory = path.resolve(input["worksheet-directory"]);
  await mkdir(worksheetDirectory, { recursive: false });
  const worksheetPath = path.join(worksheetDirectory, "review-worksheet.json");
  const worksheetBytes = Buffer.from(`${JSON.stringify({
    schemaVersion: EQUIVALENT_REVIEW_WORKSHEET_SCHEMA_VERSION,
    reviewBindingSha256,
    blindOrderVersion: EQUIVALENT_REVIEW_BLIND_ORDER_VERSION,
    candidateIdentityOmittedFromRows: true,
    attempts: worksheet,
  }, null, 2)}\n`, "utf8");
  await writeFile(worksheetPath, worksheetBytes, { flag: "wx" });
  const manifest = {
    ...reviewBasis,
    reviewBindingSha256,
    blindOrderVersion: EQUIVALENT_REVIEW_BLIND_ORDER_VERSION,
    worksheet: { path: path.relative(path.resolve("."), worksheetPath).replaceAll("\\", "/"),
      bytes: worksheetBytes.length, sha256: sha256(worksheetBytes) },
    independentSemanticReviewPending: true,
    productQualificationPassed: false,
  };
  const manifestPath = path.resolve(input["manifest-path"]);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(manifestPath, manifestBytes, { flag: "wx" });
  return { manifestPath, manifestSha256: sha256(manifestBytes), worksheetPath,
    worksheetSha256: sha256(worksheetBytes), reviewBindingSha256, attempts: worksheet.length };
}

if (process.argv[1] && path.basename(process.argv[1]) === "prepare-equivalent-campaign-review.mjs") {
  prepareEquivalentCampaignReview(process.argv.slice(2)).then(value => console.log(JSON.stringify(value))).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
