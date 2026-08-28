import { execFile } from "node:child_process";
import { cp, copyFile, lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { canonicalJson } from "../gate4/canonical.mjs";
import { buildReleaseManifest } from "../gate6/release.mjs";
import { ARTIFACT_FILE, buildArtifactManifest, verifyReleaseArtifact } from "./artifact.mjs";
import { loadReleaseConfig } from "./release-config.mjs";
import { stageSandboxRuntime } from "./sandbox-runtime.mjs";
import { releaseModelIdentity } from "./model-role-providers.mjs";

const run = promisify(execFile);
const coded = (code, message) => Object.assign(new Error(message), { code });
const root = resolve(import.meta.dirname, "..");

function argumentsOf(argv) {
  const allowed = new Set(["--output", "--config", "--release-id", "--manifest-output"]);
  const values = {};
  if (argv.length % 2 !== 0) throw coded("release-build-arguments-invalid",
    "Release build arguments must be name/value pairs.");
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(name) || !value) throw coded("release-build-arguments-invalid",
      "Usage: node gate6b/build-release.mjs --output <new-directory> --config <json> --release-id <id>");
    values[name.slice(2)] = value;
  }
  for (const name of ["output", "config", "release-id"]) if (!values[name]) {
    throw coded("release-build-arguments-invalid", `Missing --${name}.`);
  }
  return values;
}

function beneath(parent, child) {
  const value = relative(parent, child);
  return value && !value.startsWith("..") && !isAbsolute(value);
}

async function mustNotExist(path, code) {
  try { await lstat(path); throw coded(code, `The build target already exists: ${path}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

async function git(...args) {
  const result = await run("git", args, { cwd: root, encoding: "buffer", windowsHide: true,
    maxBuffer: 64 * 1024 * 1024 });
  return result.stdout;
}

async function copyTrackedFiles(destination) {
  const names = (await git("ls-files", "-z")).toString("utf8").split("\0").filter(Boolean);
  for (const name of names) {
    const source = resolve(root, name);
    const target = resolve(destination, name);
    if (!beneath(root, source) || !beneath(destination, target)) throw coded("release-build-path-invalid", "A tracked path escaped the release root.");
    const information = await lstat(source);
    if (!information.isFile()) throw coded("release-build-source-invalid", `Only regular tracked files may ship: ${name}`);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  return names.length;
}

async function main() {
  const args = argumentsOf(process.argv.slice(2));
  if (process.version !== "v22.22.0") throw coded("release-node-version-mismatch", "Node 22.22.0 is required to build the release.");
  if ((await git("status", "--porcelain=v1", "--untracked-files=all")).length) {
    throw coded("release-build-checkout-dirty", "The release must be built from a clean exact commit.");
  }
  const commit = (await git("rev-parse", "HEAD")).toString("ascii").trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw coded("release-build-commit-invalid", "The release commit is invalid.");
  const output = resolve(args.output);
  if (beneath(root, output) || output === root) throw coded("release-build-output-invalid", "The immutable release must be outside the source checkout.");
  await mustNotExist(output, "release-build-output-exists");
  const loadedConfig = await loadReleaseConfig(resolve(args.config));
  const releaseManifestPath = args["manifest-output"]
    ? resolve(args["manifest-output"])
    : resolve(loadedConfig.directory, loadedConfig.value.releaseManifestPath);
  if (beneath(output, releaseManifestPath) || releaseManifestPath === output) {
    throw coded("release-build-manifest-location-invalid", "The release manifest must remain outside the immutable artifact root.");
  }
  await mustNotExist(releaseManifestPath, "release-build-manifest-exists");
  const nodeModules = resolve(root, "node_modules");
  if (!(await stat(nodeModules)).isDirectory()) throw coded("release-build-dependencies-missing", "The installed dependency tree is unavailable.");

  await mkdir(output, { recursive: true });
  const trackedFileCount = await copyTrackedFiles(output);
  await cp(nodeModules, resolve(output, "node_modules"), { recursive: true, dereference: true,
    errorOnExist: true, force: false });
  await mkdir(resolve(output, "runtime"), { recursive: true });
  await copyFile(process.execPath, resolve(output, "runtime", "node.exe"));
  await stageSandboxRuntime({ sourceRoot: root, nodeModulesRoot: nodeModules,
    destinationRoot: output });

  const artifact = await buildArtifactManifest(output);
  await writeFile(resolve(output, ARTIFACT_FILE), `${canonicalJson(artifact)}\n`, { encoding: "utf8", flag: "wx" });
  await verifyReleaseArtifact(output, artifact.artifactDigest);
  const config = loadedConfig.value;
  const services = Object.entries(config.services).map(([name, identity]) => ({ name, ...identity }));
  const release = buildReleaseManifest({ releaseId: args["release-id"], commit,
    artifactDigest: artifact.artifactDigest, configurationDigest: loadedConfig.configurationDigest,
    applicationEntryPoint: "gate6b/server.mjs",
    model: releaseModelIdentity(config.provider), services },
  { schemaVersion: config.schemaVersion === "runa2-gate6b-release-config/v1"
    ? "runa2-gate6-release/v1" : "runa2-gate6-release/v2" });
  await mkdir(dirname(releaseManifestPath), { recursive: true });
  await writeFile(releaseManifestPath, `${JSON.stringify(release, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const retained = JSON.parse(await readFile(releaseManifestPath, "utf8"));
  if (retained.manifestDigest !== release.manifestDigest) throw coded("release-build-write-mismatch", "The retained release manifest changed while it was written.");
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate6b-release-build/v1",
    releaseId: release.releaseId, commit, artifactDigest: artifact.artifactDigest,
    configurationDigest: loadedConfig.configurationDigest, manifestDigest: release.manifestDigest,
    artifactFileCount: artifact.entries.length, trackedFileCount, nodeRuntime: process.version,
    secretsIncluded: false, protectedDataIncluded: false })}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ schemaVersion: "runa2-gate6b-release-build-error/v1",
    errorCode: error?.code ?? "release-build-failed", privateValuesIncluded: false })}\n`);
  process.exitCode = 1;
});
