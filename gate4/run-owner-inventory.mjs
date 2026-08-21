import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inventoryFromSnapshot, inventoryScriptHash, readLegacyProjectChatDomain, safeInventoryOutput } from "./inventory.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw Object.assign(new Error(`Missing ${name}.`), { code: "inventory-argument-missing" });
  return process.argv[index + 1];
}

try {
  const legacyRepo = resolve(argument("--legacy-repo"));
  const expectedCommit = argument("--expected-commit");
  const sourcePinsPath = fileURLToPath(new URL("./SOURCE-PINS.json", import.meta.url));
  const firstRead = await readLegacyProjectChatDomain({ legacyRepo, expectedCommit, sourcePinsPath });
  const secondRead = await readLegacyProjectChatDomain({ legacyRepo, expectedCommit, sourcePinsPath });
  const first = inventoryFromSnapshot(firstRead.snapshot, firstRead.diagnostics);
  const second = inventoryFromSnapshot(secondRead.snapshot, secondRead.diagnostics);
  const sources = [fileURLToPath(import.meta.url), fileURLToPath(new URL("./inventory.mjs", import.meta.url)),
    fileURLToPath(new URL("./canonical.mjs", import.meta.url)),
    fileURLToPath(new URL("./formats.mjs", import.meta.url))];
  const output = safeInventoryOutput({ authority: firstRead.authority, first, second,
    scriptSha256: inventoryScriptHash(sources) });
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (!output.passed) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate4a-owner-inventory/v1",
    errorCode: typeof error?.code === "string" ? error.code : "inventory-failed",
    disallowedFieldsEmitted: false, passed: false })}\n`);
  process.exitCode = 1;
}
