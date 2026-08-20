import fs from "node:fs";
import net from "node:net";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const RUN_ID = process.env.W7_RUN_ID || "wave7-v2";
const VERSION = RUN_ID.endsWith("v3") ? "v3" : "v2";
const ENDPOINT = process.env.LMSTUDIO_URL || "http://192.168.50.165:1234/v1";
const MODEL = process.env.LMSTUDIO_MODEL || "qwen3-coder-30b-a3b-instruct";
const npmVersion = () => process.platform === "win32"
  ? execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --version"], { encoding: "utf8" }).trim()
  : execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
const files = [
  `WAVE7-${VERSION.toUpperCase()}-PREREGISTRATION.md`,
  `probes/SEAL-WAVE7-${VERSION.toUpperCase()}.md`,
  "probes/wave7/run-wave7.mjs",
  "probes/wave7/grade-wave7.mjs",
  "probes/wave7/w7-proxy.mjs",
  "probes/wave7/w7-lib.mjs",
  "probes/wave7/w7-ask.mjs",
  `probes/wave7/verify-seal-wave7-${VERSION}.mjs`,
  "probes/wave7/verify-base.mjs",
  "probes/checkpoint.mjs",
  "probes/wave5/w5-lib.mjs",
  "package.json",
  "package-lock.json"
];

const sha256 = (path) => createHash("sha256").update(fs.readFileSync(path)).digest("hex");
const checkPort = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once("error", () => resolve(false));
  server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
});

execFileSync(process.execPath, [`probes/wave7/verify-seal-wave7-${VERSION}.mjs`], { stdio: "inherit" });

const occupied = [];
for (let port = 8901; port <= 8997; port++) if (!(await checkPort(port))) occupied.push(port);
if (occupied.length) throw new Error(`Wave 7 port range is not isolated: ${occupied.join(",")}`);

const modelsResponse = await fetch(`${ENDPOINT}/models`, { signal: AbortSignal.timeout(10000) });
if (!modelsResponse.ok) throw new Error(`model endpoint returned HTTP ${modelsResponse.status}`);
const models = await modelsResponse.json();
if (!(models.data ?? []).some((item) => item.id === MODEL)) throw new Error(`required model not listed: ${MODEL}`);

const manifest = {
  schemaVersion: 1,
  runId: RUN_ID,
  capturedAtUtc: new Date().toISOString(),
  repository: {
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    branch: execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
    statusPorcelainV2: execFileSync("git", ["status", "--porcelain=v2"], { encoding: "utf8" }).trim().split("\n").filter(Boolean),
  },
  runtime: { node: process.version, npm: npmVersion(), platform: process.platform, arch: process.arch },
  endpoint: { url: ENDPOINT, model: MODEL, listedModels: (models.data ?? []).map((item) => item.id).sort() },
  isolation: { checkedPorts: "127.0.0.1:8901-8997", occupiedPorts: occupied },
  evidence: {
    checkpoint: `probes/results/${RUN_ID}-partial.jsonl`,
    wireRoot: `artifacts/runs/${RUN_ID}-wire`,
    answerCaptureCharacters: 1200,
  },
  sourceFiles: Object.fromEntries(files.map((path) => [path, { bytes: fs.statSync(path).size, sha256: sha256(path) }])),
};

fs.mkdirSync(`artifacts/runs/${RUN_ID}-base`, { recursive: true });
const output = `artifacts/runs/${RUN_ID}-base/base-manifest.json`;
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${output} sha256 ${sha256(output)}`);
