import { createServer } from "node:http";
import { once } from "node:events";
import { fail, sha256 } from "./runner-contract.mjs";

export const HEALTH_CAPTURE_LIMITS = Object.freeze({ deadlineMs: 2000, maximumBytes: 65_536, maximumRecords: 1024, maximumJournalBodyBytes: 8_388_608 });
const healthRoutes = Object.freeze({ embedding: "/models", reranker: "/health" });
const providerPurposes = Object.freeze({
  "runa2-model-answer-input/v2": "primary-answer",
  "runa2-evidence-response-verification/v1": "evidence-checker",
  "runa2-code-response-verification/v2": "code-checker",
  "runaai-m1-planner-input/v2": "initial-plan",
  "runaai-m1-plan-protocol-correction/v1": "plan-correction",
  "runaai-m1-read-only-plan-grounding-review/v1": "read-only-plan-review",
});
function providerPurpose(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const users = messages.filter(message => message?.role === "user" && typeof message.content === "string");
  if (users.length !== 1) return "unclassified";
  try {
    const payload = JSON.parse(users[0].content);
    return providerPurposes[payload?.schemaVersion] ?? "unclassified";
  } catch { return "unclassified"; }
}
const exactHealthRead = (kind, request) => request.method === "GET" && healthRoutes[kind]
  && request.url === healthRoutes[kind] && !request.headers["transfer-encoding"]
  && (!request.headers["content-length"] || request.headers["content-length"] === "0");

async function bytes(stream, maximum) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > maximum) throw fail("m1-capture-output-limited"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

function managedServer(handler) {
  const active = new Set(); let closing = false, closePromise = null;
  const server = createServer((request, response) => {
    if (closing) { response.writeHead(503); response.end(); return; }
    const controller = new AbortController(), entry = { controller, promise: null };
    const disconnected = () => { if (!response.writableFinished) controller.abort(); };
    response.once("close", disconnected); request.once("aborted", disconnected);
    active.add(entry);
    entry.promise = Promise.resolve().then(() => handler(request, response, controller.signal))
      .catch(() => { if (!response.destroyed) response.destroy(); })
      .finally(() => { active.delete(entry); response.off("close", disconnected); request.off("aborted", disconnected); });
  });
  async function drain({ maximumMs = 5000 } = {}) {
    if (!Number.isInteger(maximumMs) || maximumMs < 1 || maximumMs > 120000) throw fail("m1-transport-drain-budget-invalid");
    const deadline = Date.now() + maximumMs;
    while (active.size) {
      const remaining = deadline - Date.now(); if (remaining <= 0) throw fail("m1-transport-undrained");
      let timer;
      try { await Promise.race([Promise.allSettled([...active].map(entry => entry.promise)),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(fail("m1-transport-undrained")), remaining); })]); }
      finally { clearTimeout(timer); }
    }
    return { activeCount: 0 };
  }
  return { server, drain, get activeCount() { return active.size; }, close() {
    if (closePromise) return closePromise;
    closing = true;
    for (const entry of active) entry.controller.abort();
    closePromise = (async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); await drain(); })();
    return closePromise;
  } };
}

