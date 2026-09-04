import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { argvDigest, digest, inspectWatchdog, launchWatchdog, packageDigest, plainFile,
  POWERSHELL, prepareWatchdogRequest } from "./control/deployment/watchdog.mjs";
import { eligibilityEnvelopeSha256, sourceAuthority } from "./native-gate3-control-node-bootstrap.mjs";

const STAGING_PARENT = "C:\\Users\\Matthew\\AppData\\Local";
const STAGING = path.join(STAGING_PARENT, "RunaAI", "Gate7F", "staging");
const RELEASE = "C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc";
const NODE = path.join(RELEASE, "runtime", "node.exe");
const NODE_SHA256 = "bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb";
const HASH = /^[a-f0-9]{64}$/u;
const coded = code => Object.assign(new Error(code), { code });
const samePath = (left, right) => path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase();
const psEnvironment = Object.freeze({ ComSpec: "C:\\Windows\\System32\\cmd.exe", OS: "Windows_NT",
  PATHEXT: ".COM;.EXE;.BAT;.CMD;.CPL", PROCESSOR_ARCHITECTURE: "AMD64", SystemDrive: "C:",
  SystemRoot: "C:\\Windows", TEMP: "C:\\Windows\\Temp", TMP: "C:\\Windows\\Temp",
  WINDIR: "C:\\Windows", PSModulePath: "C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules" });

function psLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function runPowerShell(script, code) {
  const hardenedScript = `$ProgressPreference='SilentlyContinue';${script}`;
  const result = spawnSync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-EncodedCommand", Buffer.from(hardenedScript, "utf16le").toString("base64")],
  { encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 65_536, env: psEnvironment });
  if (result.status !== 0 || result.signal !== null || result.error || result.stderr !== "") throw coded(code);
  return result.stdout.trim();
}

function makeOwnerPrivate(directory) {
  const target = psLiteral(directory);
  runPowerShell(`$ErrorActionPreference='Stop';$p=${target};$me=[Security.Principal.WindowsIdentity]::GetCurrent();
if($me.Name-cne'RUNA-CONTROL\\Matthew'){throw'identity'};$system=New-Object Security.Principal.SecurityIdentifier('S-1-5-18');
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetOwner($me.User);$acl.SetAccessRuleProtection($true,$false);
$inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit';$prop=[Security.AccessControl.PropagationFlags]::None;
foreach($sid in @($me.User,$system)){$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::FullControl,$inherit,$prop,[Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($rule)|Out-Null};[IO.Directory]::SetAccessControl($p,$acl)`,
  "native-gate3-eligibility-acl-create-failed");
}

