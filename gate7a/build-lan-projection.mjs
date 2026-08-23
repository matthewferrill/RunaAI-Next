import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { caddyfile, createLanReleaseConfig, keycloakArguments, projectionStatus } from "./lan-release.mjs";

const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
if (!output) throw new Error("--output is required");
const destination = resolve(output);
const predecessor = JSON.parse(await readFile(new URL("./fixtures/control-predecessor.json", import.meta.url), "utf8"));
const config = createLanReleaseConfig(predecessor);
await mkdir(destination, { recursive: false });
await Promise.all([
  writeFile(resolve(destination, "candidate.json"), `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" }),
  writeFile(resolve(destination, "Caddyfile"), caddyfile, { flag: "wx" }),
  writeFile(resolve(destination, "keycloak-arguments.json"), `${JSON.stringify(keycloakArguments)}\n`, { flag: "wx" }),
  writeFile(resolve(destination, "projection.json"), `${JSON.stringify(projectionStatus(predecessor, config), null, 2)}\n`, { flag: "wx" }),
]);
process.stdout.write(`${JSON.stringify(projectionStatus(predecessor, config))}\n`);
