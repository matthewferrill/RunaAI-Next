import path from "node:path";
import { fileURLToPath } from "node:url";

import { MxcJavascriptExecutor } from "../../../gate7e/mxc-javascript-executor.mjs";
import { assertOwnedStage, fail } from "./runner-contract.mjs";

export async function normalizeR15RuntimeSecurity({ root: suppliedRoot, executorFactory } = {}) {
  if (process.platform !== "win32") throw fail("r15-runtime-security-platform");
  const root = assertOwnedStage(suppliedRoot);
  const options = {
    runtimeRoot: path.join(root, "sandbox-runtime"),
    runnerPath: path.join(root, "sandbox-runtime/quickjs-child.mjs"),
    nodeExecutable: path.join(root, "runtime/node.exe"),
    temporaryRoot: path.join(root, "transient")
  };
  const executor = executorFactory ? executorFactory(options) : new MxcJavascriptExecutor(options);
  const result = await executor.preflight();
  const receipt = result?.receipt;
  const observation = result?.startupObservation;
  if (result?.ready !== true || receipt?.status !== "executed" || receipt?.errorCode !== null
      || receipt?.exitCode !== 0 || receipt?.systemStamped !== true
      || !Array.isArray(receipt?.effects) || receipt.effects.length !== 0
      || observation?.schemaVersion !== "runa2-sandbox-startup-observation/v1"
      || observation?.processStarted !== true || observation?.exitCode !== 0
      || observation?.classifiedErrorCode !== null || observation?.privateValuesIncluded !== false) {
    throw fail("r15-runtime-security-normalization-preflight");
  }
  return Object.freeze({
    schemaVersion: "runaai-m1-r15-runtime-security-normalization/v1",
    ready: true,
    receiptStatus: "executed",
    exitCode: 0,
    effects: 0,
    modelsInvoked: false,
    productionChanged: false,
    privateValuesIncluded: false
  });
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--owned-root") throw fail("r15-runtime-security-normalization-arguments");
  return { root: argv[1] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  normalizeR15RuntimeSecurity(parseArguments(process.argv.slice(2)))
    .then(value => process.stdout.write(`${JSON.stringify(value)}\n`))
    .catch(error => {
      process.stderr.write(`${error?.code ?? error?.message ?? "r15-runtime-security-normalization-failed"}\n`);
      process.exitCode = 1;
    });
}
