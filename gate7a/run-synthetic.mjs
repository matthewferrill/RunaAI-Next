import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSyntheticResult, loadClientAccessPolicy, loadClientMatrix } from "./access-policy.mjs";

const root = dirname(fileURLToPath(import.meta.url));
try {
  const policy = await loadClientAccessPolicy(join(root, "fixtures", "synthetic-policy.json"));
  const matrix = await loadClientMatrix(join(root, "fixtures", "client-matrix.json"));
  process.stdout.write(`${JSON.stringify(createSyntheticResult(policy, matrix), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "runa2-gate7a-error/v1",
    errorCode: error?.code ?? "gate7a-synthetic-failed",
    privateValuesIncluded: false,
  })}\n`);
  process.exitCode = 1;
}
