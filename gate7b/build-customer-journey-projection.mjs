import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadReleaseConfig } from "../gate6b/release-config.mjs";
import { caddyfile, createControlLaunchers, createCustomerJourneyReleaseConfig,
  customerJourneyProjectionStatus } from "../gate7a/lan-release.mjs";

const argument = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const currentConfigPath = argument("--current-config");
const output = argument("--output");
const releaseId = argument("--release-id");
if (!currentConfigPath || !output || !releaseId) {
  throw new Error("--current-config, --output, and --release-id are required");
}

const current = await loadReleaseConfig(resolve(currentConfigPath));
if (current.value.mode !== "active" || current.value.gate7a?.enabled !== true) {
  throw Object.assign(new Error("The current active Gate 7A release configuration is required."),
    { code: "gate7b-current-config-invalid" });
}
const config = createCustomerJourneyReleaseConfig(current.value);
const status = customerJourneyProjectionStatus(current.value, config);
if (!status.priorConfigurationPreserved) {
  throw Object.assign(new Error("The Gate 7B projection changed a protected release binding."),
    { code: "gate7b-projection-boundary-invalid" });
}
const launchers = createControlLaunchers(releaseId);
const destination = resolve(output);
await mkdir(destination, { recursive: false });
await Promise.all([
  writeFile(resolve(destination, "candidate.json"), `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" }),
  writeFile(resolve(destination, "Caddyfile"), caddyfile, { flag: "wx" }),
  writeFile(resolve(destination, "Run-Application.ps1"), launchers.application, { flag: "wx" }),
  writeFile(resolve(destination, "projection.json"), `${JSON.stringify(status, null, 2)}\n`, { flag: "wx" }),
]);
await loadReleaseConfig(resolve(destination, "candidate.json"));
process.stdout.write(`${JSON.stringify(status)}\n`);
