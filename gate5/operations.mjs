import { createHmac } from "node:crypto";

const SECRET_KEY = /(secret|token|password|cookie|authorization|private.?key|passphrase|credential|ciphertext|recovery)/i;
const SAFE_REF = /^(env|file|vault|secret-store):[A-Za-z0-9._/-]{1,200}$/;
const coded = (code, message) => Object.assign(new Error(message), { code });
const loopback = host => ["127.0.0.1", "::1", "localhost"].includes(host);
const privateIpv4 = host => /^10\./.test(host) || /^192\.168\./.test(host)
  || (() => { const match = /^172\.(\d+)\./.exec(host); return match && Number(match[1]) >= 16 && Number(match[1]) <= 31; })();

export function validateReleaseBoundary(config) {
  const problems = [];
  const release = config?.profile === "release";
  if (!config || !["development", "release"].includes(config.profile)) problems.push("profile-invalid");
  if (!config?.bindHost || ["0.0.0.0", "::"].includes(config.bindHost)) problems.push("bind-not-private");
  if (release && !loopback(config.bindHost) && !privateIpv4(config.bindHost)) problems.push("bind-not-private");
  if (release && config.scheme !== "https") problems.push("private-tls-required");
  if (!release && !loopback(config?.bindHost)) problems.push("development-loopback-required");
  if (release && !["internal", "custom-ca"].includes(config.tls?.mode)) problems.push("tls-mode-invalid");
  if (config?.clientAuthenticationRequired && config.tls?.clientAuth !== "require-and-verify") problems.push("client-auth-required");
  if (config?.effectRetries !== 0) problems.push("effect-retries-must-be-zero");
  if (!Number.isInteger(config?.deadlines?.totalMs) || config.deadlines.totalMs < 100 || config.deadlines.totalMs > 120_000) problems.push("total-deadline-invalid");
  if (!Number.isInteger(config?.deadlines?.upstreamMs) || config.deadlines.upstreamMs < 50 || config.deadlines.upstreamMs >= config.deadlines.totalMs) problems.push("upstream-deadline-invalid");
  if (!Number.isInteger(config?.maxRequestBytes) || config.maxRequestBytes < 1 || config.maxRequestBytes > 1_048_576) problems.push("request-limit-invalid");
  if (!config?.provider?.expectedModel || config.provider.expectedModel !== config.provider.presentedModel) problems.push("provider-model-identity-mismatch");
  if (typeof config?.provider?.baseUrl !== "string" || (!config.provider.baseUrl.startsWith("https://") && !config.provider.baseUrl.startsWith("http://127.0.0.1:"))) problems.push("provider-boundary-invalid");
  for (const [name, ref] of Object.entries(config?.secretRefs ?? {})) {
    if (SECRET_KEY.test(String(ref)) && !String(ref).includes(":")) problems.push(`secret-value-forbidden:${name}`);
    if (!SAFE_REF.test(String(ref))) problems.push(`secret-reference-invalid:${name}`);
  }
  if (Object.keys(config?.secretRefs ?? {}).length === 0) problems.push("secret-reference-required");
  return Object.freeze({ passed: problems.length === 0, problems: Object.freeze(problems), profile: config?.profile ?? null });
}

export function renderCaddyContract(config) {
  const result = validateReleaseBoundary(config);
  if (!result.passed) throw coded("release-preflight-failed", `Release preflight failed: ${result.problems.join(",")}`);
  const address = `${config.scheme}://${config.bindHost}:${config.port}`;
  const tls = config.profile === "release" ? `\n\ttls ${config.tls.mode === "internal" ? "internal" : config.tls.certificateRef}` : "";
  return `${address} {${tls}\n\trequest_body { max_size ${config.maxRequestBytes} }\n\treverse_proxy ${config.provider.baseUrl} {\n\t\tlb_retries 0\n\t\ttransport http {\n\t\t\tdial_timeout ${config.deadlines.upstreamMs}ms\n\t\t\tresponse_header_timeout ${config.deadlines.upstreamMs}ms\n\t\t}\n\t}\n}`;
}

const TELEMETRY_ALLOWLIST = new Set([
  "component", "operation", "verdict.code", "result.status", "dependency", "recovery.phase",
  "recovery.duration_ms", "record.count", "identity.online", "authorization.source", "step_up.required",
  "capability.state", "transport.profile", "request.ref", "participant.ref", "resource.ref",
]);

export function keyedReference(value, key, domain = "gate5") {
  if (typeof key !== "string" || key.length < 16) throw coded("telemetry-key-invalid", "Telemetry HMAC key must contain at least 16 characters.");
  return createHmac("sha256", key).update(`${domain}\0${String(value)}`).digest("hex");
}

export function allowlistedSecurityAttributes(attributes) {
  const result = {};
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (!TELEMETRY_ALLOWLIST.has(name)) throw coded("telemetry-attribute-forbidden", `Telemetry attribute ${name} is not allowlisted.`);
    if (SECRET_KEY.test(name)) throw coded("telemetry-secret-field-forbidden", "Secret-like telemetry fields are forbidden.");
    if (!["string", "number", "boolean"].includes(typeof value)) throw coded("telemetry-value-invalid", "Telemetry values must be scalar.");
    result[name] = value;
  }
  return Object.freeze(result);
}

export function dependencyDecision({ dependency, operation, scopedDirectSelectorAvailable = false }) {
  if (dependency === "qdrant" && operation === "approved-knowledge-read" && scopedDirectSelectorAvailable) {
    return Object.freeze({ allowed: true, degraded: true, reason: "scoped-direct-selector-fallback" });
  }
  if (["postgres", "keycloak", "openfga"].includes(dependency)) {
    return Object.freeze({ allowed: false, degraded: false, reason: `${dependency}-authority-unavailable` });
  }
  return Object.freeze({ allowed: false, degraded: false, reason: "dependency-failure-unsupported" });
}

export function secretReferenceStatus(secretRefs, key) {
  const entries = Object.entries(secretRefs ?? {}).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, ref] of entries) if (!SAFE_REF.test(String(ref))) throw coded("secret-reference-invalid", `Secret reference ${name} is invalid.`);
  return Object.freeze({
    configured: entries.length > 0,
    count: entries.length,
    configurationRef: keyedReference(entries.map(([name, ref]) => `${name}:${ref.split(":", 1)[0]}`).join("|"), key, "secret-config"),
    valuesRetained: false,
  });
}
