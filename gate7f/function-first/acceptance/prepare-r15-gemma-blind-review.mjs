import { randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildR15GemmaBlindWorksheet } from "./r15-gemma-review-contract.mjs";
import { r15GemmaEligibilityManifestSha256, validateR15GemmaBatchResult,
  validateR15GemmaEligibilityManifest } from "./r15-gemma-eligibility-contract.mjs";
import { assertOwnedStage, fail } from "./runner-contract.mjs";
import { closePinned, createContainedNewDirectory, openContainedPinned, writeContainedNew } from "./r15-owned-pinned-files.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const safeCode = error => /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "r15-gemma-blind-review-preparation-failed";

export function parseR15GemmaBlindReviewArguments(argv) {
  const expected = new Set(["owned-root", "eligibility-manifest", "eligibility-manifest-sha256",
    "batch-result", "batch-result-sha256", "private-output-directory", "worksheet-output-directory"]), result = {}, seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.slice(2), value = argv[index + 1];
    if (!expected.has(key) || !value || value.startsWith("--") || seen.has(key)) throw fail("r15-gemma-review-argument-invalid");
    seen.add(key); result[key] = value;
  }
  if (seen.size !== expected.size || !HEX.test(result["eligibility-manifest-sha256"] ?? "")
      || !HEX.test(result["batch-result-sha256"] ?? "")
      || result["eligibility-manifest"] !== "acceptance-evidence/r15-gemma-eligibility-arm.json"
      || !/^acceptance-evidence\/campaign-gemma4-26b-a4b-[a-f0-9]{16}\/result\.json$/u.test(result["batch-result"] ?? "")
      || result["private-output-directory"] !== "acceptance-evidence/operator-review-binding"
      || result["worksheet-output-directory"] !== "acceptance-evidence/candidate-blind-review")
    throw fail("r15-gemma-review-argument-invalid");
  return result;
}

export async function prepareR15GemmaBlindReview(args, { random = randomBytes } = {}) {
  const root = assertOwnedStage(args["owned-root"]), pinned = [];
  try {
    const armInput = await openContainedPinned(root, args["eligibility-manifest"], { maximumBytes: 2 * 1024 * 1024,
      code: "r15-gemma-review-arm" }); pinned.push(armInput);
    const arm = validateR15GemmaEligibilityManifest(armInput.json());
    if (r15GemmaEligibilityManifestSha256(arm) !== args["eligibility-manifest-sha256"])
      throw fail("r15-gemma-review-manifest-pin");
    const batch = await openContainedPinned(root, args["batch-result"], { expectedSha256: args["batch-result-sha256"],
      maximumBytes: 16 * 1024 * 1024, code: "r15-gemma-review-batch" }); pinned.push(batch);
    validateR15GemmaBatchResult(batch.json(), arm);
    const directory = path.dirname(batch.absolute), packets = [];
    for (const attempt of batch.json().attempts) {
      const raw = await openContainedPinned(root, path.relative(root, path.join(directory, attempt.file)), {
        expectedSha256: attempt.sha256, maximumBytes: 64 * 1024 * 1024, code: "r15-gemma-review-packet" });
      const record = await openContainedPinned(root, path.relative(root, path.join(directory, `${attempt.attemptId}.record.json`)), {
        maximumBytes: 2 * 1024 * 1024, code: "r15-gemma-review-record" });
      pinned.push(raw, record);
      if (raw.bytes.length !== attempt.bytes) throw fail("r15-gemma-review-packet-pin");
      packets.push({ attemptId: attempt.attemptId, observation: raw.json(), rawBytes: raw.bytes, recordBytes: record.bytes });
    }
    const prepared = buildR15GemmaBlindWorksheet({ eligibilityManifest: arm,
      eligibilityManifestSha256: args["eligibility-manifest-sha256"], packets, blindKey: random(32) });
    const privateOutput = path.resolve(root, args["private-output-directory"]);
    const worksheetOutput = path.resolve(root, args["worksheet-output-directory"]);
    if (!privateOutput.startsWith(root + path.sep) || !worksheetOutput.startsWith(root + path.sep)
        || privateOutput === worksheetOutput || /gemma|qwen|coder/iu.test(args["private-output-directory"] + args["worksheet-output-directory"]))
      throw fail("r15-gemma-review-output-path");
    await Promise.all(pinned.map(input => input.verifyUnchanged()));
    await createContainedNewDirectory(root, args["private-output-directory"], "r15-gemma-review-private-directory");
    await createContainedNewDirectory(root, args["worksheet-output-directory"], "r15-gemma-review-worksheet-directory");
    const manifestPublication = await writeContainedNew(root,
      `${args["private-output-directory"]}/review-manifest.json`, prepared.reviewManifest, "r15-gemma-review-manifest-publication");
    const worksheetPublication = await writeContainedNew(root,
      `${args["worksheet-output-directory"]}/review-worksheet.json`, prepared.worksheet, "r15-gemma-review-worksheet-publication");
    return Object.freeze({ schemaVersion: "runaai-m1-r15-gemma-blind-review-preparation/v1", candidateIdentityInWorksheet: false,
      reviewedAttempts: prepared.worksheet.attempts.length, reviewManifest: manifestPublication, worksheet: worksheetPublication,
      reviewerReceivesOnly: "acceptance-evidence/candidate-blind-review/review-worksheet.json",
      privateBindingDirectory: "acceptance-evidence/operator-review-binding",
      modelsInvoked: false, productionChanged: false, protectedDataRead: false });
  } finally { await closePinned(pinned); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await prepareR15GemmaBlindReview(parseR15GemmaBlindReviewArguments(process.argv.slice(2))))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-r15-gemma-blind-review-preparation-error/v1",
    errorCode: safeCode(error), modelsInvoked: false, productionChanged: false })}\n`); process.exitCode = 1; }
}
