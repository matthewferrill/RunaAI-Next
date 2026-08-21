import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertOwnerInventoryAuthority, inspectProtectedLearningStores, runOwnerInventory } from "./owner-inspection.mjs";

const gateRoot = dirname(fileURLToPath(import.meta.url)); const nextRepo = resolve(gateRoot, "..");
function argsOf(values) { const allowed = new Set(["--legacy-repo", "--expected-legacy-commit", "--expected-next-commit"]); const result = {}; for (let index = 0; index < values.length; index += 2) { const key = values[index]; const value = values[index + 1]; if (!allowed.has(key) || !value) throw Object.assign(new Error("invalid arguments"), { code: "inventory-arguments-invalid" }); result[key.slice(2)] = value; } if (Object.keys(result).length !== 3) throw Object.assign(new Error("missing arguments"), { code: "inventory-arguments-invalid" }); return result; }
try {
  const args = argsOf(process.argv.slice(2)); const sourcePins = JSON.parse(readFileSync(resolve(gateRoot, "SOURCE-PINS.json"), "utf8"));
  const authority = assertOwnerInventoryAuthority({ legacyRepo: resolve(args["legacy-repo"]), nextRepo, expectedLegacyCommit: args["expected-legacy-commit"], expectedNextCommit: args["expected-next-commit"], sourcePins });
  const output = await runOwnerInventory({ authority, inspect: () => inspectProtectedLearningStores({ legacyRepo: resolve(args["legacy-repo"]) }) });
  process.stdout.write(`${JSON.stringify(output)}\n`); if (!output.passed) process.exitCode = 1;
} catch (error) {
  const allowed = new Set(["inventory-arguments-invalid", "inventory-owner-authority-mismatch", "inventory-legacy-authority-mismatch", "inventory-next-authority-mismatch", "inventory-source-pin-mismatch", "inventory-aggregate-invalid", "protected-inventory-entry-layout-invalid"]);
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate4b-owner-inventory-result/v1", errorCode: allowed.has(error?.code) ? error.code : "protected-inventory-failed", disallowedFieldsEmitted: false, passed: false })}\n`); process.exitCode = 1;
}
