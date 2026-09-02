import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertArtifactManifest } from "../../../gate6b/artifact.mjs";

const MANIFEST_NAME = "OWNED-RUNTIME-MANIFEST.json";
const RUNTIME_ROOTS = new Set(["runtime", "sandbox-runtime"]);
const fail = code => Object.assign(new Error(code), { code });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function fileSha256(filename) {
  const handle = await open(filename, "r");
  try {
    const digest = createHash("sha256");
    for await (const bytes of handle.createReadStream({ autoClose: false })) digest.update(bytes);
    return digest.digest("hex");
  } finally { await handle.close(); }
}

async function plainRoot(rawRoot) {
  const root = path.resolve(rawRoot);
  const item = await lstat(root);
  if (!item.isDirectory() || item.isSymbolicLink() || path.resolve(await realpath(root)).toLowerCase() !== root.toLowerCase()) {
    throw fail("owned-runtime-root-invalid");
  }
  return root;
}

async function collect(root, relative, entries, directories) {
  const absolute = path.join(root, relative);
  const item = await lstat(absolute);
  if (item.isSymbolicLink()) throw fail("owned-runtime-reparse");
  if (item.isDirectory()) {
    directories.add(relative.replaceAll("\\", "/"));
    for (const name of (await readdir(absolute)).sort()) await collect(root, path.join(relative, name), entries, directories);
    return;
  }
  if (!item.isFile()) throw fail("owned-runtime-entry-type");
  entries.push({ path: relative.replaceAll("\\", "/"), bytes: item.size, sha256: await fileSha256(absolute) });
}

