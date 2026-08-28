import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { MANIFEST } from "./manifest.mjs";
const here = import.meta.dirname;
const root = path.resolve(here, "../../..");
const target = path.resolve(process.argv[2] ?? path.join(root, "artifacts/m1-readiness", MANIFEST.diagnosticId));
if (existsSync(target)) throw new Error("readiness-package-already-exists");
mkdirSync(target, { recursive: true });
const sourceFiles = { "runner.mjs": path.join(here, "runner.mjs"), "cases.mjs": path.join(here, "cases.mjs"),
  "manifest.mjs": path.join(here, "manifest.mjs"), "gguf-metadata.mjs": path.join(root, "gate7f/evaluation/home/gguf-metadata.mjs"),
  "runtime.json": path.join(root, "gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json") };
const files = Object.fromEntries(Object.entries(sourceFiles).map(([name, file]) => [name, readFileSync(file)]));
const seal = { schemaVersion: "runa-m1-readiness-package-seal/v1", createdAt: new Date().toISOString(),
  diagnosticId: MANIFEST.diagnosticId, createdBeforeInference: true,
  files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, createHash("sha256").update(bytes).digest("hex")])) };
files["seal.json"] = Buffer.from(JSON.stringify(seal, null, 2) + "\n");
const packet = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, bytes.toString("base64")]));
for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(target, name), bytes, { flag: "wx" });
writeFileSync(path.join(target, "transfer.json"), JSON.stringify(packet), { flag: "wx" });
console.log(JSON.stringify({ target, sealSha256: createHash("sha256").update(files["seal.json"]).digest("hex"), ...seal }));
