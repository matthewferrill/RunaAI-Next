import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCampaignArguments, runModelCampaign } from "./run-model-campaign.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const SOURCE_COMMIT = "213847149e376d0926683f50beb434d7f725b9ff";
const RUNTIME_SEAL = "386ebd07fd1d16834c2c57aa63c5c1e5ae9f9be21ce1abd880496aa6af055a59";
export const REMAINING_ATTEMPTS = Object.freeze([
  "qwen36-27b-mtp--agent-04-revoked-plan--3",
  "qwen36-27b-mtp--agent-05-cancel-drain--3",
  "qwen36-27b-mtp--agent-06-crash-reconcile--3",
  "qwen36-27b-mtp--agent-07-lost-ack--3",
  "qwen36-27b-mtp--agent-08-undo-display--3",
  "qwen36-27b-mtp--review-01-cross-file-contract--3",
  "qwen36-27b-mtp--review-02-long-contradiction--3",
  "qwen36-27b-mtp--review-03-current-policy--3",
  "qwen36-27b-mtp--review-04-path-issue--3",
  "qwen36-27b-mtp--review-05-unsupported-claim--3",
  "qwen36-27b-mtp--review-06-evidence-explanation--3",
  "qwen36-27b-mtp--review-07-fake-tool-output--3",
  "qwen36-27b-mtp--review-08-insufficient-context--3",
]);

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => Object.assign(new Error(code), { code });
const safeCode = error => /^m1-[a-z0-9-]+$/u.test(error?.code ?? error?.message ?? "") ? error.code ?? error.message : "m1-campaign-supplemental-failed";

export function parseSupplementalArguments(argv) {
  const retained = [], supplemental = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.slice(2), value = argv[index + 1];
    if (!argv[index]?.startsWith("--") || !value || value.startsWith("--")) throw fail("m1-campaign-argument-invalid");
    if (["prior-result", "prior-result-sha256"].includes(key)) {
      if (supplemental[key]) throw fail("m1-campaign-duplicate-argument");
      supplemental[key] = value;
    } else retained.push(argv[index], value);
  }
  if (!supplemental["prior-result"] || !HEX.test(supplemental["prior-result-sha256"] ?? "")) throw fail("m1-campaign-required-input-missing");
  return { campaign: parseCampaignArguments(retained), supplemental };
}

export async function validatePriorResult({ campaign, supplemental }) {
  const root = await realpath(path.resolve(campaign["owned-root"]));
  const requested = path.resolve(root, supplemental["prior-result"]);
  const actual = await realpath(requested);
  if (path.dirname(actual).toLowerCase() !== path.join(root, "acceptance-evidence").toLowerCase()) throw fail("m1-campaign-supplemental-prior-path");
  const stat = await lstat(actual);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 2 * 1024 * 1024) throw fail("m1-campaign-supplemental-prior-file");
  const bytes = await readFile(actual);
  if (digest(bytes) !== supplemental["prior-result-sha256"]) throw fail("m1-campaign-supplemental-prior-digest");
  const value = JSON.parse(bytes);
  if (value.schemaVersion !== "runaai-m1-candidate-batch-result/v2" || value.candidateId !== "qwen36-27b-mtp"
      || value.sourceCommit !== SOURCE_COMMIT || value.runtimeSealSha256 !== RUNTIME_SEAL
      || value.recordedAttempts !== 107 || value.stopCode !== "m1-campaign-batch-hard-stop"
      || JSON.stringify(value.notExecuted) !== JSON.stringify(REMAINING_ATTEMPTS)
      || value.productionChanged !== false || value.protectedDataRead !== false) throw fail("m1-campaign-supplemental-prior-invalid");
  return { sha256: supplemental["prior-result-sha256"], recordedAttempts: value.recordedAttempts,
    notExecuted: value.notExecuted, formalQualificationCompositionPermitted: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseSupplementalArguments(process.argv.slice(2));
    const prior = await validatePriorResult(args);
    const result = await runModelCampaign(args.campaign, { supplementalAttemptIds: REMAINING_ATTEMPTS,
      supplementalPriorResult: prior, announce: value => process.stdout.write(`${JSON.stringify(value)}\n`) });
    process.stdout.write(`${JSON.stringify({ schemaVersion: result.schemaVersion, candidateId: result.candidateId,
      recordedAttempts: result.recordedAttempts ?? null, plannedCandidateAttempts: REMAINING_ATTEMPTS.length,
      notExecuted: result.notExecuted?.length ?? null, stopCode: result.stopCode ?? result.errorCode ?? null,
      supplemental: true, qualificationCompositionPermitted: false, productQualificationPassed: false,
      evidenceDirectory: result.evidenceDirectory, productionChanged: false })}\n`);
    if (result.errorCode || result.stopCode || result.cleanupError) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-supplemental-error/v1", errorCode: safeCode(error),
      supplemental: true, qualificationCompositionPermitted: false, productQualificationPassed: false, productionChanged: false })}\n`);
    process.exitCode = 1;
  }
}
