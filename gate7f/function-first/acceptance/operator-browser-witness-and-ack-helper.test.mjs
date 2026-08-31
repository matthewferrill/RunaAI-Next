import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE } from "./browser-witness.mjs";
import { publishBrowserWitnessAndAck } from "./operator-browser-witness-and-ack-helper.mjs";

const checkpointId = "11111111-2222-4333-8444-555555555555";
const runtimeSealSha256 = "a".repeat(64);
const baseUrl = "http://127.0.0.1:54326";
const witnessExpiresAt = new Date(Date.now() + 60_000).toISOString();
const publishExpiresAt = new Date(Date.now() + 120_000).toISOString();
const witnessToken = "b".repeat(64), ackToken = "c".repeat(64);
const scope = { principalId: "p", projectId: "project", taskId: "task", experience: "code", sessionSha256: "d".repeat(64) };
const checkId = "agent-05-cancel-drain/case/12:ui.claimedImmediateKill";
const ticket = { schemaVersion: "runaai-m1-browser-witness-publication/v1", checkpointId,
  caseId: "agent-05-cancel-drain", stage: "in-flight", baseUrl,
  witnessUrl: `${baseUrl}/__acceptance/browser-observation-witness`, witnessToken, witnessExpiresAt };
const request = { schemaVersion: "runaai-m1-browser-checkpoint/v1", checkpointId,
  caseId: "agent-05-cancel-drain", runtimeSealSha256, baseUrl, preparationOnly: false,
  reusePreparedBrowser: true, bootstrap: null, preparationCheckpointId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  cancellationAt: new Date(Date.now() - 1000).toISOString(), scope, projectName: "foxtail-cancel",
  projectId: scope.projectId, taskId: scope.taskId, experience: scope.experience,
  checks: [{ checkId, kind: "ui.claimedImmediateKill" }], observationEndpoint: {
    schemaVersion: "runaai-m1-browser-observation-endpoint/v2",
    witnessUrl: ticket.witnessUrl, witnessToken, witnessExpiresAt,
    ackUrl: `${baseUrl}/__acceptance/browser-observation-ack`, ackToken, publishExpiresAt } };
const details = { observation: "Actual browser displayed bounded drain.", taskStatus: "cancelled",
  notice: AGENT05_BOUNDED_DRAIN_NOTICE, claimedImmediateKill: false, boundedDrain: AGENT05_BOUNDED_DRAIN };
const observedWitness = { boundedDrain: AGENT05_BOUNDED_DRAIN, claimedImmediateKill: false,
  notice: AGENT05_BOUNDED_DRAIN_NOTICE, taskStatus: "cancelled" };

test("publishes actual-browser witness before its bound acknowledgement", async () => {
  const calls = [];
  const fetchImplementation = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { status: 204 };
  };
  const result = await publishBrowserWitnessAndAck({ ticket, request, url: `${baseUrl}/`, actual: false,
    details, observedWitness, observedAt: new Date().toISOString(), fetchImplementation });
  assert.equal(result.livePublished, true);
  assert.deepEqual(calls.map(value => value.url), [ticket.witnessUrl, request.observationEndpoint.ackUrl]);
  assert.equal(calls[0].body.checkpointId, checkpointId);
  assert.equal(calls[1].body.witnessSha256, result.witnessSha256);
});

test("rejects a ticket that is not bound to the checkpoint request before network use", async () => {
  let called = false;
  await assert.rejects(publishBrowserWitnessAndAck({ ticket: { ...ticket, checkpointId: "99999999-2222-4333-8444-555555555555" },
    request, url: `${baseUrl}/`, actual: false, details, observedWitness, observedAt: new Date().toISOString(),
    fetchImplementation: async () => { called = true; return { status: 204 }; } }),
  /browser-witness-ack-helper-binding-invalid/u);
  assert.equal(called, false);
});

test("rejects a non-canonical observation before network use", async () => {
  let called = false;
  await assert.rejects(publishBrowserWitnessAndAck({ ticket, request, url: `${baseUrl}/`, actual: false, details,
    observedWitness: { ...observedWitness, taskStatus: "completed" }, observedAt: new Date().toISOString(),
    fetchImplementation: async () => { called = true; return { status: 204 }; } }),
  /browser-witness-ack-helper-observation-invalid/u);
  assert.equal(called, false);
});

test("does not publish an acknowledgement when witness publication fails", async () => {
  const calls = [];
  const isolatedTicket = { ...ticket, checkpointId: "77777777-2222-4333-8444-555555555555", witnessToken: "e".repeat(64) };
  const isolatedRequest = { ...request, checkpointId: isolatedTicket.checkpointId,
    observationEndpoint: { ...request.observationEndpoint, witnessToken: isolatedTicket.witnessToken } };
  await assert.rejects(publishBrowserWitnessAndAck({ ticket: isolatedTicket, request: isolatedRequest,
    url: `${baseUrl}/`, actual: false,
    details, observedWitness, observedAt: new Date().toISOString(), fetchImplementation: async url => {
      calls.push(url); return { status: 409 };
    } }), /browser-witness-helper-publication-failed/u);
  assert.deepEqual(calls, [isolatedTicket.witnessUrl]);
});

test("the combined owner wrapper parses in Windows PowerShell 5 without executing", { skip: process.platform !== "win32" }, () => {
  const file = fileURLToPath(new URL("./Publish-BrowserWitnessAndAck.Remote.ps1", import.meta.url)).replaceAll("'", "''");
  const source = `$errors=$null;[Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$null,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{$_.ToString()};exit 1}`;
  execFileSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand",
      Buffer.from(source, "utf16le").toString("base64")],
    { windowsHide: true, stdio: "pipe", env: { ...process.env,
      PSModulePath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules" } });
});

test("browser witness wrappers admit only full campaigns or the exact Qwen supplemental shape", () => {
  for (const name of ["Publish-BrowserWitness.Remote.ps1", "Publish-BrowserWitnessAndAck.Remote.ps1"]) {
    const source = readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
    const pattern = source.match(/ValidatePattern\('([^']+)'\)\]\[string\]\$CampaignDirectory/u)?.[1];
    assert.ok(pattern, `${name}: missing campaign-directory validation`);
    const allowed = new RegExp(pattern, "u");
    assert.equal(allowed.test(`campaign-qwen36-27b-mtp-${"a".repeat(16)}`), true);
    assert.equal(allowed.test(`supplemental-qwen36-27b-mtp-${"a".repeat(16)}-${"b".repeat(12)}`), true);
    assert.equal(allowed.test(`supplemental-gemma4-26b-a4b-${"a".repeat(16)}-${"b".repeat(12)}`), false);
    assert.equal(allowed.test(`supplemental-qwen36-27b-mtp-${"a".repeat(16)}-${"b".repeat(11)}`), false);
    assert.equal(allowed.test(`../supplemental-qwen36-27b-mtp-${"a".repeat(16)}-${"b".repeat(12)}`), false);
    assert.match(source, /StartsWith\(\('supplemental-qwen36-27b-mtp-' \+ \$ExpectedRuntimeSeal\.Substring\(0, 16\) \+ '-'\)/u,
      `${name}: supplemental runtime-seal prefix is not position-bound`);
    assert.match(source, /\$CampaignDirectory\.EndsWith\(\$ExpectedRuntimeSeal\.Substring\(0, 16\)/u,
      `${name}: full-campaign runtime-seal suffix is not retained`);
  }
});
