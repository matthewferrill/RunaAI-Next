import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, code) => { if (!condition) throw new Error(`readiness-evidence-${code}`); };
const allowedName = /^(capture-(qwen36|gemma|coder)\.jsonl|result-(qwen36|gemma|coder)\.json|inventory\.json|seal\.json|recovery\.json|power-(before|applied|result)\.json|watchdog\.jsonl|worker-(gemma|coder)(-(exit|recovery))?\.json|worker-(gemma|coder)-(stdout|stderr)\.txt)$/;

export function verifyExport(input) {
  const directory = path.resolve(input);
  const manifest = JSON.parse(readFileSync(path.join(directory, "EXPORT.json"), "utf8"));
  assert(manifest.schemaVersion === "runa-m1-readiness-export/v1" && Array.isArray(manifest.files) && manifest.files.length > 0, "manifest");
  const names = new Set();
  for (const entry of manifest.files) {
    assert(allowedName.test(entry.name) && !names.has(entry.name), "path"); names.add(entry.name);
    const bytes = readFileSync(path.join(directory, entry.name));
    assert(bytes.length === entry.bytes && sha(bytes) === entry.sha256, "hash");
  }
  const json = name => { assert(names.has(name), "unmanifested-file"); return JSON.parse(readFileSync(path.join(directory, name), "utf8")); };
  const summaries = [];
  for (const candidate of ["qwen36", "gemma", "coder"]) {
    const resultPresent = names.has(`result-${candidate}.json`), capturePresent = names.has(`capture-${candidate}.jsonl`);
    assert(!resultPresent || capturePresent, "incomplete-pair");
    if (!capturePresent) continue;
    assert(resultPresent || names.has("recovery.json"), "unresolved-partial-capture");
    const events = readFileSync(path.join(directory, `capture-${candidate}.jsonl`), "utf8").trim().split(/\r?\n/).map(JSON.parse);
    const result = resultPresent ? json(`result-${candidate}.json`) : {
      candidate, qualityQualified: false, cleanupVerified: null, errorCode: "capture-incomplete-no-runner-result",
      attempts: events.filter(event => event.type === "observation" || event.type === "request-failure").map(event => event.attempt) };
    assert(result.candidate === candidate && result.qualityQualified === false, "classification");
    const starts = events.filter(event => event.type === "start"), loads = events.filter(event => event.type === "load-response");
    assert(starts.length === 1 && starts[0].candidate.id === candidate, "start-binding");
    const start = starts[0], requests = new Map(), responses = new Map(), observations = [];
    if (names.has("seal.json")) assert(JSON.stringify(start.seal) === JSON.stringify(json("seal.json")), "seal-binding");
    for (const event of events) {
      if (event.type === "request") {
        assert(!requests.has(event.id) && event.wireSha256 === sha(JSON.stringify(event.request)), "wire-request");
        assert(event.request.model === start.candidate.key, "request-model");
        requests.set(event.id, event);
      }
      if (event.type === "response") {
        assert(requests.has(event.id) && !responses.has(event.id), "response-binding");
        assert(JSON.stringify(JSON.parse(event.raw)) === JSON.stringify(event.value), "raw-response");
        responses.set(event.id, event);
      }
      if (event.type === "observation" || event.type === "request-failure") observations.push(event.attempt);
    }
    assert(JSON.stringify(result.attempts) === JSON.stringify(observations), "observation-binding");
    for (const attempt of result.attempts) {
      assert(requests.has(attempt.id), "attempt-request");
      if (!attempt.accepted) continue;
      assert(responses.has(attempt.id), "accepted-response");
      const response = responses.get(attempt.id), request = requests.get(attempt.id).request;
      assert(response.ok === true && response.status === 200, "accepted-http");
      const value = response.value, native = attempt.endpoint === "/api/v1/chat";
      const expectedIds = [start.candidate.key, ...loads.map(event => event.value.instance_id)];
      assert(expectedIds.includes(native ? value.model_instance_id : value.model), "response-model");
      const completionTokens = native ? value.stats?.total_output_tokens : value.usage?.completion_tokens;
      assert(completionTokens === attempt.completionTokens && Number.isInteger(completionTokens)
        && completionTokens <= (request.max_tokens ?? request.max_output_tokens), "token-cap");
      const answerPresent = native ? value.output.some(item => item.type === "message" && item.content?.length)
        : typeof value.choices?.[0]?.message?.content === "string" && value.choices[0].message.content.length > 0;
      assert(answerPresent === attempt.answerPresent, "answer-binding");
      const message = value.choices?.[0]?.message;
      const reasoningTokens = native ? value.stats?.reasoning_output_tokens ?? null
        : value.usage?.completion_tokens_details?.reasoning_tokens ?? value.stats?.reasoning_output_tokens ?? null;
      const reasoningChannel = native ? value.output.some(item => item.type === "reasoning")
        : !!(message?.reasoning || message?.reasoning_content || /<think>|<\|channel>thought/i.test(message?.content ?? ""));
      assert(reasoningTokens === attempt.reasoningTokens && reasoningChannel === attempt.reasoningChannelPresent, "reasoning-binding");
    }
    if (result.cleanupVerified) {
      const cleanups = events.filter(event => event.type === "cleanup");
      assert(cleanups.length === 1 && cleanups[0].cleanupVerified === true
        && Array.isArray(cleanups[0].remaining) && cleanups[0].remaining.length === 0
        && !events.some(event => event.type === "cleanup-failure"), "cleanup-binding");
    }
    const samples = events.filter(event => event.type === "telemetry").map(event => event.sample);
    assert(samples.length > 0, "telemetry-absent");
    const peakTemperatureC = Math.max(...samples.flatMap(sample => sample.gpus.map(g => g.temperatureC)));
    const maximumSampleGapMs = Math.max(0, ...samples.slice(1).map((sample, i) => Date.parse(sample.time) - Date.parse(samples[i].time)));
    const conditions = Object.groupBy(result.attempts.filter(a => !a.id.includes("warmup") && !a.id.includes("context") && !a.id.includes("metrics") && !a.id.includes("control")),
      attempt => attempt.id.replace(/-[1-3](?:-late-diagnostic)?$/, ""));
    summaries.push({ candidate, runnerResultPresent: resultPresent, errorCode: result.errorCode, cleanupVerified: result.cleanupVerified,
      loadedInstanceIds: loads.map(event => event.value.instance_id),
      responseModelIds: [...new Set([...responses.values()].map(event => event.value.model ?? event.value.model_instance_id).filter(Boolean))],
      explicitReasoningEfforts: [...new Set([...requests.values()].map(event => event.request.reasoning_effort ?? "omitted"))],
      peakTemperatureC, maximumSampleGapMs, declaredModelQualityQualified: result.qualityQualified,
      coldLoadMs: loads.map(event => event.elapsedMs),
      conditions: Object.fromEntries(Object.entries(conditions).map(([name, values]) => [name, values.map(a => ({
        id: a.id, elapsedMs: a.elapsedMs, deadlineMs: a.deadlineMs, deadlineMet: a.elapsedMs <= a.deadlineMs,
        accepted: a.accepted, answerPresent: a.answerPresent ?? null, reasoningTokens: a.reasoningTokens ?? null,
        reasoningChannelPresent: a.reasoningChannelPresent ?? null, completionTokens: a.completionTokens ?? null,
        finishReason: a.finishReason ?? null, error: a.error ?? null }))])),
      context: result.attempts.filter(a => a.id.startsWith("context-")),
      reasoningControl: result.attempts.filter(a => a.id === "native-on-control" || a.id === "v0-api-off-metrics"),
      postTimeoutServerCancellationAcknowledged: events.filter(event => event.type === "post-timeout-observation").map(event => event.serverCancellationAcknowledged) });
  }
  const power = names.has("power-result.json") ? json("power-result.json") : null;
  const recovery = names.has("recovery.json") ? json("recovery.json") : null;
  if (recovery) assert(names.has("seal.json") && recovery.sourceSeal === sha(readFileSync(path.join(directory, "seal.json"))), "recovery-seal");
  return { schemaVersion: "runa-m1-readiness-verified-summary/v1", exactExportHashesVerified: true,
    summaryClassification: "unscored-readiness-not-function-qualification", summaries,
    powerWrapperRestored: power?.powerRestored ?? null, powerWrapperFailure: power?.failure ?? null,
    powerRestored: recovery ? recovery.powerRestored : power?.powerRestored ?? null,
    powerFailure: recovery ? recovery.failure : power?.failure ?? null,
    restorationEvidence: recovery ? "recovery.json" : power ? "power-result.json" : null,
    recoveryOwnedInstanceUnloaded: recovery?.unloaded ?? null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || !existsSync(process.argv[2])) throw new Error("readiness-evidence-directory");
  console.log(JSON.stringify(verifyExport(process.argv[2]), null, 2));
}
