import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { semanticChecksForCase } from "./independent-semantic-review.mjs";

export const EQUIVALENT_REVIEW_INPUT_SCHEMA_VERSION = "runaai-m1-equivalent-campaign-review-input/v1";
export const EQUIVALENT_REVIEW_WORKSHEET_SCHEMA_VERSION = "runaai-m1-equivalent-campaign-review-worksheet/v1";
export const EQUIVALENT_REVIEW_BLIND_ORDER_VERSION = "runaai-m1-equivalent-campaign-blind-order/v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
const jsonSha256 = value => sha256(Buffer.from(JSON.stringify(value), "utf8"));

function fail(code, detail = "") {
  throw new Error(`${code}${detail ? `:${detail}` : ""}`);
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
    "qwen-prior-directory", "qwen-prior-result-sha256", "qwen-supplemental-directory",
    "qwen-supplemental-result-sha256", "composition-directory", "composition-result-sha256",
    "composition-audit-sha256", "worksheet-directory", "manifest-path"];
  for (const key of required) if (!input[key]) fail("argument-missing", key);

  const sources = [
    { label: "gemma", directory: path.resolve(input["gemma-directory"]), resultSha256: input["gemma-result-sha256"] },
    { label: "coder", directory: path.resolve(input["coder-directory"]), resultSha256: input["coder-result-sha256"] },
    { label: "qwen-prior", directory: path.resolve(input["qwen-prior-directory"]), resultSha256: input["qwen-prior-result-sha256"] },
    { label: "qwen-supplemental", directory: path.resolve(input["qwen-supplemental-directory"]), resultSha256: input["qwen-supplemental-result-sha256"] },
  ];
  const packets = [], inputs = [];
  for (const source of sources) {
    const resultInput = await boundJson(path.join(source.directory, "result.json"), source.resultSha256, `${source.label}-result`);
    const result = resultInput.value;
    if (!SHA256.test(result.runtimeSealSha256 ?? "") || result.caseBundleSha256 !== CASE_BUNDLE_SHA256)
      fail("result-seal-invalid", source.label);
    const sourcePackets = await packetsFromResult(source.directory, result, result.runtimeSealSha256);
    packets.push(...sourcePackets);
    inputs.push({ label: source.label, candidateId: result.candidateId, resultSha256: source.resultSha256,
      runtimeSealSha256: result.runtimeSealSha256, attempts: sourcePackets.length });
  }
  if (packets.length !== 360 || new Set(packets.map(packet => packet.attemptId)).size !== 360) fail("campaign-packet-count-invalid", packets.length);

  const compositionDirectory = path.resolve(input["composition-directory"]);
  const composedInput = await boundJson(path.join(compositionDirectory, "qwen-composed-result.json"),
    input["composition-result-sha256"], "composition-result");
  const auditInput = await boundJson(path.join(compositionDirectory, "equivalence-audit.json"),
    input["composition-audit-sha256"], "composition-audit");
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
