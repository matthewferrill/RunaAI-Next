import { copyFileSync, constants, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadCorpus } from "./corpus.mjs";
import { messagesForCase } from "./prompt.mjs";
import { root, verifySeal, sha256 } from "./seal.mjs";
import { CAPTURE_POLICY } from "./capture-policy.mjs";

const checked = verifySeal(), corpus = loadCorpus();
const inventory = JSON.parse(readFileSync(path.join(root, "gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json")));
const out = path.join(root, "artifacts/runs/gate7f1/home-capture-20260827-v2");
if (existsSync(out)) throw new Error("gate7f1-v2-bundle-already-exists");
mkdirSync(out);
const bundle = { schemaVersion: "runa2-gate7f1-home-bundle/v2", ...checked,
  capturePolicy: CAPTURE_POLICY, runsPerCase: 3, runtime: inventory,
  candidates: {
    incumbent: { artifactPath: inventory.incumbent.path, artifactBytes: inventory.incumbent.bytes,
      artifactSha256: inventory.incumbent.sha256, quantization: "Q6_K", architecture: "qwen3moe" },
    gemma26: { artifactPath: "C:\\lm-studio-models\\google\\gemma-4-26B-A4B-it-qat-q4_0-gguf\\gemma-4-26B_q4_0-it.gguf",
      artifactBytes: 14439363584, artifactSha256: "3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d",
      quantization: "Q4_0", architecture: "gemma4" },
  },
  requests: corpus.cases.map(item => ({ caseId: item.caseId, format: item.format, messages: messagesForCase(item) })),
};
writeFileSync(path.join(out, "bundle.json"), JSON.stringify(bundle, null, 2) + "\n", { flag: "wx" });
const files = ["capture-contract.mjs", "capture-policy.mjs", "home-runner.mjs", "gguf-metadata.mjs"];
for (const file of files) copyFileSync(path.join(root, "gate7f/evaluation/v2", file), path.join(out, file), constants.COPYFILE_EXCL);
process.stdout.write(JSON.stringify({ outputDirectory: out, evaluationSealSha256: checked.evaluationSealSha256,
  hashes: Object.fromEntries(["bundle.json", ...files].map(file => [file, sha256(readFileSync(path.join(out, file)))])),
  cases: 35, attempts: 105, expectedAnswersIncluded: false, modelCalled: false }) + "\n");
