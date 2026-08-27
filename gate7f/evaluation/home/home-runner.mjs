import { appendFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync,
  realpathSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { freemem, hostname, totalmem } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API, CONTEXT, assertLoadEnvelope, assertResidency, assertTelemetry, cleanupOwnedInstance, digest,
  requestForCase, requireValue, validateCompletion } from "./capture-contract.mjs";
import { readGgufMetadata } from "./gguf-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidate = process.argv[2];
requireValue(hostname().toUpperCase() === "RUNA-HOME", "gate7f1-wrong-host");
requireValue(["incumbent", "gemma26"].includes(candidate), "gate7f1-candidate-not-authorized");
requireValue(process.argv[3] === "--authorize-home-burnin", "gate7f1-live-authority-required");
const bundle = JSON.parse(readFileSync(path.join(here, "bundle.json"), "utf8"));
const manifest = bundle.candidates[candidate];
requireValue(manifest && bundle.schemaVersion === "runa2-gate7f1-home-bundle/v1", "gate7f1-bundle-invalid");
const requests = bundle.requests;
requireValue(requests.length === 35 && new Set(requests.map(item => item.caseId)).size === 35
  && bundle.runsPerCase === 3, "gate7f1-denominator-invalid");
const runRoot = path.join(here, "evidence-" + candidate);
requireValue(!existsSync(runRoot), "gate7f1-evidence-already-exists");
requireValue(realpathSync(here) === here, "gate7f1-source-reparse");
mkdirSync(runRoot);
const eventsPath = path.join(runRoot, "events.jsonl");
const observationsPath = path.join(runRoot, "observations.jsonl");
writeFileSync(eventsPath, "", { flag: "wx" });
writeFileSync(observationsPath, "", { flag: "wx" });
const record = (type, value) => appendFileSync(eventsPath, JSON.stringify({
  type, recordedAt: new Date().toISOString(), ...value,
}) + "\n");
const progress = value => process.stdout.write(JSON.stringify({
  schemaVersion: "runa2-gate7f1-home-progress/v1", candidate, ...value,
}) + "\n");
async function hashFile(file) {
  requireValue(path.isAbsolute(file) && !lstatSync(file).isSymbolicLink(), "gate7f1-file-boundary");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function api(endpoint, body, timeoutMs = 30000) {
  requireValue(["/api/v1/models", "/api/v1/models/load", "/api/v1/models/unload",
    "/api/v0/chat/completions"].includes(endpoint), "gate7f1-endpoint-not-allowed");
  const response = await fetch(API + endpoint, { method: body === undefined ? "GET" : "POST",
    redirect: "error", headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const pieces = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    requireValue(bytes <= 1024 * 1024, "gate7f1-http-output-limit");
    pieces.push(chunk);
  }
  const text = Buffer.concat(pieces).toString("utf8");
  requireValue(response.ok, "gate7f1-provider-http-" + response.status);
  try { return JSON.parse(text); } catch { throw new Error("gate7f1-provider-json-invalid"); }
}
function telemetry(label) {
  const raw = execFileSync("nvidia-smi.exe", [
    "--query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw",
    "--format=csv,noheader,nounits",
  ], { encoding: "utf8", timeout: 15000, windowsHide: true });
  const gpus = raw.trim().split(/\r?\n/).map(line => {
    const p = line.split(",").map(value => value.trim());
    return { index: Number(p[0]), name: p[1], totalMemoryMiB: Number(p[2]),
      usedMemoryMiB: Number(p[3]), utilizationPercent: Number(p[4]),
      temperatureC: Number(p[5]), powerWatts: Number(p[6]) };
  });
  return { label, observedAt: new Date().toISOString(), freeMemoryBytes: freemem(),
    totalMemoryBytes: totalmem(), gpus };
}
let instanceId = null;
let passed = false;
let failure = null;
let observedRuns = 0;
let cleanupVerified = false;
let configDigest = null;
let inventoryBefore;
const deadline = Date.now() + 90 * 60_000;
try {
  progress({ phase: "hashing-artifact" });
  requireValue(statSync(manifest.artifactPath).size === manifest.artifactBytes, "gate7f1-artifact-size-drift");
  requireValue(await hashFile(manifest.artifactPath) === manifest.artifactSha256, "gate7f1-artifact-hash-drift");
  const gguf = readGgufMetadata(manifest.artifactPath);
  record("gguf-metadata", gguf);
  for (const file of bundle.runtime.files) {
    requireValue(await hashFile(file.path) === file.sha256, "gate7f1-runtime-file-drift");
  }
  inventoryBefore = await api("/api/v1/models");
  assertResidency(inventoryBefore, null, null);
  const matches = inventoryBefore.models.filter(model => model.size_bytes === manifest.artifactBytes
    && model.quantization?.name === manifest.quantization && model.architecture === manifest.architecture);
  requireValue(matches.length === 1, "gate7f1-registry-artifact-not-singular");
  const identity = matches[0];
  const modelKey = identity.key;
  const reasoningOff = identity.capabilities?.reasoning?.allowed_options?.includes("off") === true;
  record("identity", { manifest, identity, sourceBundleSha256: await hashFile(path.join(here, "bundle.json")),
    runtime: bundle.runtime, seal: bundle.seal });
  const before = telemetry("before-load");
  assertTelemetry(before);
  record("telemetry", before);
  progress({ phase: "loading", modelKey });
  const loadRequest = { model: modelKey, context_length: CONTEXT, flash_attention: true,
    offload_kv_cache_to_gpu: true, echo_load_config: true };
  const loadStarted = Date.now();
  const load = await api("/api/v1/models/load", loadRequest, 900000);
  requireValue(typeof load.instance_id === "string", "gate7f1-load-instance-missing");
  instanceId = load.instance_id;
  record("load", { request: loadRequest, response: load, elapsedMs: Date.now() - loadStarted });
  requireValue(load.status === "loaded" && load.load_config?.context_length === CONTEXT,
    "gate7f1-load-config-invalid");
  assertLoadEnvelope(load.load_config, gguf.chatTemplateSha256);
  const loaded = assertResidency(await api("/api/v1/models"), modelKey, instanceId);
  configDigest = digest(loaded.config);
  const afterLoad = telemetry("after-load");
  assertTelemetry(afterLoad);
  record("telemetry", afterLoad);
  const runtimeFingerprintSha256 = digest({ runtime: bundle.runtime, loadConfig: loaded.config,
    artifactSha256: manifest.artifactSha256, api: "/api/v0/chat/completions", temperature: 0,
    reasoningEffort: reasoningOff ? "none" : "not-configurable",
    corpusSha256: bundle.seal.corpusCanonicalSha256, sealFiles: bundle.seal.files });

  // This transport probe is retained separately and cannot count toward corpus quality.
  const probeRequest = { model: modelKey, messages: [{ role: "user", content: "Reply with the single word ready." }],
    temperature: 0, max_tokens: 256, stream: false };
  if (reasoningOff) probeRequest.reasoning_effort = "none";
  const probe = await api("/api/v0/chat/completions", probeRequest, 120000);
  record("transport-probe", { request: probeRequest, response: probe });
  validateCompletion(probe, modelKey, instanceId, bundle.runtime);
  for (const item of requests) {
    for (let attempt = 1; attempt <= bundle.runsPerCase; attempt++) {
      requireValue(Date.now() < deadline, "gate7f1-arm-deadline");
      assertResidency(await api("/api/v1/models"), modelKey, instanceId, configDigest);
      const sample = telemetry(item.caseId + ":" + attempt);
      record("telemetry", sample);
      assertTelemetry(sample);
      const request = requestForCase(item, modelKey, reasoningOff);
      record("request", { caseId: item.caseId, attempt, request });
      const start = Date.now();
      const response = await api("/api/v0/chat/completions", request, 120000);
      const elapsedMs = Math.max(1, Date.now() - start);
      record("response", { caseId: item.caseId, attempt, response, elapsedMs });
      const parsed = validateCompletion(response, modelKey, instanceId, bundle.runtime);
      assertResidency(await api("/api/v1/models"), modelKey, instanceId, configDigest);
      const { timeToFirstTokenMs, ...content } = parsed;
      const observation = { schemaVersion: "runa2-gate7f1-observation/v1", candidateId: candidate,
        caseId: item.caseId, attempt, modelId: modelKey, artifactSha256: manifest.artifactSha256,
        runtimeFingerprintSha256, elapsedMs, ...content };
      appendFileSync(observationsPath, JSON.stringify(observation) + "\n");
      record("performance", { caseId: item.caseId, attempt, timeToFirstTokenMs,
        tokensPerSecond: parsed.generatedTokensPerSecond });
      observedRuns++;
      if (observedRuns % 3 === 0) progress({ phase: "capturing", observedRuns, requiredRuns: 105 });
    }
  }
  passed = observedRuns === 105;
} catch (error) {
  failure = /^gate7f1-[a-z0-9-]+$/.test(error.message) ? error.message : "gate7f1-operator-failed";
  record("failure", { code: failure, errorClass: error.name });
} finally {
  try {
    const cleanup = await cleanupOwnedInstance(api, instanceId);
    cleanupVerified = cleanup.cleanupVerified;
    record("cleanup", { ...cleanup, ownedInstanceId: instanceId });
    if (cleanup.unexpectedInstances) {
      passed = false;
      failure ??= "gate7f1-final-unexpected-instance";
    }
  } catch (error) {
    record("cleanup-failure", { code: "gate7f1-owned-unload-unverified", errorClass: error.name });
  }
  try { record("telemetry", telemetry("after-unload")); } catch { cleanupVerified = false; }
  const result = { schemaVersion: "runa2-gate7f1-home-capture-result/v1", candidate,
    passed: passed && cleanupVerified, observedRuns, requiredRuns: 105, failure,
    cleanupVerified, modelContentExecuted: false, controlChanged: false,
    productionRoutingChanged: false, privateValuesIncluded: false };
  writeFileSync(path.join(runRoot, "result.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  progress({ phase: "finished", ...result });
  process.exitCode = result.passed ? 0 : 1;
}
