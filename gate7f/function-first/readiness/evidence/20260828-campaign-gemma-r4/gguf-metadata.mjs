import { closeSync, openSync, readSync } from "node:fs";
import { createHash } from "node:crypto";

// Read only GGUF metadata; never map tensor data or execute a template.
export function readGgufMetadata(file) {
  const fd = openSync(file, "r");
  let offset = 0;
  const limit = 128 * 1024 * 1024;
  const take = size => {
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > limit) throw new Error("gate7f1-gguf-bounds");
    const buffer = Buffer.alloc(size);
    if (readSync(fd, buffer, 0, size, offset) !== size) throw new Error("gate7f1-gguf-truncated");
    offset += size;
    return buffer;
  };
  const skip = size => {
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > limit) throw new Error("gate7f1-gguf-bounds");
    offset += size;
  };
  const u32 = () => take(4).readUInt32LE();
  const u64 = () => Number(take(8).readBigUInt64LE());
  const string = keep => {
    const length = u64();
    if (keep) return take(length).toString("utf8");
    skip(length);
  };
  const fixed = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
  const value = (type, keep, depth = 0) => {
    if (depth > 3) throw new Error("gate7f1-gguf-depth");
    if (type === 8) return string(keep);
    if (type === 9) {
      const element = u32(), count = u64();
      if (!Number.isSafeInteger(count) || count > 10_000_000) throw new Error("gate7f1-gguf-array-limit");
      if (fixed[element]) skip(count * fixed[element]);
      else for (let i = 0; i < count; i++) value(element, false, depth + 1);
      return null;
    }
    if (!fixed[type]) throw new Error("gate7f1-gguf-type");
    skip(fixed[type]);
    return null;
  };
  try {
    if (take(4).toString() !== "GGUF") throw new Error("gate7f1-gguf-magic");
    const version = u32();
    if (version !== 3) throw new Error("gate7f1-gguf-version");
    const tensorCount = u64(), kvCount = u64();
    if (kvCount > 100_000) throw new Error("gate7f1-gguf-kv-limit");
    const selected = {};
    for (let i = 0; i < kvCount; i++) {
      const key = string(true), type = u32();
      const keep = ["general.name", "general.architecture", "tokenizer.chat_template"].includes(key);
      const content = value(type, keep);
      if (keep) selected[key] = content;
    }
    const template = selected["tokenizer.chat_template"];
    return { version, tensorCount, kvCount, metadataBytes: offset, selected,
      chatTemplateSha256: typeof template === "string" ? createHash("sha256").update(template).digest("hex") : null };
  } finally { closeSync(fd); }
}
