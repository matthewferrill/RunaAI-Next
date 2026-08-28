import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

// Test-only wrapper around the *unchanged* shipped request listener. This is not
// an OIDC bypass in the application or a production-configurable endpoint.
export function withSyntheticBootstrap(shippedServer, { identities, getLedger }) {
  const handlers = shippedServer.listeners("request"), pending = new Map();
  if (handlers.length !== 1) throw new Error("m1-bootstrap-listener-contract");
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname !== "/__acceptance/session") return handlers[0](request, response);
    response.setHeader("cache-control", "no-store"); response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("content-security-policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return response.end("<!doctype html><title>Synthetic Runa acceptance session</title><h1>Isolated acceptance only</h1><p>This creates a synthetic account session, not an owner or production login.</p><form method='post'><label>One-time test nonce <input name='nonce' type='password' autocomplete='off' required></label><button>Start synthetic session</button></form>");
    }
    try {
      if (request.method !== "POST" || request.headers.origin !== identities.publicBaseUrl) throw new Error("denied");
      let raw = ""; for await (const part of request) { raw += part.toString("utf8"); if (Buffer.byteLength(raw) > 256) throw new Error("denied"); }
      const nonce = new URLSearchParams(raw).get("nonce");
      if (!/^[a-f0-9]{64}$/.test(nonce ?? "")) throw new Error("denied");
      const match = [...pending.entries()].find(([key]) => timingSafeEqual(Buffer.from(key), Buffer.from(nonce)));
      if (!match || match[1].expiresAt <= Date.now()) throw new Error("denied");
      pending.delete(match[0]); const session = await identities.issue(match[1].principalId);
      getLedger()?.evidence("browser", "synthetic-session-bootstrap", { principalId: session.principalId, issued: true,
        oneTimeNonceConsumed: true, sessionCookieExposedToScript: false, productionIdentityUsed: false });
      response.writeHead(303, { location: "/", "set-cookie": `__Host-runa_user_session=${session.sessionId}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax` });
      return response.end();
    } catch { response.writeHead(403, { "content-type": "application/json" }); response.end('{"errorCode":"m1-synthetic-bootstrap-denied"}'); }
  });
  return { server, createBootstrap(principalId) {
    if (!/^m1-test-[a-f0-9]{24,64}$/.test(principalId) || pending.size >= 8) throw new Error("m1-bootstrap-scope-invalid");
    const nonce = randomBytes(32).toString("hex"); pending.set(nonce, { principalId, expiresAt: Date.now() + 300000 });
    return { url: `${identities.publicBaseUrl}/__acceptance/session`, nonce, expiresInSeconds: 300 };
  } };
}
