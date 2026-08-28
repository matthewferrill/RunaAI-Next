import { createServer } from "node:http";
import { once } from "node:events";
import { fail } from "./runner-contract.mjs";

async function bytes(stream, maximum) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > maximum) throw fail("m1-capture-output-limited"); chunks.push(chunk); }
  return Buffer.concat(chunks);
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
  const server = createServer(async (request, response) => {
    const ledger = getLedger?.(); const startedAt = new Date().toISOString(); let body = null;
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    const expected = kind === "provider" ? "/chat/completions" : kind === "embedding" ? "/embeddings" : "/rerank";
    const item = { sequence: (ledger?.observation.provider.calls.length ?? 0) + 1, kind,
      role: ledger?.observation.role ?? null, phase: ledger?.phase ?? "no-case", path, startedAt,
      scope: structuredClone(ledger?.requestScope ?? null) };
    try {
      if (request.method !== "POST" || path !== expected) throw fail("m1-capture-route-denied");
      body = JSON.parse((await bytes(request, 196_608)).toString("utf8")); item.request = body;
      if (kind === "embedding") { item.adapter = "nomic";
        item.operation = body.input?.every(text => typeof text === "string" && text.startsWith("search_query: ")) ? "search" : "index"; }
      if (kind === "reranker") { item.adapter = "explicit-window-bge"; item.operation = "search"; item.windows = body.documents; }
      if (kind !== "reranker" && body.model !== modelId) throw fail("m1-capture-model-mismatch");
      item.modelId = body.model ?? null;
      if (mode !== "scored" || !ledger || ledger.observation.status !== "running") throw fail("m1-inference-not-enabled");
      validateRequest?.(body, ledger.observation.role);
      const upstream = await fetch(`${targetBaseUrl.replace(/\/$/, "")}${expected}`, { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "error",
        signal: AbortSignal.timeout(deadlineMs) });
      const raw = await bytes(upstream.body, maximumBytes);
      item.httpStatus = upstream.status;
      try { item.response = JSON.parse(raw.toString("utf8")); } catch { item.responseText = raw.toString("utf8"); }
      if (kind === "provider" && await faults?.deliverProviderResponse?.({ response, raw, item }) === false) return;
      response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json", "content-length": raw.length });
      response.end(raw);
    } catch (error) {
      item.errorCode = error.code ?? "m1-capture-upstream-failed";
      ledger?.observation.provider.unexpectedCalls.push({ ...item, request: body });
      response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ errorCode: item.errorCode }));
    } finally {
      item.finishedAt = new Date().toISOString();
      if (kind === "provider") ledger?.observation.provider.calls.push(item);
      else ledger?.observation.sources.indexOperations.push(item);
      ledger?.evidence("host-runtime", kind === "provider" ? "transport-provider" : "retrieval-operation", item);
    }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, async close() {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  } };
}

// Qdrant faults happen at a real owned HTTP boundary. The production adapter is
// unchanged; no fake vectors, documents or successful acknowledgements are made.
export async function startOwnedIndexProxy({ targetBaseUrl, collection, getLedger }) {
  const target = new URL(targetBaseUrl);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.pathname !== "/"
      || target.username || target.password || target.search || target.hash || !/^m1_[a-z0-9_]{1,70}$/.test(collection)) throw fail("m1-owned-index-target-invalid");
  const collectionPath = `/collections/${collection}`;
  let unavailable = false;
  const server = createServer(async (request, response) => {
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
        headers: { "content-type": "application/json" }, ...(body ? { body } : {}), redirect: "error", signal: AbortSignal.timeout(10000) });
      const raw = await bytes(upstream.body, 2_000_000); item.httpStatus = upstream.status;
      try { item.response = JSON.parse(raw.toString("utf8")); } catch { item.responseText = raw.toString("utf8"); }
      response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json", "content-length": raw.length }); response.end(raw);
    } catch (error) { item.errorCode = error.code ?? "m1-owned-index-forward-failed";
      response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ errorCode: item.errorCode }));
    } finally { item.finishedAt = new Date().toISOString(); ledger?.observation.sources.indexOperations.push(item);
      ledger?.evidence("host-runtime", "retrieval-operation", item); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { collection, baseUrl: `http://127.0.0.1:${server.address().port}`, setIndexUnavailable(value) { unavailable = value === true; },
    async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); } };
}
