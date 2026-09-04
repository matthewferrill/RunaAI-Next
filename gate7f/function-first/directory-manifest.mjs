import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

if (process.argv.length !== 3 || !path.isAbsolute(process.argv[2])) {
  throw new Error("directory-manifest-absolute-root-required");
}

const root = path.resolve(process.argv[2]);
const rootStat = await lstat(root);
const canonicalRoot = await realpath(root);
const samePath = (left, right) => path.resolve(left).toUpperCase() === path.resolve(right).toUpperCase();
if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !samePath(root, canonicalRoot)) {
  throw new Error("directory-manifest-root-invalid");
}

const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
const files = [];
async function walk(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(relativeDirectory, entry.name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error("directory-manifest-reparse-entry-denied");
    if (stat.isDirectory()) await walk(absolute, relative);
    else if (stat.isFile()) files.push(Object.freeze({ absolute, relative, bytes: stat.size }));
    else throw new Error("directory-manifest-entry-type-invalid");
  }
}

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

await walk(canonicalRoot);
files.sort((left, right) => compareUtf8(left.relative, right.relative));
const manifest = createHash("sha256");
let bytes = 0;
for (const file of files) {
  const digest = await hashFile(file.absolute);
  manifest.update(file.relative, "utf8"); manifest.update("\0", "utf8");
  manifest.update(String(file.bytes), "utf8"); manifest.update("\0", "utf8");
  manifest.update(digest, "ascii"); manifest.update("\n", "utf8");
  bytes += file.bytes;
}

process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-directory-manifest/v1",
  sha256: manifest.digest("hex"), files: files.length, bytes })}\n`);
