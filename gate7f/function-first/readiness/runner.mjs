import { appendFileSync, createReadStream, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { hostname, freemem, totalmem } from "node:os";
import path from "node:path";
import { MANIFEST as plan } from "./manifest.mjs";
import { CONDITIONS, PROMPT, requestFor, contextPrompt } from "./cases.mjs";
import { readGgufMetadata } from "./gguf-metadata.mjs";

const here = import.meta.dirname;
const sha = value => createHash("sha256").update(value).digest("hex");
const fail = (ok, code) => { if (!ok) throw new Error(`readiness-${code}`); };
const progress = value => console.log(JSON.stringify({ readiness: true, ...value }));
fail(hostname().toUpperCase() === plan.expectedHost && process.version === plan.expectedNode, "host-runtime");
const seal = JSON.parse(readFileSync(path.join(here, "seal.json"), "utf8"));
for (const [name, expected] of Object.entries(seal.files)) {
  fail(/^[a-z-]+\.(?:mjs|json)$/.test(name), "seal-path");
  fail(sha(readFileSync(path.join(here, name))) === expected, "package-drift");
}
const runtime = JSON.parse(readFileSync(path.join(here, "runtime.json"), "utf8"));
async function fileHash(file) {
  fail(path.isAbsolute(file) && !lstatSync(file).isSymbolicLink(), "file-path");
  const h = createHash("sha256"); for await (const bytes of createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) h.update(bytes);
  return h.digest("hex");
}
async function verifyRuntime() {
  const result = [];
  for (const file of runtime.files) {
    const observed = await fileHash(file.path); fail(observed === file.sha256, "runtime-file-drift");
    result.push({ path: file.path, sha256: observed });
  }
  return result;
}
function hardware(label) {
  const raw = execFileSync("nvidia-smi.exe", ["--query-gpu=index,name,uuid,memory.total,memory.used,temperature.gpu,power.limit,power.draw,utilization.gpu", "--format=csv,noheader,nounits"], { encoding: "utf8", timeout: 5000, windowsHide: true });
  return { label, time: new Date().toISOString(), freeMemoryBytes: freemem(), totalMemoryBytes: totalmem(),
    gpus: raw.trim().split(/\r?\n/).map(line => { const f = line.split(",").map(x => x.trim());
      return { index: +f[0], name: f[1], uuid: f[2], memoryTotalMiB: +f[3], memoryUsedMiB: +f[4],
        temperatureC: +f[5], powerLimitWatts: +f[6], powerWatts: +f[7], utilization: +f[8] }; }) };
}
function checkHardware(sample, starting = false) {
  fail(sample.freeMemoryBytes >= plan.hardware.minimumFreeHostBytes, "host-memory");
  fail(sample.gpus.length === 2 && new Set(sample.gpus.map(g => g.index)).size === 2 && sample.gpus.every(g =>
    [0,1].includes(g.index) && g.uuid === plan.hardware.gpuUuids[g.index] && g.name === "Quadro RTX 6000"
    && g.memoryTotalMiB === 23040 && g.memoryUsedMiB >= 0 && g.memoryUsedMiB < 23040
    && Number.isFinite(g.temperatureC) && g.temperatureC < plan.hardware.temperatureCutoffC
    && (!starting || g.temperatureC <= plan.hardware.maximumStartTemperatureC)
    && g.powerLimitWatts === plan.hardware.gpuPowerLimitWatts && Number.isFinite(g.powerWatts)
    && Number.isFinite(g.utilization) && g.utilization >= 0 && g.utilization <= 100), "hardware-boundary");
}
async function api(endpoint, body, timeoutMs = 15000, signal) {
  fail(["/api/v1/models", "/api/v1/models/load", "/api/v1/models/unload", "/api/v0/chat/completions", "/v1/chat/completions", "/api/v1/chat"].includes(endpoint), "endpoint");
  const start = Date.now();
  const response = await fetch(plan.api + endpoint, { method: body ? "POST" : "GET", redirect: "error",
    headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]) });
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; fail(bytes <= plan.maximumResponseBytes, "response-budget"); chunks.push(chunk); }
  const raw = Buffer.concat(chunks).toString("utf8");
  let value; try { value = JSON.parse(raw); } catch { throw Object.assign(new Error("readiness-provider-json"), { raw, status: response.status }); }
  return { raw, value, status: response.status, ok: response.ok, elapsedMs: Date.now() - start };
}
const instances = value => {
  fail(Array.isArray(value.models), "inventory-shape");
  return value.models.flatMap(model => (model.loaded_instances ?? []).map(instance => ({ ...instance, modelKey: model.key })));
};
async function residency(candidate, instance, fingerprint) {
  const response = await api("/api/v1/models"); fail(response.ok, "inventory-http");
  const loaded = instances(response.value);
  if (!instance) { fail(loaded.length === 0, "unowned-residency"); return response.value; }
  fail(loaded.length === 1 && loaded[0].id === instance && loaded[0].modelKey === candidate.key, "unexpected-residency");
  if (fingerprint) fail(sha(JSON.stringify(loaded[0].config)) === fingerprint, "load-config-drift");
  return loaded[0];
}
function normalize(response, candidate, instance, endpoint) {
  const v = response.value;
  if (!response.ok) return { accepted: false, error: "http-rejected", status: response.status };
  if (endpoint === "/api/v1/chat") {
    fail(v.model_instance_id === instance && Array.isArray(v.output), "native-identity");
    fail(v.output.every(item => ["message", "reasoning"].includes(item.type)), "unexpected-action");
    fail(Number.isInteger(v.stats?.total_output_tokens) && v.stats.total_output_tokens <= plan.maximumOutputTokens, "native-usage");
    return { accepted: true, answerPresent: v.output.some(item => item.type === "message" && item.content?.length),
      reasoningTokens: v.stats.reasoning_output_tokens ?? null, reasoningChannelPresent: v.output.some(item => item.type === "reasoning"),
      promptTokens: v.stats.input_tokens ?? null, completionTokens: v.stats.total_output_tokens,
      firstTokenMs: v.stats.time_to_first_token_seconds === undefined ? null : v.stats.time_to_first_token_seconds * 1000,
      runtimeEcho: null, contextEcho: null, finishReason: null, effectiveReasoningEcho: v.reasoning ?? v.config?.reasoning ?? null };
  }
  fail([candidate.key, instance].includes(v.model) && v.choices?.length === 1, "compatible-identity");
  const choice = v.choices[0], message = choice.message;
  fail(!message?.tool_calls?.length, "unexpected-action");
  fail(Number.isInteger(v.usage?.completion_tokens) && v.usage.completion_tokens <= plan.maximumOutputTokens, "compatible-usage");
  if (endpoint === "/api/v0/chat/completions") {
    fail(v.runtime?.name === plan.runtime.name && v.runtime?.version === plan.runtime.version, "backend-drift");
    fail(v.model_info?.context_length === plan.contextLength, "context-drift");
  }
  return { accepted: true, answerPresent: typeof message?.content === "string" && message.content.length > 0,
    reasoningTokens: v.usage?.completion_tokens_details?.reasoning_tokens ?? v.stats?.reasoning_output_tokens ?? null,
    reasoningChannelPresent: !!(message?.reasoning || message?.reasoning_content || /<think>|<\|channel>thought/i.test(message?.content ?? "")),
    promptTokens: v.usage.prompt_tokens ?? null, completionTokens: v.usage.completion_tokens,
    firstTokenMs: v.stats?.time_to_first_token === undefined ? null : v.stats.time_to_first_token * 1000,
    runtimeEcho: v.runtime ?? null, contextEcho: v.model_info?.context_length ?? null, finishReason: choice.finish_reason,
    effectiveReasoningEcho: v.reasoning_effort ?? v.config?.reasoning ?? null };
}

