import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const mime = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".svg", "image/svg+xml"]]);
const coded = (code, message) => Object.assign(new Error(message), { code });

function json(response, status, value) {
  const payload = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": payload.length,
    "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(payload);
}

function redirect(response, location, cookie = null) {
  response.writeHead(303, { location, "cache-control": "no-store",
    "x-content-type-options": "nosniff", ...(cookie ? { "set-cookie": cookie } : {}) });
  response.end();
}

function cookie(request, name) {
  const values = String(request.headers.cookie ?? "").split(";");
  for (const value of values) {
    const index = value.indexOf("=");
    if (index > 0 && value.slice(0, index).trim() === name) return value.slice(index + 1).trim();
  }
  return null;
}

const sessionCookie = (value, maximumAge = 900) =>
  `__Host-runa_owner_session=${value}; Path=/; Max-Age=${maximumAge}; Secure; HttpOnly; SameSite=Strict`;

async function body(request, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw coded("request-body-too-large", "The request exceeded the configured limit.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw coded("request-json-invalid", "The request body must be valid JSON."); }
}

function credential(request) {
  const value = request.headers.authorization;
  if (!value) return null;
  const match = /^Bearer ([^\s]{1,16384})$/.exec(value);
  if (!match) throw coded("identity-token-invalid", "The authorization scheme is invalid.");
  return match[1];
}

async function selectedCredential(request, browserCeremony) {
  const bearer = credential(request);
  if (bearer || !browserCeremony) return bearer;
  const retainedSession = cookie(request, "__Host-runa_owner_session");
  if (!retainedSession) return null;
  if (request.headers.origin !== browserCeremony.publicBaseUrl) {
    throw coded("gate6d-browser-origin-invalid", "The Gate 6D validation origin is invalid.");
  }
  return browserCeremony.credentialForSession(retainedSession);
}

async function staticFile(request, response, staticRoot) {
  const requested = new URL(request.url, "http://127.0.0.1").pathname;
  const relative = requested === "/" ? "index.html"
    : requested === "/owner-ceremony" ? "owner-ceremony.html"
      : requested === "/gate6d-validation" ? "gate6d-validation.html" : requested.replace(/^\//, "");
  const root = resolve(staticRoot);
  const file = resolve(join(root, normalize(relative)));
  if (file !== root && !file.startsWith(`${root}\\`) && !file.startsWith(`${root}/`)) return false;
  let info;
  try { info = await stat(file); } catch { return false; }
  if (!info.isFile()) return false;
  response.writeHead(200, { "content-type": mime.get(extname(file)) ?? "application/octet-stream",
    "content-length": info.size, "cache-control": "no-store", "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'" });
  createReadStream(file).pipe(response);
  return true;
}

export function createCandidateHttpServer({ application, runtimeStatus, readinessStatus, dependencyHealth,
  browserCeremony = null, staticRoot, maxRequestBytes = 1_048_576 }) {
  return createServer(async (request, response) => {
    const correlationId = randomBytes(12).toString("hex");
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health/live") {
        return json(response, 200, { schemaVersion: "runa2-gate6b-liveness/v1", live: true, privateValuesIncluded: false });
      }
      if (request.method === "GET" && url.pathname === "/health/ready") {
        const health = await dependencyHealth();
        return json(response, health.ready ? 200 : 503, health);
      }
      if (request.method === "GET" && url.pathname === "/api/runtime/status") return json(response, 200, await runtimeStatus());
      if (request.method === "GET" && url.pathname === "/api/readiness/status") return json(response, 200, await readinessStatus());
      if (request.method === "GET" && url.pathname === "/api/owner-ceremony/status") {
        if (!browserCeremony) throw coded("gate6c-browser-ceremony-unavailable", "The owner ceremony is unavailable.");
        return json(response, 200, await browserCeremony.status());
      }
      if (request.method === "GET" && url.pathname === "/owner-ceremony/start") {
        if (!browserCeremony) throw coded("gate6c-browser-ceremony-unavailable", "The owner ceremony is unavailable.");
        const started = await browserCeremony.start(url.searchParams.get("step"));
        return redirect(response, started.redirectUrl);
      }
      if (request.method === "GET" && url.pathname === "/gate6d-validation/start") {
        if (!browserCeremony) throw coded("gate6c-browser-ceremony-unavailable", "The owner ceremony is unavailable.");
        const started = await browserCeremony.startValidationSession();
        return redirect(response, started.redirectUrl);
      }
      if (request.method === "GET" && url.pathname === "/owner-ceremony/resume-enrollment") {
        if (!browserCeremony) throw coded("gate6c-browser-ceremony-unavailable", "The owner ceremony is unavailable.");
        const started = await browserCeremony.start(url.searchParams.get("step"), { resumeExisting: true });
        return redirect(response, started.redirectUrl);
      }
      if (request.method === "GET" && url.pathname === "/owner-ceremony/callback") {
        if (!browserCeremony) throw coded("gate6c-browser-ceremony-unavailable", "The owner ceremony is unavailable.");
        const result = await browserCeremony.callback({ state: url.searchParams.get("state"),
          code: url.searchParams.get("code"), actionStatus: url.searchParams.get("kc_action_status") });
        return redirect(response, result.validationSession === true ? "/gate6d-validation" : "/owner-ceremony",
          sessionCookie(result.sessionId));
      }
      if (request.method === "GET" && url.pathname === "/api/gate6d/session/status") {
        const retainedSession = cookie(request, "__Host-runa_owner_session");
        if (!browserCeremony || !retainedSession) throw coded("gate6c-browser-session-invalid", "The browser session is missing.");
        await browserCeremony.credentialForSession(retainedSession);
        return json(response, 200, { schemaVersion: "runa2-gate6d-session-status/v1",
          active: true, privateValuesIncluded: false });
      }
      if (request.method === "POST" && url.pathname === "/api/owner-ceremony/revoke") {
        if (!browserCeremony) throw coded("gate6c-browser-ceremony-unavailable", "The owner ceremony is unavailable.");
        if (request.headers.origin !== browserCeremony.publicBaseUrl) {
          throw coded("gate6c-browser-origin-invalid", "The owner ceremony origin is invalid.");
        }
        const retainedSession = cookie(request, "__Host-runa_owner_session");
        if (!retainedSession) throw coded("gate6c-browser-session-invalid", "The browser session is missing.");
        await browserCeremony.credentialForSession(retainedSession);
        const ceremony = await browserCeremony.revokeAndVerify();
        response.setHeader("set-cookie", sessionCookie("", 0));
        return json(response, 200, { schemaVersion: "runa2-gate6c-browser-revocation/v1",
          revision: ceremony.revision, nextStep: ceremony.nextStep, privateValuesIncluded: false });
      }
      if (request.method === "POST" && url.pathname === "/api/selected/answer") {
        return json(response, 200, await application.answer({ credential: await selectedCredential(request, browserCeremony), body: await body(request, maxRequestBytes) }));
      }
      if (request.method === "POST" && url.pathname === "/api/selected/settings/propose") {
        return json(response, 200, await application.proposeSetting({ credential: await selectedCredential(request, browserCeremony), body: await body(request, maxRequestBytes) }));
      }
      if (request.method === "POST" && url.pathname === "/api/selected/settings/approve") {
        return json(response, 200, await application.approveSetting({ credential: await selectedCredential(request, browserCeremony), body: await body(request, maxRequestBytes) }));
      }
      if (request.method === "POST" && url.pathname === "/api/selected/settings/decline") {
        return json(response, 200, await application.declineSetting({ credential: await selectedCredential(request, browserCeremony), body: await body(request, maxRequestBytes) }));
      }
      if (request.method === "GET" && await staticFile(request, response, staticRoot)) return;
      return json(response, 404, { schemaVersion: "runa2-gate6b-error/v1", errorCode: "route-not-found", correlationId });
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "candidate-request-failed";
      const status = code === "candidate-shadow-authority" ? 423
        : code.includes("authentication") || code.startsWith("identity-") ? 401
          : code.includes("authorization") || code.includes("denied") || code === "fresh-step-up-required" ? 403
            : code.includes("unavailable") ? 503 : 400;
      return json(response, status, { schemaVersion: "runa2-gate6b-error/v1", errorCode: code,
        correlationId, privateValuesIncluded: false });
    }
  });
}
