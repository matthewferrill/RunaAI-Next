import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", "runs", ".handoff", "wave7-v3");
const archive = path.join(outputDir, "RunaLab-wave7-v3-evidence.tar.gz");
const manifestPath = path.join(outputDir, "RunaLab-wave7-v3-files.json");
const verificationPath = path.join(outputDir, "RunaLab-wave7-v3-verification.json");
const listPath = path.join(outputDir, "RunaLab-wave7-v3-paths.txt");

const inputs = [
  "WAVE7-V2-PREREGISTRATION.md",
  "WAVE7-V3-PREREGISTRATION.md",
  "WAVE7-V3-FINDINGS.md",
  "probes/SEAL-WAVE7-V2.md",
  "probes/SEAL-WAVE7-V3.md",
  "probes/SEAL-WAVE7-V3-BASE.md",
  "probes/results/wave7-v3-partial.jsonl",
  "probes/results/wave7-v3-graded.json",
  "probes/wave7",
  "artifacts/runs/WAVE7-V3-A",
  "artifacts/runs/WAVE7-V3-B",
  "artifacts/runs/WAVE7-V3-C",
  "artifacts/runs/WAVE7-V3-CONTROL",
  "artifacts/runs/WAVE7-V3-WARMING",
  "artifacts/runs/wave7-v3-base",
  "artifacts/runs/wave7-v3-wire",
  "package.json",
  "package-lock.json"
];

const toPosix = value => value.split(path.sep).join("/");
const sha256 = buffer => createHash("sha256").update(buffer).digest("hex");

async function walk(relativePath) {
  const absolute = path.join(root, relativePath);
  const info = await stat(absolute);
  if (info.isFile()) return [toPosix(relativePath)];
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
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

await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, runId: "wave7-v3", files: manifest }, null, 2)}\n`);
await writeFile(listPath, `${files.join("\n")}\n`);

const packed = spawnSync("tar.exe", ["-czf", archive, "-T", listPath], {
  cwd: root,
  encoding: "utf8"
});
if (packed.status !== 0) throw new Error(`tar creation failed: ${packed.stderr || packed.stdout}`);

const extractRoot = await mkdtemp(path.join(tmpdir(), "runalab-wave7-v3-"));
try {
  const extracted = spawnSync("tar.exe", ["-xzf", archive, "-C", extractRoot], {
    cwd: root,
    encoding: "utf8"
  });
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
  runId: "wave7-v3",
  archive: path.basename(archive),
  archiveBytes: archiveBytes.length,
  archiveSha256: sha256(archiveBytes),
  manifest: path.basename(manifestPath),
  manifestSha256: sha256(await readFile(manifestPath)),
  files: manifest.length,
  sourceBytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
  freshExtractionVerified: true,
  verifiedFiles: manifest.length
};
await writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
await writeFile(`${archive}.sha256`, `${verification.archiveSha256}  ${path.basename(archive)}\n`);
await writeFile(`${manifestPath}.sha256`, `${verification.manifestSha256}  ${path.basename(manifestPath)}\n`);
console.log(JSON.stringify(verification, null, 2));
