import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { recoverInterruptedCampaign } from "./recover-interrupted-campaign.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
test("recovers only the immutable recorded prefix from a killed writer", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-recovery-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const slots = ["a", "b", "c"].map((attemptId, index) => ({ attemptId, candidateId: "candidate", caseId: `case-${index}`, repetition: 1 }));
  const plan = { candidateId: "candidate", sourceCommit: "a".repeat(40), runtimeSealSha256: "b".repeat(64), caseBundleSha256: "c".repeat(64), attempts: slots };
  await writeFile(path.join(directory, "plan.json"), JSON.stringify(plan));
  for (const slot of slots.slice(0, 2)) {
    const observation = Buffer.from(JSON.stringify({ candidateId: slot.candidateId, caseId: slot.caseId,
      repetition: slot.repetition, runtimeSealSha256: plan.runtimeSealSha256, caseBundleSha256: plan.caseBundleSha256,
      productionChanged: false, protectedDataRead: false,
      failures: slot.attemptId === "b" ? [{ phase: "browser", errorCode: "m1-browser-checkpoint-unobserved" }] : [],
      provider: { calls: [] }, native: { calls: [] }, grade: { passed: slot.attemptId === "a" } }));
    await writeFile(path.join(directory, `${slot.attemptId}.started.json`), JSON.stringify({ ...slot, runtimeSealSha256: plan.runtimeSealSha256 }));
    await writeFile(path.join(directory, `${slot.attemptId}.json`), observation);
    await writeFile(path.join(directory, `${slot.attemptId}.record.json`), JSON.stringify({ attemptId: slot.attemptId,
      file: `${slot.attemptId}.json`, sha256: sha256(observation), bytes: observation.byteLength,
      status: slot.attemptId === "a" ? "completed" : "failed", preliminaryGrade: slot.attemptId === "a" ? "pass" : "inconclusive" }));
  }
  const value = await recoverInterruptedCampaign(directory);
  assert.equal(value.result.recordedAttempts, 2); assert.deepEqual(value.result.notExecuted, ["c"]);
  assert.equal(value.result.stopCode, "m1-campaign-operator-stop"); assert.equal(value.audit.exactHashesVerified, true);
});

test("recovers a zero-record pause and rejects any record after a prefix hole", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-recovery-zero-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const slots = ["a", "b"].map((attemptId, index) => ({ attemptId, candidateId: "candidate", caseId: `case-${index}`, repetition: 1 }));
  const plan = { candidateId: "candidate", sourceCommit: "a".repeat(40), runtimeSealSha256: "b".repeat(64), caseBundleSha256: "c".repeat(64), attempts: slots };
  await writeFile(path.join(directory, "plan.json"), JSON.stringify(plan));
  await writeFile(path.join(directory, "a.pause.json"), JSON.stringify({ schemaVersion: "runaai-m1-campaign-pause/v1",
    ...slots[0], runtimeSealSha256: plan.runtimeSealSha256, resumeAttemptId: "a", completedPrefixImmutable: true,
    attemptConsumed: false, modelGraded: false, failure: { code: "m1-browser-checkpoint-unobserved" } }));
  const zero = await recoverInterruptedCampaign(directory);
  assert.equal(zero.result.recordedAttempts, 0); assert.equal(zero.result.stopCode, "m1-browser-checkpoint-unobserved");
  await writeFile(path.join(directory, "b.record.json"), "{}");
  await assert.rejects(recoverInterruptedCampaign(directory), /m1-recovery-record-suffix-invalid/u);
});

test("recovers the r49 supplemental prefix without relabeling it or consuming Agent06", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-recovery-r49-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const first = { attemptId: "qwen36-27b-mtp--agent-05-cancel-drain--2", candidateId: "qwen36-27b-mtp",
    caseId: "agent-05-cancel-drain", role: "agent", repetition: 2 };
  const second = { attemptId: "qwen36-27b-mtp--agent-06-crash-reconcile--2", candidateId: "qwen36-27b-mtp",
    caseId: "agent-06-crash-reconcile", role: "agent", repetition: 2 };
  const slots = [first, second, ...Array.from({ length: 50 }, (_, index) => ({
    attemptId: `qwen36-27b-mtp--remaining-${index + 1}`, candidateId: "qwen36-27b-mtp",
    caseId: `remaining-${index + 1}`, role: "review", repetition: 2 }))];
  const plan = { candidateId: first.candidateId, sourceCommit: "a".repeat(40), runtimeSealSha256: "b".repeat(64),
    caseBundleSha256: "c".repeat(64), plannedCampaignAttempts: 52, plannedCandidateAttempts: 52,
    supplemental: true, attempts: slots };
  await writeFile(path.join(directory, "plan.json"), JSON.stringify(plan));
  const observation = Buffer.from(JSON.stringify({ candidateId: first.candidateId, caseId: first.caseId,
    repetition: first.repetition, runtimeSealSha256: plan.runtimeSealSha256, caseBundleSha256: plan.caseBundleSha256,
    productionChanged: false, protectedDataRead: false, provider: { calls: [{}] }, native: { calls: [{}] }, grade: { passed: false } }));
  await writeFile(path.join(directory, `${first.attemptId}.started.json`), JSON.stringify({ ...first, runtimeSealSha256: plan.runtimeSealSha256 }));
  await writeFile(path.join(directory, `${first.attemptId}.json`), observation);
  await writeFile(path.join(directory, `${first.attemptId}.record.json`), JSON.stringify({ attemptId: first.attemptId,
    file: `${first.attemptId}.json`, sha256: sha256(observation), bytes: observation.byteLength,
    status: "completed", preliminaryGrade: "inconclusive" }));
  await writeFile(path.join(directory, `${second.attemptId}.pause.json`), JSON.stringify({ schemaVersion: "runaai-m1-campaign-pause/v1",
    ...second, runtimeSealSha256: plan.runtimeSealSha256, resumeAttemptId: second.attemptId, completedPrefixImmutable: true,
    attemptConsumed: false, modelGraded: false, failure: { code: "m1-capture-downstream-disconnected" } }));
  const value = await recoverInterruptedCampaign(directory);
  assert.equal(value.result.recordedAttempts, 1); assert.equal(value.result.attempts[0].attemptId, first.attemptId);
  assert.equal(value.result.notExecuted.length, 51); assert.equal(value.result.notExecuted[0], second.attemptId);
  assert.equal(value.result.supplemental, true); assert.equal(value.result.denominatorChanged, true);
  assert.equal(value.result.attempts.some(row => row.attemptId === second.attemptId), false);
});