// Transparent owned capture/denial proxy. It does not synthesize a successful model
// response, normalize a model ID, retry or insert expected answers. Controls mode
// categorically forbids model/embedding/reranker inference and records every attempt.
export async function startCaptureTransport({ mode, targetBaseUrl, modelId, kind = "provider", getLedger,
  maximumBytes = 2_000_000, deadlineMs = 120_000, validateRequest = null, faults = null }) {
  if (!["controls", "scored"].includes(mode) || !["provider", "embedding", "reranker"].includes(kind)) throw fail("m1-capture-mode-invalid");
  const target = new URL(targetBaseUrl);
  if (target.protocol !== "http:" || !["127.0.0.1", "192.168.50.165", "192.168.50.169"].includes(target.hostname)
      || target.username || target.password || target.search || target.hash) throw fail("m1-capture-target-invalid");
  const healthCalls = []; let healthOverflows = 0, healthJournalBodyBytes = 0;
  const managed = managedServer(async (request, response, signal) => {
    const ledger = getLedger?.(); const startedAt = new Date().toISOString(); let body = null;
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    // These two fixed application health reads are not inference, retrieval or
    // model-role evidence. Unknown methods/targets still take the denial path.
    if (exactHealthRead(kind, request)) {
      if (healthCalls.length >= HEALTH_CAPTURE_LIMITS.maximumRecords) {
        healthOverflows++;
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ errorCode: "m1-health-capture-limited" })); return;
      }
      const item = { sequence: healthCalls.length + 1, category: "health", kind, method: "GET", path,
        phase: ledger?.phase ?? "no-case", startedAt, upstreamContacted: false, inference: false };
      // Reserve before awaiting so concurrent reads share the same finite cap.
      healthCalls.push(item);
      try {
        if (mode !== "scored") throw fail("m1-health-disabled-in-controls");
        item.upstreamContacted = true;
        const upstream = await fetch(`${targetBaseUrl.replace(/\/$/, "")}${healthRoutes[kind]}`, {
          method: "GET", headers: { accept: "application/json" }, redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(HEALTH_CAPTURE_LIMITS.deadlineMs)]) });
        const raw = await bytes(upstream.body, HEALTH_CAPTURE_LIMITS.maximumBytes);
        item.httpStatus = upstream.status;
        item.responseBytes = raw.length; item.responseSha256 = sha256(raw);
        let retained;
        try { retained = { response: JSON.parse(raw.toString("utf8")) }; } catch { retained = { responseText: raw.toString("utf8") }; }
        // Count the exported JSON bytes, not only upstream bytes: control
        // characters in a non-JSON health body expand when JSON-escaped.
        const retainedBytes = Buffer.byteLength(JSON.stringify(retained));
        if (healthJournalBodyBytes + retainedBytes <= HEALTH_CAPTURE_LIMITS.maximumJournalBodyBytes) {
          healthJournalBodyBytes += retainedBytes;
          Object.assign(item, retained);
        } else item.responseOmitted = "bounded-journal-body-budget";
        response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json", "content-length": raw.length });
        response.end(raw);
      } catch (error) {
        item.errorCode = error.code === "m1-health-disabled-in-controls" ? error.code
          : error.code === "m1-capture-output-limited" ? "m1-health-output-limited" : "m1-health-upstream-failed";
        if (!response.destroyed && !response.headersSent) {
          response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ errorCode: item.errorCode }));
        }
      } finally {
        item.finishedAt = new Date().toISOString();
        // Never append late background health traffic to an already exported
        // attempt. The bounded transport journal still retains the observation.
        if (ledger?.observation.status === "running") {
          ledger.observation.health ??= { calls: [] };
          ledger.observation.health.calls.push(structuredClone(item));
          ledger.evidence("host-runtime", "auxiliary-health-observation", item);
        }
      }
      return;
    }
    const expected = kind === "provider" ? "/chat/completions" : kind === "embedding" ? "/embeddings" : "/rerank";
    const item = { sequence: (ledger?.observation.provider.calls.length ?? 0) + 1, kind,
      role: ledger?.observation.role ?? null, phase: ledger?.phase ?? "no-case", path, startedAt,
      scope: structuredClone(ledger?.requestScope ?? null), ...(kind === "provider" ? { purpose: "unclassified" } : {}) };
    try {
      if (request.method !== "POST" || request.url !== expected) throw fail("m1-capture-route-denied");
      body = JSON.parse((await bytes(request, 196_608)).toString("utf8")); item.request = body;
      if (kind === "provider") item.purpose = providerPurpose(body);
      if (kind === "embedding") { item.adapter = "nomic";
        item.operation = body.input?.every(text => typeof text === "string" && text.startsWith("search_query: ")) ? "search" : "index"; }
      if (kind === "reranker") { item.adapter = "explicit-window-bge"; item.operation = "search"; item.windows = body.documents; }
      if (kind !== "reranker" && body.model !== modelId) throw fail("m1-capture-model-mismatch");
      item.modelId = body.model ?? null;
      if (mode !== "scored" || !ledger || ledger.observation.status !== "running") throw fail("m1-inference-not-enabled");
      validateRequest?.(body, ledger.observation.role);
      const upstream = await fetch(`${targetBaseUrl.replace(/\/$/, "")}${expected}`, { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(deadlineMs)]) });
      const raw = await bytes(upstream.body, maximumBytes);
      item.httpStatus = upstream.status;
      try { item.response = JSON.parse(raw.toString("utf8")); } catch { item.responseText = raw.toString("utf8"); }
      if (kind === "provider" && await faults?.deliverProviderResponse?.({ response, raw, item }) === false) return;
      response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json", "content-length": raw.length });
      response.end(raw);
    } catch (error) {
      item.errorCode = error.code ?? "m1-capture-upstream-failed";
      ledger?.observation.provider.unexpectedCalls.push({ ...item, request: body });
      if (!response.destroyed && !response.headersSent) { response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ errorCode: item.errorCode })); }
    } finally {
      item.finishedAt = new Date().toISOString();
      if (kind === "provider") ledger?.observation.provider.calls.push(item);
      else ledger?.observation.sources.indexOperations.push(item);
      ledger?.evidence("host-runtime", kind === "provider" ? "transport-provider" : "retrieval-operation", item);
    }
  });
  const { server } = managed;
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, drain: managed.drain,
    get healthCalls() { return structuredClone(healthCalls); }, get healthOverflows() { return healthOverflows; },
    get activeCount() { return managed.activeCount; }, close: managed.close };
}

