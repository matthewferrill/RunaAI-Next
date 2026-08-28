import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyExport } from "./verify-export.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t, mutate = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), "runa-readiness-verifier-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.match(path.basename(root), /^runa-readiness-verifier-[a-zA-Z0-9]+$/);
    rmSync(root, { recursive: true });
  });
  const request = { model: "synthetic-model", max_tokens: 8 };
  const value = { model: "synthetic-model", choices: [{ message: { content: "ready" } }], usage: { completion_tokens: 2 } };
  const attempt = { id: "synthetic-1", endpoint: "/v1/chat/completions", accepted: true, answerPresent: true,
    completionTokens: 2, elapsedMs: 10, deadlineMs: 30000, reasoningTokens: null, reasoningChannelPresent: false };
  const events = [
    { type: "start", candidate: { id: "qwen36", key: "synthetic-model" } },
    { type: "request", id: attempt.id, request, wireSha256: sha(JSON.stringify(request)) },
    { type: "response", id: attempt.id, status: 200, ok: true, value, raw: JSON.stringify(value) },
    { type: "observation", attempt },
    { type: "telemetry", sample: { time: "2026-08-28T12:00:00Z", gpus: [{ temperatureC: 40 }] } },
    { type: "cleanup", cleanupVerified: true, remaining: [] }
  ];
  const result = { candidate: "qwen36", qualityQualified: false, cleanupVerified: true, attempts: [structuredClone(attempt)] };
  mutate({ events, result });
  const files = { "capture-qwen36.jsonl": events.map(e => JSON.stringify(e)).join("\n") + "\n",
    "result-qwen36.json": JSON.stringify(result) };
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text, { flag: "wx" });
  writeFileSync(path.join(root, "EXPORT.json"), JSON.stringify({ schemaVersion: "runa-m1-readiness-export/v1",
    files: Object.entries(files).map(([name, text]) => ({ name, bytes: Buffer.byteLength(text), sha256: sha(text) })) }), { flag: "wx" });
  return root;
}

test("readiness evidence verifies bytes and preserves non-qualification", t => {
  const summary = verifyExport(fixture(t));
  assert.equal(summary.exactExportHashesVerified, true);
  assert.equal(summary.summaries[0].declaredModelQualityQualified, false);
  assert.equal(summary.summaries[0].peakTemperatureC, 40);
});
test("byte tampering is rejected before observations are used", t => {
  const root = fixture(t), file = path.join(root, "result-qwen36.json");
  writeFileSync(file, readFileSync(file, "utf8") + " ");
  assert.throws(() => verifyExport(root), /evidence-hash/);
});
test("self-consistent exported hashes cannot hide a wrong request digest", t => {
  const root = fixture(t, ({ events }) => { events[1].wireSha256 = "0".repeat(64); });
  assert.throws(() => verifyExport(root), /wire-request/);
});
test("a result cannot invent a successful answer absent from the captured observation", t => {
  const root = fixture(t, ({ result }) => { result.attempts[0].answerPresent = false; });
  assert.throws(() => verifyExport(root), /observation-binding/);
});
test("matching result and observation cannot invent a successful answer absent from raw output", t => {
  const root = fixture(t, ({ events }) => {
    events[2].value.choices[0].message.content = "";
    events[2].raw = JSON.stringify(events[2].value);
  });
  assert.throws(() => verifyExport(root), /answer-binding/);
});
test("an output beyond the actual request cap is rejected", t => {
  const root = fixture(t, ({ events, result }) => {
    events[2].value.usage.completion_tokens = 9;
    events[2].raw = JSON.stringify(events[2].value);
    events[3].attempt.completionTokens = 9; result.attempts[0].completionTokens = 9;
  });
  assert.throws(() => verifyExport(root), /token-cap/);
});
test("reasoning suppression cannot be claimed from a successful HTTP status alone", t => {
  const root = fixture(t, ({ events }) => {
    events[2].value.usage.completion_tokens_details = { reasoning_tokens: 2 };
    events[2].value.choices[0].message.reasoning_content = "hidden reasoning";
    events[2].raw = JSON.stringify(events[2].value);
  });
  assert.throws(() => verifyExport(root), /reasoning-binding/);
});
test("cleanup cannot be claimed when a retained instance remains", t => {
  const root = fixture(t, ({ events }) => { events[5].remaining = [{ id: "synthetic-model" }]; });
  assert.throws(() => verifyExport(root), /cleanup-binding/);
});
test("manual recovery retains a partial arm as incomplete rather than inventing a runner result", t => {
  const root = fixture(t), file = path.join(root, "EXPORT.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  manifest.files = manifest.files.filter(entry => entry.name !== "result-qwen36.json");
  const seal = JSON.stringify({ synthetic: true });
  const recovery = JSON.stringify({ sourceSeal: sha(seal), powerRestored: true, unloaded: true, failure: null });
  for (const [name, value] of [["seal.json", seal], ["recovery.json", recovery]]) {
    writeFileSync(path.join(root, name), value, { flag: "wx" });
    manifest.files.push({ name, bytes: Buffer.byteLength(value), sha256: sha(value) });
  }
  const capturePath = path.join(root, "capture-qwen36.jsonl");
  const events = readFileSync(capturePath, "utf8").trim().split("\n").map(JSON.parse);
  events[0].seal = JSON.parse(seal);
  const text = events.map(e => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(capturePath, text);
  const entry = manifest.files.find(item => item.name === "capture-qwen36.jsonl");
  entry.bytes = Buffer.byteLength(text); entry.sha256 = sha(text);
  writeFileSync(file, JSON.stringify(manifest));
  const summary = verifyExport(root);
  assert.equal(summary.summaries[0].runnerResultPresent, false);
  assert.equal(summary.summaries[0].errorCode, "capture-incomplete-no-runner-result");
  assert.equal(summary.summaries[0].cleanupVerified, null);
  assert.equal(summary.restorationEvidence, "recovery.json");
  assert.equal(summary.powerRestored, true);
});
