import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { canonicalJson } from "../gate4/canonical.mjs";

export const ARTIFACT_FILE = "artifact-files.json";
export const ARTIFACT_SCHEMA = "runa2-gate6b-artifact/v1";

const coded = (code, message) => Object.assign(new Error(message), { code });
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));
const digest = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function normalizedPath(root, path) {
  const result = relative(root, path).split(sep).join("/");
  if (!result || result.startsWith("../") || result.includes("/../") || result.startsWith("/")) {
    throw coded("artifact-path-invalid", "The artifact contains an invalid path.");
  }
  return result;
}

async function filesBelow(root, excluded) {
  const files = [];
  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = resolve(directory, child.name);
      const name = normalizedPath(root, path);
      if (excluded.has(name)) continue;
      const information = await lstat(path);
      if (information.isSymbolicLink()) throw coded("artifact-link-forbidden", `Artifact links are forbidden: ${name}`);
      if (information.isDirectory()) await visit(path);
      else if (information.isFile()) files.push({ name, path, size: information.size });
      else throw coded("artifact-entry-forbidden", `Unsupported artifact entry: ${name}`);
    }
  }
  await visit(root);
  return files;
}

export function assertArtifactManifest(value) {
  if (!exactKeys(value, ["schemaVersion", "entries", "artifactDigest"]) || value.schemaVersion !== ARTIFACT_SCHEMA
      || !Array.isArray(value.entries) || !hex64(value.artifactDigest)) {
    throw coded("artifact-manifest-invalid", "The artifact file manifest is malformed.");
  }
  const caseNames = new Set();
  let previous = "";
  const entries = value.entries.map(entry => {
    const segments = typeof entry.path === "string" ? entry.path.split("/") : [];
    const pathValid = entry.path?.length <= 2_000 && segments.length > 0 && segments.every(segment =>
      segment.length > 0 && segment.length <= 255 && ![".", ".."].includes(segment)
      && !/[\u0000-\u001f\u007f\\:]/.test(segment) && !/[. ]$/.test(segment));
    if (!exactKeys(entry, ["path", "size", "sha256"]) || !pathValid
        || entry.path === ARTIFACT_FILE
        || !Number.isSafeInteger(entry.size) || entry.size < 0 || !hex64(entry.sha256)) {
      throw coded("artifact-entry-invalid", "The artifact file manifest contains an invalid entry.");
    }
    if (previous && previous.localeCompare(entry.path) >= 0) {
      throw coded("artifact-order-invalid", "Artifact entries must be uniquely sorted.");
    }
    previous = entry.path;
    const folded = entry.path.toLocaleLowerCase("en-US");
    if (caseNames.has(folded)) throw coded("artifact-path-collision", "Artifact paths collide by case.");
    caseNames.add(folded);
    return Object.freeze({ path: entry.path, size: entry.size, sha256: entry.sha256 });
  });
  const base = { schemaVersion: ARTIFACT_SCHEMA, entries };
  const artifactDigest = digest(canonicalJson(base));
  if (artifactDigest !== value.artifactDigest) {
    throw coded("artifact-manifest-digest-mismatch", "The artifact manifest does not match its digest.");
  }
  return Object.freeze({ ...base, artifactDigest });
}

export async function buildArtifactManifest(rootDirectory) {
  const root = resolve(rootDirectory);
  const files = await filesBelow(root, new Set([ARTIFACT_FILE]));
  const entries = [];
  for (const file of files) {
    entries.push(Object.freeze({ path: file.name, size: file.size,
      sha256: digest(await readFile(file.path)) }));
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const base = { schemaVersion: ARTIFACT_SCHEMA, entries };
  return assertArtifactManifest({ ...base, artifactDigest: digest(canonicalJson(base)) });
}

export async function verifyReleaseArtifact(rootDirectory, expectedDigest) {
  const root = resolve(rootDirectory);
  let retained;
  try { retained = assertArtifactManifest(JSON.parse(await readFile(resolve(root, ARTIFACT_FILE), "utf8"))); }
  catch (error) {
    if (error?.code) throw error;
    throw coded("artifact-manifest-unavailable", "The artifact file manifest is unavailable.");
  }
  if (retained.artifactDigest !== expectedDigest) {
    throw coded("artifact-release-digest-mismatch", "The artifact is not the one named by the release manifest.");
  }
  const observed = await buildArtifactManifest(root);
  if (observed.artifactDigest !== retained.artifactDigest) {
    throw coded("artifact-files-mismatch", "The installed release files do not match the reviewed artifact.");
  }
  return Object.freeze({ schemaVersion: "runa2-gate6b-artifact-status/v1",
    verified: true, artifactDigest: retained.artifactDigest, fileCount: retained.entries.length,
    privateValuesIncluded: false });
}
