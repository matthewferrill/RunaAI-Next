import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateSmokeSeal, SMOKE_POLICY } from "./operator-smoke.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function verifyOperatorSmoke(events) {
  const sealed = events[0]; assert.equal(sealed.type, "seal");
  const seal = validateSmokeSeal(sealed.seal);
  assert.deepEqual(sealed.policy, SMOKE_POLICY);
  const requests = events.filter(item => item.type === "request"), responses = events.filter(item => item.type === "response");
  const roles = ["chat", "research", "review", "code", "agent", "embedding", "reranker"];
  assert.deepEqual(requests.map(item => item.role), roles); assert.deepEqual(responses.map(item => item.role), roles);
  assert.ok(!events.some(item => item.type === "transport-failure"));
  for (const item of events.filter(item => item.type === "residency")) {
    assert.deepEqual(item.loaded.map(value => value.id).sort(), [seal.primaryInstanceId, seal.embeddingInstanceId].sort());
  }
  assert.equal(events.filter(item => item.type === "residency").length, 2);
  for (let index = 0; index < 5; index++) {
    const input = requests[index].input, output = JSON.parse(responses[index].rawText);
    assert.equal(input.model, seal.modelId); assert.equal(output.model, seal.modelId);
    assert.equal(input.max_tokens, index < 3 ? 512 : 1536); assert.equal(input.temperature, 0);
    assert.equal(input.reasoning_effort, seal.reasoningEffort ?? undefined);
    assert.ok(!JSON.stringify(input).includes("/no_think"));
    assert.equal(output.choices?.[0]?.finish_reason, "stop");
    assert.ok(output.choices[0].message.content.trim());
  }
  assert.equal(requests[5].input.model, seal.embeddingModelId);
  assert.ok(requests[5].input.input[0].startsWith("search_document: "));
  assert.ok(requests[5].input.input[1].startsWith("search_query: "));
  const embeddings = JSON.parse(responses[5].rawText);
  assert.deepEqual(embeddings.data.map(item => item.index), [0, 1]);
  assert.ok(embeddings.data.every(item => item.embedding.length === 768 && item.embedding.every(Number.isFinite)));
  const ranked = JSON.parse(responses[6].rawText);
  assert.deepEqual(ranked.results.map(item => item.index).sort(), [0, 1]);
  assert.ok(ranked.results.every(item => Number.isFinite(item.score)));
  assert.ok(responses.every(item => item.status === 200 && item.elapsedMs >= 0 && item.elapsedMs <= 30_000));
  const final = events.at(-1); assert.equal(final.type, "result");
  assert.equal(final.result.passed, true); assert.equal(final.result.scored, false);
  assert.equal(final.result.productionChanged, false); assert.equal(final.result.providerCalls, 7);
  assert.equal(final.result.modelsLoadedOrUnloaded, false); assert.equal(final.result.modelId, seal.modelId);
  assert.deepEqual(final.result.checks, ["chat-actual-answer-adapter", "research-actual-answer-adapter", "review-actual-answer-adapter",
    "code-actual-planner-adapter", "agent-actual-planner-adapter", "nomic-actual-prefix-and-dimension", "bge-actual-adapter"]);
  return { candidateId: seal.candidateId, modelId: seal.modelId, passed: true, scored: false,
    runtimeSealSha256: seal.runtimeSealSha256, smokeSealSha256: sealed.sealSha256,
    calls: responses.map(item => ({ role: item.role, status: item.status, elapsedMs: item.elapsedMs })),
    actualQdrantJourneyIncluded: false, actualFunctionQualificationIncluded: false, productionChanged: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, name, commit, archiveSha256] = process.argv.slice(2);
  assert.equal(process.argv.length, 6); assert.match(name, /^(gemma|coder|qwen)$/);
  assert.match(commit, /^[a-f0-9]{40}$/); assert.match(archiveSha256, /^[a-f0-9]{64}$/);
  const files = (await readdir(resolve(source))).sort();
  assert.ok(files.length > 0 && files.every((file, index) => file === `${String(index).padStart(4, "0")}.json`));
  const bytes = await Promise.all(files.map(file => readFile(join(source, file))));
  assert.ok(bytes.every(value => value.length < 2_100_000));
  const events = bytes.map(value => JSON.parse(value)), result = verifyOperatorSmoke(events);
  const root = resolve(import.meta.dirname, "../.."), archivePath = resolve(source, "../source.tar"), correspondence = {};
  assert.equal(sha(await readFile(archivePath)), archiveSha256);
  for (const [file, expected] of Object.entries(events[0].seal.sourceFiles)) {
    const blob = execFileSync("git", ["show", `${commit}:${file}`], { cwd: root });
    const archived = execFileSync("tar.exe", ["-xOf", archivePath, file]);
    assert.equal(sha(archived), expected); // exact bytes hashed before the live call
    const exact = archived.equals(blob);
    assert.ok(exact || !blob.includes(Buffer.from("\r\n")) && archived.equals(Buffer.from(blob.toString("utf8").replaceAll("\n", "\r\n"))), "archive-source-drift");
    correspondence[file] = { gitBlobSha256: sha(blob), archivedSha256: expected,
      representation: exact ? "exact-git-blob" : "CRLF-export-of-LF-Git-blob" };
  }
  const output = join(import.meta.dirname, "readiness/evidence", `20260828-actual-adapter-${name}`);
  await mkdir(output); // create-only: a later result cannot overwrite the original run
  for (let index = 0; index < files.length; index++) await writeFile(join(output, files[index]), bytes[index], { flag: "wx" });
  const manifest = { schemaVersion: "runaai-m1-operator-smoke-export/v1", sourceCommit: commit, sourceArchiveSha256: archiveSha256,
    sourceCorrespondence: correspondence,
    files: Object.fromEntries(files.map((file, index) => [file, { bytes: bytes[index].length, sha256: sha(bytes[index]) }])), result };
  await writeFile(join(output, "EXPORT.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, ...result }));
}
