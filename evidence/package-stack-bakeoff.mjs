import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const bundleId = "stack-bakeoff-20260820";
const outputDir = path.join(root, "artifacts", "runs", ".handoff", bundleId);
const archive = path.join(outputDir, `RunaLab-${bundleId}-evidence.tar.gz`);
const manifestPath = path.join(outputDir, `RunaLab-${bundleId}-files.json`);
const verificationPath = path.join(outputDir, `RunaLab-${bundleId}-verification.json`);
const listPath = path.join(outputDir, `RunaLab-${bundleId}-paths.txt`);

const exactInputs = [
  "STACK-BAKEOFF-PREREGISTRATION.md",
  "STACK-BAKEOFF.md",
  "STACK-TOOLCHAIN-MANIFEST.md",
  "SECURITY-BAKEOFF-PREREGISTRATION.md",
  "SECURITY-GATES.md",
  "CONTENT-BOUNDARY-PREREGISTRATION.md",
  "FRAY-MAP.md",
  "evidence/README.md",
  "evidence/package-stack-bakeoff.mjs",
  "probes/SEAL-STACK-BAKEOFF.md",
  "probes/SEAL-SECURITY-BAKEOFF.md",
  "probes/SEAL-CONTENT-BOUNDARY.md",
  "probes/verify-seal-stack-bakeoff.mjs",
  "probes/verify-seal-security-bakeoff.mjs",
  "probes/verify-seal-content-boundary.mjs",
  "probes/seal-file.mjs",
];
const roots = ["bakeoffs"];
const runRoots = [
  "artifacts/runs/stack-bakeoff-caddy",
  "artifacts/runs/stack-bakeoff-content",
  "artifacts/runs/stack-bakeoff-langgraph-postgres",
  "artifacts/runs/stack-bakeoff-langgraph-v2",
  "artifacts/runs/stack-bakeoff-otel",
  "artifacts/runs/stack-bakeoff-postgres",
  "artifacts/runs/stack-bakeoff-preflight",
  "artifacts/runs/stack-bakeoff-provider",
  "artifacts/runs/stack-bakeoff-provider-v2",
  "artifacts/runs/stack-bakeoff-qdrant",
  "artifacts/runs/stack-bakeoff-qdrant-v2",
  "artifacts/runs/stack-bakeoff-qdrant-v3",
  "artifacts/runs/stack-bakeoff-qdrant-v4",
  "artifacts/runs/stack-bakeoff-security",
  "artifacts/runs/stack-bakeoff-temporal-v2",
];
const excludedDirectoryNames = new Set(["node_modules", "data", "storage"]);
const toPosix = value => value.split(path.sep).join("/");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function walk(relativePath, filterDirectories = false) {
  const absolute = path.join(root, relativePath);
  const info = await stat(absolute);
  if (info.isFile()) return [toPosix(relativePath)];
  const files = [];
  const entries = await readdir(absolute, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && (entry.name === "node_modules" || (filterDirectories && excludedDirectoryNames.has(entry.name)))) continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child, filterDirectories));
    else if (entry.isFile()) files.push(toPosix(child));
  }
  return files;
}

const resultFiles = (await readdir(path.join(root, "probes", "results")))
  .filter(name => /^stack-bakeoff-.*\.json$/.test(name))
  .map(name => `probes/results/${name}`);
const inputs = [
  ...exactInputs,
  ...resultFiles,
  ...(await Promise.all(roots.map(item => walk(item, false)))).flat(),
  ...(await Promise.all(runRoots.map(item => walk(item, true)))).flat(),
];
const files = [...new Set(inputs.map(toPosix))].sort();

await mkdir(outputDir, { recursive: true });
const manifest = [];
for (const relative of files) {
  const bytes = await readFile(path.join(root, relative));
  manifest.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
}
await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, bundleId, files: manifest }, null, 2)}\n`);
await writeFile(listPath, `${files.join("\n")}\n`);

const packed = spawnSync("tar.exe", ["-czf", archive, "-T", listPath], { cwd: root, encoding: "utf8" });
if (packed.status !== 0) throw new Error(`tar creation failed: ${packed.stderr || packed.stdout}`);

const extractRoot = await mkdtemp(path.join(tmpdir(), "runalab-stack-bakeoff-"));
try {
  const extracted = spawnSync("tar.exe", ["-xzf", archive, "-C", extractRoot], { cwd: root, encoding: "utf8" });
  if (extracted.status !== 0) throw new Error(`fresh extraction failed: ${extracted.stderr || extracted.stdout}`);
  for (const expected of manifest) {
    const bytes = await readFile(path.join(extractRoot, expected.path));
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`fresh extraction mismatch: ${expected.path}`);
    }
  }
} finally {
  const resolved = path.resolve(extractRoot);
  if (!resolved.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("unsafe temporary path");
  await rm(resolved, { recursive: true, force: true });
}

const archiveBytes = await readFile(archive);
const verification = {
  schemaVersion: 1,
  bundleId,
  gitAnchor: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
  workingTreeSnapshot: true,
  archive: path.basename(archive),
  archiveBytes: archiveBytes.length,
  archiveSha256: sha256(archiveBytes),
  manifest: path.basename(manifestPath),
  manifestSha256: sha256(await readFile(manifestPath)),
  files: manifest.length,
  sourceBytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
  excludedPersistentServiceData: ["PostgreSQL data", "Qdrant storage"],
  freshExtractionVerified: true,
  verifiedFiles: manifest.length,
};
await writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
await writeFile(`${archive}.sha256`, `${verification.archiveSha256}  ${path.basename(archive)}\n`);
await writeFile(`${manifestPath}.sha256`, `${verification.manifestSha256}  ${path.basename(manifestPath)}\n`);
console.log(JSON.stringify(verification, null, 2));
