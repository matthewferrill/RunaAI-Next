import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("./m1-s2b1-isomorphic-git-release-manifest.json", import.meta.url), "utf8"));
const digest = /^[a-f0-9]{64}$/u;

test("pins the exact reviewed registry artifact and unpacked release", () => {
  assert.equal(manifest.schemaVersion, "runaai-package-release-manifest/v1");
  assert.deepEqual({ name: manifest.package.name, version: manifest.package.version, license: manifest.package.license },
    { name: "isomorphic-git", version: "1.41.0", license: "MIT" });
  assert.equal(manifest.registryArtifact.url, "https://registry.npmjs.org/isomorphic-git/-/isomorphic-git-1.41.0.tgz");
  assert.equal(manifest.registryArtifact.bytes, 1_205_055);
  assert.equal(manifest.registryArtifact.sha512Base64,
    "YADpOKD/pLemtcyZ9jssNXnPVhfDObGl/BAKMtvmU17svgNzOKTT6AHX68DzFHpie5hAZHRtutC0Cka3lYdmBA==");
  assert.equal(manifest.unpackedArtifact.entryCount, 36);
  assert.equal(manifest.unpackedArtifact.totalBytes, 4_891_940);
  assert.match(manifest.unpackedArtifact.manifestSha256, digest);
});

test("pins a unique exact dependency set with no install scripts or alternate registry", () => {
  assert.equal(manifest.isolatedResolution.packageCount, 55);
  assert.equal(manifest.isolatedResolution.packageIds.length, 55);
  assert.equal(new Set(manifest.isolatedResolution.packageIds).size, 55);
  assert.equal(manifest.isolatedResolution.allResolvedFromRegistryNpmjsOrg, true);
  assert.deepEqual(manifest.isolatedResolution.installScriptPackages, []);
  assert.match(manifest.isolatedResolution.closureSha256, digest);
  assert.equal(manifest.isolatedResolution.packageIds.includes("isomorphic-git@1.41.0"), true);
  assert.deepEqual(Object.keys(manifest.directDependencies).sort(), ["async-lock", "clean-git-ref", "crc-32", "diff3",
    "ignore", "minimisted", "pako", "pify", "readable-stream", "sha.js", "simple-get"]);
});

test("admits only the ESM core with the Runa broker and records a time-bound clean audit", () => {
  assert.equal(manifest.runtimeAdmission.allowedPackageEntryPoint, "isomorphic-git/index.js");
  assert.equal(manifest.runtimeAdmission.requiredHttpImplementation, "Runa authenticated bounded Git broker transport");
  assert.equal(manifest.runtimeAdmission.packageHttpAdapterAllowed, false);
  assert.equal(manifest.runtimeAdmission.packageCliAllowed, false);
  for (const entry of ["isomorphic-git/cli.cjs", "isomorphic-git/http/node", "isomorphic-git/http/web", "isomorphic-git/index.cjs"]) {
    assert.equal(manifest.runtimeAdmission.deniedPackageEntryPoints.includes(entry), true, entry);
  }
  assert.equal(manifest.advisoryObservation.total, 0);
  assert.equal(manifest.advisoryObservation.timeBoundNotPermanentGuarantee, true);
  assert.equal(manifest.reviewState, "prospective-uninstalled");
});
