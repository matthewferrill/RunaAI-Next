// Wave 0 Phase 1 — freeze the base (BASE-MANIFEST.json). Records the exact software/model/config
// base the coverage claim is bound to. Host and endpoint facts can only be true where the probes run,
// so this must be executed on Control (or wherever the sweep runs), not in a cloud clone. Fields it
// cannot observe are recorded as null with a reason, never guessed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const sha = (p) => existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : null;

const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
const installed = {};
for (const [k, v] of Object.entries(lock.packages || {})) {
  if (!k.startsWith("node_modules/")) continue;
  installed[k.replace("node_modules/", "")] = v.version;
}

const stack = existsSync(path.join(ROOT, "probes/stack2.mjs")) ? readFileSync(path.join(ROOT, "probes/stack2.mjs"), "utf8") : "";
const modelId = process.env.LMSTUDIO_MODEL || (stack.match(/LMSTUDIO_MODEL\s*\|\|\s*"([^"]+)"/) || [])[1] || null;
const embedId = (stack.match(/textEmbeddingModel\("([^"]+)"\)/) || [])[1] || null;
const endpoint = process.env.LMSTUDIO_URL || (stack.match(/LMSTUDIO_URL\s*\|\|\s*"([^"]+)"/) || [])[1] || null;

// Live endpoint probe — records what the endpoint actually served at freeze time, or the failure.
let endpointLive = null;
if (endpoint) {
  try {
    const res = execSync(`curl -s -m 8 ${endpoint.replace(/\/$/, "")}/models`, { encoding: "utf8" });
    const ids = (JSON.parse(res).data || []).map((m) => m.id);
    endpointLive = { reachable: true, models: ids };
  } catch (e) { endpointLive = { reachable: false, reason: String(e.message).slice(0, 120) }; }
}

// LM Studio version, in order of authority: explicit env, the `lms` CLI, then the native REST API's
// own report. Each records HOW it was learned, because a version nobody can source is not a fact.
let lmVersion = process.env.LMSTUDIO_VERSION || null;
let lmVersionSource = lmVersion ? "env LMSTUDIO_VERSION" : null;
if (!lmVersion) {
  const cli = sh("lms version");
  if (cli) { lmVersion = cli.replace(/^.*?([0-9]+\.[0-9]+\.[0-9]+.*)$/s, "$1").trim(); lmVersionSource = "lms version (CLI on the probe host)"; }
}
if (!lmVersion && endpoint) {
  // The native REST surface (/api/v0) sits beside the OpenAI-compatible /v1 on the same origin.
  try {
    const base = endpoint.replace(/\/v1\/?$/, "");
    const raw = execSync(`curl -s -m 8 -i ${base}/api/v0/models`, { encoding: "utf8" });
    const hdr = (raw.match(/^server:\s*(.+)$/im) || [])[1];
    if (hdr && /lm ?studio/i.test(hdr)) { lmVersion = hdr.trim(); lmVersionSource = "Server header on /api/v0 (endpoint host)"; }
  } catch { /* endpoint may not expose the native API; null stays honest */ }
}

const manifest = {
  schemaVersion: "runalab-base-manifest/v1",
  collectedAtHost: os.hostname(),
  frozenBase: {
    gitCommit: sh("git rev-parse HEAD"),
    // The manifest must not report the base dirty on account of itself: its own file is untracked on
    // a first run and modified on every re-run. Everything else still counts.
    gitStatusClean: (sh("git status --porcelain") || "").split("\n").filter((l) => l.trim() && !/BASE-MANIFEST\.json$/.test(l)).length === 0,
    packageLockSha256: sha(path.join(ROOT, "package-lock.json")),
    nodeVersion: process.version,
    os: { platform: process.platform, release: os.release(), arch: process.arch },
    installedPackages: installed,
  },
  model: {
    endpoint,
    modelId,
    embeddingId: embedId,
    lmStudioVersion: lmVersion,
    lmStudioVersionSource: lmVersionSource || "not observable from this host — set LMSTUDIO_VERSION when known; null is honest, not a guess",
    endpointAtFreeze: endpointLive,
  },
  configDigests: {
    "probes/stack2.mjs": sha(path.join(ROOT, "probes/stack2.mjs")),
    "package.json": sha(path.join(ROOT, "package.json")),
    "RUNTIME-GRAPH.json": sha(path.join(ROOT, "RUNTIME-GRAPH.json")),
  },
  hardwareProfile: {
    cpus: os.cpus().length,
    cpuModel: (os.cpus()[0] || {}).model || null,
    totalMemBytes: os.totalmem(),
    note: "GPU/accelerator profile of RUNA-HOME is not visible from the probe host; record separately if the endpoint host differs.",
  },
  boundsClaim: "No coverage claim applies outside this frozen base. On any change to gitCommit, packageLockSha256, nodeVersion, modelId, embeddingId, or lmStudioVersion, re-run drift detection and invalidate affected results.",
};
writeFileSync(path.join(ROOT, "BASE-MANIFEST.json"), JSON.stringify(manifest, null, 1));
console.log(`host: ${manifest.collectedAtHost}, node: ${manifest.frozenBase.nodeVersion}, commit: ${String(manifest.frozenBase.gitCommit).slice(0,8)}`);
console.log(`model: ${modelId}, embed: ${embedId}, endpoint live: ${endpointLive ? endpointLive.reachable : "not probed"}`);
console.log(`lm studio version: ${manifest.model.lmStudioVersion ?? "NULL — set LMSTUDIO_VERSION on Control"}`);