// Called after transport close/drain. Outside-attempt health remains ungraded
// diagnostics, but is not silently discarded when a batch/control host closes.
export function healthCaptureDiagnostics(transports) {
  return { schemaVersion: "runaai-m1-health-capture-diagnostics/v1", category: "ungraded-health",
    limits: HEALTH_CAPTURE_LIMITS, modelRoleCredit: false, inferenceCredit: false,
    transports: Object.fromEntries(["provider", "embedding", "reranker"].map(kind => [kind, {
      calls: transports?.[kind]?.healthCalls ?? [], overflowCount: transports?.[kind]?.healthOverflows ?? 0,
      activeCount: transports?.[kind]?.activeCount ?? 0,
    }])) };
}

// Qdrant faults happen at a real owned HTTP boundary. The production adapter is
// unchanged; no fake vectors, documents or successful acknowledgements are made.
export async function startOwnedIndexProxy({ targetBaseUrl, collection, getLedger }) {
  const target = new URL(targetBaseUrl);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.pathname !== "/"
      || target.username || target.password || target.search || target.hash || !/^m1_[a-z0-9_]{1,70}$/.test(collection)) throw fail("m1-owned-index-target-invalid");
  const collectionPath = `/collections/${collection}`;
  let unavailable = false;
  const managed = managedServer(async (request, response, signal) => {
    const ledger = getLedger?.(), url = new URL(request.url, "http://127.0.0.1");
    const item = { adapter: "qdrant", operation: url.pathname.endsWith("/points/query") ? "search" : "index",
      phase: ledger?.phase ?? "setup", path: url.pathname, method: request.method, startedAt: new Date().toISOString() };
    try {
      const routeAllowed = (request.method === "GET" && ["/readyz", collectionPath].includes(url.pathname))
        || (request.method === "PUT" && [collectionPath, `${collectionPath}/points`].includes(url.pathname))
        || (request.method === "POST" && url.pathname === `${collectionPath}/points/query`);
      if (!routeAllowed || (url.search && !(url.pathname === `${collectionPath}/points` && url.search === "?wait=true"))) throw fail("m1-owned-index-route-denied");
      const body = request.method === "GET" ? undefined : await bytes(request, 196608);
      item.request = body ? JSON.parse(body.toString("utf8")) : null;
      if (item.operation === "search") {
        item.references = (item.request?.filter?.should ?? []).map(group => Object.fromEntries((group.must ?? []).map(term => [term.key, term.match?.value])));
      }
      if (unavailable) throw fail("m1-owned-index-unavailable");
      const upstream = await fetch(`${targetBaseUrl}${url.pathname}${url.search}`, { method: request.method,
        headers: { "content-type": "application/json" }, ...(body ? { body } : {}), redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      const raw = await bytes(upstream.body, 2_000_000); item.httpStatus = upstream.status;
      try { item.response = JSON.parse(raw.toString("utf8")); } catch { item.responseText = raw.toString("utf8"); }
      response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json", "content-length": raw.length }); response.end(raw);
    } catch (error) { item.errorCode = error.code ?? "m1-owned-index-forward-failed";
      if (!response.destroyed && !response.headersSent) { response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ errorCode: item.errorCode })); }
    } finally { item.finishedAt = new Date().toISOString(); ledger?.observation.sources.indexOperations.push(item);
      ledger?.evidence("host-runtime", "retrieval-operation", item); }
  });
  const { server } = managed;
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { collection, baseUrl: `http://127.0.0.1:${server.address().port}`, setIndexUnavailable(value) { unavailable = value === true; },
    drain: managed.drain, get activeCount() { return managed.activeCount; }, close: managed.close };
}
