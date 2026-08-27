import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate as aggregateBurnin } from "./grader.mjs";
import { loadCorpus } from "./corpus.mjs";
import { verifySeal } from "./seal.mjs";
import { messagesForCase } from "./prompt.mjs";
import { requestForCase, validateCompletion } from "./capture-contract.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const quantile = (values, fraction) => values.length === 0 ? null
  : [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)];
const summary = values => ({ samples: values.length, median: quantile(values, 0.5),
  p95: quantile(values, 0.95), minimum: values.length ? Math.min(...values) : null,
  maximum: values.length ? Math.max(...values) : null });

export function summarizeCapture(corpus, observations, events, capture, expectedSealSha256) {
  const grade = aggregateBurnin(corpus, observations, expectedSealSha256);
  const valid = capture.passed === true && capture.cleanupVerified === true
    && capture.observedRuns === observations.length && capture.candidate === grade.candidateId
    && grade.captureComplete;
  const telemetry = events.filter(item => item.type === "telemetry");
  const performance = events.filter(item => item.type === "performance");
  const gpuIds = [...new Set(telemetry.flatMap(item => item.gpus.map(gpu => gpu.index)))].sort();
  return { schemaVersion: "runa2-gate7f1-capture-summary/v2", capture, grade,
    validForComparison: valid, eligible: valid && grade.eligible,
    timing: { loadMs: events.find(item => item.type === "load")?.elapsedMs ?? null,
      requestMs: summary(observations.map(item => item.elapsedMs)),
      timeToFirstTokenMs: summary(performance.map(item => item.timeToFirstTokenMs)),
      generatedTokensPerSecond: summary(observations.map(item => item.generatedTokensPerSecond)) },
    hardware: { sampling: "before-load, after-load, before-each-request, after-unload; not continuous",
      hostFreeBytes: summary(telemetry.map(item => item.freeMemoryBytes)),
      gpus: gpuIds.map(index => {
        const samples = telemetry.flatMap(item => item.gpus.filter(gpu => gpu.index === index));
        const at = label => telemetry.find(item => item.label === label)?.gpus.find(gpu => gpu.index === index) ?? null;
        return { index, beforeLoad: at("before-load"), afterUnload: at("after-unload"),
          memoryMiB: summary(samples.map(item => item.usedMemoryMiB)),
          temperatureC: summary(samples.map(item => item.temperatureC)),
          powerWatts: summary(samples.map(item => item.powerWatts)) };
      }) },
    privateValuesIncluded: false, rawResponsesIncluded: false, productionRoutingChanged: false };
}

export function validateCapturedRows(corpus, observations, events, sealDigest) {
  const identity = events.find(row => row.type === "identity");
  if (observations.length && !identity) throw new Error("gate7f1-v2-evidence-identity-missing");
  const pins = { incumbent: ["qwen3-coder-30b-a3b-instruct", "72a9b20a19c70db56e1ccd01fb35b0f0842d67d28e7c3bdff762df860120b769"],
    gemma26: ["gemma-4-26b-a4b-it-qat", "3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d"] };
  for (const row of observations) {
    if (!pins[row.candidateId] || row.modelId !== pins[row.candidateId][0]
      || row.artifactSha256 !== pins[row.candidateId][1]) throw new Error("gate7f1-v2-evidence-artifact-pin");
    const source = events.filter(event => event.type === "response" && event.caseId === row.caseId && event.attempt === row.attempt);
    const requests = events.filter(event => event.type === "request" && event.caseId === row.caseId && event.attempt === row.attempt);
    const entry = corpus.cases.find(item => item.caseId === row.caseId);
    if (!entry || source.length !== 1 || requests.length !== 1) throw new Error("gate7f1-v2-evidence-event-set");
    const off = identity.identity.capabilities?.reasoning?.allowed_options?.includes("off") === true;
    const request = requestForCase({ ...entry, messages: messagesForCase(entry) }, identity.identity.key, off);
    if (JSON.stringify(requests[0].request) !== JSON.stringify(request)) throw new Error("gate7f1-v2-evidence-request-drift");
    const load = events.find(event => event.type === "load");
    const parsed = validateCompletion(source[0].response, identity.identity.key, load?.response.instance_id, identity.runtime);
    for (const key of ["rawResponse", "finishReason", "generationTokens", "generatedTokensPerSecond"]) {
      if (parsed[key] !== row[key]) throw new Error("gate7f1-v2-evidence-response-drift");
    }
    if (row.evaluationSealSha256 !== sealDigest || row.artifactSha256 !== identity.manifest.artifactSha256
      || row.elapsedMs !== source[0].elapsedMs || row.modelId !== identity.identity.key)
      throw new Error("gate7f1-v2-evidence-identity-drift");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const checked = verifySeal();
  const input = path.resolve(process.argv[2] ?? "");
  const allowed = path.join(root, "artifacts/runs/gate7f1");
  if (!input.startsWith(allowed + path.sep)) throw new Error("gate7f1-summary-input-boundary");
  const corpus = loadCorpus();
  const files = Object.fromEntries(["observations.jsonl", "events.jsonl", "result.json"].map(file =>
    [file, readFileSync(path.join(input, file))]));
  const lines = file => files[file].toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const result = summarizeCapture(corpus, lines("observations.jsonl"), lines("events.jsonl"),
    JSON.parse(files["result.json"]), checked.evaluationSealSha256);
  validateCapturedRows(corpus, lines("observations.jsonl"), lines("events.jsonl"), checked.evaluationSealSha256);
  result.evidenceSha256 = Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, sha256(bytes)]));
  const output = path.join(input, "summary.json");
  if (existsSync(output)) throw new Error("gate7f1-summary-already-exists");
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(JSON.stringify(result) + "\n");
}
