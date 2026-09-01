import { createHash } from "node:crypto";
import { lstat, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCampaignFailure, pauseableObservationFailure } from "./campaign-failure.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => { const error = new Error(code); error.code = code; throw error; };

function exactIds(rows, label) {
  if (!Array.isArray(rows)) fail(`m1-continuation-${label}-invalid`);
  const ids = rows.map(value => value?.attemptId);
  if (ids.some(value => typeof value !== "string" || !value.length) || new Set(ids).size !== ids.length) fail(`m1-continuation-${label}-invalid`);
  return ids;
}

function nonModelFailure(observation) {
  return pauseableObservationFailure(observation);
}

function validateObservationBinding(observation, row, priorResult) {
  if (!observation || observation.candidateId !== row.candidateId || observation.caseId !== row.caseId
      || observation.repetition !== row.repetition || observation.runtimeSealSha256 !== priorResult.runtimeSealSha256
      || observation.caseBundleSha256 !== priorResult.caseBundleSha256) fail("m1-continuation-observation-binding-invalid");
}

export function prepareCampaignContinuation({ priorResult, priorPlan, observationsByAttemptId, bindings }) {
  const planIds = exactIds(priorPlan?.attempts, "plan"), resultIds = exactIds(priorResult?.attempts, "result");
  if (priorResult?.candidateId !== priorPlan?.candidateId || priorResult?.recordedAttempts !== resultIds.length
      || priorResult?.plannedCandidateAttempts !== planIds.length || !planIds.slice(0, resultIds.length).every((id, index) => id === resultIds[index])) {
    fail("m1-continuation-prefix-binding-invalid");
  }
  for (const [name, value] of Object.entries(bindings ?? {})) if (name.endsWith("Sha256") && !SHA256.test(value ?? "")) fail("m1-continuation-binding-invalid");
  const observedRows = priorResult.attempts.map(row => {
    const observation = observationsByAttemptId?.get?.(row.attemptId) ?? observationsByAttemptId?.[row.attemptId];
    validateObservationBinding(observation, row, priorResult);
    return { row, failure: nonModelFailure(observation) };
  });
  let resumeIndex = resultIds.length, pauseFailure = null;
  for (let index = 0; index < resultIds.length; index++) {
    const failure = observedRows[index].failure;
    if (failure) { resumeIndex = index; pauseFailure = failure; break; }
  }
  if (resumeIndex === planIds.length) fail("m1-continuation-campaign-complete");
  const topLevelStop = priorResult.stopCode
    ? classifyCampaignFailure(priorResult.stopCode, { phase: "runner" })
    : null;
  if (resumeIndex === resultIds.length && topLevelStop?.attribution !== "non-model")
    fail("m1-continuation-non-model-stop-missing");
  const retainedAttempts = priorResult.attempts.slice(0, resumeIndex);
  const discardedAttempts = observedRows.slice(resumeIndex).map(({ row, failure }) => ({ attemptId: row.attemptId,
    status: row.status, reason: failure }));
  if (discardedAttempts.some(value => !value.reason || value.reason.attribution !== "non-model"))
    fail("m1-continuation-model-result-discarded");
  const remainingIds = planIds.slice(resumeIndex), remainingSet = new Set(remainingIds);
  const continuationAttempts = priorPlan.attempts.filter(value => remainingSet.has(value.attemptId));
  const retainedPrefixResult = { ...priorResult, recordedAttempts: retainedAttempts.length, attempts: retainedAttempts,
    notExecuted: remainingIds, stopCode: pauseFailure?.code ?? topLevelStop.code,
    pause: { schemaVersion: "runaai-m1-campaign-pause-summary/v1", resumeAttemptId: remainingIds[0],
      completedPrefixAttempts: retainedAttempts.length, completedPrefixImmutable: true, modelGradedAtPause: false } };
  const continuationPlan = { ...priorPlan, schemaVersion: "runaai-m1-campaign-continuation-plan/v1",
    attempts: continuationAttempts, plannedCampaignAttempts: continuationAttempts.length,
    plannedCandidateAttempts: continuationAttempts.length, continuation: true, supplemental: true,
    priorResultSha256: bindings.priorResultSha256, priorPlanSha256: bindings.priorPlanSha256,
    priorRuntimeSealSha256: bindings.priorRuntimeSealSha256, resumeAttemptId: remainingIds[0],
    retainedPrefixAttempts: retainedAttempts.length, discardedHistoricalAttempts: discardedAttempts.map(value => value.attemptId) };
  const audit = { schemaVersion: "runaai-m1-campaign-continuation-audit/v1", candidateId: priorPlan.candidateId,
    resumeAttemptId: remainingIds[0], retainedPrefixAttempts: retainedAttempts.length,
    continuationAttempts: continuationAttempts.length, discardedHistoricalAttempts: discardedAttempts,
    priorResultSha256: bindings.priorResultSha256, priorPlanSha256: bindings.priorPlanSha256,
    priorRuntimeSealSha256: bindings.priorRuntimeSealSha256, completedPrefixImmutable: true,
    modelFacingEquivalenceRequiredBeforeComposition: true, singleUninterruptedArmClaimed: false };
  return { retainedPrefixResult, continuationPlan, audit };
}

