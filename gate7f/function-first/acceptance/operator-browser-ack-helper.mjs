import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE,
  browserWitnessFromAck, browserWitnessSha256 } from "./browser-witness.mjs";

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const IN_FLIGHT_DETAILS = new Set(["observation", "taskStatus", "notice", "claimedImmediateKill", "boundedDrain"]);
const ORDINARY_DETAILS = new Set(["observation"]);
const BOUNDED_DRAIN = AGENT05_BOUNDED_DRAIN;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function plainObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) throw fail(code);
  return value;
}

function exactKeys(value, allowed, code) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw fail(code);
}

function validObservedAt(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function common(request) {
  if (request?.schemaVersion !== "runaai-m1-browser-checkpoint/v1" || !UUID.test(request.checkpointId ?? "")
      || typeof request.caseId !== "string" || !request.caseId || !SHA256.test(request.runtimeSealSha256 ?? "")) {
    throw fail("browser-ack-helper-request-invalid");
  }
  return {
    schemaVersion: "runaai-m1-browser-checkpoint-ack/v1",
    checkpointId: request.checkpointId,
    caseId: request.caseId,
    runtimeSealSha256: request.runtimeSealSha256
  };
}

function exactUrl(request, url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw fail("browser-ack-helper-url-invalid"); }
  if (url !== `${request.baseUrl}/` || parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1"
      || parsed.pathname !== "/" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw fail("browser-ack-helper-url-invalid");
  }
}

function observation(details) {
  if (details.observation !== undefined
      && (typeof details.observation !== "string" || details.observation.length < 1 || details.observation.length > 2048)) {
    throw fail("browser-ack-helper-observation-invalid");
  }
  return details.observation === undefined ? {} : { observation: details.observation };
}

export function buildBrowserAck({ mode, request, url, actual = null, details = {}, observedAt }) {
  if (!['preparation', 'graded'].includes(mode)) throw fail("browser-ack-helper-mode-invalid");
  plainObject(request, "browser-ack-helper-request-invalid");
  plainObject(details, "browser-ack-helper-details-invalid");
  if (!validObservedAt(observedAt)) throw fail("browser-ack-helper-observed-at-invalid");
  exactUrl(request, url);
  const base = common(request);

  if (mode === "preparation") {
    exactKeys(details, ORDINARY_DETAILS, "browser-ack-helper-details-invalid");
    if (request.preparationOnly !== true || request.reusePreparedBrowser !== false
        || !Array.isArray(request.checks) || request.checks.length !== 0 || !request.scope) {
      throw fail("browser-ack-helper-preparation-request");
    }
    const data = {
      scope: request.scope,
      url,
      observedAt,
      projectName: request.projectName,
      taskObjective: request.taskObjective,
      ...observation(details)
    };
    return {
      ...base,
      preparedScope: request.scope,
      evidence: [{
        id: `${request.checkpointId}-actual-browser-preparation`,
        source: "browser",
        kind: "browser-preparation",
        data
      }],
      checks: []
    };
  }

  if (request.preparationOnly === true || !Array.isArray(request.checks) || request.checks.length !== 1) {
    throw fail("browser-ack-helper-graded-request");
  }
  const check = request.checks[0];
  if (!check || typeof check.checkId !== "string" || typeof check.kind !== "string") {
    throw fail("browser-ack-helper-graded-request");
  }
  const id = `${request.checkpointId}-actual-browser`;

  if (request.reusePreparedBrowser === true) {
    exactKeys(details, IN_FLIGHT_DETAILS, "browser-ack-helper-in-flight-details-invalid");
    const scope = plainObject(request.scope, "browser-ack-helper-in-flight-request");
    if (request.caseId !== "agent-05-cancel-drain" || request.bootstrap !== null
        || !UUID.test(request.preparationCheckpointId ?? "") || !validObservedAt(request.cancellationAt)
        || check.kind !== "ui.claimedImmediateKill" || actual !== false
        || details.taskStatus !== "cancelled" || details.notice !== AGENT05_BOUNDED_DRAIN_NOTICE
        || details.claimedImmediateKill !== false || !isDeepStrictEqual(details.boundedDrain, BOUNDED_DRAIN)) {
      throw fail("browser-ack-helper-in-flight-request");
    }
    const data = {
      checkId: check.checkId,
      actual: false,
      scope,
      url,
      observedAt,
      projectName: request.projectName,
      projectId: request.projectId,
      taskId: request.taskId,
      experience: request.experience,
      taskStatus: details.taskStatus,
      cancellationAt: request.cancellationAt,
      notice: details.notice,
      claimedImmediateKill: details.claimedImmediateKill,
      boundedDrain: details.boundedDrain,
      ...observation(details)
    };
    return {
      ...base,
      preparedScope: scope,
      preparationCheckpointId: request.preparationCheckpointId,
      cancellationAt: request.cancellationAt,
      evidence: [{ id, source: "browser", kind: check.kind, data }],
      checks: [{ checkId: check.checkId, kind: check.kind, actual: false,
        evidenceRefs: [{ id, pointer: "/actual" }] }]
    };
  }

  exactKeys(details, ORDINARY_DETAILS, "browser-ack-helper-details-invalid");
  const data = {
    checkId: check.checkId,
    actual,
    url,
    observedAt,
    projectName: request.projectName,
    ...observation(details)
  };
  return {
    ...base,
    evidence: [{ id, source: "browser", kind: check.kind, data }],
    checks: [{ checkId: check.checkId, kind: check.kind, actual,
      evidenceRefs: [{ id, pointer: "/actual" }] }]
  };
}

