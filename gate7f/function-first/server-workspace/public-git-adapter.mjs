import fs from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as git from "isomorphic-git";
import materializationPolicy from "./m1-s2b1-materialization-policy.json" with { type: "json" };
import { createGitBrokerHttp } from "./git-broker-transport.mjs";
import { fileSetDigest, manifestEntrySchema, materializationRequestSchema, sourceSelectionSchema } from "./materialization-contracts.mjs";

const fail = code => Object.assign(new Error(code), { code });
const textExtensions = new Set(materializationPolicy.utf8TextExtensionsCaseInsensitive);
const excludedBasenames = new Set(materializationPolicy.excludedBasenamesCaseInsensitive);
const excludedSuffixes = materializationPolicy.excludedSuffixesCaseInsensitive;
const excludedPrefixes = materializationPolicy.excludedPrefixesCaseInsensitive;

function assertSeparateAbsoluteRoots(objectDirectory, stagingDirectory) {
  const objectRoot = path.resolve(objectDirectory), stagingRoot = path.resolve(stagingDirectory);
  const nested = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };
  if (!path.isAbsolute(objectDirectory) || !path.isAbsolute(stagingDirectory)
      || nested(objectRoot, stagingRoot) || nested(stagingRoot, objectRoot)) {
    throw fail("workspace-root-invalid");
  }
}

function excluded(relativePath) {
  const basename = path.posix.basename(relativePath).toLowerCase();
  return excludedBasenames.has(basename) || excludedSuffixes.some(value => basename.endsWith(value))
    || excludedPrefixes.some(value => basename.startsWith(value));
}

function mediaClass(relativePath, blob) {
  if (!textExtensions.has(path.posix.extname(relativePath).toLowerCase())) return "binary";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(blob);
    return "utf8-text";
  } catch { return "binary"; }
}

async function collectTree({ objectDirectory, treeOid, prefix = "", output }) {
  const { tree } = await git.readTree({ fs, dir: objectDirectory, oid: treeOid });
  for (const item of tree) {
    const relativePath = prefix ? `${prefix}/${item.path}` : item.path;
    if (item.type === "tree") {
      await collectTree({ objectDirectory, treeOid: item.oid, prefix: relativePath, output });
      continue;
    }
    if (item.type !== "blob" || !["100644", "100755"].includes(item.mode)) throw fail("workspace-tree-entry-denied");
    if (excluded(relativePath)) { output.excludedCount += 1; continue; }
    const { blob } = await git.readBlob({ fs, dir: objectDirectory, oid: item.oid });
    const value = manifestEntrySchema.safeParse({ path: relativePath, bytes: blob.length,
      sha256: createHash("sha256").update(blob).digest("hex"),
      mediaClass: mediaClass(relativePath, blob) });
    if (!value.success) throw fail("workspace-tree-entry-denied");
    output.files.push(Object.freeze({ ...value.data, blob: Buffer.from(blob) }));
  }
}

export async function materializeGitCommit({ objectDirectory, commitOid, expectedCommitOid, stagingDirectory }) {
  assertSeparateAbsoluteRoots(objectDirectory, stagingDirectory);
  if (!/^[a-f0-9]{40}$/u.test(expectedCommitOid) || commitOid !== expectedCommitOid) {
    throw fail("workspace-commit-mismatch");
  }
  const { commit } = await git.readCommit({ fs, dir: objectDirectory, oid: commitOid });
  const output = { files: [], excludedCount: 0 };
  await collectTree({ objectDirectory, treeOid: commit.tree, output });
  output.files.sort((left, right) => {
    const leftKey = left.path.toLowerCase(), rightKey = right.path.toLowerCase();
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  if (output.files.length > materializationPolicy.maximumFiles) throw fail("workspace-file-limit");
  if (output.files.some((value, index) => index > 0
      && output.files[index - 1].path.toLowerCase() === value.path.toLowerCase())) throw fail("workspace-path-collision");
  const totalBytes = output.files.reduce((sum, value) => sum + value.bytes, 0);
  if (totalBytes > materializationPolicy.maximumTotalBytes) throw fail("workspace-total-bytes-limit");
  await mkdir(stagingDirectory, { recursive: false });
  for (const file of output.files) {
    const destination = path.join(stagingDirectory, ...file.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.blob, { flag: "wx", mode: 0o600 });
  }
  const entries = output.files.map(({ blob: _blob, ...entry }) => entry);
  return Object.freeze({ nativeVersion: commitOid, entries: Object.freeze(entries),
    fileSetDigest: fileSetDigest(entries), excludedCount: output.excludedCount,
    rejectedCount: 0, complete: true, totalBytes });
}

export class PublicGitSourceAdapter {
  constructor({ broker }) {
    if (!broker || typeof broker.request !== "function") throw fail("git-broker-required");
    this.broker = broker;
  }

  async materialize({ source: rawSource, request: rawRequest, expectedCommitOid, objectDirectory, stagingDirectory }) {
    const source = sourceSelectionSchema.parse(rawSource);
    const request = materializationRequestSchema.parse(rawRequest);
    if (source.sourceKind !== "git-public-https" || !["configured", "connected"].includes(source.lifecycle)
        || request.sourceId !== source.sourceId || request.requestedRef !== source.requestedRef
        || request.uploadSessionId !== null || request.uploadManifestDigest !== null) {
      throw fail("public-git-source-binding-invalid");
    }
    assertSeparateAbsoluteRoots(objectDirectory, stagingDirectory);
    await mkdir(objectDirectory, { recursive: false });
    const http = createGitBrokerHttp({ broker: this.broker, repositoryHttpsUrl: source.repositoryHttpsUrl,
      sourceId: source.sourceId, requestId: request.requestId });
    await git.clone({ fs, http, dir: objectDirectory, url: source.repositoryHttpsUrl, ref: source.requestedRef,
      singleBranch: true, depth: 1, tags: false, noCheckout: true });
    if (http.requestCount() !== 2) throw fail("git-broker-request-count-invalid");
    const commitOid = await git.resolveRef({ fs, dir: objectDirectory, ref: "HEAD" });
    return materializeGitCommit({ objectDirectory, commitOid, expectedCommitOid, stagingDirectory });
  }
}
