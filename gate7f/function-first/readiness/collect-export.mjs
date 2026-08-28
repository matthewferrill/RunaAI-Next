import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const input = process.argv[2], output = process.argv[3];
if (!input || !output || existsSync(output)) throw new Error("readiness-export-boundary");
const packet = JSON.parse(readFileSync(input, "utf8"));
const allowed = /^(capture-(qwen36|gemma|coder)\.jsonl|result-(qwen36|gemma|coder)\.json|inventory\.json|seal\.json|power-(before|applied|result)\.json)$/;
if (!Object.keys(packet).length || Object.keys(packet).some(name => !allowed.test(name))) throw new Error("readiness-export-files");
const files = Object.entries(packet).map(([name, data]) => {
  if (typeof data !== "string") throw new Error("readiness-export-data");
  const bytes = Buffer.from(data, "base64");
  if (bytes.toString("base64") !== data || bytes.length > 8 * 1024 * 1024) throw new Error("readiness-export-data");
  return { name, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
});
mkdirSync(output, { recursive: true });
for (const file of files) writeFileSync(path.join(output, file.name), file.bytes, { flag: "wx" });
const manifest = { schemaVersion: "runa-m1-readiness-export/v1", retrievedAt: new Date().toISOString(),
  files: files.map(({ name, bytes, sha256 }) => ({ name, bytes: bytes.length, sha256 })),
  syntheticOnly: true, protectedDataIncluded: false };
writeFileSync(path.join(output, "EXPORT.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(manifest));
