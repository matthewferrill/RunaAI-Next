import { createRequire } from "node:module";
import { hostname, userInfo } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const coded = (code, message) => Object.assign(new Error(message), { code });
const hex40 = value => /^[a-f0-9]{40}$/.test(String(value));
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(value));

function argumentsOf(argv) {
  const names = ["release-root", "config", "expected-release-id", "expected-commit",
    "expected-artifact-digest", "prior-release-id", "prior-commit", "prior-artifact-digest",
    "reason", "legacy-repo", "legacy-commit"];
  const accepted = new Set(names); const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] ?? "").replace(/^--/, ""); const value = argv[index + 1];
    if (!accepted.has(key) || !value || !String(argv[index]).startsWith("--") || Object.hasOwn(result, key)) {
      throw coded("gate6c-owner-rebind-arguments-invalid", "The bounded owner rebind arguments are invalid.");
    }
    result[key] = value;
  }
  if (Object.keys(result).length !== names.length) throw coded("gate6c-owner-rebind-arguments-invalid", "Every owner rebind argument is required once.");
  return result;
}
function git(repo, args) {
  const result = spawnSync("git", ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`, "-C", repo, ...args],
    { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  if (result.status !== 0) throw coded("gate6c-owner-rebind-git-unavailable", "Legacy Git authority could not be verified.");
  return result.stdout.trim();
}

export async function rebindOwnerRecoveryAuthority({ pool, priorBinding, binding, subject, reason,
  observedAt = new Date().toISOString(), operationId, advanceOwnerCeremony, digestEvidence, bindingDigest }) {
  if (!uuid(subject) || !/^control-owner-rebind-[a-f0-9]{12}$/.test(String(operationId))) {
    throw coded("gate6c-owner-rebind-input-invalid", "The exact owner rebind input is invalid.");
  }
  if (!["webauthn-rp-domain-correction", "interrupted-enrollment-recovery-release"].includes(reason)) {
    throw coded("gate6c-owner-rebind-reason-invalid", "The owner rebind reason is not approved.");
  }
  const priorDigest = bindingDigest(priorBinding); const digest = bindingDigest(binding);
  if (priorDigest === digest) throw coded("gate6c-owner-rebind-unchanged", "The corrected release must have a distinct authority binding.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const principal = (await client.query(`SELECT oidc_subject,role,age_class,status,record_version
      FROM gate5.principals WHERE principal_id='matthew-owner' FOR UPDATE`)).rows[0];
    if (!principal || principal.oidc_subject !== subject || principal.role !== "primary-steward"
        || principal.age_class !== "adult" || principal.status !== "active" || principal.record_version !== 1) {
      throw coded("gate6c-owner-rebind-principal-mismatch", "The existing target owner principal does not match exactly.");
    }
    const rows = (await client.query(`SELECT binding_digest,state_json FROM gate6c.owner_ceremonies
      WHERE binding_digest=ANY($1::text[]) ORDER BY binding_digest FOR UPDATE`, [[priorDigest, digest]])).rows;
    if (rows.length !== 2) throw coded("gate6c-owner-rebind-ceremony-missing", "Both prior and corrected ceremony records are required.");
    const prior = rows.find(row => row.binding_digest === priorDigest)?.state_json;
    const current = rows.find(row => row.binding_digest === digest)?.state_json;
    if (prior?.revision !== 1 || prior?.nextStep !== "enroll-primary-credential" || prior?.complete !== false
        || current?.revision !== 0 || current?.phase !== "planned"
        || current?.nextStep !== "verify-recovery-authority" || current?.complete !== false) {
      throw coded("gate6c-owner-rebind-ceremony-state-mismatch", "The prior or corrected owner ceremony has drifted.");
    }
    const evidence = { passed: true, evidenceDigest: digestEvidence({ command: "verify-recovery-authority",
      authorityVerified: true, reason, priorBindingDigest: priorDigest,
      principalRef: binding.participantRefHmac, observedAt }) };
    const next = advanceOwnerCeremony(current, { operationId, command: "verify-recovery-authority", evidence, observedAt });
    const updated = await client.query(`UPDATE gate6c.owner_ceremonies SET state_json=$2::jsonb,
      updated_at=clock_timestamp() WHERE binding_digest=$1`, [digest, JSON.stringify(next)]);
    if (updated.rowCount !== 1) throw coded("gate6c-owner-rebind-update-failed", "The corrected ceremony was not advanced exactly once.");
    await client.query("COMMIT");
    return Object.freeze({ schemaVersion: "runa2-gate6c-owner-rebind-result/v1", passed: true,
      priorCeremonyRetained: true, ceremonyRevision: next.revision, nextStep: next.nextStep,
      privateValuesIncluded: false });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

async function main(argv) {
  const args = argumentsOf(argv);
  if (process.platform !== "win32" || hostname().toUpperCase() !== "RUNA-CONTROL"
      || userInfo().username.toLowerCase() !== "matthew") throw coded("gate6c-owner-rebind-context-invalid", "Owner rebind must run as Matthew on RUNA-CONTROL.");
  if (!hex40(args["expected-commit"]) || !hex40(args["prior-commit"]) || !hex40(args["legacy-commit"])
      || !hex64(args["expected-artifact-digest"]) || !hex64(args["prior-artifact-digest"])) {
    throw coded("gate6c-owner-rebind-pins-invalid", "The release and legacy pins are invalid.");
  }
  const releaseRoot = resolve(args["release-root"]); const configPath = resolve(args.config);
  if (releaseRoot !== resolve("C:\\AI\\RunaAI-Next-Candidate\\releases", args["expected-release-id"])
      || configPath !== resolve("C:\\AI\\RunaAI-Next-Candidate\\config\\candidate.json")) {
    throw coded("gate6c-owner-rebind-path-invalid", "The rebind paths are outside the candidate boundary.");
  }
  const legacyRepo = resolve(args["legacy-repo"]);
  if (legacyRepo !== resolve("C:\\AI\\Projects\\RunaAI") || git(legacyRepo, ["rev-parse", "HEAD"]) !== args["legacy-commit"]
      || git(legacyRepo, ["branch", "--show-current"]) !== "main"
      || git(legacyRepo, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
    throw coded("gate6c-owner-rebind-legacy-mismatch", "Legacy RunaAI is not the exact clean authority pin.");
  }
  const imported = relative => import(pathToFileURL(join(releaseRoot, relative)).href);
  const [{ loadReleaseConfig, readSecretReference, decodeKey }, { assertReleaseManifest }, { verifyReleaseArtifact },
    { createEnvelopeCipher }, ceremony, contracts, formats] = await Promise.all([
      imported("gate6b/release-config.mjs"), imported("gate6/release.mjs"), imported("gate6b/artifact.mjs"),
      imported("gate4/envelope.mjs"), imported("gate6c/ceremony.mjs"), imported("gate6c/contracts.mjs"), imported("gate6c/formats.mjs")]);
  const loaded = await loadReleaseConfig(configPath); const config = loaded.value;
  const manifestPath = isAbsolute(config.releaseManifestPath) ? config.releaseManifestPath : resolve(dirname(configPath), config.releaseManifestPath);
  const manifest = assertReleaseManifest(JSON.parse((await readFile(manifestPath, "utf8")).replace(/^\uFEFF/, "")));
  if (config.mode !== "shadow" || config.keycloak.issuer !== "http://localhost:9762/realms/runaai-next"
      || config.gate6c?.enabled !== true || config.gate6c.expectedPrincipalId !== "matthew-owner"
      || config.gate6c.legacyCommit !== args["legacy-commit"] || manifest.releaseId !== args["expected-release-id"]
      || manifest.commit !== args["expected-commit"] || manifest.artifactDigest !== args["expected-artifact-digest"]
      || manifest.configurationDigest !== loaded.configurationDigest) {
    throw coded("gate6c-owner-rebind-release-mismatch", "The corrected shadow release does not match its reviewed pins.");
  }
  await verifyReleaseArtifact(releaseRoot, manifest.artifactDigest);
  const [connectionString, coreEncryption, coreHmac] = await Promise.all([
    readSecretReference(config.databaseUrlRef, dirname(configPath)), readSecretReference(config.keyRefs.coreEncryption, dirname(configPath)),
    readSecretReference(config.keyRefs.coreHmac, dirname(configPath))]);
  const cipher = createEnvelopeCipher({ encryptionKey: decodeKey(coreEncryption, "core encryption key"),
    hmacKey: decodeKey(coreHmac, "core HMAC key"), keyId: "runa-core-release-v1" });
  const base = { schemaVersion: formats.GATE6C_BINDING_VERSION, cutoverId: config.cutoverId,
    releaseCommit: manifest.commit, artifactDigest: manifest.artifactDigest, sourceGeneration: config.gate6c.legacyCommit,
    targetGeneration: config.targetGeneration, participantRefHmac: cipher.digest({ type: "gate6c-owner-participant", principalId: "matthew-owner" }) };
  const binding = { ...base, releaseId: manifest.releaseId };
  const priorBinding = { ...base, releaseId: args["prior-release-id"],
    releaseCommit: args["prior-commit"], artifactDigest: args["prior-artifact-digest"] };
  const subject = process.env.RUNA_GATE6C_OWNER_SUBJECT; delete process.env.RUNA_GATE6C_OWNER_SUBJECT;
  const pg = createRequire(join(releaseRoot, "package.json"))("pg");
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000,
    application_name: "runaai-next-owner-rebind" });
  try { return await rebindOwnerRecoveryAuthority({ pool, priorBinding, binding, subject, reason: args.reason,
    operationId: `control-owner-rebind-${contracts.digestEvidence({ prior: contracts.bindingDigest(priorBinding),
      current: contracts.bindingDigest(binding) }).slice(0, 12)}`, advanceOwnerCeremony: ceremony.advanceOwnerCeremony,
    digestEvidence: contracts.digestEvidence, bindingDigest: contracts.bindingDigest }); }
  finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(value => process.stdout.write(`${JSON.stringify(value)}\n`), error => {
    process.stderr.write(`${JSON.stringify({ schemaVersion: "runa2-gate6c-owner-rebind-error/v1",
      errorCode: error?.code ?? "gate6c-owner-rebind-failed", privateValuesIncluded: false })}\n`); process.exitCode = 1;
  });
}
