import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const bundleId = "stack-bakeoff-service-state-20260820";
const outputDir = path.join(root, "artifacts", "runs", ".handoff", "stack-bakeoff-20260820");
const archive = path.join(outputDir, `RunaLab-${bundleId}.tar.gz`);
const manifestPath = path.join(outputDir, `RunaLab-${bundleId}-files.json`);
const verificationPath = path.join(outputDir, `RunaLab-${bundleId}-verification.json`);
const listPath = path.join(outputDir, `RunaLab-${bundleId}-paths.txt`);
const inputs = [
  "artifacts/runs/stack-bakeoff-postgres/data",
  "artifacts/runs/stack-bakeoff-qdrant-v4/storage",
];
const toPosix = value => value.split(path.sep).join("/");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function walk(relativePath) {
  const absolute = path.join(root, relativePath);
  const info = await stat(absolute);
  if (info.isFile()) return [toPosix(relativePath)];
  const files = [];
  for (const entry of (await readdir(absolute, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (entry.isFile()) files.push(toPosix(child));
  }
  return files;
}

await mkdir(outputDir, { recursive: true });
const files = [...new Set((await Promise.all(inputs.map(walk))).flat())].sort();
const manifest = [];
for (const relative of files) {
  const bytes = await readFile(path.join(root, relative));
  manifest.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
}
await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, bundleId, syntheticLabDataOnly: true, files: manifest }, null, 2)}\n`);
await writeFile(listPath, `${files.join("\n")}\n`);

const packed = spawnSync("tar.exe", ["-czf", archive, "-T", listPath], { cwd: root, encoding: "utf8" });
if (packed.status !== 0) throw new Error(`tar creation failed: ${packed.stderr || packed.stdout}`);

const extractRoot = await mkdtemp(path.join(tmpdir(), "runalab-stack-state-"));
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
  syntheticLabDataOnly: true,
  servicesStoppedBeforePackaging: true,
  archive: path.basename(archive),
  archiveBytes: archiveBytes.length,
  archiveSha256: sha256(archiveBytes),
  manifest: path.basename(manifestPath),
  manifestSha256: sha256(await readFile(manifestPath)),
  files: manifest.length,
  sourceBytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
  freshExtractionVerified: true,
  verifiedFiles: manifest.length,
};
await writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
await writeFile(`${archive}.sha256`, `${verification.archiveSha256}  ${path.basename(archive)}\n`);
await writeFile(`${manifestPath}.sha256`, `${verification.manifestSha256}  ${path.basename(manifestPath)}\n`);
console.log(JSON.stringify(verification, null, 2));
