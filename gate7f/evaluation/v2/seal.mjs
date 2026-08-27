import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus, corpusDigest } from "./corpus.mjs";
import { CAPTURE_POLICY } from "./capture-policy.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const filesToSeal = [
  "gate7f/GATE7F1-V2-CORRECTION-PLAN-2026-08-27.md", "gate7f/contracts.mjs",
  "gate7f/evaluation/corpus.json", "gate7f/evaluation/contracts.mjs", "gate7f/evaluation/grader.mjs",
  "gate7f/evaluation/SEAL.json", "gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json", "package-lock.json",
  ...["capture-policy.mjs", "corpus.mjs", "prompt.mjs", "contracts.mjs", "grader.mjs", "capture-contract.mjs",
    "home-runner.mjs", "gguf-metadata.mjs", "build-bundle.mjs", "seal.mjs", "report.mjs", "v2.test.mjs", "README.md"]
    .map(file => "gate7f/evaluation/v2/" + file),
];
const fileDigest = file => sha256(readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n"));
const sealPath = path.join(root, "gate7f/evaluation/v2/SEAL.json");
export function verifySeal() {
  const raw = readFileSync(sealPath, "utf8").replace(/\r\n/g, "\n");
  const seal = JSON.parse(raw);
  if (JSON.stringify(Object.keys(seal.files).sort()) !== JSON.stringify([...filesToSeal].sort()))
    throw new Error("gate7f1-v2-seal-file-set-drift");
  for (const [file, expected] of Object.entries(seal.files))
    if (fileDigest(file) !== expected) throw new Error("gate7f1-v2-seal-file-drift:" + file);
  if (seal.corpusCanonicalSha256 !== corpusDigest(loadCorpus())
    || JSON.stringify(seal.capturePolicy) !== JSON.stringify(CAPTURE_POLICY)) throw new Error("gate7f1-v2-seal-contract-drift");
  return { seal, evaluationSealSha256: sha256(raw) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--create") {
    if (existsSync(sealPath)) throw new Error("gate7f1-v2-seal-already-exists");
    const seal = { schemaVersion: "runa2-gate7f1-seal/v2", sealedAt: new Date().toISOString(),
      priorEvidenceKnown: true, corpusCanonicalSha256: corpusDigest(loadCorpus()), capturePolicy: CAPTURE_POLICY,
      files: Object.fromEntries(filesToSeal.map(file => [file, fileDigest(file)])) };
    writeFileSync(sealPath, JSON.stringify(seal, null, 2) + "\n", { flag: "wx" });
  }
  const checked = verifySeal();
  process.stdout.write(JSON.stringify({ passed: true, checkedFiles: filesToSeal.length,
    evaluationSealSha256: checked.evaluationSealSha256, modelCalled: false }) + "\n");
}