async function assertOwnerPrivate(directory) {
  if (!path.isAbsolute(directory) || !samePath(await realpath(directory), directory)
      || !(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) {
    throw coded("native-gate3-eligibility-private-directory-invalid");
  }
  const target = psLiteral(directory);
  const result = runPowerShell(`$ErrorActionPreference='Stop';$p=${target};$me=[Security.Principal.WindowsIdentity]::GetCurrent();
$acl=[IO.Directory]::GetAccessControl($p);$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));
$owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;$ids=@($rules|ForEach-Object{$_.IdentityReference.Value}|Sort-Object -Unique);if($owner-cne$me.User.Value-or$ids.Count-ne2-or
  $acl.AreAccessRulesProtected-ne$true-or$ids-notcontains$me.User.Value-or$ids-notcontains'S-1-5-18'-or@($rules|Where-Object{$_.IsInherited-or$_.AccessControlType-ne'Allow'-or
  ($_.FileSystemRights-band[Security.AccessControl.FileSystemRights]::FullControl)-ne[Security.AccessControl.FileSystemRights]::FullControl}).Count-ne0){throw'acl'};'ok'`,
  "native-gate3-eligibility-acl-invalid");
  if (result !== "ok") throw coded("native-gate3-eligibility-acl-invalid");
}

async function createOwnerPrivate(directory) {
  await mkdir(directory);
  makeOwnerPrivate(directory);
  await assertOwnerPrivate(directory);
}

async function writeExclusiveJson(filename, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  const handle = await open(filename, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  return Object.freeze({ bytes: bytes.length, sha256: digest(bytes) });
}

async function prepareControlStaging() {
  if (!samePath(await realpath(STAGING_PARENT), STAGING_PARENT)) {
    throw coded("native-gate3-eligibility-control-parent-preflight-failed");
  }
  const target = psLiteral(STAGING_PARENT);
  const result = runPowerShell(`$ErrorActionPreference='Stop';$p=${target};$me=[Security.Principal.WindowsIdentity]::GetCurrent();
if($me.Name-cne'RUNA-CONTROL\\Matthew'){throw'identity'};$item=Get-Item -LiteralPath $p -Force;
if(-not$item.PSIsContainer-or($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0-or[IO.Path]::GetFullPath($item.FullName)-cne$p){throw'path'};
$q=$item.FullName;while($true){$ancestor=Get-Item -LiteralPath $q -Force;if(($ancestor.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw'reparse'};
$parent=[IO.Directory]::GetParent($q);if($null-eq$parent){break};$q=$parent.FullName};
$acl=[IO.Directory]::GetAccessControl($p);$owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;$allowed=@($me.User.Value,'S-1-5-18','S-1-5-32-544');
if($allowed-notcontains$owner){throw'owner'};$write=[Security.AccessControl.FileSystemRights]::WriteData-bor[Security.AccessControl.FileSystemRights]::AppendData-bor
[Security.AccessControl.FileSystemRights]::WriteExtendedAttributes-bor[Security.AccessControl.FileSystemRights]::WriteAttributes-bor
[Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles-bor[Security.AccessControl.FileSystemRights]::Delete-bor
[Security.AccessControl.FileSystemRights]::ChangePermissions-bor[Security.AccessControl.FileSystemRights]::TakeOwnership;
$bad=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|Where-Object{$_.AccessControlType-eq'Allow'-and
  ($_.FileSystemRights-band$write)-ne0-and$allowed-notcontains$_.IdentityReference.Value});if($bad.Count-ne0){throw'write'};'ok'`,
  "native-gate3-eligibility-control-parent-preflight-failed");
  if (result !== "ok") throw coded("native-gate3-eligibility-control-parent-preflight-failed");
  for (const directory of [path.join(STAGING_PARENT, "RunaAI"),
    path.join(STAGING_PARENT, "RunaAI", "Gate7F"), STAGING]) {
    if (await pathAbsent(directory)) {
      await createOwnerPrivate(directory);
    }
    await assertOwnerPrivate(directory);
  }
  if (!samePath(await realpath(STAGING), STAGING)) {
    throw coded("native-gate3-eligibility-staging-provision-failed");
  }
}

function expectedAuthority(authority) {
  const expected = {
    sourceCommit: process.env.RUNAAI_GATE3_EXPECTED_SOURCE_COMMIT,
    operatorSha256: process.env.RUNAAI_GATE3_EXPECTED_OPERATOR_SHA256,
    bootstrapSha256: process.env.RUNAAI_GATE3_EXPECTED_BOOTSTRAP_SHA256,
    watchdogSha256: process.env.RUNAAI_GATE3_EXPECTED_WATCHDOG_SHA256,
    hostSha256: process.env.RUNAAI_GATE3_EXPECTED_HOST_SHA256,
    wrapperSha256: process.env.RUNAAI_GATE3_EXPECTED_WRAPPER_SHA256,
    helperSha256: process.env.RUNAAI_GATE3_EXPECTED_HELPER_SHA256,
  };
  if (!/^[a-f0-9]{40,64}$/u.test(expected.sourceCommit ?? "")
      || !Object.entries(expected).every(([key, value]) => key === "sourceCommit" || HASH.test(value ?? ""))
      || Object.entries(expected).some(([key, value]) => authority[key] !== value)) {
    throw coded("native-gate3-eligibility-reviewed-source-mismatch");
  }
}

async function nonContentManifest(directory) {
  const hash = createHash("sha256");
  let files = 0;
  let directories = 0;
  let bytes = 0;
  const compare = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
  async function walk(current, relative = "") {
    const children = await readdir(current, { withFileTypes: true });
    children.sort((left, right) => compare(left.name, right.name));
    for (const child of children) {
      const next = path.posix.join(relative, child.name);
      const filename = path.join(current, child.name);
      const item = await lstat(filename);
      if (item.isSymbolicLink()) throw coded("native-gate3-eligibility-scratch-link");
      if (item.isDirectory()) {
        directories += 1;
        hash.update(`d\0${next}\n`, "utf8");
        await walk(filename, next);
      } else if (item.isFile()) {
        files += 1;
        bytes += item.size;
        hash.update(`f\0${next}\0${item.size}\n`, "utf8");
      } else throw coded("native-gate3-eligibility-scratch-type");
    }
  }
  await walk(directory);
  return Object.freeze({ schemaVersion: "runaai-native-gate3-noncontent-manifest/v1",
    files, directories, bytes, sha256: hash.digest("hex") });
}

async function pathAbsent(filename) {
  try { await lstat(filename); return false; }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
}

function errorCode(error, fallback = "native-gate3-eligibility-operator-failed") {
  return /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : fallback;
}

function parseChildEvidence(bytes) {
  let value;
  try { value = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)); }
  catch { throw coded("native-gate3-eligibility-evidence-json"); }
  const keys = ["browserInvoked", "combinedBytes", "databaseAttempted", "errorCode", "exitCode",
    "isolationTier", "modelInvoked", "passed", "privateValuesIncluded", "productionChanged", "schemaVersion",
    "status"];
  const allowedStatuses = new Set(["executed", "unavailable", "failed", "timed-out", "output-limited"]);
  const allowedTiers = new Set(["unavailable", "base-container", "appcontainer-bfs", "appcontainer-dacl"]);
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("\0") !== keys.sort().join("\0")
      || value.schemaVersion !== "runaai-native-gate3-mxc-eligibility-result/v1"
      || typeof value.passed !== "boolean" || !allowedStatuses.has(value.status)
      || !(value.errorCode === null || /^[a-z0-9-]{1,100}$/u.test(value.errorCode))
      || !(value.exitCode === null || Number.isInteger(value.exitCode)) || !allowedTiers.has(value.isolationTier)
      || !Number.isSafeInteger(value.combinedBytes) || value.combinedBytes < 0 || value.combinedBytes > 160_000
      || value.databaseAttempted !== false || value.modelInvoked !== false || value.browserInvoked !== false
      || value.productionChanged !== false || value.privateValuesIncluded !== false) {
    throw coded("native-gate3-eligibility-evidence-schema");
  }
  return value;
}

