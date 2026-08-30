import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AGENT05_BOUNDED_DRAIN_NOTICE } from "./browser-checkpoint.mjs";
import { browserWitnessFromAck, browserWitnessSha256 } from "./browser-witness.mjs";
import { buildBrowserAck, publishBrowserObservation } from "./operator-browser-ack-helper.mjs";
import { buildBrowserWitnessPublication, publishBrowserWitness } from "./operator-browser-witness-helper.mjs";

const observedAt = "2026-08-29T23:40:05.000Z";
const seal = "a".repeat(64);
const checkpointId = "11111111-2222-4333-8444-555555555555";
const scope = { principalId: "m1-test-fixture", projectId: "project-fixture", taskId: "task-fixture",
  experience: "code", sessionSha256: "b".repeat(64) };
const base = { schemaVersion: "runaai-m1-browser-checkpoint/v1", checkpointId,
  caseId: "control-10-unknown-execution", runtimeSealSha256: seal,
  baseUrl: "http://127.0.0.1:12345", projectName: "fixture-project", projectId: scope.projectId,
  taskId: scope.taskId, taskObjective: "Fixture objective", experience: "code" };
const check = { checkId: "control-10-unknown-execution/case/1:ui.unknownOutcomeHidden",
  kind: "ui.unknownOutcomeHidden", expected: false };
const boundedDrain = { noNewSteps: true, alreadyDispatchedMayFinish: true,
  awaitingReconciliation: true, resultWillBeRetained: true };

test("preparation acknowledgement binds the exact browser scope without grading a check", () => {
  const request = { ...base, caseId: "agent-05-cancel-drain", preparationOnly: true,
    reusePreparedBrowser: false, scope, checks: [] };
  const value = buildBrowserAck({ mode: "preparation", request, url: `${base.baseUrl}/`, observedAt,
    details: { observation: "Task opened before dispatch." } });
  assert.deepEqual(value.preparedScope, scope);
  assert.deepEqual(value.checks, []);
  assert.deepEqual(value.evidence[0].data.scope, scope);
  assert.equal(value.evidence[0].data.observedAt, observedAt);
  assert.equal(value.evidence[0].data.observation, "Task opened before dispatch.");
});

test("ordinary graded acknowledgement cannot override system binding fields", () => {
  const request = { ...base, preparationOnly: false, reusePreparedBrowser: false, scope: null, checks: [check] };
  const value = buildBrowserAck({ mode: "graded", request, url: `${base.baseUrl}/`, observedAt,
    actual: false, details: { observation: "Unknown state stayed visible." } });
  assert.equal(value.evidence[0].data.checkId, check.checkId);
  assert.equal(value.evidence[0].data.actual, false);
  assert.equal(value.evidence[0].data.observedAt, observedAt);
  assert.throws(() => buildBrowserAck({ mode: "graded", request, url: `${base.baseUrl}/`, observedAt,
    actual: false, details: { actual: true } }), /browser-ack-helper-details-invalid/u);
});

