import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCampaignFailure } from "./campaign-failure.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => { const error = new Error(code); error.code = code; throw error; };

async function optionalRegular(file) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail("m1-recovery-file-invalid");
    return await readFile(file);
  } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

export async function recoverInterruptedCampaign(directory) {
  const planBytes = await readFile(path.join(directory, "plan.json")), plan = JSON.parse(planBytes);
  if (!Array.isArray(plan.attempts) || plan.attempts.length < 1
      || plan.attempts.some(row => !/^[a-z0-9-]{1,180}$/u.test(row?.attemptId ?? ""))
      || new Set(plan.attempts.map(row => row.attemptId)).size !== plan.attempts.length) fail("m1-recovery-plan-invalid");
  const attempts = [], observations = new Map();
  let gapIndex = plan.attempts.length, pause = null;
  for (let index = 0; index < plan.attempts.length; index++) {
    const slot = plan.attempts[index], recordBytes = await optionalRegular(path.join(directory, `${slot.attemptId}.record.json`));
    if (!recordBytes) { gapIndex = index; break; }
    const startedBytes = await optionalRegular(path.join(directory, `${slot.attemptId}.started.json`));
    if (!startedBytes) fail("m1-recovery-started-missing");
    const started = JSON.parse(startedBytes), record = JSON.parse(recordBytes);
    if (started.attemptId !== slot.attemptId || started.candidateId !== slot.candidateId || started.caseId !== slot.caseId
        || started.repetition !== slot.repetition || started.runtimeSealSha256 !== plan.runtimeSealSha256
        || record.attemptId !== slot.attemptId || record.file !== `${slot.attemptId}.json`) fail("m1-recovery-attempt-binding-invalid");
    const observationBytes = await optionalRegular(path.join(directory, record.file));
    if (!observationBytes) fail("m1-recovery-observation-missing");
    if (sha256(observationBytes) !== record.sha256 || observationBytes.byteLength !== record.bytes) fail("m1-recovery-observation-hash-invalid");
    const observation = JSON.parse(observationBytes); observations.set(slot.attemptId, observation);
    if (observation.candidateId !== slot.candidateId || observation.caseId !== slot.caseId
        || observation.repetition !== slot.repetition || observation.runtimeSealSha256 !== plan.runtimeSealSha256
        || observation.caseBundleSha256 !== plan.caseBundleSha256) fail("m1-recovery-observation-binding-invalid");
    if (observation.productionChanged !== false || observation.protectedDataRead !== false) fail("m1-recovery-containment-invalid");
    attempts.push({ ...slot, file: record.file, sha256: record.sha256, bytes: record.bytes,
      status: record.status, preliminaryGrade: record.preliminaryGrade,
      passed: observation.grade?.passed ?? false, providerCalls: observation.provider?.calls?.length ?? 0,
      nativeCalls: observation.native?.calls?.length ?? 0 });
  }
  if (gapIndex === plan.attempts.length) fail("m1-recovery-not-interrupted");
  for (const slot of plan.attempts.slice(gapIndex + 1)) {
    if (await optionalRegular(path.join(directory, `${slot.attemptId}.record.json`))) fail("m1-recovery-record-suffix-invalid");
  }
  const pausedSlot = plan.attempts[gapIndex], pauseBytes = await optionalRegular(path.join(directory, `${pausedSlot.attemptId}.pause.json`));
  if (pauseBytes) {
    pause = JSON.parse(pauseBytes);
    const classified = classifyCampaignFailure(pause?.failure?.code, { phase: "runner" });
    if (pause.schemaVersion !== "runaai-m1-campaign-pause/v1" || pause.attemptId !== pausedSlot.attemptId
        || pause.candidateId !== pausedSlot.candidateId || pause.caseId !== pausedSlot.caseId
        || pause.repetition !== pausedSlot.repetition || pause.runtimeSealSha256 !== plan.runtimeSealSha256
        || pause.resumeAttemptId !== pausedSlot.attemptId || pause.attemptConsumed !== false || pause.modelGraded !== false
        || pause.completedPrefixImmutable !== true || classified.attribution !== "non-model") fail("m1-recovery-pause-invalid");
  }
  const stopCode = pause?.failure?.code ?? "m1-campaign-operator-stop";
  const notExecuted = plan.attempts.slice(attempts.length).map(row => row.attemptId);
  const result = { schemaVersion: "runaai-m1-recovered-interrupted-candidate-result/v1", candidateId: plan.candidateId,
    sourceCommit: plan.sourceCommit, runtimeSealSha256: plan.runtimeSealSha256, caseBundleSha256: plan.caseBundleSha256,
    plannedCampaignAttempts: plan.plannedCampaignAttempts ?? 360, plannedCandidateAttempts: plan.attempts.length,
    recordedAttempts: attempts.length, attempts, notExecuted, stopCode,
    denominatorChanged: plan.supplemental === true, supplemental: plan.supplemental === true,
    qualificationCompositionPermitted: false, productQualificationPassed: false, independentSemanticReviewPending: true,
    humanTrialRequired: true, productionChanged: false, protectedDataRead: false, recoveredFromCreateOnlyArtifacts: true };
  const audit = { schemaVersion: "runaai-m1-interrupted-campaign-recovery-audit/v1", candidateId: plan.candidateId,
    planSha256: sha256(planBytes), recoveredAttempts: attempts.length, firstNotExecutedAttemptId: notExecuted[0],
    pauseReceiptObserved: Boolean(pause), pauseReceiptSha256: pauseBytes ? sha256(pauseBytes) : null,
    sourceFilesRewritten: false, rawAttemptBytesRewritten: false, exactHashesVerified: true };
  return { result, audit, observations };
}

async function main(argv) {
  const values = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, index) => [argv[index * 2]?.replace(/^--/u, ""), argv[index * 2 + 1]]));
  if (!values["campaign-directory"] || !values["output-directory"]) fail("m1-recovery-argument-invalid");
  const campaignDirectory = path.resolve(values["campaign-directory"]), outputDirectory = path.resolve(values["output-directory"]);
  const recovered = await recoverInterruptedCampaign(campaignDirectory); await mkdir(outputDirectory, { recursive: false });
  for (const [name, value] of [["result-recovered.json", recovered.result], ["recovery-audit.json", recovered.audit]]) await writeFile(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ outputDirectory, recoveredAttempts: recovered.audit.recoveredAttempts,
    firstNotExecutedAttemptId: recovered.audit.firstNotExecutedAttemptId })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${error?.code ?? error?.message ?? "m1-recovery-failed"}\n`); process.exitCode = 1;
});
