import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "../../gate4/canonical.mjs";
import { assertQualifiedM1Successor, M1_EVIDENCE_FILE_LIMITS, parseM1EvidenceBytes } from "./deployment.mjs";

const fail = code => Object.assign(new Error(code), { code });
export function parseVerificationArguments(args) {
  const keys = ["--prior", "--successor", "--plan", "--grades", "--runtime-seal", "--expected-source-commit", "--expected-plan-sha256"];
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!keys.includes(key) || Object.hasOwn(parsed, key.slice(2)) || typeof value !== "string" || !value || value.startsWith("--")) {
      throw fail("m1-deploy-verifier-arguments-invalid");
    }
    parsed[key.slice(2)] = value;
  }
  if (Object.keys(parsed).length !== keys.length || !/^[a-f0-9]{40}$/u.test(parsed["expected-source-commit"])
      || !/^[a-f0-9]{64}$/u.test(parsed["expected-plan-sha256"])) throw fail("m1-deploy-verifier-arguments-invalid");
  return parsed;
}

async function readBounded(filename, limit) {
  let file;
  try {
    file = await open(filename, "r");
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > limit) throw fail("m1-deploy-evidence-size-invalid");
    const result = await file.readFile();
    if (result.length !== stat.size || result.length > limit) throw fail("m1-deploy-evidence-read-changed");
    return result;
  } catch (error) { throw /^m1-deploy-/u.test(error?.code ?? "") ? error : fail("m1-deploy-evidence-read-failed"); }
  finally { await file?.close(); }
}

/** Reads each exact bounded file once. Does not start a service, mutate a config,
 * connect to a model/database, or display any configuration/private values. */
export async function verifySuccessorFiles(args) {
  const [priorBytes, successorBytes, planBytes, gradesBytes, runtimeSealBytes] = await Promise.all([
    readBounded(args.prior, M1_EVIDENCE_FILE_LIMITS.configuration), readBounded(args.successor, M1_EVIDENCE_FILE_LIMITS.configuration),
    readBounded(args.plan, M1_EVIDENCE_FILE_LIMITS.plan), readBounded(args.grades, M1_EVIDENCE_FILE_LIMITS.grades),
    readBounded(args["runtime-seal"], M1_EVIDENCE_FILE_LIMITS.runtimeSeal),
  ]);
  const plan = parseM1EvidenceBytes(planBytes, { limit: M1_EVIDENCE_FILE_LIMITS.plan,
    expectedSha256: args["expected-plan-sha256"], errorCode: "m1-deploy-plan-byte-mismatch" });
  // Config hashes in the plan use the existing canonical config contract. Their
  // original raw bytes are not silently substituted for the grades/seal digests.
  const config = bytes => parseM1EvidenceBytes(bytes, { limit: M1_EVIDENCE_FILE_LIMITS.configuration,
    expectedSha256: sha256(bytes), errorCode: "m1-deploy-config-read-failed" });
  return assertQualifiedM1Successor({ prior: config(priorBytes), successor: config(successorBytes), plan,
    gradesBytes, runtimeSealBytes, expectedSourceCommit: args["expected-source-commit"] });
}

export async function runVerificationCli(args, write = text => process.stdout.write(text)) {
  try {
    const result = await verifySuccessorFiles(parseVerificationArguments(args));
    write(`${JSON.stringify(result)}\n`); return 0;
  } catch (error) {
    const code = /^m1-deploy-[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "m1-deploy-verification-failed";
    write(`${JSON.stringify({ schemaVersion: "runaai-m1-successor-verification/v1", passed: false, errorCode: code,
      productionChanged: false, privateValuesIncluded: false })}\n`); return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runVerificationCli(process.argv.slice(2));
}
