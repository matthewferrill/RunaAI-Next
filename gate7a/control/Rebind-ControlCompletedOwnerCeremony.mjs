import { createRequire } from "node:module";
import { hostname, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { rebindCompletedOwnerCeremony } from "../../gate6c/control/Rebind-ControlCompletedOwnerCeremony.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const hex40 = value => /^[a-f0-9]{40}$/.test(String(value));
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));

function argumentsOf(argv) {
  const names = ["release-root", "successor-config", "successor-manifest", "expected-release-id",
    "expected-commit", "expected-artifact-digest", "prior-config", "prior-manifest",
    "prior-release-id", "prior-commit", "prior-artifact-digest", "legacy-repo", "legacy-commit"];
  const accepted = new Set(names); const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] ?? "").replace(/^--/, ""); const value = argv[index + 1];
    if (!accepted.has(key) || !value || !String(argv[index]).startsWith("--") || Object.hasOwn(result, key)) {
      throw coded("gate7a-owner-rebind-arguments-invalid", "The bounded Gate 7A owner-rebind arguments are invalid.");
    }
    result[key] = value;
  }
  if (Object.keys(result).length !== names.length) {
    throw coded("gate7a-owner-rebind-arguments-invalid", "Every Gate 7A owner-rebind argument is required once.");
  }
  return result;
}

