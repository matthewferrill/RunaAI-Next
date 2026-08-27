import { appendFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { freemem, hostname, totalmem } from "node:os";
import path from "node:path";
import { assertLoadEnvelope, assertResidency, assertTelemetry, cleanupOwnedInstance, digest } from "../evaluation/v2/capture-contract.mjs";
import { readGgufMetadata } from "../evaluation/v2/gguf-metadata.mjs";

export const requireValue = (ok, code) => { if (!ok) throw new Error("qualification-" + code); };
export const hash = value => createHash("sha256").update(value).digest("hex");
export async function hashFile(file) {
  requireValue(path.isAbsolute(file) && !lstatSync(file).isSymbolicLink(), "file-boundary");
  const h = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) h.update(bytes);
  return h.digest("hex");
}
export async function verifyPackage(here) {
  const root = path.resolve(here,"..");
  const manifestPath = path.join(root,"package-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath,"utf8"));
  requireValue(manifest.schemaVersion === "runa2-qualification-package-manifest/v1", "package-manifest");
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.resolve(root,relative);
    requireValue(file.startsWith(root + path.sep) && /^[a-f0-9]{64}$/.test(expected), "package-file-boundary");
    requireValue(await hashFile(file) === expected, "package-file-drift");
  }
  return { manifest, sha256: await hashFile(manifestPath) };
}
export async function api(endpoint, body, timeoutMs = 120000) {
  requireValue(["/api/v1/models", "/api/v1/models/load", "/api/v1/models/unload",
    "/api/v0/chat/completions", "/v1/chat/completions"].includes(endpoint), "endpoint-denied");
  const response = await fetch("http://127.0.0.1:1234" + endpoint, {
    method: body === undefined ? "GET" : "POST", redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const chunks = []; let size = 0;
  for await (const bytes of response.body) {
    size += bytes.byteLength; requireValue(size <= 2 * 1024 * 1024, "http-size");
    chunks.push(bytes);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let value;
  try { value = JSON.parse(raw); } catch { throw Object.assign(new Error("qualification-provider-json"), { status: response.status }); }
  if (!response.ok) throw Object.assign(new Error("qualification-http-" + response.status), { status: response.status, providerError: value });
  return value;
}
export function telemetry(label) {
  const csv = execFileSync("nvidia-smi.exe", [
    "--query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw",
    "--format=csv,noheader,nounits",
  ], { encoding: "utf8", timeout: 15000, windowsHide: true });
  const gpus = csv.trim().split(/\r?\n/).map(line => {
    const p = line.split(",").map(v => v.trim());
    return { index: Number(p[0]), name: p[1], totalMemoryMiB: Number(p[2]), usedMemoryMiB: Number(p[3]),
      utilizationPercent: Number(p[4]), temperatureC: Number(p[5]), powerWatts: Number(p[6]) };
  });
  const sample = { label, freeMemoryBytes: freemem(), totalMemoryBytes: totalmem(), gpus };
  assertTelemetry(sample);
  return sample;
}
export function validateResponse(value, model, instance, runtime, endpoint) {
  requireValue([model, instance].includes(value?.model), "response-model");
  requireValue(Array.isArray(value.choices) && value.choices.length === 1, "response-shape");
  const choice = value.choices[0], msg = choice.message;
  requireValue(["stop", "length", "tool_calls"].includes(choice.finish_reason), "finish-reason");
  requireValue(msg && (typeof msg.content === "string" || msg.content === null), "message-shape");
  requireValue(!msg.reasoning && !msg.reasoning_content && !/<think>|<\|channel>thought/i.test(msg.content ?? "")
    && !(value.stats?.reasoning_output_tokens > 0) && !(value.usage?.completion_tokens_details?.reasoning_tokens > 0), "reasoning-leaked");
  requireValue(Number.isInteger(value.usage?.completion_tokens) && value.usage.completion_tokens >= 0, "usage-missing");
  if (endpoint === "/api/v0/chat/completions") {
    requireValue(value.runtime?.name === runtime.name && value.runtime?.version === runtime.version, "runtime-drift");
    requireValue(value.model_info?.context_length === 32768, "response-context");
    requireValue(Number.isFinite(value.stats?.tokens_per_second) && Number.isFinite(value.stats?.time_to_first_token), "metrics-missing");
  }
  return { content: msg.content, toolCalls: msg.tool_calls ?? [], finishReason: choice.finish_reason,
    completionTokens: value.usage.completion_tokens, promptTokens: value.usage.prompt_tokens ?? null,
    tokensPerSecond: value.stats?.tokens_per_second ?? null,
    firstTokenMs: value.stats?.time_to_first_token === undefined ? null : value.stats.time_to_first_token * 1000 };
}
export async function withCandidate({ bundle, candidate, outputDir, phase }, work) {
  requireValue(hostname().toUpperCase() === "RUNA-HOME", "wrong-host");
  requireValue(["incumbent", "gemma26"].includes(candidate), "candidate");
  const manifest = bundle.candidates[candidate];
  requireValue(!existsSync(outputDir) && realpathSync(path.dirname(outputDir)) === path.dirname(outputDir), "output-boundary");
  mkdirSync(outputDir);
  const events = path.join(outputDir, "events.jsonl");
  writeFileSync(events, "", { flag: "wx" });
  const record = (type, payload = {}) => appendFileSync(events, JSON.stringify({ type, time: new Date().toISOString(), ...payload }) + "\n");
  const progress = payload => process.stdout.write(JSON.stringify({ phase, candidate, ...payload }) + "\n");
  let instance = null, cleanupVerified = false, passed = false, failure = null, modelKey, fingerprint, observed = 0;
  const startedAt = new Date().toISOString();
  try {
    record("source", { source: bundle.source, manifest, runtime: bundle.runtime, phase });
    progress({ status: "hashing" });
    requireValue(statSync(manifest.artifactPath).size === manifest.artifactBytes, "artifact-size");
    requireValue(await hashFile(manifest.artifactPath) === manifest.artifactSha256, "artifact-hash");
    for (const file of bundle.runtime.files) requireValue(await hashFile(file.path) === file.sha256, "runtime-file-hash");
    const gguf = readGgufMetadata(manifest.artifactPath);
    record("metadata", gguf);
    const inventory = await api("/api/v1/models");
    assertResidency(inventory, null, null);
    const models = inventory.models.filter(m => m.size_bytes === manifest.artifactBytes && m.architecture === manifest.architecture
      && m.quantization?.name === manifest.quantization);
    requireValue(models.length === 1, "model-singular");
    const identity = models[0]; modelKey = identity.key;
    const reasoningOff = identity.capabilities?.reasoning?.allowed_options?.includes("off") === true;
    record("identity", { identity });
    record("telemetry", telemetry("before-load"));
    progress({ status: "loading", modelKey });
    const loadRequest = { model: modelKey, context_length: 32768, flash_attention: true, offload_kv_cache_to_gpu: true, echo_load_config: true };
    const t = Date.now(), loaded = await api("/api/v1/models/load", loadRequest, 900000);
    requireValue(typeof loaded.instance_id === "string", "instance-missing");
    instance = loaded.instance_id;
    record("load", { request: loadRequest, response: loaded, elapsedMs: Date.now() - t });
    assertLoadEnvelope(loaded.load_config, gguf.chatTemplateSha256);
    const resident = assertResidency(await api("/api/v1/models"), modelKey, instance);
    fingerprint = digest(resident.config);
    record("telemetry", telemetry("after-load"));
    const invoke = async ({ id, request, endpoint = "/api/v0/chat/completions", allowDiagnosticHttpError = false }) => {
      assertResidency(await api("/api/v1/models"), modelKey, instance, fingerprint);
      record("telemetry", telemetry(id));
      const body = { ...request, model: modelKey, temperature: 0, stream: false,
        ...(reasoningOff ? { reasoning_effort: "none" } : {}) };
      record("request", { id, endpoint, request: body });
      const start = Date.now();
      try {
        const response = await api(endpoint, body, 120000);
        record("response", { id, endpoint, response, elapsedMs: Date.now() - start });
        const normalized = validateResponse(response, modelKey, instance, bundle.runtime, endpoint);
        assertResidency(await api("/api/v1/models"), modelKey, instance, fingerprint);
        observed++;
        record("observation", { id, endpoint, normalized, elapsedMs: Date.now() - start });
        progress({ status: "observed", id, observed });
        return { response, normalized };
      } catch (error) {
        record("request-failure", { id, code: error.message, status: error.status ?? null,
          diagnosticProviderError: allowDiagnosticHttpError ? error.providerError ?? null : null, elapsedMs: Date.now() - start });
        if (!allowDiagnosticHttpError || ![400,404,422].includes(error.status)) throw error;
        return { failure: error.message };
      }
    };
    await work({ invoke, record, progress, modelKey, instance, manifest, reasoningOff });
    passed = true;
  } catch (error) {
    failure = /^(qualification|gate7f1)-[a-z0-9-]+$/.test(error.message) ? error.message : "qualification-operator-failed";
    record("failure", { code: failure, errorClass: error.name });
  } finally {
    try {
      const cleanup = await cleanupOwnedInstance(api, instance);
      cleanupVerified = cleanup.cleanupVerified && !cleanup.unexpectedInstances;
      record("cleanup", { ...cleanup, ownedInstance: instance });
    } catch (error) { record("cleanup-failure", { code: error.message }); }
    try { record("telemetry", telemetry("after-unload")); } catch { cleanupVerified = false; }
    const result = { schemaVersion: "runa2-qualification-capture-result/v1", candidate, phase, startedAt,
      endedAt: new Date().toISOString(), passed: passed && cleanupVerified, failure, observed, cleanupVerified,
      modelKey: modelKey ?? null, configSha256: fingerprint ?? null, modelContentExecuted: false,
      productionRoutingChanged: false, protectedDataIncluded: false };
    writeFileSync(path.join(outputDir,"result.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
    progress({status:"finished",...result});
    return result;
  }
}