export async function run() {
  if (process.platform !== "win32" || process.version !== "v22.22.0" || !samePath(process.execPath, NODE)
      || digest(await plainFile(NODE, 100 * 1024 * 1024, true)) !== NODE_SHA256) {
    throw coded("native-gate3-eligibility-operator-runtime-invalid");
  }
  const authority = await sourceAuthority();
  expectedAuthority(authority);
  await prepareControlStaging();
  const root = path.join(STAGING, `m1-g3-eligibility-${randomUUID().replaceAll("-", "")}`);
  const journal = path.join(root, "journal");
  const scratch = path.join(root, "scratch");
  const local = path.join(scratch, "localappdata");
  const temp = path.join(scratch, "temp");
  const transient = path.join(scratch, "transient");
  let rootIdentity = null;
  let scratchIdentity = null;
  let prepared = null;
  let completion = null;
  let observation = null;
  let child = null;
  let childBytes = null;
  let envelopeSha256 = null;
  let primaryError = null;
  let scratchManifest = null;
  let sealInput = null;
  let scratchRemoved = false;
  let scratchCreated = false;
  let terminalBytes = null;
  let terminalSafe = true;
  try {
    await mkdir(root);
    const rootItem = await lstat(root);
    rootIdentity = { dev: rootItem.dev, ino: rootItem.ino, birthtimeMs: rootItem.birthtimeMs };
    makeOwnerPrivate(root);
    await assertOwnerPrivate(root);
    await createOwnerPrivate(journal);
    await createOwnerPrivate(scratch);
    scratchCreated = true;
    const scratchItem = await lstat(scratch);
    scratchIdentity = { dev: scratchItem.dev, ino: scratchItem.ino, birthtimeMs: scratchItem.birthtimeMs };
    for (const directory of [local, temp, transient]) await createOwnerPrivate(directory);

    const deployment = path.join(import.meta.dirname, "control", "deployment");
    const bootstrap = path.join(import.meta.dirname, "native-gate3-control-node-bootstrap.mjs");
    const host = path.join(deployment, "Watchdog-Host.mjs");
    const wrapper = path.join(deployment, "Invoke-ClosedCompanionWatchdog.ps1");
    const helper = path.join(deployment, "ClosedCompanionJob.cs");
    const manifestPath = path.join(root, "supervisor-package.json");
    const members = [
      { role: "node-runtime", path: NODE, sha256: NODE_SHA256 },
      { role: "control-bootstrap", path: bootstrap, sha256: authority.bootstrapSha256 },
      { role: "supervisor-host", path: host, sha256: authority.hostSha256 },
      { role: "supervisor-wrapper", path: wrapper, sha256: authority.wrapperSha256 },
      { role: "supervisor-helper", path: helper, sha256: authority.helperSha256 },
    ];
    await writeExclusiveJson(manifestPath, { schemaVersion: "runaai-native-gate3-supervisor-package/v1",
      members, privateValuesIncluded: false });
    const pins = [...members.map(({ path: memberPath, sha256 }) => ({ path: memberPath, sha256 })),
      { path: manifestPath, sha256: digest(await plainFile(manifestPath, 16_777_216)) }]
      .sort((left, right) => {
        const a = left.path.toLowerCase(); const b = right.path.toLowerCase();
        return a < b ? -1 : a > b ? 1 : 0;
      });
    const methodNonce = authority.sourceAuthoritySha256.slice(0, 32);
    envelopeSha256 = await eligibilityEnvelopeSha256();
    const environment = { ComSpec: "C:\\Windows\\System32\\cmd.exe", LOCALAPPDATA: local, OS: "Windows_NT",
      PATHEXT: ".COM;.EXE;.BAT;.CMD", PROCESSOR_ARCHITECTURE: "AMD64", SystemDrive: "C:",
      SystemRoot: "C:\\Windows", TEMP: temp, TMP: temp, WINDIR: "C:\\Windows",
      RUNAAI_GATE3_RESOURCE_PROOF_METHOD: methodNonce };
    prepared = await prepareWatchdogRequest({ directory: journal,
      transitionId: randomBytes(16).toString("hex"), descriptorSha256: envelopeSha256,
      packageSha256: packageDigest(pins), executable: NODE, executableSha256: NODE_SHA256,
      supervisorExecutable: NODE, supervisorExecutableSha256: NODE_SHA256,
      arguments: [bootstrap], pins, admission: { phase: "eligibility", envelopeSha256,
        eligibilitySealSha256: null }, entrypoint: { path: bootstrap, sha256: members[1].sha256 },
      environment, manifest: pins.find(pin => pin.path === manifestPath), maximumMs: 30_000,
      maximumBytes: 64 * 1024, assertOwnerPrivate });
    if (prepared.request.argumentsSha256 !== argvDigest([bootstrap])) throw coded("native-gate3-eligibility-argv-drift");
    const launched = await launchWatchdog({ prepared, wrapperFile: wrapper, wrapperSha256: members[3].sha256,
      helperFile: helper, helperSha256: members[4].sha256, hostFile: host, hostSha256: members[2].sha256,
      powershellSha256: digest(await plainFile(POWERSHELL, 100 * 1024 * 1024, true)), assertOwnerPrivate });
    completion = await launched.completion;
    if (completion?.stopped === true) {
      observation = await inspectWatchdog({ directory: journal, requestSha256: prepared.requestSha256,
        assertOwnerPrivate });
      if (observation?.terminalRetained === true) {
        terminalBytes = await plainFile(path.join(journal, "terminal.json"), 524_288);
        const childPath = path.join(scratch, "eligibility-child.json");
        if (!await pathAbsent(childPath)) {
          childBytes = await plainFile(childPath, 16_384);
          child = parseChildEvidence(childBytes);
        }
      }
    }
    if (completion?.status !== "returned" || completion?.stopped !== true || completion?.exitCode !== 0) {
      throw coded("native-gate3-eligibility-supervisor-completion-unknown");
    }
    if (child === null) throw coded("native-gate3-eligibility-evidence-missing");
    if (observation.status !== "terminal" || observation.result?.ExitCode !== 0
        || observation.result?.ActiveProcesses !== 0 || observation.result?.AdmissionAcknowledged !== true
        || observation.result?.Acknowledgement?.consumed !== true || child.passed !== true
        || child.databaseAttempted !== false || child.modelInvoked !== false || child.browserInvoked !== false
        || child.productionChanged !== false || child.privateValuesIncluded !== false) {
      throw coded("native-gate3-eligibility-result-invalid");
    }
  } catch (error) { primaryError = error; }

  const cleanupErrors = [];
  if (rootIdentity !== null) {
    try {
      await assertOwnerPrivate(root);
      if (scratchIdentity !== null && !await pathAbsent(scratch)) scratchManifest = await nonContentManifest(scratch);
      const terminalResult = observation?.result;
      const processTerminal = terminalResult?.StopConfirmed === true && terminalResult?.ProcessAbsent === true
        && terminalResult?.TreeAbsent === true && terminalResult?.ExitCodeObserved === true
        && terminalResult?.OutputComplete === true && terminalResult?.OutputFaulted === false
        && terminalResult?.ActiveProcesses === 0;
      terminalSafe = terminalSafe && (prepared === null || processTerminal);
      const acknowledgementSha256 = terminalResult?.Acknowledgement
        ? digest(Buffer.from(JSON.stringify(terminalResult.Acknowledgement), "utf8")) : null;
      const sealValue = { schemaVersion: "runaai-native-gate3-mxc-eligibility-seal-input/v1",
        sourceCommit: authority.sourceCommit, sourceTree: authority.sourceTree,
        sourceAuthoritySha256: authority.sourceAuthoritySha256,
        operatorSha256: authority.operatorSha256, envelopeSha256, requestSha256: prepared?.requestSha256 ?? null,
        supervisor: completion ? { status: completion.status, stopped: completion.stopped === true,
          exitCode: Number.isInteger(completion.exitCode) ? completion.exitCode : null } : null,
        terminalRecordSha256: terminalBytes ? digest(terminalBytes) : null,
        terminal: terminalResult ? { status: observation.status, exitCode: terminalResult.ExitCode,
          activeProcesses: terminalResult.ActiveProcesses, processAbsent: terminalResult.ProcessAbsent,
          treeAbsent: terminalResult.TreeAbsent, stopConfirmed: terminalResult.StopConfirmed,
          exitCodeObserved: terminalResult.ExitCodeObserved, outputComplete: terminalResult.OutputComplete,
          outputFaulted: terminalResult.OutputFaulted, timedOut: terminalResult.TimedOut,
          outputLimited: terminalResult.OutputLimited, admissionAcknowledged: terminalResult.AdmissionAcknowledged,
          acknowledgementSha256 } : null,
        childResultSha256: childBytes ? digest(childBytes) : null,
        child: child ? { passed: child.passed, status: child.status, errorCode: child.errorCode,
          exitCode: child.exitCode, isolationTier: child.isolationTier, combinedBytes: child.combinedBytes } : null,
        scratchIdentity, scratchManifest,
        primaryFailureCode: primaryError ? errorCode(primaryError) : null,
        databaseAttempted: false, modelInvoked: false, browserInvoked: false,
        productionChanged: false, privateValuesIncluded: false };
      sealInput = await writeExclusiveJson(path.join(root, "eligibility-seal-input.json"), sealValue);
    } catch (error) { cleanupErrors.push(error); }
  }
  if (scratchIdentity !== null && sealInput !== null && terminalSafe) {
    try {
      const current = await lstat(scratch);
      if (current.dev !== scratchIdentity.dev || current.ino !== scratchIdentity.ino
          || current.birthtimeMs !== scratchIdentity.birthtimeMs || !samePath(await realpath(scratch), scratch)) {
        throw coded("native-gate3-eligibility-scratch-replaced");
      }
      await rm(scratch, { recursive: true, force: false });
      if (!await pathAbsent(scratch)) throw coded("native-gate3-eligibility-scratch-cleanup-unconfirmed");
      scratchRemoved = true;
    } catch (error) { cleanupErrors.push(error); }
  } else if (scratchCreated) cleanupErrors.push(coded("native-gate3-eligibility-scratch-retained"));

  let eligibilitySeal = null;
  if (rootIdentity !== null && sealInput !== null) {
    try {
      const rootItem = await lstat(root);
      if (rootItem.dev !== rootIdentity.dev || rootItem.ino !== rootIdentity.ino
          || rootItem.birthtimeMs !== rootIdentity.birthtimeMs || !samePath(await realpath(root), root)) {
        throw coded("native-gate3-eligibility-root-replaced");
      }
      const passed = primaryError === null && cleanupErrors.length === 0 && scratchRemoved;
      eligibilitySeal = await writeExclusiveJson(path.join(root, "eligibility-result.json"), {
        schemaVersion: "runaai-native-gate3-mxc-eligibility-public-result/v1", passed,
        envelopeSha256, requestSha256: prepared?.requestSha256 ?? null, sealInputSha256: sealInput.sha256,
        status: child?.status ?? "unavailable", isolationTier: child?.isolationTier ?? "unavailable",
        childErrorCode: child?.errorCode ?? null,
        terminalRetained: observation?.terminalRetained === true,
        terminalRecordSha256: terminalBytes ? digest(terminalBytes) : null,
        activeProcesses: observation?.result?.ActiveProcesses ?? null,
        scratchRemoved, primaryFailureCode: primaryError ? errorCode(primaryError) : null,
        cleanupFailureCodes: cleanupErrors.map(error => errorCode(error, "native-gate3-eligibility-cleanup-failed")),
        databaseAttempted: false, modelInvoked: false, browserInvoked: false,
        productionChanged: false, privateValuesIncluded: false });
    } catch (error) { cleanupErrors.push(error); }
  }
  if (primaryError || cleanupErrors.length || !eligibilitySeal) {
    const failures = [primaryError, ...cleanupErrors].filter(Boolean);
    if (failures.length === 1) throw failures[0];
    const aggregate = new AggregateError(failures, "native-gate3-eligibility-and-cleanup-failed");
    aggregate.code = "native-gate3-eligibility-and-cleanup-failed";
    throw aggregate;
  }
  return Object.freeze({ schemaVersion: "runaai-native-gate3-mxc-eligibility-operator/v1", passed: true,
    eligibilitySealSha256: eligibilitySeal.sha256, isolationTier: child.isolationTier,
    activeProcesses: 0, scratchRemoved: true, databaseAttempted: false, modelInvoked: false,
    browserInvoked: false, productionChanged: false, privateValuesIncluded: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-native-gate3-mxc-eligibility-operator-error/v1",
      passed: false, errorCode: /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "")
        ? error.code : "native-gate3-eligibility-operator-failed", databaseAttempted: false,
      modelInvoked: false, browserInvoked: false, productionChanged: false, privateValuesIncluded: false })}\n`);
    process.exitCode = 1;
  });
}
