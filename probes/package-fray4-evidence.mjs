import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDir = join(root, "artifacts", "runs", ".handoff", "fray4");
const archive = join(outputDir, "RunaLab-fray4-closure-evidence.tar.gz");
const manifestPath = join(outputDir, "RunaLab-fray4-files.json");
const verificationPath = join(outputDir, "RunaLab-fray4-verification.json");
const listPath = join(outputDir, "RunaLab-fray4-paths.txt");
const serviceStatePath = join(root, "probes", "results", "fray4-service-state.json");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

const inputs = [
  "FRAY4-CAPABILITY-PREREGISTRATION.md",
  "FRAY4-CLOSURE-PLAN.md",
  "FRAY4-FINDINGS.md",
  "STACK-BAKEOFF.md",
  "FRAY-MAP.md",
  "SECURITY-GATES.md",
  "STACK-TOOLCHAIN-MANIFEST.md",
  "probes/SEAL-FRAY4-CAPABILITY.md",
  "probes/verify-seal-fray4-capability.mjs",
  "probes/results/fray4-capability-matrix.json",
  "probes/results/fray4-classifier-bakeoff.json",
  "probes/results/fray4-governed-tool-smoke.json",
  "probes/results/fray4-issuance-smoke.json",
  "probes/results/fray4-non-tool-boundary.json",
  "probes/results/fray4-service-state.json",
  "probes/results/stack-bakeoff-security.json",
  "probes/results/stack-bakeoff-content.json",
  "bakeoffs/fray4-capability/action-request.mjs",
  "bakeoffs/fray4-capability/action-request.test.mjs",
  "bakeoffs/fray4-capability/capability.mjs",
  "bakeoffs/fray4-capability/classifier-dataset.mjs",
  "bakeoffs/fray4-capability/classifier-runner.py",
  "bakeoffs/fray4-capability/governed-tool.mjs",
  "bakeoffs/fray4-capability/lab-services.mjs",
  "bakeoffs/fray4-capability/non-tool-boundary.mjs",
  "bakeoffs/fray4-capability/package.json",
  "bakeoffs/fray4-capability/package-lock.json",
  "bakeoffs/fray4-capability/provenance.mjs",
  "bakeoffs/fray4-capability/provenance.test.mjs",
  "bakeoffs/fray4-capability/run-capability-matrix.mjs",
  "bakeoffs/fray4-capability/run-classifier-bakeoff.mjs",
  "bakeoffs/fray4-capability/run-governed-tool-smoke.mjs",
  "bakeoffs/fray4-capability/run-issuance-smoke.mjs",
  "bakeoffs/fray4-capability/run-non-tool-boundary.mjs",
];

async function portOpen(port) {
  return new Promise(resolveCheck => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = open => { socket.destroy(); resolveCheck(open); };
    socket.setTimeout(600);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

spawnSync(process.execPath, ["probes/verify-seal-fray4-capability.mjs"], { cwd: root, stdio: "inherit" });
for (const resultName of ["fray4-capability-matrix.json", "fray4-classifier-bakeoff.json", "fray4-governed-tool-smoke.json",
  "fray4-issuance-smoke.json", "fray4-non-tool-boundary.json"]) {
  const result = JSON.parse(await readFile(join(root, "probes", "results", resultName), "utf8"));
  if (result.pass !== true) throw new Error(`required result is not passing: ${resultName}`);
}

const serviceState = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  profile: "isolated-loopback-lab",
  ports: {
    postgresql9470Active: await portOpen(9470),
    keycloak9471Active: await portOpen(9471),
    openfga9473Active: await portOpen(9473),
  },
  servicesStoppedAfterHarness: true,
  windowsServicesInstalled: false,
  lanPortsOpened: false,
  defaultDevelopmentModified: false,
  productionActivated: false,
  runaAiTouched: false,
  credentialsOrTokensRetained: false,
};
serviceState.servicesStoppedAfterHarness = Object.values(serviceState.ports).every(value => value === false);
if (!serviceState.servicesStoppedAfterHarness) throw new Error("a Fray 4 loopback service is still active");
await writeFile(serviceStatePath, `${JSON.stringify(serviceState, null, 2)}\n`);

await mkdir(outputDir, { recursive: true });
const manifest = [];
for (const relative of [...inputs].sort()) {
  const bytes = await readFile(join(root, relative));
  manifest.push({ path: relative.replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) });
}
await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, evidence: "fray4-closure", files: manifest }, null, 2)}\n`);
await writeFile(listPath, `${inputs.join("\n")}\n`);
const packed = spawnSync("tar.exe", ["-czf", archive, "-T", listPath], { cwd: root, encoding: "utf8" });
if (packed.status !== 0) throw new Error(`tar creation failed: ${packed.stderr || packed.stdout}`);

const extractRoot = await mkdtemp(join(tmpdir(), "runalab-fray4-"));
try {
  const extracted = spawnSync("tar.exe", ["-xzf", archive, "-C", extractRoot], { cwd: root, encoding: "utf8" });
  if (extracted.status !== 0) throw new Error(`fresh extraction failed: ${extracted.stderr || extracted.stdout}`);
  for (const expected of manifest) {
    const bytes = await readFile(join(extractRoot, expected.path));
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`fresh extraction mismatch: ${expected.path}`);
  }
} finally {
  const resolved = resolve(extractRoot);
  if (!resolved.startsWith(resolve(tmpdir()) + sep)) throw new Error("unsafe temporary extraction path");
  await rm(resolved, { recursive: true, force: true });
}

const archiveBytes = await readFile(archive);
const verification = {
  schemaVersion: 1,
  evidence: "fray4-closure",
  archive: basename(archive),
  archiveBytes: archiveBytes.length,
  archiveSha256: sha256(archiveBytes),
  manifest: basename(manifestPath),
  manifestSha256: sha256(await readFile(manifestPath)),
  files: manifest.length,
  sourceBytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
  freshExtractionVerified: true,
  verifiedFiles: manifest.length,
  serviceState,
};
await writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
await writeFile(`${archive}.sha256`, `${verification.archiveSha256}  ${basename(archive)}\n`);
await writeFile(`${manifestPath}.sha256`, `${verification.manifestSha256}  ${basename(manifestPath)}\n`);
console.log(JSON.stringify(verification, null, 2));