async function writeExclusive(filename, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const handle = await open(filename, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function pinnedBytes(filename, expectedSha256, expectedBytes, code) {
  const item = await lstat(filename);
  if (!item.isFile() || item.isSymbolicLink() || item.size !== expectedBytes) throw fail(code);
  const handle = await open(filename, "r");
  try {
    const bytes = await handle.readFile();
    if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha256) throw fail(code);
    return bytes;
  } finally { await handle.close(); }
}

async function writePinned(filename, bytes) {
  await mkdir(path.dirname(filename), { recursive: true });
  const handle = await open(filename, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

async function expectedRuntimeEntries({ root, releaseRoot, expectedDependencyArtifactDigest,
  expectedSourceTreeManifestSha256, expectedNodeSha256 }) {
  const sourceManifestBytes = await readFile(path.join(root, "SOURCE-TREE-MANIFEST.json"));
  if (sha256(sourceManifestBytes) !== expectedSourceTreeManifestSha256) throw fail("owned-runtime-source-manifest-pin");
  let sourceManifest;
  try { sourceManifest = JSON.parse(sourceManifestBytes); } catch { throw fail("owned-runtime-source-manifest-json"); }
  const quickjsSource = sourceManifest.entries?.find(entry => entry.path === "gate7e/quickjs-child.mjs");
  if (!quickjsSource || !Number.isSafeInteger(quickjsSource.bytes) || !/^[a-f0-9]{64}$/.test(quickjsSource.sha256)) {
    throw fail("owned-runtime-quickjs-source-pin");
  }
  const artifactBytes = await readFile(path.join(releaseRoot, "artifact-files.json"));
  let artifact;
  try { artifact = assertArtifactManifest(JSON.parse(artifactBytes)); }
  catch { throw fail("owned-runtime-dependency-manifest"); }
  if (artifact.artifactDigest !== expectedDependencyArtifactDigest) throw fail("owned-runtime-dependency-digest");
  const nodeSource = artifact.entries.find(entry => entry.path === "runtime/node.exe");
  if (!nodeSource || nodeSource.sha256 !== expectedNodeSha256) throw fail("owned-runtime-node-artifact-pin");
  const packagePrefixes = ["node_modules/quickjs-emscripten/", "node_modules/quickjs-emscripten-core/", "node_modules/@jitl/"];
  const packages = artifact.entries.filter(entry => packagePrefixes.some(prefix => entry.path.startsWith(prefix)));
  if (!packagePrefixes.every(prefix => packages.some(entry => entry.path.startsWith(prefix)))) {
    throw fail("owned-runtime-dependency-set");
  }
  const bindings = [{ source: path.join(root, "gate7e/quickjs-child.mjs"), path: "sandbox-runtime/quickjs-child.mjs",
    bytes: quickjsSource.bytes, sha256: quickjsSource.sha256 },
  { source: path.join(releaseRoot, "runtime/node.exe"), path: "runtime/node.exe", bytes: nodeSource.size, sha256: nodeSource.sha256 },
  ...packages.map(entry => ({ source: path.join(releaseRoot, ...entry.path.split("/")),
    path: `sandbox-runtime/${entry.path}`, bytes: entry.size, sha256: entry.sha256 }))];
  bindings.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return bindings;
}

export async function buildOwnedRuntime({ root: rawRoot, releaseRoot: rawReleaseRoot, sourceCommit, sourceArchiveSha256,
  expectedDependencyArtifactDigest, expectedSourceTreeManifestSha256, expectedNodeSha256 }) {
  const root = await plainRoot(rawRoot);
  const releaseRoot = path.resolve(rawReleaseRoot);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit) || ![sourceArchiveSha256, expectedDependencyArtifactDigest,
    expectedSourceTreeManifestSha256, expectedNodeSha256].every(value => /^[a-f0-9]{64}$/.test(value))
      || path.resolve(await realpath(releaseRoot)).toLowerCase() !== releaseRoot.toLowerCase()) {
    throw fail("owned-runtime-source-binding");
  }
  const runtime = path.join(root, "runtime"), sandbox = path.join(root, "sandbox-runtime");
  for (const target of [runtime, sandbox, path.join(root, MANIFEST_NAME)]) {
    try { await lstat(target); throw fail("owned-runtime-target-exists"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const bindings = await expectedRuntimeEntries({ root, releaseRoot, expectedDependencyArtifactDigest,
    expectedSourceTreeManifestSha256, expectedNodeSha256 });
  await mkdir(runtime);
  await mkdir(sandbox);
  for (const binding of bindings) {
    const bytes = await pinnedBytes(binding.source, binding.sha256, binding.bytes, "owned-runtime-source-file-pin");
    await writePinned(path.join(root, ...binding.path.split("/")), bytes);
  }
  const entries = bindings.map(({ path: entryPath, bytes, sha256: entrySha256 }) =>
    ({ path: entryPath, bytes, sha256: entrySha256 }));
  const manifest = { schemaVersion: "runaai-m1-owned-runtime-manifest/v2", sourceCommit, sourceArchiveSha256,
    dependencyArtifactDigest: expectedDependencyArtifactDigest, sourceTreeManifestSha256: expectedSourceTreeManifestSha256,
    nodeSourceSha256: expectedNodeSha256, entries };
  const receipt = await writeExclusive(path.join(root, MANIFEST_NAME), manifest);
  await validateOwnedRuntime({ root, expectedManifestSha256: receipt.sha256, expectedSourceCommit: sourceCommit,
    expectedSourceArchiveSha256: sourceArchiveSha256, expectedNodeSha256, releaseRoot,
    expectedDependencyArtifactDigest, expectedSourceTreeManifestSha256 });
  return Object.freeze({ schemaVersion: "runaai-m1-owned-runtime-stage-result/v1", manifestSha256: receipt.sha256,
    manifestBytes: receipt.bytes, runtimeFiles: entries.length, nodeSha256: manifest.nodeSourceSha256 });
}

export async function validateOwnedRuntime({ root: rawRoot, expectedManifestSha256, expectedSourceCommit,
  expectedSourceArchiveSha256, expectedNodeSha256, releaseRoot: rawReleaseRoot,
  expectedDependencyArtifactDigest, expectedSourceTreeManifestSha256 }) {
  const root = await plainRoot(rawRoot), manifestPath = path.join(root, MANIFEST_NAME);
  const releaseRoot = path.resolve(rawReleaseRoot);
  const manifestBytes = await readFile(manifestPath);
  if (sha256(manifestBytes) !== expectedManifestSha256 || manifestBytes.length > 4_000_000) throw fail("owned-runtime-manifest-pin");
  let manifest;
  try { manifest = JSON.parse(manifestBytes); } catch { throw fail("owned-runtime-manifest-json"); }
  if (Object.keys(manifest).sort().join() !== ["dependencyArtifactDigest", "entries", "nodeSourceSha256", "schemaVersion", "sourceArchiveSha256", "sourceCommit", "sourceTreeManifestSha256"].sort().join()
      || manifest.schemaVersion !== "runaai-m1-owned-runtime-manifest/v2" || manifest.sourceCommit !== expectedSourceCommit
      || manifest.sourceArchiveSha256 !== expectedSourceArchiveSha256 || manifest.nodeSourceSha256 !== expectedNodeSha256
      || manifest.dependencyArtifactDigest !== expectedDependencyArtifactDigest
      || manifest.sourceTreeManifestSha256 !== expectedSourceTreeManifestSha256
      || !Array.isArray(manifest.entries) || manifest.entries.length < 5 || manifest.entries.length > 10_000) {
    throw fail("owned-runtime-manifest-schema");
  }
  const anchored = (await expectedRuntimeEntries({ root, releaseRoot, expectedDependencyArtifactDigest,
    expectedSourceTreeManifestSha256, expectedNodeSha256 })).map(({ path: entryPath, bytes, sha256: entrySha256 }) =>
    ({ path: entryPath, bytes, sha256: entrySha256 }));
  if (JSON.stringify(manifest.entries) !== JSON.stringify(anchored)) throw fail("owned-runtime-source-bindings");
  const expected = new Set(), expectedDirectories = new Set();
  let previous = null;
  for (const entry of manifest.entries) {
    if (Object.keys(entry).sort().join() !== "bytes,path,sha256" || typeof entry.path !== "string"
        || !/^(?:runtime|sandbox-runtime)\/(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[\x20-\x7e]+$/.test(entry.path)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)
        || expected.has(entry.path) || (previous !== null && previous >= entry.path)) {
      throw fail("owned-runtime-manifest-entry");
    }
    previous = entry.path; expected.add(entry.path);
    let directory = path.posix.dirname(entry.path);
    while (directory !== ".") { expectedDirectories.add(directory); directory = path.posix.dirname(directory); }
    const filename = path.join(root, ...entry.path.split("/")), item = await lstat(filename);
    if (!item.isFile() || item.isSymbolicLink() || item.size !== entry.bytes || await fileSha256(filename) !== entry.sha256) {
      throw fail("owned-runtime-file-pin");
    }
  }
  if (!expected.has("runtime/node.exe") || !expected.has("sandbox-runtime/quickjs-child.mjs")) throw fail("owned-runtime-required-file");
  const actual = new Set(), actualDirectories = new Set();
  for (const name of [...RUNTIME_ROOTS].sort()) {
    const entries = [], directories = new Set(); await collect(root, name, entries, directories);
    for (const entry of entries) actual.add(entry.path);
    for (const directory of directories) actualDirectories.add(directory);
  }
  if ([...actual].sort().join("\n") !== [...expected].sort().join("\n")
      || [...actualDirectories].sort().join("\n") !== [...expectedDirectories].sort().join("\n")) {
    throw fail("owned-runtime-exact-set");
  }
  return Object.freeze(manifest);
}

function parseArguments(argv) {
  if (argv.length % 2 !== 0) throw fail("owned-runtime-arguments");
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; if (!key.startsWith("--") || Object.hasOwn(values, key)) throw fail("owned-runtime-arguments");
    values[key] = argv[index + 1];
  }
  const required = ["--owned-root", "--release-root", "--source-commit", "--source-archive-sha256",
    "--dependency-artifact-digest", "--source-tree-manifest-sha256", "--node-sha256"];
  if (Object.keys(values).sort().join() !== required.sort().join()) throw fail("owned-runtime-arguments");
  return values;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const values = parseArguments(process.argv.slice(2));
  const result = await buildOwnedRuntime({ root: values["--owned-root"], releaseRoot: values["--release-root"],
    sourceCommit: values["--source-commit"], sourceArchiveSha256: values["--source-archive-sha256"],
    expectedDependencyArtifactDigest: values["--dependency-artifact-digest"],
    expectedSourceTreeManifestSha256: values["--source-tree-manifest-sha256"], expectedNodeSha256: values["--node-sha256"] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
