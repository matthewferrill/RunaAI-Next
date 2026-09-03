import { createPublicKey, randomBytes, sign, verify } from "node:crypto";
import pg from "pg";
import { browserKeyThumbprint, canonicalJson, createSignedCapability, LOCAL_CONTEXT_LIMITS,
  LOCAL_CONTEXT_SCHEMAS, localSha256, verifyBrowserProof, verifySignedCapability }
  from "./local-context-contract.mjs";

const coded = (code, message = code) => Object.assign(new Error(message), { code });
const ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;
const LIFECYCLES = Object.freeze(["known", "configured", "connected", "tested", "enabled",
  "disconnected", "revoking", "revoked"]);
const TRANSITIONS = new Map([
  ["known", new Set(["configured", "revoked"])],
  ["configured", new Set(["connected", "revoked"])],
  ["connected", new Set(["tested", "disconnected", "revoked"])],
  ["tested", new Set(["enabled", "disconnected", "revoked"])],
  ["enabled", new Set(["disconnected", "revoking", "revoked"])],
  ["disconnected", new Set(["connected", "revoked"])],
  ["revoking", new Set(["revoked"])],
  ["revoked", new Set()],
]);

const id = (value, code = "local-identifier-invalid") => {
  if (typeof value !== "string" || !ID.test(value)) throw coded(code);
  return value;
};
const keyObject = value => {
  try { return createPublicKey({ key: Buffer.from(value, "base64url"), format: "der", type: "spki" }); }
  catch { throw coded("local-public-key-invalid"); }
};
const signatureValid = (publicKey, input, signature) => typeof signature === "string"
  && verify(null, Buffer.from(canonicalJson(input)), keyObject(publicKey), Buffer.from(signature, "base64url"));
const clone = value => structuredClone(value);

export class PostgresLocalContextStore {
  constructor({ connectionString, pool = null, now = () => new Date() }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    this.ownsPool = !pool;
    this.now = now;
  }

