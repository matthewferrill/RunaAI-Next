import { createRequire } from "node:module";
import { hostname, userInfo } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const coded = (code, message) => Object.assign(new Error(message), { code });
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hex40 = value => /^[a-f0-9]{40}$/.test(String(value));
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(value));

function parseArguments(argv) {
  const accepted = new Set(["release-root", "config", "expected-release-id", "expected-commit",
    "expected-artifact-digest", "legacy-repo", "legacy-commit"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] ?? "").replace(/^--/, "");
    const value = argv[index + 1];
    if (!accepted.has(key) || !value || !String(argv[index]).startsWith("--") || Object.hasOwn(result, key)) {
      throw coded("gate6c-owner-arguments-invalid", "The bounded owner operator arguments are invalid.");
    }
    result[key] = value;
  }
  if (!exactKeys(result, [...accepted])) {
    throw coded("gate6c-owner-arguments-invalid", "Every exact owner operator argument is required once.");
  }
  return result;
}

function git(repo, args) {
  const result = spawnSync("git", ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`, "-C", repo, ...args], {
    encoding: "utf8", windowsHide: true, timeout: 15_000,
  });
  if (result.status !== 0) throw coded("gate6c-owner-legacy-git-unavailable", "Legacy Git authority could not be verified.");
  return result.stdout.trim();
}

export async function bindOwnerAndVerifyRecoveryAuthority({ pool, binding, subject,
  principalId = "matthew-owner", observedAt = new Date().toISOString(), operationId,
  advanceOwnerCeremony, digestEvidence, bindingDigest }) {
  if (!uuid(subject) || principalId !== "matthew-owner"
      || !/^control-recovery-authority-[a-f0-9]{12}$/.test(String(operationId))) {
    throw coded("gate6c-owner-binding-input-invalid", "The exact target owner binding input is invalid.");
  }
  const evidence = { passed: true, evidenceDigest: digestEvidence({
    command: "verify-recovery-authority", authorityVerified: true,
    principalRef: binding.participantRefHmac, observedAt,
  }) };
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const principalCount = Number((await client.query("SELECT count(*)::int AS count FROM gate5.principals")).rows[0]?.count);
    if (principalCount !== 0) throw coded("gate6c-owner-principal-state-changed", "The target principal store is no longer empty.");
    const digest = bindingDigest(binding);
    const row = (await client.query(`SELECT state_json FROM gate6c.owner_ceremonies
      WHERE binding_digest=$1 FOR UPDATE`, [digest])).rows[0];
    if (!row || row.state_json?.revision !== 0 || row.state_json?.phase !== "planned"
        || row.state_json?.nextStep !== "verify-recovery-authority" || row.state_json?.complete !== false) {
      throw coded("gate6c-owner-ceremony-state-changed", "The owner ceremony is not at its exact initial authority step.");
    }
    await client.query(`INSERT INTO gate5.principals
      (principal_id,oidc_subject,role,age_class,status,record_version)
      VALUES($1,$2,'primary-steward','adult','active',1)`, [principalId, subject]);
    const next = advanceOwnerCeremony(row.state_json, { operationId,
      command: "verify-recovery-authority", evidence, observedAt });
    const updated = await client.query(`UPDATE gate6c.owner_ceremonies SET state_json=$2::jsonb,
      updated_at=clock_timestamp() WHERE binding_digest=$1`, [digest, JSON.stringify(next)]);
    if (updated.rowCount !== 1) throw coded("gate6c-owner-ceremony-update-failed", "The owner ceremony was not advanced exactly once.");
    await client.query("COMMIT");
    return Object.freeze({ schemaVersion: "runa2-gate6c-owner-authority-result/v1", passed: true,
      principalId, ceremonyRevision: next.revision, nextStep: next.nextStep,
      privateValuesIncluded: false });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function main(argv) {
  const args = parseArguments(argv);
  if (process.platform !== "win32" || hostname().toUpperCase() !== "RUNA-CONTROL"
      || userInfo().username.toLowerCase() !== "matthew") {
    throw coded("gate6c-owner-authority-context-invalid", "The owner operator must run as Matthew on RUNA-CONTROL.");
  }
  if (!hex40(args["expected-commit"]) || !hex40(args["legacy-commit"])
      || !hex64(args["expected-artifact-digest"])) {
    throw coded("gate6c-owner-pins-invalid", "The exact release and legacy pins are invalid.");
  }
  const releaseRoot = resolve(args["release-root"]);
  const configPath = resolve(args.config);
  const expectedRoot = resolve("C:\\AI\\RunaAI-Next-Candidate\\releases", args["expected-release-id"]);
  if (releaseRoot !== expectedRoot || configPath !== resolve("C:\\AI\\RunaAI-Next-Candidate\\config\\candidate.json")) {
    throw coded("gate6c-owner-path-invalid", "The owner operator paths are outside the exact candidate release boundary.");
  }
  const legacyRepo = resolve(args["legacy-repo"]);
  if (legacyRepo !== resolve("C:\\AI\\Projects\\RunaAI")
      || git(legacyRepo, ["rev-parse", "HEAD"]) !== args["legacy-commit"]
      || git(legacyRepo, ["branch", "--show-current"]) !== "main"
      || git(legacyRepo, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
    throw coded("gate6c-owner-legacy-authority-mismatch", "Legacy RunaAI is not at the exact clean authority pin.");
  }

  const imported = async relative => import(pathToFileURL(join(releaseRoot, relative)).href);
  const [{ loadReleaseConfig, readSecretReference, decodeKey }, { assertReleaseManifest },
    { verifyReleaseArtifact }, { createEnvelopeCipher }, ceremony, contracts, formats] = await Promise.all([
      imported("gate6b/release-config.mjs"), imported("gate6/release.mjs"),
      imported("gate6b/artifact.mjs"), imported("gate4/envelope.mjs"),
      imported("gate6c/ceremony.mjs"), imported("gate6c/contracts.mjs"), imported("gate6c/formats.mjs"),
    ]);
  const loaded = await loadReleaseConfig(configPath);
  const config = loaded.value;
  const manifestPath = isAbsolute(config.releaseManifestPath) ? config.releaseManifestPath
    : resolve(dirname(configPath), config.releaseManifestPath);
  const manifest = assertReleaseManifest(JSON.parse((await readFile(manifestPath, "utf8")).replace(/^\uFEFF/, "")));
  if (config.mode !== "shadow" || config.gate6c?.enabled !== true
      || config.gate6c.expectedPrincipalId !== "matthew-owner"
      || manifest.releaseId !== args["expected-release-id"] || manifest.commit !== args["expected-commit"]
      || manifest.artifactDigest !== args["expected-artifact-digest"]
      || manifest.configurationDigest !== loaded.configurationDigest
      || config.gate6c.legacyCommit !== args["legacy-commit"]
      || config.sourceGeneration !== args["legacy-commit"]) {
    throw coded("gate6c-owner-release-authority-mismatch", "The running release is not the exact reviewed shadow authority.");
  }
  await verifyReleaseArtifact(releaseRoot, manifest.artifactDigest);
  const [connectionString, coreEncryption, coreHmac] = await Promise.all([
    readSecretReference(config.databaseUrlRef, dirname(configPath)),
    readSecretReference(config.keyRefs.coreEncryption, dirname(configPath)),
    readSecretReference(config.keyRefs.coreHmac, dirname(configPath)),
  ]);
  const cipher = createEnvelopeCipher({ encryptionKey: decodeKey(coreEncryption, "core encryption key"),
    hmacKey: decodeKey(coreHmac, "core HMAC key"), keyId: "runa-core-release-v1" });
  const binding = { schemaVersion: formats.GATE6C_BINDING_VERSION, cutoverId: config.cutoverId,
    releaseId: manifest.releaseId, releaseCommit: manifest.commit,
    artifactDigest: manifest.artifactDigest, sourceGeneration: config.gate6c.legacyCommit,
    targetGeneration: config.targetGeneration,
    participantRefHmac: cipher.digest({ type: "gate6c-owner-participant", principalId: "matthew-owner" }) };
  const subject = process.env.RUNA_GATE6C_OWNER_SUBJECT;
  delete process.env.RUNA_GATE6C_OWNER_SUBJECT;
  const require = createRequire(join(releaseRoot, "package.json"));
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000,
    query_timeout: 8_000, application_name: "runaai-next-owner-authority" });
  try {
    return await bindOwnerAndVerifyRecoveryAuthority({ pool, binding, subject,
      operationId: `control-recovery-authority-${contracts.digestEvidence({
        releaseId: manifest.releaseId, principalRef: binding.participantRefHmac,
      }).slice(0, 12)}`, advanceOwnerCeremony: ceremony.advanceOwnerCeremony,
      digestEvidence: contracts.digestEvidence, bindingDigest: contracts.bindingDigest });
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
    process.stderr.write(`${JSON.stringify({ schemaVersion: "runa2-gate6c-owner-authority-error/v1",
      errorCode: error?.code ?? "gate6c-owner-authority-failed", privateValuesIncluded: false })}\n`);
    process.exitCode = 1;
  });
}
