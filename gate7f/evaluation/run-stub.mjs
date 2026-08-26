import { readFile } from "node:fs/promises";
import { parseBurninCorpus, burninCorpusDigest } from "./contracts.mjs";
import { aggregateBurnin, passingResponseForCase } from "./grader.mjs";

const corpus = parseBurninCorpus(JSON.parse(await readFile(new URL("./corpus.json", import.meta.url), "utf8")));
const observations = corpus.cases.flatMap(item => Array.from({ length: corpus.runsPerCase }, (_, index) => ({
  schemaVersion: "runa2-gate7f1-observation/v1",
  candidateId: "sealed-stub",
  caseId: item.caseId,
  attempt: index + 1,
  modelId: "stub/no-model-called",
  artifactSha256: "a".repeat(64),
  runtimeFingerprintSha256: "b".repeat(64),
  rawResponse: passingResponseForCase(item),
  elapsedMs: 1,
  generationTokens: 1,
  generatedTokensPerSecond: 1,
})));
const aggregate = aggregateBurnin(corpus, observations);
const result = {
  schemaVersion: "runa2-gate7f1-stub-result/v1",
  passed: aggregate.decidable && aggregate.eligible && aggregate.passedRuns === 105,
  corpusSha256: burninCorpusDigest(corpus),
  cases: corpus.cases.length,
  runs: aggregate.observedRuns,
  categories: Object.keys(aggregate.byCategory).length,
  rawResponsesRetained: false,
  modelCalled: false,
  networkCalled: false,
  productionChanged: false,
  privateValuesIncluded: false,
};
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.passed) process.exitCode = 1;
