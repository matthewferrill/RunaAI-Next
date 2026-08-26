import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { burninCorpusDigest, parseBurninCorpus } from "./contracts.mjs";

const root = new URL("../../", import.meta.url);
const seal = JSON.parse(await readFile(new URL("./SEAL.json", import.meta.url), "utf8"));
const failures = [];
for (const [path, expected] of Object.entries(seal.files)) {
  const content = await readFile(new URL(path.replaceAll("\\", "/"), root));
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) failures.push({ path, expected, actual });
}
const corpus = parseBurninCorpus(JSON.parse(await readFile(new URL("./corpus.json", import.meta.url), "utf8")));
const canonical = burninCorpusDigest(corpus);
if (canonical !== seal.corpusCanonicalSha256) failures.push({ path: "corpusCanonicalSha256",
  expected: seal.corpusCanonicalSha256, actual: canonical });
const result = { schemaVersion: "runa2-gate7f1-seal-verification/v1", passed: failures.length === 0,
  checkedFiles: Object.keys(seal.files).length, failures, modelCalled: false, networkCalled: false,
  productionChanged: false, privateValuesIncluded: false };
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.passed) process.exitCode = 1;
