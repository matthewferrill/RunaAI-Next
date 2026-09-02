import { lstat, mkdir, open, realpath } from "node:fs/promises";
import path from "node:path";

import { fail, sha256 } from "./runner-contract.mjs";

function contained(root, target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : null;
}

async function rejectReparseChain(root, absolute, code) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw fail(code);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw fail(code);
  if (!relative) return;
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw fail(code);
  }
}

async function stableNamedIdentity(absolute, handle, code) {
  const held = await handle.stat({ bigint: true }), named = await lstat(absolute, { bigint: true });
  if (!held.isFile() || !named.isFile() || held.dev !== named.dev || held.ino !== named.ino || held.size !== named.size)
    throw fail(code);
  return held;
}

export async function createContainedNewDirectory(rootInput, relativeInput, code = "r15-owned-new-directory") {
  const root = path.resolve(rootInput), absolute = path.resolve(root, relativeInput), relative = contained(root, absolute);
  if (!relative) throw fail(`${code}-path`);
  const parent = path.dirname(absolute), rootReal = await realpath(root);
  await rejectReparseChain(root, parent, `${code}-reparse`);
  if (path.relative(rootReal, await realpath(parent)) !== path.relative(root, parent)) throw fail(`${code}-path`);
  await mkdir(absolute, { recursive: false });
  await rejectReparseChain(root, absolute, `${code}-reparse`);
  if (await realpath(root) !== rootReal || path.relative(rootReal, await realpath(absolute)) !== relative) throw fail(`${code}-path`);
  return absolute;
}

export async function writeContainedNew(rootInput, relativeInput, value, code = "r15-owned-new-file", { afterSync } = {}) {
  const root = path.resolve(rootInput), absolute = path.resolve(root, relativeInput), relative = contained(root, absolute);
  if (!relative) throw fail(`${code}-path`);
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (bytes.length < 1) throw fail(`${code}-shape`);
  const parent = path.dirname(absolute), rootReal = await realpath(root);
  await rejectReparseChain(root, parent, `${code}-reparse`);
  if (path.relative(rootReal, await realpath(parent)) !== path.relative(root, parent)) throw fail(`${code}-path`);
  const handle = await open(absolute, "wx+");
  try {
    const opened = await stableNamedIdentity(absolute, handle, `${code}-changed`);
    if (opened.size !== 0n) throw fail(`${code}-changed`);
    await handle.writeFile(bytes); await handle.sync();
    if (afterSync) await afterSync({ absolute, handle });
    await rejectReparseChain(root, absolute, `${code}-reparse`);
    if (await realpath(root) !== rootReal || path.relative(rootReal, await realpath(absolute)) !== relative) throw fail(`${code}-path`);
    const written = await stableNamedIdentity(absolute, handle, `${code}-changed`);
    if (written.size !== BigInt(bytes.length)) throw fail(`${code}-changed`);
    const durable = await readFromStart(handle, Number(written.size), `${code}-read`);
    if (sha256(durable) !== sha256(bytes)) throw fail(`${code}-changed`);
    await stableNamedIdentity(absolute, handle, `${code}-changed`);
    return { file: path.basename(absolute), bytes: bytes.length, sha256: sha256(bytes) };
  } finally { await handle.close(); }
}

async function readFromStart(handle, size, code) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
    if (bytesRead === 0) throw fail(code);
    offset += bytesRead;
  }
  return bytes;
}

export async function openContainedPinned(rootInput, relativeInput, {
  expectedSha256 = null, maximumBytes = 64 * 1024 * 1024, code = "r15-owned-pinned-file"
} = {}) {
  const root = path.resolve(rootInput), absolute = path.resolve(root, relativeInput);
  const relative = contained(root, absolute);
  if (!relative) throw fail(`${code}-path`);
  await rejectReparseChain(root, absolute, `${code}-reparse`);
  const rootReal = await realpath(root), targetReal = await realpath(absolute);
  if (path.relative(rootReal, targetReal) !== relative) throw fail(`${code}-path`);
  const handle = await open(absolute, "r");
  try {
    const stat = await stableNamedIdentity(absolute, handle, `${code}-changed`);
    if (!stat.isFile() || stat.size < 1n || stat.size > BigInt(maximumBytes)) throw fail(`${code}-shape`);
    const size = Number(stat.size), bytes = await readFromStart(handle, size, `${code}-read`), digest = sha256(bytes);
    if (expectedSha256 && digest !== expectedSha256) throw fail(`${code}-pin`);
    const identity = { dev: stat.dev, ino: stat.ino, size: stat.size };
    return {
      absolute, relative: relative.split(path.sep).join("/"), handle, bytes, sha256: digest,
      json() { try { return JSON.parse(bytes.toString("utf8")); } catch { throw fail(`${code}-json`); } },
      async verifyUnchanged() {
        await rejectReparseChain(root, absolute, `${code}-changed`);
        if (await realpath(root) !== rootReal || await realpath(absolute) !== targetReal) throw fail(`${code}-changed`);
        const after = await handle.stat({ bigint: true });
        if (!after.isFile() || after.dev !== identity.dev || after.ino !== identity.ino || after.size !== identity.size)
          throw fail(`${code}-changed`);
        await stableNamedIdentity(absolute, handle, `${code}-changed`);
        const current = await readFromStart(handle, Number(after.size), `${code}-read`);
        if (sha256(current) !== digest) throw fail(`${code}-changed`);
        const namedHandle = await open(absolute, "r");
        try {
          const currentNamed = await stableNamedIdentity(absolute, namedHandle, `${code}-changed`);
          if (currentNamed.dev !== identity.dev || currentNamed.ino !== identity.ino || currentNamed.size !== identity.size
              || sha256(await readFromStart(namedHandle, Number(currentNamed.size), `${code}-read`)) !== digest)
            throw fail(`${code}-changed`);
        } finally { await namedHandle.close(); }
        await stableNamedIdentity(absolute, handle, `${code}-changed`);
        return true;
      },
      async close() { await handle.close(); }
    };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function closePinned(inputs) {
  await Promise.allSettled(inputs.map(input => input?.close()));
}
