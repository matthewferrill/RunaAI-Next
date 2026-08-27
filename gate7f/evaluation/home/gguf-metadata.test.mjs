import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readGgufMetadata } from "./gguf-metadata.mjs";

const u32 = value => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const u64 = value => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; };
const str = value => Buffer.concat([u64(Buffer.byteLength(value)), Buffer.from(value)]);
test("GGUF metadata reader preserves exact template and skips vocabulary without touching tensors", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "runa-gate7f1-gguf-"));
  const file = path.join(dir, "fixture.gguf");
  try {
    const bytes = Buffer.concat([Buffer.from("GGUF"), u32(3), u64(1000), u64(3),
      str("tokenizer.tokens"), u32(9), u32(8), u64(2), str("a"), str("b"),
      str("general.architecture"), u32(8), str("gemma4"),
      str("tokenizer.chat_template"), u32(8), str("synthetic template"), Buffer.from("TENSORS")]);
    writeFileSync(file, bytes);
    const result = readGgufMetadata(file);
    assert.equal(result.selected["general.architecture"], "gemma4");
    assert.equal(result.selected["tokenizer.chat_template"], "synthetic template");
    assert.equal(result.metadataBytes, bytes.length - 7);
    assert.match(result.chatTemplateSha256, /^[a-f0-9]{64}$/);
  } finally { unlinkSync(file); rmdirSync(dir); }
});
test("GGUF metadata reader rejects wrong magic and truncated headers", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "runa-gate7f1-gguf-"));
  const file = path.join(dir, "fixture.gguf");
  try {
    writeFileSync(file, Buffer.from("NOPE"));
    assert.throws(() => readGgufMetadata(file), /gguf-magic/);
    writeFileSync(file, Buffer.from("GGUF"));
    assert.throws(() => readGgufMetadata(file), /gguf-truncated/);
  } finally { unlinkSync(file); rmdirSync(dir); }
});
