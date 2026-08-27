import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const repo = resolve(directory, "../../..");
const prefix = "gate7f/qualification/acceptance/";
export const SEALED_PATHS = [
  "gate7f/GATE7F-QUALIFICATION-AUTHORIZATION-AND-CRITERIA-2026-08-27.md",
  "gate7f/contracts.mjs",
  "gate7f/evaluation/contracts.mjs",
  "package-lock.json",
  ...[".gitattributes", "tools.mjs", "corpus.mjs", "inputs.mjs", "checks.mjs", "validate.mjs", "seal.mjs", "acceptance.test.mjs", "RUBRIC.md", "README.md"].map(path => prefix + path),
];
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function createAcceptanceSeal(root = repo) {
  return {
    schemaVersion: "runa2-gate7f-qualification-acceptance-seal/v1",
    evaluatorRole: "independent-corpus-designer-and-anonymous-response-judge",
    createdBeforeAcceptanceInference: true,
    files: SEALED_PATHS.map(path => {
      const bytes = readFileSync(resolve(root, path));
      return { path, bytes: bytes.length, sha256: digest(bytes) };
    }),
  };
}
export function verifyAcceptanceSeal(root = repo) {
  const retained = JSON.parse(readFileSync(resolve(root, prefix, "SEAL.json"), "utf8"));
  const actual = createAcceptanceSeal(root);
  const passed = JSON.stringify(retained) === JSON.stringify(actual);
  return { schemaVersion: "runa2-gate7f-qualification-acceptance-seal-verification/v1", passed, fileCount: actual.files.length,
    sealSha256: digest(readFileSync(resolve(root, prefix, "SEAL.json"))) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--print")) process.stdout.write(JSON.stringify(createAcceptanceSeal(), null, 2) + "\n");
  else if (process.argv.includes("--verify")) {
    const result = verifyAcceptanceSeal();
    process.stdout.write(JSON.stringify(result) + "\n");
    if (!result.passed) process.exitCode = 1;
  } else throw new Error("Use --print or --verify; seal generation must be retained before model inference.");
}