test("in-flight acknowledgement carries the authoritative preparation, cancellation and DOM bindings", () => {
  const cancellationAt = "2026-08-29T23:40:00.000Z";
  const request = { ...base, caseId: "agent-05-cancel-drain", preparationOnly: false,
    reusePreparedBrowser: true, bootstrap: null, scope, checks: [{
      checkId: "agent-05-cancel-drain/case/9:ui.claimedImmediateKill",
      kind: "ui.claimedImmediateKill", expected: false }],
    preparationCheckpointId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", cancellationAt };
  const details = { observation: "The bounded drain notice was visible.", taskStatus: "cancelled",
    notice: AGENT05_BOUNDED_DRAIN_NOTICE, claimedImmediateKill: false, boundedDrain };
  const value = buildBrowserAck({ mode: "graded", request, url: `${base.baseUrl}/`, observedAt,
    actual: false, details });
  assert.deepEqual(value.preparedScope, scope);
  assert.equal(value.preparationCheckpointId, request.preparationCheckpointId);
  assert.equal(value.cancellationAt, cancellationAt);
  assert.deepEqual(value.evidence[0].data.scope, scope);
  assert.equal(value.evidence[0].data.taskStatus, "cancelled");
  assert.equal(value.evidence[0].data.notice, AGENT05_BOUNDED_DRAIN_NOTICE);
  assert.deepEqual(value.evidence[0].data.boundedDrain, boundedDrain);
  assert.equal(value.checks[0].actual, false);
  for (const changed of [
    { ...details, taskStatus: "active" },
    { ...details, claimedImmediateKill: true },
    { ...details, boundedDrain: { noNewSteps: true } }
  ]) assert.throws(() => buildBrowserAck({ mode: "graded", request, url: `${base.baseUrl}/`, observedAt,
    actual: false, details: changed }), /browser-ack-helper-in-flight-request/u);
});

test("live witness and acknowledgement publications use separate bound one-time endpoints", async t => {
  const received = []; let calls = 0;
  const server = createServer(async (request, response) => {
    const parts = []; for await (const part of request) parts.push(part);
    calls++; received.push({ url: request.url, body: JSON.parse(Buffer.concat(parts).toString("utf8")) });
    response.writeHead(204); response.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = { ...base, baseUrl, caseId: "agent-05-cancel-drain", stage: "in-flight",
    observationEndpoint: { schemaVersion: "runaai-m1-browser-observation-endpoint/v2",
      witnessUrl: `${baseUrl}/__acceptance/browser-observation-witness`, witnessToken: "e".repeat(64),
      ackUrl: `${baseUrl}/__acceptance/browser-observation-ack`, ackToken: "f".repeat(64),
      witnessExpiresAt: "2026-08-30T12:00:24.000Z", publishExpiresAt: "2026-08-30T12:01:24.000Z" },
    preparationOnly: false, reusePreparedBrowser: true, scope, bootstrap: null,
    preparationCheckpointId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    cancellationAt: "2026-08-30T12:00:00.000Z", checks: [{ ...check,
      checkId: "agent-05-cancel-drain/case/9:ui.claimedImmediateKill", kind: "ui.claimedImmediateKill" }] };
  const details = { observation: "The bounded drain notice was visible.", taskStatus: "cancelled",
    notice: AGENT05_BOUNDED_DRAIN_NOTICE, claimedImmediateKill: false, boundedDrain };
  const ack = buildBrowserAck({ mode: "graded", request, url: `${baseUrl}/`, observedAt,
    actual: false, details });
  const witnessPublication = { schemaVersion: "runaai-m1-browser-witness-publication/v1", checkpointId,
    caseId: request.caseId, stage: request.stage, baseUrl, witnessUrl: request.observationEndpoint.witnessUrl,
    witnessToken: request.observationEndpoint.witnessToken, witnessExpiresAt: new Date(Date.now() + 60_000).toISOString() };
  const publication = buildBrowserWitnessPublication(witnessPublication);
  assert.equal(await publishBrowserWitness(witnessPublication), publication.witnessSha256);
  assert.equal(await publishBrowserObservation(request, ack), true);
  assert.equal(calls, 2); assert.equal(received[0].url, "/__acceptance/browser-observation-witness");
  assert.deepEqual(received[0].body, publication.body);
  assert.equal(received[1].url, "/__acceptance/browser-observation-ack");
  assert.equal(received[1].body.checkpointId, request.checkpointId);
  assert.equal(received[1].body.token, request.observationEndpoint.ackToken); assert.deepEqual(received[1].body.ack, ack);
  assert.equal(received[1].body.witnessSha256, browserWitnessSha256(browserWitnessFromAck(ack)));
  await assert.rejects(publishBrowserObservation({ ...request, observationEndpoint: { ...request.observationEndpoint,
    ackUrl: `${baseUrl}/wrong` } }, ack), /endpoint-invalid/u);
});

test("immediate witness ticket is exact, time-bound and locally one-use before fetch", async () => {
  const baseUrl = "http://127.0.0.1:12345", expires = new Date(Date.now() + 60_000).toISOString();
  const ticket = { schemaVersion: "runaai-m1-browser-witness-publication/v1", checkpointId,
    caseId: "agent-05-cancel-drain", stage: "in-flight", baseUrl,
    witnessUrl: `${baseUrl}/__acceptance/browser-observation-witness`, witnessToken: "1".repeat(64),
    witnessExpiresAt: expires };
  for (const changed of [
    { ...ticket, checkpointId: "wrong" },
    { ...ticket, witnessUrl: `${baseUrl}/wrong` },
    { ...ticket, stage: "before-native-dispatch" },
    { ...ticket, witnessToken: "wrong" },
    { ...ticket, witnessExpiresAt: new Date(Date.now() - 1).toISOString() },
    { ...ticket, extra: true }
  ]) assert.throws(() => buildBrowserWitnessPublication(changed), /browser-witness-helper-request-invalid/u);
  let fetches = 0;
  const fakeFetch = async () => { fetches++; return { status: 204 }; };
  await publishBrowserWitness(ticket, fakeFetch);
  await assert.rejects(publishBrowserWitness(ticket, fakeFetch), /browser-witness-helper-ticket-replayed/u);
  assert.equal(fetches, 1);
});

test("the CLI writes one fsynced create-only acknowledgement from base64 inputs", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "runa-browser-ack-helper-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const requestPath = path.join(directory, "request.json"), outputPath = path.join(directory, "browser-ack.json");
  const request = { ...base, preparationOnly: false, reusePreparedBrowser: false, scope: null, checks: [check] };
  await writeFile(requestPath, JSON.stringify(request));
  const helper = fileURLToPath(new URL("./operator-browser-ack-helper.mjs", import.meta.url));
  const actual = Buffer.from("false", "utf8").toString("base64");
  const details = Buffer.from(JSON.stringify({ observation: "Unknown state stayed visible." }), "utf8").toString("base64");
  execFileSync(process.execPath, [helper, "graded", requestPath, outputPath, `${base.baseUrl}/`, actual, details, observedAt],
    { windowsHide: true, stdio: "pipe" });
  const value = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(value.evidence[0].data.actual, false);
  assert.throws(() => execFileSync(process.execPath,
    [helper, "graded", requestPath, outputPath, `${base.baseUrl}/`, actual, details, observedAt],
    { windowsHide: true, stdio: "pipe" }));
});

test("the owner wrapper parses in Windows PowerShell 5 without executing", { skip: process.platform !== "win32" }, () => {
  const file = fileURLToPath(new URL("./Write-BrowserAck.Remote.ps1", import.meta.url)).replaceAll("'", "''");
  const source = `$errors=$null;[Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$null,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{$_.ToString()};exit 1}`;
  execFileSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand",
      Buffer.from(source, "utf16le").toString("base64")],
    { windowsHide: true, stdio: "pipe", env: { ...process.env,
      PSModulePath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules" } });
});
