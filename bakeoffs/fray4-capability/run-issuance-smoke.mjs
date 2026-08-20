import pg from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createEnvelope } from "./provenance.mjs";
import { createActionRequest } from "./action-request.mjs";
import { CapabilityStore, initializeCapabilitySchema } from "./capability.mjs";
import { startKeycloak, startOpenFga, startPostgres } from "./lab-services.mjs";

const root = resolve(import.meta.dirname, "../..");
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
  openfga = await startOpenFga(actorId);
  pool = new pg.Pool({ connectionString: postgres.connectionString, connectionTimeoutMillis: 3000 });
  await initializeCapabilitySchema(pool, { reset: true });
  const now = new Date();
  const intent = createEnvelope({ provenance: "authenticated_user_request", sourceId: `keycloak-sub:${keycloak.subject}`,
    content: "Send five units to household-0001", createdAt: now.toISOString() });
  const request = createActionRequest({ intent, actorId, action: "transfer", resourceId: "account:household",
    arguments: { destination: "household-0001", amount: 5 }, issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 300000).toISOString(), requestId: "issuance-smoke", idempotencyKey: "issuance-smoke-effect" });
  const identity = await keycloak.introspect(keycloak.token);
  const authorization = await openfga.check(actorId, "transfer", "account:household");
  const store = new CapabilityStore(pool);
  const issued = await store.issue(request, { identity, authorization, now: now.toISOString(), capabilityId: "issuance-smoke-capability" });
  const row = await pool.query("SELECT capability_id,actor_id,action,resource_id,argument_hash,status,idempotency_key FROM fray4.capabilities WHERE capability_id=$1", [issued.capabilityId]);
  result = {
    schemaVersion: 1,
    sealVerified: true,
    keycloakIdentityActive: identity.active,
    openfgaAllowed: authorization.allowed,
    issueOutcome: issued.outcome,
    persisted: row.rowCount === 1,
    persistedStatus: row.rows[0]?.status ?? null,
    argumentHashMatches: row.rows[0]?.argument_hash === request.argumentHash,
    actorHash: (await import("./provenance.mjs")).sha256(actorId),
    credentialsOrTokensRetained: false,
  };
  result.pass = result.keycloakIdentityActive && result.openfgaAllowed && result.issueOutcome === "pending" &&
    result.persisted && result.persistedStatus === "pending" && result.argumentHashMatches;
} catch (error) {
  result = { schemaVersion: 1, pass: false, error: { name: error.name, message: error.message, stack: error.stack } };
} finally {
  await pool?.end().catch(() => {});
  await openfga?.stop().catch(() => {});
  await keycloak?.stop().catch(() => {});
  await postgres?.stop().catch(() => {});
}
await writeFile(resolve(root, "probes", "results", "fray4-issuance-smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