if (process.argv[2] === "--inventory") {
  fail(!existsSync(path.join(here, "inventory.json")), "inventory-exists");
  const registry = await residency(null, null); const sample = hardware("inventory"); checkHardware(sample, true);
  const metadata = plan.candidates.map(candidate => {
    const meta = readGgufMetadata(candidate.artifactPath);
    return { key: candidate.key, actualBytes: statSync(candidate.artifactPath).size, templateSha256: meta.chatTemplateSha256,
      architecture: meta.selected["general.architecture"], metadataBytes: meta.metadataBytes };
  });
  const result = { observedAt: new Date().toISOString(), host: hostname(), node: process.version, runtime: await verifyRuntime(),
    metadata, hardware: sample, identities: registry.models.filter(model => plan.candidates.some(c => c.key === model.key)) };
  writeFileSync(path.join(here, "inventory.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  progress({ status: "inventory-complete", ...result });
} else {
  const candidate = plan.candidates.find(c => c.id === process.argv[2]); fail(candidate, "candidate");
  const capturePath = path.join(here, `capture-${candidate.id}.jsonl`); const resultPath = path.join(here, `result-${candidate.id}.json`);
  fail(!existsSync(capturePath) && !existsSync(resultPath), "capture-exists");
  writeFileSync(capturePath, "", { flag: "wx" });
  const record = (type, data) => appendFileSync(capturePath, JSON.stringify({ type, time: new Date().toISOString(), ...data }) + "\n");
  let instance = null, modelKey = null, fingerprint = null, loadRequested = false, cleanupVerified = false, errorCode = null;
  const attempts = []; const controller = new AbortController(); let lastSample = Date.now(); let sampling = false;
  const sample = label => { const value = hardware(label); record("telemetry", { sample: value });
    fail(Date.now() - lastSample <= plan.maximumTelemetryGapMs, "telemetry-gap"); lastSample = Date.now(); checkHardware(value); return value; };
  const monitor = setInterval(() => { if (sampling) return; sampling = true; try { sample("periodic"); }
    catch (error) { controller.abort(error); try { record("telemetry-failure", { code: error.message }); } catch {} }
    finally { sampling = false; } }, plan.telemetryIntervalMs);
  const armTimer = setTimeout(() => controller.abort(new Error("readiness-arm-deadline")), plan.armDeadlineMs);
  const onSignal = () => controller.abort(new Error("readiness-interrupted"));
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  async function invoke(id, condition, request, deadline = plan.requestDeadlineMs) {
    controller.signal.throwIfAborted(); await residency(candidate, instance, fingerprint);
    sample(`${id}:before`); record("request", { id, endpoint: condition.endpoint, deadlineMs: deadline, request, wireSha256: sha(JSON.stringify(request)) });
    const started = Date.now();
    try {
      const response = await api(condition.endpoint, request, deadline, controller.signal);
      record("response", { id, ...response });
      const observed = normalize(response, candidate, instance, condition.endpoint);
      const attempt = { id, endpoint: condition.endpoint, elapsedMs: Date.now() - started, deadlineMs: deadline, ...observed };
      attempts.push(attempt); record("observation", { attempt }); progress({ candidate: candidate.id, status: "observed", ...attempt });
      sample(`${id}:after`); await residency(candidate, instance, fingerprint); return attempt;
    } catch (error) {
      const timeout = error.name === "TimeoutError";
      const attempt = { id, endpoint: condition.endpoint, elapsedMs: Date.now() - started, deadlineMs: deadline, accepted: false,
        timeout, error: timeout ? "request-deadline" : error.message };
      attempts.push(attempt); record("request-failure", { attempt, raw: error.raw ?? null }); progress({ candidate: candidate.id, status: "request-failed", ...attempt });
      if (!timeout || controller.signal.aborted) throw error;
      // Never queue another request behind an unconfirmed abort. Wait for bounded GPU idleness,
      // retaining every sample and exact unchanged residency. This is a diagnostic observation,
      // not a server proof of exclusive traffic or cancellation acknowledgement.
      const until = Date.now() + 30000; let idle = 0;
      while (Date.now() < until && idle < 2) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const state = sample(`${id}:post-timeout`); await residency(candidate, instance, fingerprint);
        idle = state.gpus.every(g => g.utilization < 5) ? idle + 1 : 0;
      }
      fail(idle >= 2, "post-timeout-idleness-unverified");
      record("post-timeout-observation", { id, twoIdleSamples: true, serverCancellationAcknowledged: false });
      return attempt;
    }
  }
  try {
    record("start", { candidate, plan, seal, classification: plan.classification, exclusiveTrafficVerified: false });
    const baseline = await residency(null, null); checkHardware(sample("before-hash"), true);
    const identity = baseline.models.filter(model => model.key === candidate.key && model.size_bytes === candidate.bytes
      && model.architecture === candidate.architecture && model.quantization?.name === candidate.quantization);
    fail(identity.length === 1, "registry-identity"); modelKey = candidate.key;
    progress({ candidate: candidate.id, status: "hashing-artifact" });
    fail(statSync(candidate.artifactPath).size === candidate.bytes && await fileHash(candidate.artifactPath) === candidate.sha256, "artifact-drift");
    const runtimeHashes = await verifyRuntime(); const gguf = readGgufMetadata(candidate.artifactPath);
    fail(gguf.chatTemplateSha256 === candidate.templateSha256, "template-pin");
    record("pins-verified", { candidate, runtimeHashes, metadata: gguf });
    controller.signal.throwIfAborted(); await residency(null, null); checkHardware(sample("before-load"), true);
    const loadRequest = { model: candidate.key, context_length: plan.contextLength, flash_attention: true,
      offload_kv_cache_to_gpu: true, echo_load_config: true, speculative_draft_mtp: candidate.mtp,
      speculative_draft_simple: false, speculative_draft_model: "",
      ...(candidate.mtp ? { speculative_draft_max_tokens: 2, speculative_draft_min_tokens: 0,
        speculative_draft_min_continue_probability: 0.75 } : {}) };
    record("load-request", { request: loadRequest }); loadRequested = true;
    const loaded = await api("/api/v1/models/load", loadRequest, plan.loadDeadlineMs, controller.signal);
    record("load-response", loaded);
    fail(loaded.ok && loaded.value.status === "loaded" && typeof loaded.value.instance_id === "string", "load-response");
    instance = loaded.value.instance_id;
    const config = loaded.value.load_config;
    fail(config?.context_length === plan.contextLength && config.flash_attention === true && config.offload_kv_cache_to_gpu === true
      && config.speculative_draft_mtp === candidate.mtp && config.speculative_draft_simple === false
      && config.speculative_draft_model === "" && typeof config.prompt_template?.template === "string"
      && sha(config.prompt_template.template) === candidate.templateSha256, "load-envelope");
    if (candidate.mtp) fail(config.speculative_draft_max_tokens === 2 && config.speculative_draft_min_tokens === 0
      && config.speculative_draft_min_continue_probability === 0.75, "mtp-draft-count");
    const resident = await residency(candidate, instance); fingerprint = sha(JSON.stringify(resident.config));
    record("resident", { resident, fingerprint }); progress({ candidate: candidate.id, status: "loaded", loadElapsedMs: loaded.elapsedMs, instance });
    const reasoningOff = identity[0].capabilities?.reasoning?.allowed_options?.includes("off") === true;
    const compatible = { id: "v1-api-off", endpoint: "/v1/chat/completions", suffix: true, ...(reasoningOff ? { reasoning_effort: "none" } : {}) };
    await invoke("warmup-unscored", compatible, requestFor(modelKey, compatible, { prompt: 'Return {"answer":"ready","citations":[]}.', maximumTokens: 64 }), 120000);
    const conditions = candidate.id === "qwen36" ? CONDITIONS : [compatible];
    for (const condition of conditions) for (let repetition = 1; repetition <= plan.repetitions; repetition++) {
      const request = requestFor(modelKey, condition); const id = `${condition.id}-${repetition}`;
      const observed = await invoke(id, condition, request);
      if (observed.timeout) { await invoke(`${id}-late-diagnostic`, condition, request, plan.lateDiagnosticDeadlineMs); break; }
      if (observed.accepted === false) break;
    }
    const metrics = { ...compatible, id: "v0-api-off-metrics", endpoint: "/api/v0/chat/completions" };
    await invoke("v0-api-off-metrics", metrics, requestFor(modelKey, metrics));
    if (candidate.id === "qwen36") {
      const on = { id: "native-on-control", endpoint: "/api/v1/chat", suffix: false, reasoning: "on" };
      await invoke(on.id, on, requestFor(modelKey, on, { maximumTokens: 128 }));
    }
    for (const rows of plan.contextLadderRows) {
      const request = requestFor(modelKey, compatible, { prompt: contextPrompt(rows), maximumTokens: plan.contextOutputTokens });
      const observed = await invoke(`context-${rows}-rows`, compatible, request);
      if (observed.timeout) { await invoke(`context-${rows}-rows-late-diagnostic`, compatible, request, plan.lateDiagnosticDeadlineMs); break; }
      if (!observed.accepted || !observed.answerPresent || observed.finishReason === "length") break;
    }
    controller.signal.throwIfAborted();
  } catch (error) {
    errorCode = /^readiness-[a-z0-9-]+$/.test(error.message) ? error.message : "readiness-operator-failed";
    try { record("failure", { code: errorCode, errorClass: error.name }); } catch {}
  } finally {
    clearInterval(monitor); clearTimeout(armTimer); process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
    try {
      if (instance) { const current = instances((await api("/api/v1/models")).value);
        fail(current.some(item => item.id === instance && item.modelKey === candidate.key), "cleanup-ownership");
        record("unload", await api("/api/v1/models/unload", { instance_id: instance }, 120000)); }
      const remaining = instances((await api("/api/v1/models")).value);
      cleanupVerified = remaining.length === 0 && !(loadRequested && !instance);
      record("cleanup", { ownedInstance: instance, remaining, cleanupVerified, ambiguousLoad: loadRequested && !instance });
      const final = hardware("after-unload"); record("telemetry", { sample: final }); checkHardware(final);
    } catch (error) { cleanupVerified = false; record("cleanup-failure", { code: error.message }); }
    const result = { schemaVersion: "runa-m1-readiness-result/v1", candidate: candidate.id, diagnosticId: plan.diagnosticId,
      classification: plan.classification, errorCode, attempts, cleanupVerified, productionRoutingChanged: false,
      powerSettingsChanged: false, protectedDataIncluded: false, qualityQualified: false, endedAt: new Date().toISOString() };
    writeFileSync(resultPath, JSON.stringify(result, null, 2), { flag: "wx" });
    progress({ status: "finished", candidate: candidate.id, errorCode, attempts: attempts.length, cleanupVerified });
    if (errorCode || !cleanupVerified) process.exitCode = 1;
  }
}
