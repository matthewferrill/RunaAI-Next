import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PIN_KEYS = ["schemaVersion", "platform", "nativeScriptRelativePath", "nativeScriptSha256",
  "powershellPath", "powershellSha256", "gitPath", "gitInstallRoot", "gitSha256", "mxcPackage",
  "gitSystemConfigPath", "gitSystemConfigSha256", "gitSystemAttributesPath",
  "gitSystemAttributesSha256", "mxcVersion", "mxcExecutorRelativePath", "mxcExecutorSha256",
  "policyTemplateSha256", "processMonitorRelativePath", "processMonitorSha256",
  "repositoryWitnessRelativePath", "repositoryWitnessSha256", "uiWitnessRelativePath", "uiWitnessSha256",
  "hostPrepRelativePath", "hostPrepSha256", "hostPrerequisiteReaderRelativePath",
  "hostPrerequisiteReaderSha256", "hostTransitionRelativePath", "hostTransitionSha256",
  "aclNativeSourceRelativePath", "aclNativeSourceSha256", "containedProcessSourceRelativePath",
  "containedProcessSourceSha256", "hostRepairLauncherRelativePath", "hostRepairLauncherSha256"];

export async function loadOmenReleasePins() {
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  const pinsPath = resolve(import.meta.dirname, "release-pins.json");
  const pins = JSON.parse(await readFile(pinsPath, "utf8"));
  if (!pins || Object.keys(pins).sort().join("\0") !== [...PIN_KEYS].sort().join("\0")
      || pins.schemaVersion !== "runa-omen-local-release-pins/v1" || pins.platform !== "win32-x64-omen"
      || pins.mxcPackage !== "@microsoft/mxc-sdk" || pins.mxcVersion !== "0.8.0"
      || ![pins.powershellPath, pins.gitPath, pins.gitInstallRoot, pins.gitSystemConfigPath,
        pins.gitSystemAttributesPath].every(value => typeof value === "string" && value.length > 2)
      || ![pins.nativeScriptSha256, pins.powershellSha256, pins.gitSha256, pins.gitSystemConfigSha256,
        pins.gitSystemAttributesSha256, pins.mxcExecutorSha256, pins.policyTemplateSha256,
        pins.processMonitorSha256, pins.repositoryWitnessSha256, pins.uiWitnessSha256, pins.hostPrepSha256,
        pins.hostPrerequisiteReaderSha256, pins.hostTransitionSha256, pins.aclNativeSourceSha256,
        pins.containedProcessSourceSha256, pins.hostRepairLauncherSha256]
        .every(value => /^[a-f0-9]{64}$/u.test(value))) {
    throw Object.assign(new Error("omen-release-pins-invalid"), { code: "omen-release-pins-invalid" });
  }
  return Object.freeze({ ...pins, repositoryRoot, pinsPath,
    nativeScriptPath: resolve(repositoryRoot, pins.nativeScriptRelativePath),
    mxcExecutorPath: resolve(repositoryRoot, pins.mxcExecutorRelativePath),
    processMonitorPath: resolve(repositoryRoot, pins.processMonitorRelativePath),
    repositoryWitnessPath: resolve(repositoryRoot, pins.repositoryWitnessRelativePath),
    uiWitnessPath: resolve(repositoryRoot, pins.uiWitnessRelativePath),
    hostPrepPath: resolve(repositoryRoot, pins.hostPrepRelativePath),
    hostPrerequisiteReaderPath: resolve(repositoryRoot, pins.hostPrerequisiteReaderRelativePath),
    hostTransitionPath: resolve(repositoryRoot, pins.hostTransitionRelativePath),
    aclNativeSourcePath: resolve(repositoryRoot, pins.aclNativeSourceRelativePath),
    containedProcessSourcePath: resolve(repositoryRoot, pins.containedProcessSourceRelativePath),
    hostRepairLauncherPath: resolve(repositoryRoot, pins.hostRepairLauncherRelativePath) });
}
