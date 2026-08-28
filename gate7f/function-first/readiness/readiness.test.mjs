import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { MANIFEST } from "./manifest.mjs";
import { CONDITIONS, PROMPT, requestFor, contextPrompt } from "./cases.mjs";
test("matched compatible A/B differs only in declared API reasoning control", () => {
  const a = requestFor("synthetic", CONDITIONS[1]), b = requestFor("synthetic", CONDITIONS[2]);
  assert.equal(b.reasoning_effort, "none"); delete b.reasoning_effort; assert.deepEqual(a, b);
  assert.ok(a.messages[1].content.endsWith("/no_think"));
});
test("native request is explicitly non-storing and has no integrations", () => {
  const native = requestFor("synthetic", CONDITIONS[3]);
  assert.equal(native.store, false); assert.deepEqual(native.integrations, []);
  assert.equal(native.reasoning, "off"); assert.equal(native.input, `${PROMPT}\n/no_think`);
});
test("three exact artifacts stay separate and MTP cannot silently substitute the base artifact", () => {
  assert.equal(MANIFEST.candidates.length, 3); assert.equal(MANIFEST.candidates[0].bytes, 17106773120);
  assert.equal(MANIFEST.candidates[0].mtp, true);
  assert.ok(MANIFEST.candidates.every(c => /^[a-f0-9]{64}$/.test(c.sha256) && /^[a-f0-9]{64}$/.test(c.templateSha256)));
  assert.equal(new Set(MANIFEST.candidates.map(c => c.artifactPath)).size, 3);
});
test("short diagnostic deadlines, hardware cutoffs and context ladder are prospectively bounded", () => {
  assert.equal(MANIFEST.requestDeadlineMs, 30000); assert.equal(MANIFEST.lateDiagnosticDeadlineMs, 120000);
  assert.equal(MANIFEST.maximumOutputTokens, 512); assert.equal(MANIFEST.telemetryIntervalMs, 5000);
  assert.equal(MANIFEST.hardware.temperatureCutoffC, 85); assert.equal(MANIFEST.hardware.gpuPowerLimitWatts, 160);
  assert.equal(MANIFEST.hardware.originalPowerLimitWatts, 260);
  assert.ok(contextPrompt(250).length < contextPrompt(750).length);
  assert.ok(contextPrompt(1400).length < 200000);
});
test("runner has mandatory exact package/residency checks and finally-owned-instance cleanup", () => {
  const source = readFileSync(new URL("./runner.mjs", import.meta.url), "utf8");
  assert.match(source, /package-drift/); assert.match(source, /unowned-residency/); assert.match(source, /finally \{/);
  assert.match(source, /instance_id: instance/); assert.match(source, /cleanup-ownership/);
  assert.doesNotMatch(source, /unloadAll|nvidia-smi.*-pl|Set-Acl|prepare-system-drive|download/);
  assert.match(source, /serverCancellationAcknowledged: false/);
});
test("source syntax parses without making a model call", () => {
  const result = spawnSync(process.execPath, ["--check", new URL("./runner.mjs", import.meta.url).pathname.replace(/^\//, "")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