async function main(argv) {
  const values = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, index) => [argv[index * 2]?.replace(/^--/u, ""), argv[index * 2 + 1]]));
  for (const name of ["prior-directory", "output-directory", "prior-result-sha256", "prior-plan-sha256", "prior-runtime-seal-sha256"]) if (!values[name]) fail("m1-continuation-argument-missing");
  const priorDirectory = path.resolve(values["prior-directory"]), outputDirectory = path.resolve(values["output-directory"]);
  const resultPath = values["prior-result-path"] ? path.resolve(values["prior-result-path"]) : path.join(priorDirectory, "result.json");
  const planPath = values["prior-plan-path"] ? path.resolve(values["prior-plan-path"]) : path.join(priorDirectory, "plan.json");
  const runtimeSealPath = values["prior-runtime-seal-path"] ? path.resolve(values["prior-runtime-seal-path"]) : path.join(priorDirectory, "runtimeSeal.json");
  const resultBytes = await readFile(resultPath), planBytes = await readFile(planPath);
  if (sha256(resultBytes) !== values["prior-result-sha256"] || sha256(planBytes) !== values["prior-plan-sha256"]) fail("m1-continuation-input-hash-mismatch");
  if (sha256(await readFile(runtimeSealPath)) !== values["prior-runtime-seal-sha256"]) fail("m1-continuation-input-hash-mismatch");
  const priorResult = JSON.parse(resultBytes), priorPlan = JSON.parse(planBytes), observations = new Map();
  for (const row of priorResult.attempts ?? []) {
    if (row.file !== `${row.attemptId}.json`) fail("m1-continuation-observation-path-invalid");
    const observationPath = path.join(priorDirectory, row.file), recordPath = path.join(priorDirectory, `${row.attemptId}.record.json`);
    const [observationStat, recordStat] = await Promise.all([lstat(observationPath), lstat(recordPath)]);
    if (!observationStat.isFile() || observationStat.isSymbolicLink() || !recordStat.isFile() || recordStat.isSymbolicLink())
      fail("m1-continuation-observation-path-invalid");
    const [observationBytes, recordBytes] = await Promise.all([readFile(observationPath), readFile(recordPath)]), record = JSON.parse(recordBytes);
    if (record.attemptId !== row.attemptId || record.file !== row.file || record.sha256 !== row.sha256
        || record.bytes !== row.bytes || sha256(observationBytes) !== row.sha256 || observationBytes.byteLength !== row.bytes)
      fail("m1-continuation-observation-hash-invalid");
    observations.set(row.attemptId, JSON.parse(observationBytes));
  }
  const prepared = prepareCampaignContinuation({ priorResult, priorPlan, observationsByAttemptId: observations,
    bindings: { priorResultSha256: values["prior-result-sha256"], priorPlanSha256: values["prior-plan-sha256"],
      priorRuntimeSealSha256: values["prior-runtime-seal-sha256"] } });
  await mkdir(outputDirectory, { recursive: false });
  for (const [name, value] of [["retained-prefix-result.json", prepared.retainedPrefixResult], ["continuation-plan.json", prepared.continuationPlan], ["continuation-audit.json", prepared.audit]]) {
    await writeFile(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify({ outputDirectory, resumeAttemptId: prepared.audit.resumeAttemptId,
    retainedPrefixAttempts: prepared.audit.retainedPrefixAttempts, continuationAttempts: prepared.audit.continuationAttempts })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${error?.code ?? error?.message ?? "m1-continuation-failed"}\n`); process.exitCode = 1;
});
