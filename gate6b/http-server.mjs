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

async function staticFile(request, response, staticRoot) {
  const requested = new URL(request.url, "http://127.0.0.1").pathname;
  const relative = requested === "/" ? "index.html" : requested.replace(/^\//, "");
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
  staticRoot, maxRequestBytes = 1_048_576 }) {
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
      if (request.method === "POST" && url.pathname === "/api/selected/answer") {
        return json(response, 200, await application.answer({ credential: credential(request), body: await body(request, maxRequestBytes) }));
      }
      if (request.method === "POST" && url.pathname === "/api/selected/settings/propose") {
        return json(response, 200, await application.proposeSetting({ credential: credential(request), body: await body(request, maxRequestBytes) }));
      }
      if (request.method === "POST" && url.pathname === "/api/selected/settings/approve") {
        return json(response, 200, await application.approveSetting({ credential: credential(request), body: await body(request, maxRequestBytes) }));
      }
      if (request.method === "POST" && url.pathname === "/api/selected/settings/decline") {
        return json(response, 200, await application.declineSetting({ credential: credential(request), body: await body(request, maxRequestBytes) }));
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

