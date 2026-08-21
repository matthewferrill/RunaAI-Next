import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { evaluateReadiness } from "./readiness.mjs";

function argumentsOf(argv) {
  const allowed = new Set(["--manifest", "--facts", "--release-boundary", "--profile"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]; const value = argv[index + 1];
    if (!allowed.has(name) || !value) throw Object.assign(new Error("Usage: node gate6/run-readiness.mjs --manifest <json> --facts <json> --release-boundary <json> --profile <candidate|promotion>"), { code: "readiness-arguments-invalid" });
    result[name.slice(2)] = value;
  }
  for (const required of ["manifest", "facts", "release-boundary", "profile"]) if (!result[required]) throw Object.assign(new Error(`Missing --${required}.`), { code: "readiness-arguments-invalid" });
  return result;
}

async function jsonFile(file) {
  return JSON.parse(await readFile(path.resolve(file), "utf8"));
}

try {
  const args = argumentsOf(process.argv.slice(2));
  const result = evaluateReadiness({ manifest: await jsonFile(args.manifest), facts: await jsonFile(args.facts),
    releaseBoundary: await jsonFile(args["release-boundary"]), profile: args.profile });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.passed) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate6-readiness-error/v1",
    errorCode: error?.code ?? "readiness-runner-failed", passed: false, privateValuesIncluded: false })}\n`);
  process.exitCode = 1;
}
