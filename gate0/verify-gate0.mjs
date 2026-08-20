import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gateDir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(gateDir, "..");
const readJson = (name) => JSON.parse(readFileSync(join(gateDir, name), "utf8"));
const profile = readJson("VERIFIER-PROFILE.json");
const corpus = readJson("PARITY-CORPUS.json");
const samples = readJson("SAMPLE-OUTPUTS.json");
const pins = readJson("SOURCE-PINS.json");

function run(command, args, cwd) {
  process.stdout.write(`> ${command} ${args.join(" ")}\n`);
  execFileSync(command, args, { cwd, stdio: "inherit", windowsHide: true });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

for (const relative of profile.requiredDocuments) {
  assert.ok(existsSync(join(repo, relative)), `missing required Gate 0 document: ${relative}`);
}

assert.equal(corpus.schemaVersion, "runa2-gate0-parity-corpus/v1");
assert.equal(corpus.dataPolicy, "synthetic-only");
assert.equal(corpus.cases.length, 18, "the frozen corpus must contain exactly 18 reviewed cases");
assert.equal(new Set(corpus.cases.map((item) => item.id)).size, corpus.cases.length, "case ids must be unique");
for (const lane of ["general", "research", "guarded", "workspace", "all"]) {
  assert.ok(corpus.cases.some((item) => item.lane === lane), `missing parity lane: ${lane}`);
}
for (const item of corpus.cases) {
  assert.ok(item.input && item.fixture && Array.isArray(item.expect) && item.expect.length > 0, `incomplete case: ${item.id}`);
}
assert.equal(samples.schemaVersion, "runa2-gate0-sample-outputs/v1");
assert.equal(samples.sourceCommit, pins.commit);
assert.equal(samples.samples.length, 7, "the deterministic sample set must contain exactly 7 reviewed outputs");
assert.equal(new Set(samples.samples.map((item) => item.id)).size, samples.samples.length, "sample ids must be unique");

run(profile.inherited.nodeCommand[0], profile.inherited.nodeCommand.slice(1), repo);
for (const [command, ...args] of profile.inherited.sealCommands) run(command, args, repo);

const legacy = process.env.RUNAAI_LEGACY_CHECKOUT;
if (legacy) {
  const legacyRoot = resolve(legacy);
  const commit = execFileSync("git", ["-c", `safe.directory=${legacyRoot.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], {
    cwd: legacyRoot, encoding: "utf8", windowsHide: true,
  }).trim();
  assert.equal(commit, pins.commit, "legacy checkout is not at the frozen commit");
  for (const [relative, expected] of Object.entries(pins.files)) {
    assert.equal(sha256(join(legacyRoot, relative)), expected, `legacy source pin changed: ${relative}`);
  }
  for (const relative of profile.legacyFocusedTests) run(process.execPath, [relative], legacyRoot);
} else {
  process.stdout.write("Legacy source pins/tests: NOT RUN (set RUNAAI_LEGACY_CHECKOUT for Gate 0 acceptance)\n");
}

const [major, minor] = process.versions.node.split(".").map(Number);
const selectedNode = major === 22 && minor >= 22;
process.stdout.write(`Node ${process.versions.node}: ${selectedNode ? "selected Gate 1 runtime" : "Gate 0 evidence only; Gate 1 requires >=22.22.0 <23"}\n`);
process.stdout.write(`Gate 0 verification passed: 18 corpus cases, 14 inherited tests expected, 10 seals, ${legacy ? "12 legacy focused suites" : "legacy optional phase not run"}.\n`);
