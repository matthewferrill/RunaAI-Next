import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJson } from "../gate4/canonical.mjs";
import { inspectSelectedContinuity } from "./selected-inventory.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const expectedPins = Object.freeze({
  "src/runa/settings-store.mjs": "75008b93939f7571694930de76b08cc62644a104d672a22f70999ea92c5cfffb",
  "src/runa/action-proposal-store.mjs": "9da769e2caf57894873b7b1f8d43bf501f17234a540bb89d1feeae04feebe3c4",
  "src/runa/action-pathway.mjs": "4847509da5716cb57c0b99b998c85d9f49d0a4f7493685eedb3a3ad9d5c6ca0e",
  "src/runa/local-state.mjs": "496aad2a21de13cd6450c8288f15b8b43fe261d3b68755c66fcb525bba308e92",
  "scripts/runa-local-ui-proxy.mjs": "ecd142fad5dfaf151083e647644a618d926c363d30e0cd0053ee398a122bc59d",
});
function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}
function git(repo, args) {
  const result = spawnSync("git", ["-c", `safe.directory=${repo.replace(/\\/g, "/")}`, "-C", repo, ...args],
    { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw coded("gate6c-owner-authority-mismatch", "The legacy Git authority check failed.");
  return result.stdout.trim();
}
function sourceDigest(path) {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text).digest("hex");
}

try {
  const legacyRepo = resolve(argument("--legacy-repo") ?? "");
  const expectedCommit = argument("--expected-commit");
  if (hostname().toUpperCase() !== "RUNA-CONTROL" || userInfo().username.toLowerCase() !== "matthew") {
    throw coded("gate6c-owner-authority-mismatch", "The selected inventory requires Matthew on RUNA-CONTROL.");
  }
  if (!/^[a-f0-9]{40}$/.test(String(expectedCommit)) || git(legacyRepo, ["rev-parse", "HEAD"]) !== expectedCommit
      || git(legacyRepo, ["branch", "--show-current"]) !== "main"
      || git(legacyRepo, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
    throw coded("gate6c-owner-authority-mismatch", "The legacy checkout is not the exact clean expected authority.");
  }
  for (const [relative, expected] of Object.entries(expectedPins)) {
    if (sourceDigest(join(legacyRepo, ...relative.split("/"))) !== expected) {
      throw coded("gate6c-source-pin-mismatch", "A selected source contract changed.");
    }
  }
  const key = randomBytes(32);
  const stateRoot = join(legacyRepo, ".runaai-local", "state");
  const first = inspectSelectedContinuity({ stateRoot, reconciliationKey: key });
  const second = inspectSelectedContinuity({ stateRoot, reconciliationKey: key });
  if (canonicalJson(first) !== canonicalJson(second)) throw coded("gate6c-owner-inventory-nondeterministic", "The two selected inventory passes differ.");
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate6c-owner-selected-inventory/v1",
    passed: true, sourceCommit: expectedCommit, sourceBranch: "main", trackedClean: true,
    sourcePinsVerified: true, twoPassDeterministic: true, domains: first.domains,
    settingValueAllowed: first.settingValueAllowed, selectedReceiptClassified: first.selectedReceiptClassified,
    unrelatedActionCount: first.unrelatedActionCount, sourceModified: first.sourceModified,
    deferredStoresOpened: first.deferredStoresOpened, privateValuesIncluded: false })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate6c-owner-selected-inventory/v1",
    passed: false, errorCode: error?.code ?? "gate6c-owner-inventory-failed",
    privateValuesIncluded: false })}\n`);
  process.exitCode = 1;
}
