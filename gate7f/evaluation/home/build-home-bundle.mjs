import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBurninCorpus, burninCorpusDigest } from "../contracts.mjs";
import { messagesForBurninCase } from "../prompt.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const seal = JSON.parse(readFileSync(path.join(here, "../SEAL.json"), "utf8"));
for (const [file, expected] of Object.entries(seal.files)) {
  const bytes = readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
  if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("gate7f1-seal-drift:" + file);
}
const corpus = parseBurninCorpus(JSON.parse(readFileSync(path.join(here, "../corpus.json"), "utf8")));
if (burninCorpusDigest(corpus) !== seal.corpusCanonicalSha256) throw new Error("gate7f1-corpus-drift");
const inventory = JSON.parse(readFileSync(path.join(here, "HOME-RUNTIME-2026-08-27.json"), "utf8"));
const out = path.join(root, "artifacts/runs/gate7f1/home-capture-20260827-r3");
mkdirSync(out, { recursive: true });
const bundle = {
  schemaVersion: "runa2-gate7f1-home-bundle/v1", seal, runsPerCase: corpus.runsPerCase,
  runtime: inventory,
  candidates: {
    incumbent: { artifactPath: inventory.incumbent.path, artifactBytes: inventory.incumbent.bytes,
      artifactSha256: inventory.incumbent.sha256, quantization: "Q6_K", architecture: "qwen3moe" },
    gemma26: { artifactPath: "C:\\lm-studio-models\\google\\gemma-4-26B-A4B-it-qat-q4_0-gguf\\gemma-4-26B_q4_0-it.gguf",
      artifactBytes: 14439363584, artifactSha256: "3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d",
      quantization: "Q4_0", architecture: "gemma4" },
  },
  requests: corpus.cases.map(item => ({ caseId: item.caseId, format: item.format,
    messages: messagesForBurninCase(item) })),
};
writeFileSync(path.join(out, "bundle.json"), JSON.stringify(bundle, null, 2) + "\n", { flag: "wx" });
for (const file of ["capture-contract.mjs", "home-runner.mjs", "gguf-metadata.mjs"]) {
  copyFileSync(path.join(here, file), path.join(out, file), constants.COPYFILE_EXCL);
}
process.stdout.write(JSON.stringify({ schemaVersion: "runa2-gate7f1-home-bundle-build/v1",
  outputDirectory: out, cases: bundle.requests.length, runs: bundle.requests.length * bundle.runsPerCase,
  expectedAnswersIncluded: false, networkCalled: false, modelCalled: false }) + "\n");