  async initialize() {
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS runa_local;
      CREATE TABLE IF NOT EXISTS runa_local.devices (
        participant_id text NOT NULL, device_id text NOT NULL, public_key text NOT NULL,
        release_digest text NOT NULL CHECK(release_digest ~ '^[a-f0-9]{64}$'),
        boot_epoch text NOT NULL CHECK(boot_epoch ~ '^[a-f0-9]{64}$'),
        status text NOT NULL CHECK(status IN ('active','revoked')),
        capability_set_version bigint NOT NULL CHECK(capability_set_version > 0),
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(participant_id,device_id)
      );
      CREATE TABLE IF NOT EXISTS runa_local.browser_instances (
        participant_id text NOT NULL, device_id text NOT NULL, key_thumbprint text NOT NULL,
        public_key text NOT NULL, status text NOT NULL CHECK(status IN ('active','revoked')),
        registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(participant_id,device_id,key_thumbprint),
        FOREIGN KEY(participant_id,device_id) REFERENCES runa_local.devices(participant_id,device_id)
      );
      CREATE TABLE IF NOT EXISTS runa_local.connections (
        participant_id text NOT NULL, project_id text NOT NULL, connection_id text NOT NULL,
        device_id text NOT NULL, root_id text NOT NULL, safe_label text NOT NULL,
        lifecycle text NOT NULL CHECK(lifecycle IN
          ('known','configured','connected','tested','enabled','disconnected','revoking','revoked')),
        allowed_operations text[] NOT NULL, capability_set_version bigint NOT NULL CHECK(capability_set_version > 0),
        cleanup_state text NOT NULL CHECK(cleanup_state IN ('not-requested','pending','complete')),
        last_test_at timestamptz, last_test_code text, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(participant_id,connection_id),
        UNIQUE(participant_id,project_id,device_id,root_id),
        FOREIGN KEY(participant_id,device_id) REFERENCES runa_local.devices(participant_id,device_id)
      );
      CREATE TABLE IF NOT EXISTS runa_local.capabilities (
        capability_id text PRIMARY KEY, participant_id text NOT NULL, project_id text NOT NULL,
        connection_id text NOT NULL, device_id text NOT NULL, root_id text NOT NULL,
        boot_epoch text NOT NULL, browser_key_thumbprint text NOT NULL, operation text NOT NULL,
        argument_digest text NOT NULL CHECK(argument_digest ~ '^[a-f0-9]{64}$'),
        nonce text NOT NULL UNIQUE, capability_set_version bigint NOT NULL,
        issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
        status text NOT NULL CHECK(status IN ('issued','redeemed','invalidated','expired')),
        UNIQUE(participant_id,connection_id,capability_id)
      );
      CREATE TABLE IF NOT EXISTS runa_local.redemptions (
        redemption_id text PRIMARY KEY, capability_id text NOT NULL UNIQUE REFERENCES runa_local.capabilities(capability_id),
        participant_id text NOT NULL, connection_id text NOT NULL, request_id text NOT NULL,
        argument_digest text NOT NULL CHECK(argument_digest ~ '^[a-f0-9]{64}$'),
        result_digest text, outcome_code text, status text NOT NULL
          CHECK(status IN ('in-flight','completed','abandoned')),
        deadline_at timestamptz NOT NULL, started_at timestamptz NOT NULL,
        completed_at timestamptz, UNIQUE(participant_id,request_id)
      );
      CREATE INDEX IF NOT EXISTS runa_local_redemptions_connection_status
        ON runa_local.redemptions(participant_id,connection_id,status);
    `);
  }

  async enrollDevice({ participantId, deviceId, publicKey, releaseDigest, bootEpoch }) {
    for (const value of [participantId, deviceId]) id(value);
    keyObject(publicKey);
    if (!/^[a-f0-9]{64}$/u.test(releaseDigest) || !/^[a-f0-9]{64}$/u.test(bootEpoch)) {
      throw coded("local-device-binding-invalid");
    }
    const result = await this.pool.query(`INSERT INTO runa_local.devices
      (participant_id,device_id,public_key,release_digest,boot_epoch,status,capability_set_version)
      VALUES($1,$2,$3,$4,$5,'active',1)
      ON CONFLICT(participant_id,device_id) DO UPDATE SET
        public_key=EXCLUDED.public_key,release_digest=EXCLUDED.release_digest,boot_epoch=EXCLUDED.boot_epoch,
        status='active',capability_set_version=runa_local.devices.capability_set_version+1,updated_at=clock_timestamp()
      RETURNING capability_set_version::int`, [participantId, deviceId, publicKey, releaseDigest, bootEpoch]);
    await this.pool.query(`UPDATE runa_local.capabilities SET status='invalidated'
      WHERE participant_id=$1 AND device_id=$2 AND status='issued'`, [participantId, deviceId]);
    return Object.freeze({ participantId, deviceId, bootEpoch,
      capabilitySetVersion: result.rows[0].capability_set_version });
  }

  async registerBrowser({ participantId, deviceId, browserPublicKey }) {
    const thumbprint = browserKeyThumbprint(browserPublicKey);
    const result = await this.pool.query(`INSERT INTO runa_local.browser_instances
      (participant_id,device_id,key_thumbprint,public_key,status) VALUES($1,$2,$3,$4,'active')
      ON CONFLICT(participant_id,device_id,key_thumbprint) DO UPDATE SET public_key=EXCLUDED.public_key,status='active'
      RETURNING key_thumbprint`, [id(participantId), id(deviceId), thumbprint, browserPublicKey]);
    return Object.freeze({ browserKeyThumbprint: result.rows[0].key_thumbprint });
  }

  async createConnection({ participantId, projectId, connectionId, deviceId, rootId, safeLabel,
    allowedOperations = ["tree", "text-read"] }) {
    for (const value of [participantId, projectId, connectionId, deviceId, rootId]) id(value);
    const label = String(safeLabel ?? "").replace(/\s+/gu, " ").trim();
    if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/u.test(label)) throw coded("local-label-invalid");
    const operations = [...new Set(allowedOperations)];
    if (!operations.length || operations.some(value => !["tree", "text-read", "git-status", "git-log",
      "git-diffstat", "git-branches", "git-remotes", "git-show-commit", "connection-test", "root-remove"].includes(value))) {
      throw coded("local-operations-invalid");
    }
    const count = await this.pool.query(`SELECT count(*)::int count FROM runa_local.connections
      WHERE participant_id=$1 AND lifecycle <> 'revoked'`, [participantId]);
    if (count.rows[0].count >= LOCAL_CONTEXT_LIMITS.roots) throw coded("local-root-limit");
    const result = await this.pool.query(`INSERT INTO runa_local.connections
      (participant_id,project_id,connection_id,device_id,root_id,safe_label,lifecycle,allowed_operations,
       capability_set_version,cleanup_state)
      VALUES($1,$2,$3,$4,$5,$6,'known',$7,1,'not-requested')
      RETURNING *`, [participantId, projectId, connectionId, deviceId, rootId, label, operations]);
    return this.#connection(result.rows[0]);
  }

  async transition({ participantId, connectionId, expected, next, testCode = null }) {
    if (!LIFECYCLES.includes(expected) || !TRANSITIONS.get(expected)?.has(next)) throw coded("local-lifecycle-transition-invalid");
    const tested = next === "tested";
    const result = await this.pool.query(`UPDATE runa_local.connections SET lifecycle=$3,
      capability_set_version=capability_set_version+1, updated_at=clock_timestamp(),
      last_test_at=CASE WHEN $4 THEN clock_timestamp() ELSE last_test_at END,
      last_test_code=CASE WHEN $4 THEN $5 ELSE last_test_code END
      WHERE participant_id=$1 AND connection_id=$2 AND lifecycle=$6 RETURNING *`,
    [id(participantId), id(connectionId), next, tested, tested ? String(testCode ?? "passed") : null, expected]);
    if (!result.rowCount) throw coded("local-lifecycle-conflict");
    return this.#connection(result.rows[0]);
  }

  async authorizeIssue({ participantId, projectId, connectionId, deviceId, rootId, bootEpoch,
    browserKeyThumbprint: thumbprint, operation, argumentDigest, capabilityId, nonce, issuedAt, expiresAt }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(`SELECT c.*,d.boot_epoch,d.status device_status,b.status browser_status,
          b.public_key browser_public_key
        FROM runa_local.connections c
        JOIN runa_local.devices d ON d.participant_id=c.participant_id AND d.device_id=c.device_id
        JOIN runa_local.browser_instances b ON b.participant_id=c.participant_id AND b.device_id=c.device_id
          AND b.key_thumbprint=$6
        WHERE c.participant_id=$1 AND c.project_id=$2 AND c.connection_id=$3 AND c.device_id=$4
          AND c.root_id=$5 FOR UPDATE OF c,d,b`,
      [participantId, projectId, connectionId, deviceId, rootId, thumbprint]);
      const row = result.rows[0];
      if (!row || row.lifecycle !== "enabled" || row.device_status !== "active" || row.browser_status !== "active"
          || row.boot_epoch !== bootEpoch || !row.allowed_operations.includes(operation)) {
        throw coded("local-capability-authorization-denied");
      }
      await client.query(`INSERT INTO runa_local.capabilities
        (capability_id,participant_id,project_id,connection_id,device_id,root_id,boot_epoch,
         browser_key_thumbprint,operation,argument_digest,nonce,capability_set_version,issued_at,expires_at,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'issued')`,
      [capabilityId, participantId, projectId, connectionId, deviceId, rootId, bootEpoch, thumbprint,
        operation, argumentDigest, nonce, row.capability_set_version, issuedAt, expiresAt]);
      await client.query("COMMIT");
      return Object.freeze({ capabilitySetVersion: Number(row.capability_set_version),
        browserPublicKey: row.browser_public_key });
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async deviceBinding(participantId, deviceId) {
    const result = await this.pool.query(`SELECT public_key,boot_epoch,status,capability_set_version::int
      FROM runa_local.devices WHERE participant_id=$1 AND device_id=$2`, [id(participantId), id(deviceId)]);
    if (!result.rowCount) throw coded("local-device-not-found");
    return Object.freeze({ publicKey: result.rows[0].public_key, bootEpoch: result.rows[0].boot_epoch,
      status: result.rows[0].status, capabilitySetVersion: result.rows[0].capability_set_version });
  }

  async redeem({ payload, requestId, redemptionId, startedAt, deadlineAt }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(`SELECT cap.*,c.lifecycle,c.capability_set_version current_version,
          d.boot_epoch current_boot,d.status device_status,b.status browser_status
        FROM runa_local.capabilities cap
        JOIN runa_local.connections c ON c.participant_id=cap.participant_id AND c.connection_id=cap.connection_id
        JOIN runa_local.devices d ON d.participant_id=cap.participant_id AND d.device_id=cap.device_id
        JOIN runa_local.browser_instances b ON b.participant_id=cap.participant_id AND b.device_id=cap.device_id
          AND b.key_thumbprint=cap.browser_key_thumbprint
        WHERE cap.capability_id=$1 FOR UPDATE OF cap,c,d,b`, [payload.capabilityId]);
      const row = result.rows[0];
      if (!row || row.status !== "issued" || row.lifecycle !== "enabled" || row.device_status !== "active"
          || row.browser_status !== "active" || row.current_boot !== payload.bootEpoch
          || Number(row.current_version) !== payload.capabilitySetVersion
          || row.argument_digest !== payload.argumentDigest || row.operation !== payload.operation
          || row.connection_id !== payload.connectionId || row.root_id !== payload.rootId
          || new Date(row.expires_at).getTime() < new Date(startedAt).getTime()) {
        throw coded("local-redemption-denied");
      }
      await client.query("UPDATE runa_local.capabilities SET status='redeemed' WHERE capability_id=$1",
        [payload.capabilityId]);
      await client.query(`INSERT INTO runa_local.redemptions
        (redemption_id,capability_id,participant_id,connection_id,request_id,argument_digest,status,deadline_at,started_at)
        VALUES($1,$2,$3,$4,$5,$6,'in-flight',$7,$8)`, [redemptionId, payload.capabilityId,
        payload.participantPseudonym, payload.connectionId, requestId, payload.argumentDigest, deadlineAt, startedAt]);
      await client.query("COMMIT");
      return Object.freeze({ redemptionId, deadlineAt });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505") throw coded("local-redemption-replay");
      throw error;
    } finally { client.release(); }
  }

  async complete({ participantId, connectionId, redemptionId, argumentDigest, resultDigest, outcomeCode, completedAt }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(`SELECT * FROM runa_local.redemptions
        WHERE redemption_id=$1 AND participant_id=$2 AND connection_id=$3 FOR UPDATE`,
      [redemptionId, participantId, connectionId]);
      const row = found.rows[0];
      if (!row) throw coded("local-completion-not-found");
      if (row.status === "completed") {
        if (row.result_digest !== resultDigest || row.outcome_code !== outcomeCode) throw coded("local-completion-mismatch");
        await client.query("COMMIT");
        return Object.freeze({ status: "completion-already-finalized", resultDigest });
      }
      if (row.status !== "in-flight" || row.argument_digest !== argumentDigest || new Date(completedAt).getTime()
          > new Date(row.deadline_at).getTime() + LOCAL_CONTEXT_LIMITS.clockSkewMs) {
        throw coded("local-completion-rejected");
      }
      await client.query(`UPDATE runa_local.redemptions SET status='completed',result_digest=$2,
        outcome_code=$3,completed_at=$4 WHERE redemption_id=$1`,
      [redemptionId, resultDigest, outcomeCode, completedAt]);
      await this.#finishRevocation(client, participantId, connectionId);
      await client.query("COMMIT");
      return Object.freeze({ status: "completion-accepted", resultDigest });
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async revoke({ participantId, connectionId, localReachable }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(`SELECT * FROM runa_local.connections
        WHERE participant_id=$1 AND connection_id=$2 FOR UPDATE`, [id(participantId), id(connectionId)]);
      if (!found.rowCount) throw coded("local-connection-not-found");
      if (found.rows[0].lifecycle === "revoked") { await client.query("COMMIT"); return this.#connection(found.rows[0]); }
      await client.query(`UPDATE runa_local.capabilities SET status='invalidated'
        WHERE participant_id=$1 AND connection_id=$2 AND status='issued'`, [participantId, connectionId]);
      await client.query(`UPDATE runa_local.connections SET lifecycle='revoking',
        capability_set_version=capability_set_version+1,cleanup_state=$3,updated_at=clock_timestamp()
        WHERE participant_id=$1 AND connection_id=$2`,
      [participantId, connectionId, localReachable ? "complete" : "pending"]);
      await this.#finishRevocation(client, participantId, connectionId);
      const result = await client.query(`SELECT * FROM runa_local.connections
        WHERE participant_id=$1 AND connection_id=$2`, [participantId, connectionId]);
      await client.query("COMMIT");
      return this.#connection(result.rows[0]);
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async abandonExpired(at = this.now()) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const expired = await client.query(`UPDATE runa_local.redemptions SET status='abandoned',
        outcome_code='operation-abandoned',completed_at=$1
        WHERE status='in-flight' AND deadline_at + interval '10 seconds' < $1
        RETURNING participant_id,connection_id`, [at.toISOString()]);
      for (const row of expired.rows) await this.#finishRevocation(client, row.participant_id, row.connection_id);
      await client.query("COMMIT");
      return expired.rowCount;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async listConnections(participantId, projectId) {
    const result = await this.pool.query(`SELECT * FROM runa_local.connections
      WHERE participant_id=$1 AND project_id=$2 ORDER BY updated_at DESC`, [id(participantId), id(projectId)]);
    return Object.freeze(result.rows.map(row => this.#connection(row)));
  }

  async #finishRevocation(client, participantId, connectionId) {
    const active = await client.query(`SELECT count(*)::int count FROM runa_local.redemptions
      WHERE participant_id=$1 AND connection_id=$2 AND status='in-flight'`, [participantId, connectionId]);
    if (active.rows[0].count === 0) await client.query(`UPDATE runa_local.connections SET lifecycle='revoked',
      updated_at=clock_timestamp() WHERE participant_id=$1 AND connection_id=$2 AND lifecycle='revoking'`,
    [participantId, connectionId]);
  }

  #connection(row) {
    return Object.freeze({ schemaVersion: LOCAL_CONTEXT_SCHEMAS.lifecycle, participantId: row.participant_id,
      projectId: row.project_id, connectionId: row.connection_id, deviceId: row.device_id,
      rootId: row.root_id, safeLabel: row.safe_label, lifecycle: row.lifecycle,
      allowedOperations: Object.freeze([...row.allowed_operations]),
      capabilitySetVersion: Number(row.capability_set_version), cleanupState: row.cleanup_state,
      lastTestAt: row.last_test_at ? new Date(row.last_test_at).toISOString() : null,
      lastTestCode: row.last_test_code ?? null, privateValuesIncluded: false });
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}

export class LocalContextControlService {
  constructor({ store, issuerPrivateKey, issuerPublicKey, issuer = "runa-control", now = () => new Date() }) {
    this.store = store; this.issuerPrivateKey = issuerPrivateKey; this.issuerPublicKey = issuerPublicKey;
    this.issuer = issuer; this.now = now;
  }

  async issue(input) {
    const issuedAt = this.now();
    const capabilityId = input.capabilityId ?? `cap-${randomBytes(16).toString("hex")}`;
    const nonce = randomBytes(32).toString("base64url");
    const argumentDigest = localSha256(input.arguments);
    const expiresAt = new Date(issuedAt.getTime() + LOCAL_CONTEXT_LIMITS.capabilityLifetimeMs);
    const authorized = await this.store.authorizeIssue({ ...input, capabilityId, nonce, argumentDigest,
      browserKeyThumbprint: browserKeyThumbprint(input.browserPublicKey), issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString() });
    if (authorized.browserPublicKey !== input.browserPublicKey) throw coded("local-browser-key-mismatch");
    const token = createSignedCapability({ capabilityId, issuer: this.issuer,
      audienceDeviceId: input.deviceId, bootEpoch: input.bootEpoch, browserPublicKey: input.browserPublicKey,
      participantPseudonym: input.participantId, projectId: input.projectId,
      connectionId: input.connectionId, rootId: input.rootId, operation: input.operation,
      argumentDigest, capabilitySetVersion: authorized.capabilitySetVersion, nonce },
    this.issuerPrivateKey, { now: issuedAt });
    return Object.freeze({ schemaVersion: LOCAL_CONTEXT_SCHEMAS.capability, token, capabilityId,
      expiresAt: expiresAt.toISOString(), privateValuesIncluded: false });
  }

  async redeem({ request, deviceSignature, startedAt = this.now().toISOString() }) {
    const verifiedRequest = verifyBrowserProof(request);
    const payload = verifySignedCapability(request.controlCapability, this.issuerPublicKey, { now: new Date(startedAt) });
    const argumentDigest = localSha256(request.arguments);
    if (payload.audienceDeviceId !== request.deviceId && request.deviceId !== undefined) throw coded("local-redemption-denied");
    if (payload.connectionId !== request.connectionId || payload.rootId !== request.rootId
        || payload.operation !== request.operation || payload.argumentDigest !== argumentDigest
        || payload.bootEpoch !== request.bootEpoch || payload.browserPublicKey !== request.browserPublicKey
        || payload.browserKeyThumbprint !== request.browserKeyThumbprint) throw coded("local-redemption-denied");
    const binding = await this.store.deviceBinding(payload.participantPseudonym, payload.audienceDeviceId);
    const signedInput = { schemaVersion: LOCAL_CONTEXT_SCHEMAS.redemption, capabilityId: payload.capabilityId,
      requestId: request.requestId, argumentDigest, bootEpoch: request.bootEpoch,
      browserKeyThumbprint: request.browserKeyThumbprint, startedAt };
    if (binding.status !== "active" || binding.bootEpoch !== request.bootEpoch
        || !signatureValid(binding.publicKey, signedInput, deviceSignature)) throw coded("local-device-proof-invalid");
    const redemptionId = `redeem-${randomBytes(16).toString("hex")}`;
    const deadlineAt = new Date(new Date(startedAt).getTime() + LOCAL_CONTEXT_LIMITS.operationDeadlineMs).toISOString();
    const result = await this.store.redeem({ payload, requestId: verifiedRequest.requestId,
      redemptionId, startedAt, deadlineAt });
    return Object.freeze({ schemaVersion: LOCAL_CONTEXT_SCHEMAS.redemption, status: "redeemed", ...result,
      privateValuesIncluded: false });
  }

  async complete(input) {
    const signedInput = { schemaVersion: LOCAL_CONTEXT_SCHEMAS.completion, redemptionId: input.redemptionId,
      participantId: input.participantId, connectionId: input.connectionId, deviceId: input.deviceId,
      bootEpoch: input.bootEpoch, outcomeCode: input.outcomeCode, argumentDigest: input.argumentDigest, resultDigest: input.resultDigest,
      startedAt: input.startedAt, completedAt: input.completedAt };
    const binding = await this.store.deviceBinding(input.participantId, input.deviceId);
    if (binding.status !== "active" || binding.bootEpoch !== input.bootEpoch
        || !signatureValid(binding.publicKey, signedInput, input.deviceSignature)) throw coded("local-device-proof-invalid");
    const result = await this.store.complete(input);
    return Object.freeze({ schemaVersion: LOCAL_CONTEXT_SCHEMAS.completion, ...result,
      privateValuesIncluded: false });
  }
}

export function signDeviceMessage(value, privateKey) {
  return sign(null, Buffer.from(canonicalJson(value)), privateKey).toString("base64url");
}

export { LIFECYCLES };
