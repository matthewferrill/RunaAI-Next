import {
  DEPENDENCY_ROOTS,
  EXPECTED_DEPENDENCY_SHA256,
  dependencyManifestSha256,
} from "../gate7f/function-first/native-gate3-control-node-bootstrap.mjs";

async function main() {
  if (process.argv.length !== 2) throw Object.assign(new Error("arguments"), {
    code: "gate7f-dependency-manifest-arguments-invalid",
  });
  const actualSha256 = await dependencyManifestSha256();
  const matchesPinned = actualSha256 === EXPECTED_DEPENDENCY_SHA256;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "runaai-gate7f-dependency-manifest/v1",
    roots: DEPENDENCY_ROOTS,
    actualSha256,
    expectedSha256: EXPECTED_DEPENDENCY_SHA256,
    matchesPinned,
    modelInvoked: false,
    eligibilityInvoked: false,
    browserInvoked: false,
    databaseAttempted: false,
    networkAttempted: false,
    privateValuesIncluded: false,
  })}\n`);
  if (!matchesPinned) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${/^[a-z0-9-]+$/u.test(error?.code ?? "")
    ? error.code : "gate7f-dependency-manifest-failed"}\n`);
  process.exitCode = 1;
});
