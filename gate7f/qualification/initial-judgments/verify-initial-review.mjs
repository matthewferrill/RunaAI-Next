import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildInitialReview } from "./build-initial-review.mjs";

for (const label of ["Candidate-A", "Candidate-B"]) {
  const regenerated = await buildInitialReview(label);
  const files = [
    [label + "-initial-judgments.json", regenerated.bundle],
    [label + "-initial-aggregate.json", regenerated.aggregate],
  ];
  const hashes = [];
  for (const [name, expected] of files) {
    const bytes = readFileSync(new URL(name, import.meta.url));
    assert.deepEqual(JSON.parse(bytes), expected, "initial-review-retained-file-mismatch:" + name);
    hashes.push({ name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  process.stdout.write(JSON.stringify({
    label, sourceVerified: regenerated.sourceVerification.passed, turns: regenerated.aggregate.turnResponses,
    attempts: regenerated.aggregate.caseAttempts, files: hashes,
  }) + "\n");
}
