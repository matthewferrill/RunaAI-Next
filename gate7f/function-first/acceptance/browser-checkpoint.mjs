import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { enumerateCaseChecks } from "./assertions.mjs";
import { fail } from "./runner-contract.mjs";

// Operator bridge for the parent agent's actual in-app browser. This module never
// claims a DOM observation itself. The one-use nonce is synthetic-session access,
// retained only in the owned temporary evidence directory, not a production key.
export function createBrowserCheckpoint({ directory, maximumWaitMs = 300000, announce = () => {}, signal = null }) {
  if (!Number.isInteger(maximumWaitMs) || maximumWaitMs < 1000 || maximumWaitMs > 300000) throw fail("m1-browser-checkpoint-budget-invalid");
  return async ({ client, phase, stage }) => {
    if (signal?.aborted) throw fail("m1-browser-checkpoint-aborted");
    const descriptors = enumerateCaseChecks(client.ledger.observation.caseId).filter(value => value.kind.startsWith("ui."));
    if (!descriptors.length) return;
    const checkpointId = randomUUID(), checkpointDirectory = path.join(directory, `browser-${checkpointId}`);
    await mkdir(checkpointDirectory, { recursive: false });
    const bootstrap = await client.host.createBootstrap(client.principalId, { session: client.session });
    const request = { schemaVersion: "runaai-m1-browser-checkpoint/v1", checkpointId,
      caseId: client.ledger.observation.caseId, candidateId: client.ledger.observation.candidateId,
      repetition: client.ledger.observation.repetition, phase, stage,
      runtimeSealSha256: client.ledger.observation.runtimeSealSha256, baseUrl: client.host.baseUrl,
      bootstrap, principalId: client.principalId, projectId: client.projectId, projectName: client.item.setup.project,
      experience: client.experience, taskId: client.task?.taskId ?? null, runId: client.run?.runId ?? null,
      checks: descriptors, ackPath: path.join(checkpointDirectory, "browser-ack.json"),
      expiresAt: new Date(Date.now() + maximumWaitMs).toISOString() };
    const requestPath = path.join(checkpointDirectory, "request.json");
    await writeFile(requestPath, JSON.stringify(request, null, 2), { flag: "wx" });
    announce({ checkpointId, requestPath, baseUrl: request.baseUrl, caseId: request.caseId, phase, stage });
    const deadline = Date.now() + maximumWaitMs;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw fail("m1-browser-checkpoint-aborted");
      let raw;
      try {
        const info = await lstat(request.ackPath);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 262144) throw fail("m1-browser-ack-invalid");
        raw = await readFile(request.ackPath, "utf8");
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (raw) {
        const ack = JSON.parse(raw);
        if (ack.schemaVersion !== "runaai-m1-browser-checkpoint-ack/v1" || ack.checkpointId !== checkpointId
          || ack.caseId !== request.caseId || ack.runtimeSealSha256 !== request.runtimeSealSha256
          || !Array.isArray(ack.evidence) || !Array.isArray(ack.checks)) throw fail("m1-browser-ack-invalid");
        const identifiers = new Map();
        for (const evidence of ack.evidence) {
          if (evidence.source !== "browser" || typeof evidence.id !== "string" || identifiers.has(evidence.id)
            || typeof evidence.kind !== "string" || !evidence.data || typeof evidence.data !== "object") throw fail("m1-browser-evidence-invalid");
          identifiers.set(evidence.id, client.ledger.evidence("browser", evidence.kind, evidence.data));
        }
        for (const check of ack.checks) {
          const frozen = descriptors.find(value => value.checkId === check.checkId && value.kind === check.kind);
          if (!frozen || !Array.isArray(check.evidenceRefs) || check.evidenceRefs.length < 1) throw fail("m1-browser-check-invalid");
          const evidenceRefs = check.evidenceRefs.map(value => {
            if (!identifiers.has(value.id) || typeof value.pointer !== "string") throw fail("m1-browser-reference-invalid");
            return { id: identifiers.get(value.id), pointer: value.pointer };
          });
          client.ledger.observation.checks.push({ checkId: check.checkId, kind: check.kind, actual: check.actual, evidenceRefs });
        }
        client.ledger.observation.browserExercised = true;
        await writeFile(path.join(checkpointDirectory, "consumed.json"), JSON.stringify({ checkpointId, consumedAt: new Date().toISOString() }), { flag: "wx" });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw fail("m1-browser-checkpoint-unobserved");
  };
}
