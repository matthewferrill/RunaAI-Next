import { resolve } from "node:path";
import { createProductionComposition } from "./composition.mjs";
import { createCandidateHttpServer } from "./http-server.mjs";
import { loadReleaseConfig } from "./release-config.mjs";

const argument = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const configPath = argument("--config");
if (!configPath) throw Object.assign(new Error("--config is required"), { code: "release-config-required" });
if (process.version !== "v22.22.0") throw Object.assign(new Error("Node 22.22.0 is required"), { code: "release-node-version-mismatch" });

const loadedConfig = await loadReleaseConfig(resolve(configPath));
const releaseRoot = resolve(import.meta.dirname, "..");
const composition = await createProductionComposition({ loadedConfig, releaseRoot });
const server = createCandidateHttpServer({ application: composition.application,
  runtimeStatus: composition.runtimeStatus, readinessStatus: composition.readinessStatus,
  dependencyHealth: composition.dependencyHealth,
  staticRoot: resolve(import.meta.dirname, "public"),
  maxRequestBytes: loadedConfig.value.limits.maxRequestBytes });

await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(loadedConfig.value.bind.port, loadedConfig.value.bind.host, resolveListen);
});
process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate6b-start/v1",
  listening: true, bind: "loopback", port: loadedConfig.value.bind.port,
  releaseId: composition.releaseManifest.releaseId, privateValuesIncluded: false })}\n`);

let closing = false;
async function close(signal) {
  if (closing) return;
  closing = true;
  await new Promise(resolveClose => server.close(resolveClose));
  await composition.close();
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate6b-stop/v1",
    stopped: true, signal, privateValuesIncluded: false })}\n`);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void close(signal).then(() => process.exit(0)); });
