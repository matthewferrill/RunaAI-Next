import { createRequire } from "node:module";
import { hostname, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { rebindCompletedOwnerCeremony } from "../../gate6c/control/Rebind-ControlCompletedOwnerCeremony.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const hex40 = value => /^[a-f0-9]{40}$/.test(String(value));
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));

function argumentsOf(argv) {
  const names = ["release-root", "successor-config", "successor-manifest", "expected-release-id",
    "expected-commit", "expected-artifact-digest", "prior-config", "prior-manifest",
    "prior-release-id", "prior-commit", "prior-artifact-digest"];
  const accepted = new Set(names); const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] ?? "").replace(/^--/, ""); const value = argv[index + 1];
    if (!accepted.has(key) || !value || !String(argv[index]).startsWith("--") || Object.hasOwn(result, key)) {
      throw coded("gate7a-ordinary-owner-rebind-arguments-invalid", "The bounded owner-session rebind arguments are invalid.");
    }
    result[key] = value;
  }
  if (Object.keys(result).length !== names.length) {
    throw coded("gate7a-ordinary-owner-rebind-arguments-invalid", "Every owner-session rebind argument is required once.");
  }
  return result;
}

async function main(argv) {
  const args = argumentsOf(argv);
  if (process.platform !== "win32" || hostname().toUpperCase() !== "RUNA-CONTROL"
      || userInfo().username.toLowerCase() !== "matthew") {
    throw coded("gate7a-ordinary-owner-rebind-context-invalid", "The owner-session rebind must run as Matthew on RUNA-CONTROL.");
  }
  if (!hex40(args["expected-commit"]) || !hex40(args["prior-commit"])
      || !hex64(args["expected-artifact-digest"]) || !hex64(args["prior-artifact-digest"])) {
    throw coded("gate7a-ordinary-owner-rebind-pins-invalid", "The owner-session release pins are invalid.");
  }

  const root = resolve("C:\\AI\\RunaAI-Next-Candidate");
  const releaseId = args["expected-release-id"]; const releaseRoot = resolve(args["release-root"]);
  const rollbackRoot = resolve(root, "secrets", `gate7a-ordinary-rollback-${releaseId}`);
  const successorConfigPath = resolve(args["successor-config"]);
  const successorManifestPath = resolve(args["successor-manifest"]);
  const priorConfigPath = resolve(args["prior-config"]); const priorManifestPath = resolve(args["prior-manifest"]);
  if (releaseRoot !== resolve(root, "releases", releaseId)
      || successorConfigPath !== resolve(root, "config", "candidate.json")
      || successorManifestPath !== resolve(root, "config", "gate7a-release.json")
      || priorConfigPath !== resolve(rollbackRoot, "candidate.json")
      || priorManifestPath !== resolve(rollbackRoot, "gate7a-release.json")) {
    throw coded("gate7a-ordinary-owner-rebind-path-invalid", "The owner-session rebind paths are outside their exact boundaries.");
  }

  const imported = relative => import(pathToFileURL(join(releaseRoot, relative)).href);
  const [{ loadReleaseConfig, readSecretReference, decodeKey }, { assertReleaseManifest },
    { verifyReleaseArtifact }, { createEnvelopeCipher }, ceremony, contracts, formats] = await Promise.all([
    imported("gate6b/release-config.mjs"), imported("gate6/release.mjs"), imported("gate6b/artifact.mjs"),
    imported("gate4/envelope.mjs"), imported("gate6c/ceremony.mjs"), imported("gate6c/contracts.mjs"),
    imported("gate6c/formats.mjs")]);
  const [loaded, priorLoaded] = await Promise.all([
    loadReleaseConfig(successorConfigPath), loadReleaseConfig(priorConfigPath)]);
  const config = loaded.value; const priorConfig = priorLoaded.value;
  const manifest = assertReleaseManifest(JSON.parse((await readFile(successorManifestPath, "utf8")).replace(/^\uFEFF/, "")));
  const priorManifest = assertReleaseManifest(JSON.parse((await readFile(priorManifestPath, "utf8")).replace(/^\uFEFF/, "")));
  const canonicalOrigin = "https://runa.bridgebuildersai.com";
  const canonicalIssuer = `${canonicalOrigin}/auth/realms/runaai-next`;
  const backchannelIssuer = "http://127.0.0.1:9762/realms/runaai-next";
  if (config.mode !== "active" || config.publicBaseUrl !== canonicalOrigin
      || config.keycloak.issuer !== canonicalIssuer || config.keycloak.backchannelIssuer !== backchannelIssuer
      || config.gate7a?.enabled !== true || config.gate7a.ordinaryClient?.clientId !== "runaai-next-user"
      || config.gate6c?.enabled !== true || config.gate6c.expectedPrincipalId !== "matthew-owner"
      || manifest.releaseId !== releaseId || manifest.commit !== args["expected-commit"]
      || manifest.artifactDigest !== args["expected-artifact-digest"]
      || manifest.configurationDigest !== loaded.configurationDigest
      || priorConfig.mode !== "active" || priorConfig.publicBaseUrl !== canonicalOrigin
      || priorConfig.keycloak.issuer !== canonicalIssuer || priorConfig.keycloak.backchannelIssuer !== backchannelIssuer
      || priorConfig.gate7a?.enabled !== true || priorConfig.gate6c?.enabled !== true
      || config.gate7a.predecessorManifestDigest !== priorConfig.gate7a.predecessorManifestDigest
      || priorConfig.gate6c.expectedPrincipalId !== "matthew-owner"
      || priorManifest.releaseId !== args["prior-release-id"] || priorManifest.commit !== args["prior-commit"]
      || priorManifest.artifactDigest !== args["prior-artifact-digest"]
      || priorManifest.configurationDigest !== priorLoaded.configurationDigest
      || config.cutoverId !== priorConfig.cutoverId || config.sourceGeneration !== priorConfig.sourceGeneration
      || config.targetGeneration !== priorConfig.targetGeneration
      || config.gate6c.legacyCommit !== priorConfig.gate6c.legacyCommit
      || config.databaseUrlRef !== priorConfig.databaseUrlRef
      || config.keyRefs.coreEncryption !== priorConfig.keyRefs.coreEncryption
      || config.keyRefs.coreHmac !== priorConfig.keyRefs.coreHmac) {
    throw coded("gate7a-ordinary-owner-rebind-release-mismatch", "The exact predecessor and ordinary-access successor do not reconcile.");
  }
  await verifyReleaseArtifact(releaseRoot, manifest.artifactDigest);

  const secretBase = dirname(successorConfigPath);
  const [connectionString, coreEncryption, coreHmac] = await Promise.all([
    readSecretReference(config.databaseUrlRef, secretBase),
    readSecretReference(config.keyRefs.coreEncryption, secretBase),
    readSecretReference(config.keyRefs.coreHmac, secretBase)]);
  const cipher = createEnvelopeCipher({ encryptionKey: decodeKey(coreEncryption, "core encryption key"),
    hmacKey: decodeKey(coreHmac, "core HMAC key"), keyId: "runa-core-release-v1" });
  const participantRefHmac = cipher.digest({ type: "gate6c-owner-participant", principalId: "matthew-owner" });
  const base = { schemaVersion: formats.GATE6C_BINDING_VERSION, cutoverId: config.cutoverId,
    sourceGeneration: config.gate6c.legacyCommit, targetGeneration: config.targetGeneration, participantRefHmac };
  const binding = { ...base, releaseId: manifest.releaseId, releaseCommit: manifest.commit,
    artifactDigest: manifest.artifactDigest };
  const priorBinding = { ...base, releaseId: priorManifest.releaseId, releaseCommit: priorManifest.commit,
    artifactDigest: priorManifest.artifactDigest };
  const subject = process.env.RUNA_GATE7A_OWNER_SUBJECT; delete process.env.RUNA_GATE7A_OWNER_SUBJECT;
  const pg = createRequire(join(releaseRoot, "package.json"))("pg");
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000,
    application_name: "runaai-next-gate7a-ordinary-owner-rebind" });
  try {
    const result = await rebindCompletedOwnerCeremony({ pool, priorBinding, binding, subject,
      reason: "completed-owner-ordinary-access-release",
      operationId: `control-completed-owner-rebind-${contracts.digestEvidence({
        prior: contracts.bindingDigest(priorBinding), current: contracts.bindingDigest(binding) }).slice(0, 12)}`,
      assertOwnerCeremonyComplete: ceremony.assertOwnerCeremonyComplete,
      bindingDigest: contracts.bindingDigest });
    return Object.freeze({ schemaVersion: "runa2-gate7a-ordinary-owner-rebind-result/v1", passed: result.passed,
      priorCeremonyRetained: result.priorCeremonyRetained, ceremonyRevision: result.ceremonyRevision,
      ceremonyComplete: result.ceremonyComplete, alreadyRebound: result.alreadyRebound === true,
      authorityChanged: false, protectedProductDataChanged: false, privateValuesIncluded: false });
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(value => process.stdout.write(`${JSON.stringify(value)}\n`), error => {
    delete process.env.RUNA_GATE7A_OWNER_SUBJECT;
    process.stderr.write(`${JSON.stringify({ schemaVersion: "runa2-gate7a-ordinary-owner-rebind-error/v1",
      errorCode: error?.code ?? "gate7a-ordinary-owner-rebind-failed", privateValuesIncluded: false })}\n`);
    process.exitCode = 1;
  });
}
