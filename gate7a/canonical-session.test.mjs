import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadReleaseConfig } from "../gate6b/release-config.mjs";
import { createLanReleaseConfig } from "./lan-release.mjs";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const clients = await read("../gate6b/clients.mjs");
const composition = await read("../gate6b/composition.mjs");
const config = await read("../gate6b/release-config.mjs");
const ceremony = await read("../gate6c/browser-ceremony.mjs");
const server = await read("../gate6b/http-server.mjs");

test("canonical browser issuer is separated from the loopback-only Keycloak backchannel", () => {
  assert.match(clients, /backchannelIssuer = issuer/);
  assert.match(clients, /this\.backchannelIssuer.*protocol\/openid-connect\/token/);
  assert.match(clients, /this\.issuer.*protocol\/openid-connect\/auth/);
  assert.match(composition, /backchannelIssuer: config\.keycloak\.backchannelIssuer/);
  assert.match(composition, /config\.keycloak\.backchannelIssuer \?\? config\.keycloak\.issuer/);
});

test("Gate 7A release configuration binds canonical origin, issuer, RP ID, and predecessor", () => {
  assert.match(config, /canonicalOrigin/);
  assert.match(config, /relyingPartyId/);
  assert.match(config, /predecessorManifestDigest/);
  assert.match(config, /http:\/\/127\.0\.0\.1:9762\/realms\/runaai-next/);
  assert.match(config, /release-config-gate7a-invalid/);
});

test("a closed promoted authority accepts only its exact reviewed Gate 7A successor", () => {
  assert.match(composition, /retainedCutover\.phase === "closed"/);
  assert.match(composition, /retainedCutover\.authorityGeneration === config\.targetGeneration/);
  assert.match(composition,
    /retainedCutover\.releaseManifestDigest === config\.gate7a\.predecessorManifestDigest/);
});

test("regular sign-in uses the exact canonical session callback and an opaque secure host cookie", () => {
  assert.match(ceremony, /this\.redirectUri = `\$\{this\.publicBaseUrl\}\/session\/callback`/);
  assert.match(ceremony, /async startSession\(\)/);
  assert.match(server, /url\.pathname === "\/session\/start"/);
  assert.match(server, /url\.pathname === "\/session\/callback"/);
  assert.match(server, /__Host-runa_owner_session/);
  assert.match(server, /Secure; HttpOnly; SameSite=Lax/);
});

test("the exact Control predecessor produces one valid canonical successor and issuer drift fails", async t => {
  const root = await mkdtemp(join(tmpdir(), "runa-gate7a-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const predecessor = JSON.parse(await read("./fixtures/control-predecessor.json"));
  const projected = createLanReleaseConfig(predecessor);
  const path = join(root, "candidate.json");
  await writeFile(path, JSON.stringify(projected));
  const loaded = await loadReleaseConfig(path);
  assert.equal(loaded.value.publicBaseUrl, "https://runa.bridgebuildersai.com");
  assert.equal(loaded.value.gate7a.predecessorManifestDigest,
    predecessor.predecessor.manifestDigest);
  const drifted = structuredClone(projected);
  drifted.keycloak.issuer = "https://wrong.example/auth/realms/runaai-next";
  await writeFile(path, JSON.stringify(drifted));
  await assert.rejects(loadReleaseConfig(path), { code: "release-config-gate7a-invalid" });
});