function git(repo, args) {
  const result = spawnSync("git", ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`, "-C", repo, ...args],
    { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  if (result.status !== 0) throw coded("gate7a-owner-rebind-git-unavailable", "Git authority could not be verified.");
  return result.stdout.trim();
}

async function main(argv) {
  const args = argumentsOf(argv);
  if (process.platform !== "win32" || hostname().toUpperCase() !== "RUNA-CONTROL"
      || userInfo().username.toLowerCase() !== "matthew") {
    throw coded("gate7a-owner-rebind-context-invalid", "Gate 7A owner rebind must run as Matthew on RUNA-CONTROL.");
  }
  if (!hex40(args["expected-commit"]) || !hex40(args["prior-commit"]) || !hex40(args["legacy-commit"])
      || !hex64(args["expected-artifact-digest"]) || !hex64(args["prior-artifact-digest"])) {
    throw coded("gate7a-owner-rebind-pins-invalid", "The Gate 7A owner-rebind pins are invalid.");
  }

  const root = resolve("C:\\AI\\RunaAI-Next-Candidate");
  const releaseRoot = resolve(args["release-root"]); const releaseId = args["expected-release-id"];
  const stagingRoot = resolve(root, "staging", releaseId);
  const successorConfigPath = resolve(args["successor-config"]);
  const successorManifestPath = resolve(args["successor-manifest"]);
  const priorConfigPath = resolve(args["prior-config"]); const priorManifestPath = resolve(args["prior-manifest"]);
  if (releaseRoot !== resolve(root, "releases", releaseId)
      || successorConfigPath !== resolve(stagingRoot, "candidate.json")
      || successorManifestPath !== resolve(stagingRoot, "gate7a-release.json")
      || priorConfigPath !== resolve(root, "config", "candidate.json")
      || priorManifestPath !== resolve(root, "config", "release-gate6d-promotion-a886754.json")) {
    throw coded("gate7a-owner-rebind-path-invalid", "The Gate 7A owner-rebind paths are outside their exact boundaries.");
  }
  const legacyRepo = resolve(args["legacy-repo"]);
  if (legacyRepo !== resolve("C:\\AI\\Projects\\RunaAI")
      || git(legacyRepo, ["rev-parse", "HEAD"]) !== args["legacy-commit"]
      || git(legacyRepo, ["branch", "--show-current"]) !== "main"
      || git(legacyRepo, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
    throw coded("gate7a-owner-rebind-legacy-mismatch", "Legacy RunaAI is not the exact clean authority pin.");
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
  if (config.mode !== "active" || config.publicBaseUrl !== "https://runa.bridgebuildersai.com"
      || config.keycloak.issuer !== "https://runa.bridgebuildersai.com/auth/realms/runaai-next"
      || config.keycloak.backchannelIssuer !== "http://127.0.0.1:9762/realms/runaai-next"
      || config.gate7a?.enabled !== true || config.gate7a.predecessorManifestDigest !== priorManifest.manifestDigest
      || config.gate6c?.enabled !== true || config.gate6c.expectedPrincipalId !== "matthew-owner"
      || manifest.releaseId !== releaseId || manifest.commit !== args["expected-commit"]
      || manifest.artifactDigest !== args["expected-artifact-digest"]
      || manifest.configurationDigest !== loaded.configurationDigest || priorConfig.mode !== "active"
      || priorConfig.publicBaseUrl !== "https://192.168.50.169:9761"
      || priorConfig.keycloak.issuer !== "http://localhost:9762/realms/runaai-next"
      || priorConfig.gate6c?.enabled !== true || priorConfig.gate6c.expectedPrincipalId !== "matthew-owner"
      || priorManifest.releaseId !== args["prior-release-id"] || priorManifest.commit !== args["prior-commit"]
      || priorManifest.artifactDigest !== args["prior-artifact-digest"]
      || priorManifest.configurationDigest !== priorLoaded.configurationDigest
      || config.gate6c.legacyCommit !== args["legacy-commit"]
      || priorConfig.gate6c.legacyCommit !== args["legacy-commit"]
      || config.targetGeneration !== priorConfig.targetGeneration
      || config.databaseUrlRef !== priorConfig.databaseUrlRef
      || config.keyRefs.coreEncryption !== priorConfig.keyRefs.coreEncryption
      || config.keyRefs.coreHmac !== priorConfig.keyRefs.coreHmac) {
    throw coded("gate7a-owner-rebind-release-mismatch", "The exact predecessor and Gate 7A successor do not reconcile.");
  }
  await verifyReleaseArtifact(releaseRoot, manifest.artifactDigest);

  const secretBase = dirname(priorConfigPath);
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
  const priorBinding = { ...base, cutoverId: priorConfig.cutoverId, releaseId: priorManifest.releaseId,
    releaseCommit: priorManifest.commit, artifactDigest: priorManifest.artifactDigest };
  const subject = process.env.RUNA_GATE7A_OWNER_SUBJECT; delete process.env.RUNA_GATE7A_OWNER_SUBJECT;
  const pg = createRequire(import.meta.url)("pg");
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000,
    application_name: "runaai-next-gate7a-owner-rebind" });
  try {
    const result = await rebindCompletedOwnerCeremony({ pool, priorBinding, binding, subject,
      reason: "completed-owner-canonical-ingress",
      operationId: `control-completed-owner-rebind-${contracts.digestEvidence({
        prior: contracts.bindingDigest(priorBinding), current: contracts.bindingDigest(binding) }).slice(0, 12)}`,
      assertOwnerCeremonyComplete: ceremony.assertOwnerCeremonyComplete,
      bindingDigest: contracts.bindingDigest });
    return Object.freeze({ schemaVersion: "runa2-gate7a-owner-rebind-result/v1", passed: result.passed,
      priorCeremonyRetained: result.priorCeremonyRetained, ceremonyRevision: result.ceremonyRevision,
      ceremonyComplete: result.ceremonyComplete, authorityChanged: false, productionChanged: false,
      legacyModified: false, privateValuesIncluded: false });
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(value => process.stdout.write(`${JSON.stringify(value)}\n`), error => {
    delete process.env.RUNA_GATE7A_OWNER_SUBJECT;
    process.stderr.write(`${JSON.stringify({ schemaVersion: "runa2-gate7a-owner-rebind-error/v1",
      errorCode: error?.code ?? "gate7a-owner-rebind-failed", privateValuesIncluded: false })}\n`);
    process.exitCode = 1;
  });
}
