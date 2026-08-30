import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const submitScript = `const form=document.querySelector('form');form.addEventListener('submit',async event=>{event.preventDefault();const output=document.querySelector('[role=status]'),button=form.querySelector('button');button.disabled=true;output.textContent='Starting synthetic session…';try{const response=await fetch('/__acceptance/session',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form))});if(!response.ok)throw new Error('denied');location.assign('/');}catch{output.textContent='Synthetic session was not started. Check the one-time nonce or request a new test checkpoint.';button.disabled=false;}});`;

// Test-only wrapper around the *unchanged* shipped request listener. This is not
// an OIDC bypass in the application or a production-configurable endpoint.
export function withSyntheticBootstrap(shippedServer, { identities, getLedger }) {
  const handlers = shippedServer.listeners("request"), pending = new Map(), browserObservations = new Map();
  const counters = { get: 0, post: 0, issued: 0, denied: 0, browserObservationAccepted: 0, browserObservationDenied: 0 };
  if (handlers.length !== 1) throw new Error("m1-bootstrap-listener-contract");
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/__acceptance/bootstrap-status") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return response.end(JSON.stringify({ schemaVersion: "runaai-m1-bootstrap-counts/v1", ...counters, privateValuesIncluded: false }));
    }
    if (request.method === "GET" && url.pathname === "/__acceptance/bootstrap.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" }); return response.end(submitScript);
    }
    if (url.pathname === "/__acceptance/browser-observation") {
      response.setHeader("cache-control", "no-store");
      try {
        const remote = request.socket.remoteAddress;
        if (request.method !== "POST" || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) throw new Error("denied");
        let raw = ""; for await (const part of request) { raw += part.toString("utf8"); if (Buffer.byteLength(raw) > 262144) throw new Error("denied"); }
        const body = JSON.parse(raw), entry = browserObservations.get(body?.checkpointId);
        if (!entry || entry.ackRaw !== null || entry.expiresAtMs < Date.now()
            || !/^[a-f0-9]{64}$/.test(body?.token ?? "") || body.token.length !== entry.token.length
            || !timingSafeEqual(Buffer.from(body.token), Buffer.from(entry.token))
            || !body.ack || typeof body.ack !== "object" || Array.isArray(body.ack)) throw new Error("denied");
        const ackRaw = JSON.stringify(body.ack);
        if (Buffer.byteLength(ackRaw) > 262144) throw new Error("denied");
        entry.ackRaw = ackRaw; entry.receivedAtMs = Date.now(); counters.browserObservationAccepted++;
        getLedger()?.evidence("application", "browser-observation-received", { checkpointId: body.checkpointId,
          receivedAt: new Date(entry.receivedAtMs).toISOString(), loopbackOnly: true, oneTimeTokenConsumed: true });
        response.writeHead(204); return response.end();
      } catch {
        counters.browserObservationDenied++;
        response.writeHead(403, { "content-type": "application/json" });
        return response.end('{"errorCode":"m1-browser-observation-denied"}');
      }
    }
    if (url.pathname !== "/__acceptance/session") return handlers[0](request, response);
    response.setHeader("cache-control", "no-store"); response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'");
    if (request.method === "GET") {
      counters.get++;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return response.end("<!doctype html><title>Synthetic Runa acceptance session</title><h1>Isolated acceptance only</h1><p>This creates a synthetic account session, not an owner or production login.</p><form method='post' action='/__acceptance/session'><label>One-time test nonce <input name='nonce' type='text' autocomplete='off' spellcheck='false' required></label><button type='submit'>Start synthetic session</button></form><p role='status'></p><script src='/__acceptance/bootstrap.js' defer></script>");
    }
    try {
      if (request.method === "POST") counters.post++;
      getLedger()?.evidence("application", "synthetic-bootstrap-request", { method: request.method, originMatched: request.headers.origin === identities.publicBaseUrl });
      if (request.method !== "POST" || request.headers.origin !== identities.publicBaseUrl) throw new Error("denied");
      let raw = ""; for await (const part of request) { raw += part.toString("utf8"); if (Buffer.byteLength(raw) > 256) throw new Error("denied"); }
      const nonce = new URLSearchParams(raw).get("nonce");
      if (!/^[a-f0-9]{64}$/.test(nonce ?? "")) throw new Error("denied");
      const match = [...pending.entries()].find(([key]) => timingSafeEqual(Buffer.from(key), Buffer.from(nonce)));
      if (!match || match[1].expiresAt <= Date.now()) throw new Error("denied");
      pending.delete(match[0]);
      const retained = match[1].sessionId;
      const session = retained ? { ...await identities.participant(retained), sessionId: retained } : await identities.issue(match[1].principalId);
      if (session.principalId !== match[1].principalId) throw new Error("denied");
      counters.issued++;
      getLedger()?.evidence("browser", "synthetic-session-bootstrap", { principalId: session.principalId, issued: true,
        oneTimeNonceConsumed: true, sameSessionReattached: Boolean(retained), sessionCookieExposedToScript: false, productionIdentityUsed: false });
      response.writeHead(303, { location: "/", "set-cookie": `__Host-runa_user_session=${session.sessionId}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax` });
      return response.end();
    } catch { counters.denied++; getLedger()?.evidence("application", "synthetic-bootstrap-denied", { method: request.method, counters: { ...counters } });
      response.writeHead(403, { "content-type": "application/json" }); response.end('{"errorCode":"m1-synthetic-bootstrap-denied"}'); }
  });
  return { server, async createBootstrap(principalId, { session = null } = {}) {
    if (!/^m1-test-[a-f0-9]{24,64}$/.test(principalId) || pending.size >= 8) throw new Error("m1-bootstrap-scope-invalid");
    if (session && (session.principalId !== principalId || (await identities.participant(session.sessionId)).principalId !== principalId)) throw new Error("m1-bootstrap-session-mismatch");
    const nonce = randomBytes(32).toString("hex"); pending.set(nonce, { principalId, sessionId: session?.sessionId ?? null, expiresAt: Date.now() + 300000 });
    return { url: `${identities.publicBaseUrl}/__acceptance/session`, nonce, expiresInSeconds: 300 };
  }, createBrowserObservation(checkpointId, expiresAtMs) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(checkpointId)
        || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() || browserObservations.size >= 8) throw new Error("m1-browser-observation-scope-invalid");
    const token = randomBytes(32).toString("hex");
    browserObservations.set(checkpointId, { token, expiresAtMs, ackRaw: null, receivedAtMs: null });
    return { schemaVersion: "runaai-m1-browser-observation-endpoint/v1",
      url: `${identities.publicBaseUrl}/__acceptance/browser-observation`, token };
  }, readBrowserObservation(checkpointId) {
    const entry = browserObservations.get(checkpointId);
    if (!entry?.ackRaw) throw Object.assign(new Error("not observed"), { code: "ENOENT" });
    return { raw: entry.ackRaw, receivedAtMs: entry.receivedAtMs };
  }, consumeBrowserObservation(checkpointId) { browserObservations.delete(checkpointId); } };
}
