import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { link, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { OmenRootStore, WindowsNativeBridge } from "./native-bridge.mjs";
import { loadOmenReleasePins } from "./release-pins.mjs";

const codeOf = async promise => promise.then(() => null, error => error?.code ?? "unexpected-error");

export async function runActualOmenFileProof({ userProfilePath = homedir() } = {}) {
  const pins = await loadOmenReleasePins();
  if (process.platform !== "win32") throw Object.assign(new Error("actual-windows-required"), { code: "actual-windows-required" });
  if (!pins.powershellPath || !existsSync(pins.powershellPath)) throw Object.assign(new Error("powershell-path-required"), { code: "powershell-path-required" });
  if (!userProfilePath || !existsSync(userProfilePath)) throw Object.assign(new Error("user-profile-path-required"), { code: "user-profile-path-required" });
  const root = await mkdtemp(join(tmpdir(), "runa-m1-omen-files-"));
  const exactRoot = await realpath(root), selected = join(root, "selected"), outside = join(root, "outside"),
    state = join(root, "state", "roots.dpapi"), scriptPath = pins.nativeScriptPath;
  const checks = {};
  let failure, stage = "create-owned-fixture";
  try {
    await mkdir(join(selected, ".git"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(selected, "ordinary.txt"), "ordinary actual Omen text\nsecond line", { flag: "wx" });
    await writeFile(join(selected, "empty.txt"), Buffer.alloc(0), { flag: "wx" });
    await writeFile(join(selected, "long-filename-for-short-alias.txt"), "short alias target", { flag: "wx" });
    await writeFile(join(selected, "hardlink-source.txt"), "hard link must be denied", { flag: "wx" });
    await writeFile(join(selected, "secret.txt"), "password=actual-secret-value", { flag: "wx" });
    await writeFile(join(selected, "binary.txt"), Buffer.from([0xff, 0xfe, 0xfd]), { flag: "wx" });
    await writeFile(join(outside, "outside.txt"), "must never return", { flag: "wx" });
    await link(join(selected, "hardlink-source.txt"), join(selected, "hardlink.txt"));
    await symlink(outside, join(selected, "escape-junction"), "junction");
    const bridge = new WindowsNativeBridge({ powershellPath: pins.powershellPath, scriptPath,
      expectedScriptSha256: pins.nativeScriptSha256, expectedPowerShellSha256: pins.powershellSha256 });
    stage = "verify-native-release";
    const release = await bridge.verifyRelease();
    checks.releaseScriptPinned = release.scriptSha256 === pins.nativeScriptSha256
      && createHash("sha256").update(await readFile(pins.powershellPath)).digest("hex") === pins.powershellSha256;
    const store = new OmenRootStore({ statePath: state, nativeBridge: bridge,
      userProfilePath: resolve(userProfilePath), protectedSystemPaths: ["C:\\Windows", "C:\\Program Files",
        "C:\\Program Files (x86)", "C:\\ProgramData"] });
    stage = "load-missing-dpapi-store";
    checks.missingDpapiStoreIsEmpty = (await store.load()).roots.length === 0;
    stage = "inspect-selected-root";
    const candidate = await store.inspectSelectedRoot(selected);
    checks.actualHandleRootIdentity = candidate.path.toLowerCase() === resolve(selected).toLowerCase()
      && candidate.repositoryDetected === true && /^[a-f0-9]{8}$/u.test(candidate.volumeId)
      && /^[a-f0-9]{16}$/u.test(candidate.fileId);
    stage = "confirm-and-protect-root";
    await store.confirm(candidate);
    const sealed = await readFile(state);
    checks.dpapiCiphertextDoesNotExposePath = !sealed.includes(Buffer.from(resolve(selected), "utf16le"))
      && !sealed.includes(Buffer.from(resolve(selected), "utf8")) && !sealed.includes(Buffer.from("runa-omen-root-store/v1"));
    const restarted = new OmenRootStore({ statePath: state,
       nativeBridge: new WindowsNativeBridge({ powershellPath: pins.powershellPath, scriptPath,
          expectedScriptSha256: pins.nativeScriptSha256, expectedPowerShellSha256: pins.powershellSha256 }),
      userProfilePath: resolve(userProfilePath), protectedSystemPaths: ["C:\\Windows", "C:\\Program Files",
        "C:\\Program Files (x86)", "C:\\ProgramData"] });
    stage = "unprotect-root-after-restart";
    checks.currentUserDpapiRestartRead = (await restarted.load()).roots[0].rootId === candidate.rootId;
    stage = "read-ordinary-file";
    const read = await restarted.readText(candidate.rootId, "ordinary.txt");
    checks.actualBoundedTextRead = read.content === "ordinary actual Omen text\nsecond line" && read.truncated === false;
    const empty = await restarted.readText(candidate.rootId, "empty.txt");
    checks.emptyFileAccepted = empty.content === "" && empty.sourceBytes === 0 && empty.truncated === false;
    stage = "adversarial-read-cases";
    checks.hardlinkDenied = await codeOf(restarted.readText(candidate.rootId, "hardlink.txt")) === "native-hardlink-denied";
    checks.junctionEscapeDenied = await codeOf(restarted.readText(candidate.rootId,
      "escape-junction\\outside.txt")) === "native-path-escape-denied";
    checks.protectedNameDeniedBeforeNativeRead = await codeOf(restarted.readText(candidate.rootId, ".env")) === "protected-source-denied";
    checks.protectedContentDenied = await codeOf(restarted.readText(candidate.rootId, "secret.txt")) === "protected-source-denied";
    checks.invalidUtf8Denied = await codeOf(restarted.readText(candidate.rootId, "binary.txt")) === "protected-source-denied";
    checks.aliasAndAdsDenied = await codeOf(restarted.readText(candidate.rootId, "ordinary.txt.")) === "native-relative-path-invalid"
      && await codeOf(restarted.readText(candidate.rootId, "ordinary.txt:stream")) === "native-relative-path-invalid";
    checks.caseAliasDenied = await codeOf(restarted.readText(candidate.rootId, "ORDINARY.TXT")) === "native-path-alias-denied";
    const shortTarget = join(selected, "long-filename-for-short-alias.txt");
    let shortPath = null;
    try { shortPath = await bridge.shortPath(shortTarget); } catch (error) {
      if (error?.code !== "native-short-path-unavailable") throw error;
    }
    const shortAliasCode = shortPath === null || shortPath === shortTarget ? null
      : await codeOf(restarted.readText(candidate.rootId, relative(resolve(selected), shortPath)));
    checks.shortAliasDeniedOrUnavailable = shortPath === null || shortPath === shortTarget
      || ["native-path-alias-denied", "native-relative-path-invalid"].includes(shortAliasCode);
    const racePath = join(selected, "race.txt"), replacementPath = join(selected, "race-replacement.txt");
    await writeFile(racePath, "race original"); await writeFile(replacementPath, "race replacement");
    const selectedIdentity = await bridge.inspectFile(selected, "race.txt", candidate);
    const heldRacePath = join(selected, "race-held.txt");
    await rename(racePath, heldRacePath); await rename(replacementPath, racePath);
    checks.fileEntryReplacementRaceFailClosed = await codeOf(
      bridge.safeRead(selected, "race.txt", candidate, selectedIdentity)) === "native-source-identity-changed";
    await rename(racePath, replacementPath); await rename(heldRacePath, racePath);
    checks.wholeDriveAndUserHomeDenied = await codeOf(restarted.inspectSelectedRoot("C:\\")) === "omen-root-protected"
      && await codeOf(restarted.inspectSelectedRoot(userProfilePath)) === "omen-root-protected";
    stage = "retained-root-identity-replacement";
    const heldSelected = `${selected}-held`; await rename(selected, heldSelected); await mkdir(selected);
    checks.replacedRetainedRootDenied = await codeOf(restarted.readText(candidate.rootId, "ordinary.txt"))
      === "omen-root-identity-changed";
    await rm(selected, { recursive: true, force: true }); await rename(heldSelected, selected);
  } catch (error) { error.stage ??= stage; failure = error; }
  finally {
    if (resolve(root) !== resolve(exactRoot) || !resolve(root).startsWith(resolve(tmpdir()) + sep)
        || !root.includes("runa-m1-omen-files-")) throw new Error("omen-file-cleanup-root-invalid");
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    checks.ownedFixtureRemoved = !existsSync(root);
  }
  if (failure) throw failure;
  return { schemaVersion: "runaai-m1-omen-file-proof/v1", passed: Object.values(checks).every(Boolean),
    checks, privateValuesIncluded: false, productionChanged: false, modelCalled: false };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runActualOmenFileProof()
    .then(result => { process.stdout.write(`${JSON.stringify(result)}\n`); if (!result.passed) process.exitCode = 1; },
      error => { process.stderr.write(`${JSON.stringify({ schemaVersion: "runaai-m1-omen-file-error/v1",
        errorCode: error?.code ?? "omen-file-proof-failed", stage: error?.stage ?? "unknown",
        privateValuesIncluded: false })}\n`); process.exitCode = 1; });
}
