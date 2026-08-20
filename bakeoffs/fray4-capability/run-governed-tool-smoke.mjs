import pg from "pg";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createEnvelope } from "./provenance.mjs";
import { createActionRequest } from "./action-request.mjs";
import { CapabilityStore, initializeCapabilitySchema } from "./capability.mjs";
import { executeGovernedTransfer } from "./governed-tool.mjs";
import { startKeycloak, startOpenFga, startPostgres } from "./lab-services.mjs";

const root = resolve(import.meta.dirname, "../..");
const resultPath = resolve(root, "probes", "results", "fray4-governed-tool-smoke.json");
execFileSync(process.execPath, ["probes/verify-seal-fray4-capability.mjs"], { cwd: root, stdio: "inherit" });
await mkdir(resolve(root, "probes", "results"), { recursive: true });

let postgres;
let keycloak;
let openfga;
let pool;
let result;
try {
  postgres = await startPostgres();
  keycloak = await startKeycloak();
  const actorId = `user:${keycloak.subject}`;
  const resourceId = "account:household";
  openfga = await startOpenFga(actorId);
  pool = new pg.Pool({ connectionString: postgres.connectionString, connectionTimeoutMillis: 3000 });
  await initializeCapabilitySchema(pool, { reset: true });
  const store = new CapabilityStore(pool);
  const now = new Date();
  const args = { amount: 5, destination: "household-0001" };
  const intent = createEnvelope({
    provenance: "authenticated_user_request",
    sourceId: `keycloak-sub:${keycloak.subject}`,
    content: "Send five units to household-0001",
    createdAt: now.toISOString(),
  });
  const actionRequest = createActionRequest({
    intent,
    actorId,
    action: "transfer",
    resourceId,
    arguments: args,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 300000).toISOString(),
    requestId: "governed-smoke-request",
    idempotencyKey: "governed-smoke-effect",
  });
  const identity = await keycloak.introspect(keycloak.token);
  const issuanceAuthorization = await openfga.check(actorId, "transfer", resourceId);
  const issued = await store.issue(actionRequest, {
    identity,
    authorization: issuanceAuthorization,
    capabilityId: "governed-smoke-capability",
  });

  const missing = await executeGovernedTransfer({
    store,
    capabilityId: null,
    actorId,
    resourceId,
    arguments: args,
    identity,
    authorization: await openfga.check(actorId, "transfer", resourceId),
  });
  const substituted = await executeGovernedTransfer({
    store,
    capabilityId: issued.capabilityId,
    actorId,
    resourceId,
    arguments: { ...args, amount: 5000 },
    identity,
    authorization: await openfga.check(actorId, "transfer", resourceId),
  });
  const committed = await executeGovernedTransfer({
    store,
    capabilityId: issued.capabilityId,
    actorId,
    resourceId,
    arguments: args,
    identity,
    authorization: await openfga.check(actorId, "transfer", resourceId),
  });
  const replay = await executeGovernedTransfer({
    store,
    capabilityId: issued.capabilityId,
    actorId,
    resourceId,
    arguments: args,
    identity,
    authorization: await openfga.check(actorId, "transfer", resourceId),
  });
  const counts = await store.counts();
  const deed = await store.postcondition(actionRequest.idempotencyKey);
  result = {
    schemaVersion: 1,
    sealVerified: true,
    issuance: issued.outcome,
    missingCapability: missing.outcome,
    substitutedArguments: substituted.reason,
    authorizedExecution: committed.outcome,
    duplicateDelivery: replay.outcome,
    exactlyOneDeed: counts.deeds === 1,
    deedMatchesApprovedArguments: deed?.argument_hash === actionRequest.argumentHash,
    credentialsOrTokensRetained: false,
  };
  result.pass = result.issuance === "pending" && result.missingCapability === "denied" &&
    result.substitutedArguments === "capability-argument-mismatch" && result.authorizedExecution === "committed" &&
    result.duplicateDelivery === "already-consumed" && result.exactlyOneDeed && result.deedMatchesApprovedArguments;
} catch (error) {
  result = { schemaVersion: 1, pass: false, error: { name: error.name, message: error.message, stack: error.stack } };
} finally {
  await pool?.end().catch(() => {});
  await openfga?.stop().catch(() => {});
  await keycloak?.stop().catch(() => {});
  await postgres?.stop().catch(() => {});
}

await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
