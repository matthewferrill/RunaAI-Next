import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateBurnin } from "../grader.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const quantile = (values, fraction) => values.length === 0 ? null
  : [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)];
const summary = values => ({ samples: values.length, median: quantile(values, 0.5),
  p95: quantile(values, 0.95), minimum: values.length ? Math.min(...values) : null,
  maximum: values.length ? Math.max(...values) : null });

export function summarizeCapture(corpus, observations, events, capture) {
  const grade = aggregateBurnin(corpus, observations);
  const valid = capture.passed === true && capture.cleanupVerified === true
    && capture.observedRuns === observations.length && capture.candidate === grade.candidateId
    && grade.decidable;
  const telemetry = events.filter(item => item.type === "telemetry");
  const performance = events.filter(item => item.type === "performance");
  const gpuIds = [...new Set(telemetry.flatMap(item => item.gpus.map(gpu => gpu.index)))].sort();
  return { schemaVersion: "runa2-gate7f1-capture-summary/v1", capture, grade,
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const seal = JSON.parse(readFileSync(path.join(root, "gate7f/evaluation/SEAL.json"), "utf8"));
  for (const [file, expected] of Object.entries(seal.files)) {
    if (sha256(readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n")) !== expected)
      throw new Error("gate7f1-summary-seal-drift");
  }
  const input = path.resolve(process.argv[2] ?? "");
  const allowed = path.join(root, "artifacts/runs/gate7f1");
  if (!input.startsWith(allowed + path.sep)) throw new Error("gate7f1-summary-input-boundary");
  const corpus = JSON.parse(readFileSync(path.join(root, "gate7f/evaluation/corpus.json"), "utf8"));
  const files = Object.fromEntries(["observations.jsonl", "events.jsonl", "result.json"].map(file =>
    [file, readFileSync(path.join(input, file))]));
  const lines = file => files[file].toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const result = summarizeCapture(corpus, lines("observations.jsonl"), lines("events.jsonl"),
    JSON.parse(files["result.json"]));
  result.evidenceSha256 = Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, sha256(bytes)]));
  const output = path.join(input, "summary.json");
  if (existsSync(output)) throw new Error("gate7f1-summary-already-exists");
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(JSON.stringify(result) + "\n");
}
