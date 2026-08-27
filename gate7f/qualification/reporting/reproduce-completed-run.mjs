// Reporting-only reproduction of the completed 2026-08-27 matched run.
// Reads retained evidence; never loads a model, writes an artifact or changes a host.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "../runtime.mjs";
import { verifyFinalPublication } from "./publication.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = relative => path.join(root, relative);
const retained = at("artifacts/runs/gate7f1/qualification-power-v2-final-retrieved");
const review = at("artifacts/runs/gate7f1/qualification-blind-review-source");
const results = at("gate7f/qualification/results");
const finalTransfer = {
  root: retained,
  manifest: {
    file: path.join(retained, "FINAL-HOME-EXPORT.json"),
    sha256: "bf1a3e30ae2f72666caf7790a9d94abe5767df2867ea76837bd8b46b844c780d",
  },
  expectedFiles: [
    "power-before.json", "power-applied.json", "power-result.json",
    "qualification/capture-incumbent/events.jsonl", "qualification/capture-incumbent/result.json",
    "qualification/capture-gemma26/events.jsonl", "qualification/capture-gemma26/result.json",
  ],
};

// Pins were retained from the sealed run, Home-created exports and committed blinded review.
// Candidate mapping was disclosed only after adjudication commit 6a283c5.
const result = await verifyFinalPublication({
  packageDir: at("artifacts/runs/gate7f1/qualification-acceptance-power-v2"),
  runSeal: {
    file: at("gate7f/qualification/RUN-SEAL-POWER-V2.json"),
    sha256: "7bc032fc0d4ff7e566ad858315d79b1e9e60222e4def103295736a56b6d2b627",
  },
  reviewTransfer: {
    root: review,
    manifest: {
      file: path.join(review, "HOME-REVIEW-EXPORT.json"),
      sha256: "9dabd2743ead1900af5e3209585e028c7d09ee5da344c410954cd1160bf55970",
    },
    expectedFiles: ["incumbent-prefix.jsonl", "gemma26-prefix.jsonl"],
  },
  mapping: { "blind-candidate-a": "gemma26", "blind-candidate-b": "incumbent" },
  arms: [
    {
      armId: "blind-candidate-a", transfer: finalTransfer,
      packet: { file: path.join(results, "Candidate-A.json"),
        sha256: "4be726089b5022c776dc1f7acad2206d8639f6107f0d18ea05eaf22c0ab2336a" },
      judgments: { file: path.join(results, "Candidate-A-final-judgments.json"),
        sha256: "02faa424a53b1754bf74500ea9fd327b027701fdf63366b8739da15abc1feb8a" },
    },
    {
      armId: "blind-candidate-b", transfer: finalTransfer,
      packet: { file: path.join(results, "Candidate-B.json"),
        sha256: "54b072675c118e2739d703fc159d6b3e9889308b0427fc02f767032fd1f11847" },
      judgments: { file: path.join(results, "Candidate-B-final-judgments.json"),
        sha256: "cc4300043633d20db2d864661c7539cb7b7433faf7bce586ec21d7cd819db887" },
    },
  ],
});
for (const arm of result.arms) {
  const label = arm.armId === "blind-candidate-a" ? "A" : "B";
  const model = label === "A" ? "GEMMA" : "QWEN";
  assert.equal(arm.verifiedSummarySha256, hash(readFileSync(at(
    "gate7f/qualification/evidence/" + model + "-POWER-V2-VERIFIED-SUMMARY.json"))),
    "published-summary-mismatch");
  assert.equal(arm.aggregateSha256, hash(readFileSync(path.join(results,
    "Candidate-" + label + "-final-aggregate.json"))), "published-aggregate-mismatch");
}
const { arms, ...publication } = result;
const compact = {
  ...publication,
  schemaVersion: "runa2-qualification-completed-run-verification/v1",
  fullPublicationSha256: hash(JSON.stringify(result, null, 2) + "\n"),
  arms: arms.map(({ aggregate, ...binding }) => ({
    ...binding,
    roles: Object.fromEntries(Object.entries(aggregate.roleResults).map(([name, role]) => [name, {
      status: role.status, qualified: role.qualified, acceptable: role.counts.acceptable,
      caseAttempts: role.caseAttempts, failureReasons: role.failureReasons,
    }])),
  })),
};
process.stdout.write(JSON.stringify(compact, null, 2) + "\n");
