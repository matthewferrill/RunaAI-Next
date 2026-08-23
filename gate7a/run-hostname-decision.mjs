import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHostnameDecisionReadiness } from "./hostname-decision.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const readJson = async name => JSON.parse(await readFile(join(root, "fixtures", name), "utf8"));

try {
  const decision = await readJson("selected-hostname.json");
  const template = await readJson("synthetic-policy.json");
  process.stdout.write(`${JSON.stringify(createHostnameDecisionReadiness(decision, template), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "runa2-gate7a-error/v1",
    errorCode: error?.code ?? "gate7a-hostname-readiness-failed",
    privateValuesIncluded: false,
  })}\n`);
  process.exitCode = 1;
}