function decodeJson(value, code) {
  try { return JSON.parse(Buffer.from(value, "base64").toString("utf8")); }
  catch { throw fail(code); }
}

export function writeCreateOnly(path, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  if (bytes.byteLength > 262144) throw fail("browser-ack-helper-output-too-large");
  const handle = openSync(path, "wx", 0o600);
  try { writeSync(handle, bytes); fsyncSync(handle); } finally { closeSync(handle); }
  return bytes.byteLength;
}

export async function publishBrowserObservation(request, value, fetchImplementation = fetch) {
  const endpoint = request.observationEndpoint;
  if (endpoint === null || endpoint === undefined) return false;
  if (endpoint.schemaVersion !== "runaai-m1-browser-observation-endpoint/v2"
      || endpoint.ackUrl !== `${request.baseUrl}/__acceptance/browser-observation-ack`
      || endpoint.witnessUrl !== `${request.baseUrl}/__acceptance/browser-observation-witness`
      || !/^[a-f0-9]{64}$/u.test(endpoint.ackToken ?? "") || !/^[a-f0-9]{64}$/u.test(endpoint.witnessToken ?? "")
      || !Number.isFinite(Date.parse(endpoint.witnessExpiresAt)) || !Number.isFinite(Date.parse(endpoint.publishExpiresAt))) {
    throw fail("browser-ack-helper-observation-endpoint-invalid");
  }
  let witnessSha256;
  try { witnessSha256 = browserWitnessSha256(browserWitnessFromAck(value)); }
  catch { throw fail("browser-ack-helper-observation-endpoint-invalid"); }
  let response;
  try { response = await fetchImplementation(endpoint.ackUrl, { method: "POST", redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkpointId: request.checkpointId, token: endpoint.ackToken, witnessSha256, ack: value }) }); }
  catch { throw fail("browser-ack-helper-observation-publication-failed"); }
  if (response.status !== 204) throw fail("browser-ack-helper-observation-publication-failed");
  return true;
}

async function main() {
  const [mode, requestPath, outputPath, url, actualBase64, detailsBase64, observedAt] = process.argv.slice(2);
  if (!mode || !requestPath || !outputPath || !url || !actualBase64 || !detailsBase64 || !observedAt) {
    throw fail("browser-ack-helper-arguments");
  }
  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  const actual = decodeJson(actualBase64, "browser-ack-helper-actual-invalid");
  const details = decodeJson(detailsBase64, "browser-ack-helper-details-invalid");
  const value = buildBrowserAck({ mode, request, url, actual, details, observedAt });
  const livePublished = await publishBrowserObservation(request, value);
  const bytes = writeCreateOnly(outputPath, value);
  process.stdout.write(JSON.stringify({ schemaVersion: "runaai-m1-browser-ack-publication/v2",
    checkpointId: request.checkpointId, mode, observedAt, bytes, livePublished }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => {
  process.stderr.write(`${error?.code ?? "browser-ack-helper-failed"}\n`); process.exitCode = 1;
});
