import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

// Owned, disposable, loopback-only integration database. Never points at a release store.
export async function startSyntheticPostgres({ toolRoot, artifactRoot, statementTimeoutMs = null,
  lockTimeoutMs = null, idleInTransactionSessionTimeoutMs = null, processExitTimeoutMs = 30_000,
  includeProcessEvidence = false }) {
  if (!path.isAbsolute(toolRoot) || !path.isAbsolute(artifactRoot)) throw new Error("m1-pg-absolute-path-required");
  if (typeof includeProcessEvidence !== "boolean") throw new Error("m1-pg-process-evidence-invalid");
  const boundedMilliseconds = (value, name, { optional = false } = {}) => {
    if (optional && value === null) return null;
    if (!Number.isSafeInteger(value) || value < 1 || value > 300_000) {
      throw new Error(`m1-pg-${name}-invalid`);
    }
    return value;
  };
  const statementTimeout = boundedMilliseconds(statementTimeoutMs, "statement-timeout", { optional: true });
  const lockTimeout = boundedMilliseconds(lockTimeoutMs, "lock-timeout", { optional: true });
  const idleInTransactionSessionTimeout = boundedMilliseconds(idleInTransactionSessionTimeoutMs,
    "idle-in-transaction-session-timeout", { optional: true });
  const processExitTimeout = boundedMilliseconds(processExitTimeoutMs, "process-exit-timeout");
  const samePath = (left, right) => path.resolve(left).toUpperCase() === path.resolve(right).toUpperCase();
  await mkdir(artifactRoot, { recursive: true });
  const artifactRootStat = await lstat(artifactRoot);
  if (!artifactRootStat.isDirectory() || artifactRootStat.isSymbolicLink()) {
    throw new Error("m1-synthetic-pg-artifact-root-invalid");
  }
  const artifactRootIdentity = Object.freeze({ dev: artifactRootStat.dev, ino: artifactRootStat.ino,
    birthtimeMs: artifactRootStat.birthtimeMs });
  const root = await realpath(artifactRoot);
  if (!samePath(root, artifactRoot)) throw new Error("m1-synthetic-pg-artifact-root-invalid");
  const directory = await mkdtemp(path.join(root, "m1-synthetic-pg-"));
  const data = path.join(directory, "data");
  const bin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
  let directoryIdentity = null;
  const hasIdentity = (stat, identity) => stat.dev === identity.dev && stat.ino === identity.ino
    && stat.birthtimeMs === identity.birthtimeMs;
  async function verifiedArtifactRoot() {
    const currentStat = await lstat(artifactRoot);
    const currentRoot = await realpath(artifactRoot);
    if (!currentStat.isDirectory() || currentStat.isSymbolicLink() || !samePath(currentRoot, root)
        || !hasIdentity(currentStat, artifactRootIdentity)) {
      throw new Error("m1-synthetic-pg-artifact-root-invalid");
    }
    return currentRoot;
  }
  async function verifiedOwnedDirectory({ captureIdentity = false } = {}) {
    await verifiedArtifactRoot();
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error("m1-synthetic-pg-cleanup-target-invalid");
    }
    const resolved = await realpath(directory);
    if (!samePath(resolved, directory) || !samePath(path.dirname(resolved), root)
        || !path.basename(directory).startsWith("m1-synthetic-pg-")) {
      throw new Error("m1-synthetic-pg-cleanup-target-invalid");
    }
    if (directoryIdentity === null) {
      if (!captureIdentity) throw new Error("m1-synthetic-pg-cleanup-identity-unavailable");
      directoryIdentity = Object.freeze({ dev: directoryStat.dev, ino: directoryStat.ino,
        birthtimeMs: directoryStat.birthtimeMs });
    } else if (!hasIdentity(directoryStat, directoryIdentity)) {
      throw new Error("m1-synthetic-pg-cleanup-target-replaced");
    }
    return directory;
  }
  async function reserveLoopbackPort() {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      let settled = false;
      const settle = (error, selected = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(selected);
      };
      const timer = setTimeout(() => {
        const error = new Error("m1-synthetic-pg-port-selection-timeout");
        settle(error);
        if (server.listening) server.close(() => {});
      }, 5_000);
      server.once("error", error => settle(Object.assign(new Error("m1-synthetic-pg-port-selection-failed",
        { cause: error }), { diagnostic: { errorCode: error.code ?? null } })));
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const selected = typeof address === "object" && address !== null ? address.port : null;
        if (!Number.isSafeInteger(selected) || selected < 1 || selected > 65_535) {
          server.close(() => settle(new Error("m1-synthetic-pg-port-selection-invalid")));
          return;
        }
        server.close(error => settle(error ? Object.assign(new Error("m1-synthetic-pg-port-release-failed",
          { cause: error }), { diagnostic: { errorCode: error.code ?? null } }) : null, selected));
      });
    });
  }
  function run(name, args) {
    // PostgreSQL must not inherit a launcher pipe on Windows. A real file keeps
    // pg_ctl observable without making spawnSync wait on the long-lived server.
    const diagnosticFd = name === "pg_ctl" ? openSync(path.join(directory, "pg_ctl.log"), "a") : null;
    let result;
    try {
      result = spawnSync(path.join(bin, name + ".exe"), args, {
        encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000,
        ...(diagnosticFd === null ? {} : { stdio: ["ignore", diagnosticFd, diagnosticFd] }),
      });
    } finally { if (diagnosticFd !== null) closeSync(diagnosticFd); }
    if (result.status !== 0) {
      const error = new Error("m1-synthetic-pg-" + name + "-failed", { cause: result.error });
      error.diagnostic = { status: result.status, signal: result.signal ?? null,
        errorCode: result.error?.code ?? null };
      throw error;
    }
    return result;
  }
  const lifecycle = {
    phase: "prepared", child: null, postgresProcessId: null, port: null, terminal: null, spawnError: null,
    stopRequested: false,
  };
  let stopReceipt = null, stopPromise = null;
  const recordTerminal = (exitCode, signal) => {
    if (lifecycle.terminal === null) {
      lifecycle.terminal = Object.freeze({ exitCode, signal: signal ?? null });
      lifecycle.phase = lifecycle.stopRequested ? "terminal-after-stop" : "terminal-before-stop";
    }
    return lifecycle.terminal;
  };
  const terminalState = child => {
    if (lifecycle.terminal !== null) return lifecycle.terminal;
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      return recordTerminal(child.exitCode, child.signalCode);
    }
    return null;
  };
  async function waitForTerminalExit(child) {
    const alreadyExited = terminalState(child);
    if (alreadyExited !== null) return alreadyExited;
    return new Promise((resolve, reject) => {
      let timer;
      const finish = (exitCode, signal) => {
        clearTimeout(timer);
        child.off("error", failWait);
        resolve(recordTerminal(exitCode, signal));
      };
      const failWait = error => {
        clearTimeout(timer);
        child.off("exit", finish);
        reject(Object.assign(new Error("m1-synthetic-pg-postgres-exit-observation-failed", { cause: error }), {
          diagnostic: { postgresProcessId: lifecycle.postgresProcessId,
            terminalExitConfirmed: false, cleanup: "preserved" },
        }));
      };
      child.once("exit", finish);
      child.once("error", failWait);
      const racedExit = terminalState(child);
      if (racedExit !== null) {
        child.off("exit", finish); child.off("error", failWait); resolve(racedExit); return;
      }
      timer = setTimeout(() => {
        child.off("exit", finish); child.off("error", failWait);
        reject(Object.assign(new Error("m1-synthetic-pg-postgres-exit-timeout"), {
          diagnostic: { postgresProcessId: lifecycle.postgresProcessId,
            terminalExitConfirmed: false, cleanup: "preserved" },
        }));
      }, processExitTimeout);
    });
  }
  async function waitForReady(child) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (lifecycle.spawnError) throw Object.assign(new Error("m1-synthetic-pg-postgres-spawn-failed",
        { cause: lifecycle.spawnError }), {
        diagnostic: { status: null, signal: null, errorCode: lifecycle.spawnError.code ?? null },
      });
      const terminal = terminalState(child);
      if (terminal !== null) {
        throw Object.assign(new Error("m1-synthetic-pg-postgres-exited"), {
          diagnostic: { status: terminal.exitCode, signal: terminal.signal, errorCode: null },
        });
      }
      const probe = spawnSync(path.join(bin, "pg_isready.exe"),
        ["-h", "127.0.0.1", "-p", String(lifecycle.port), "-U", "m1_synthetic", "-d", "postgres"],
        { windowsHide: true, timeout: 1_000, stdio: "ignore" });
      if (probe.status === 0) return;
      if (probe.error && probe.error.code !== "ETIMEDOUT") {
        throw Object.assign(new Error("m1-synthetic-pg-readiness-probe-failed", { cause: probe.error }), {
          diagnostic: { status: probe.status, signal: probe.signal ?? null, errorCode: probe.error.code ?? null },
        });
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Object.assign(new Error("m1-synthetic-pg-postgres-readiness-timeout"), {
      diagnostic: { status: null, signal: null, errorCode: "ETIMEDOUT" },
    });
  }
  function stop() {
    if (stopPromise !== null) return stopPromise;
    stopPromise = (async () => {
      const child = lifecycle.child;
      const preStopTerminal = terminalState(child);
      if (preStopTerminal !== null) {
        throw Object.assign(new Error("m1-synthetic-pg-postgres-exited-before-stop"), {
          diagnostic: { postgresProcessId: lifecycle.postgresProcessId, terminalExitConfirmed: true,
            exitCode: preStopTerminal.exitCode, signal: preStopTerminal.signal, cleanup: "preserved" },
        });
      }
      if (!child || !["starting", "ready"].includes(lifecycle.phase)
          || !Number.isSafeInteger(lifecycle.postgresProcessId) || lifecycle.postgresProcessId < 1) {
        throw Object.assign(new Error("m1-synthetic-pg-postgres-terminal-state-unknown"), {
          diagnostic: { postgresProcessId: lifecycle.postgresProcessId,
            terminalExitConfirmed: false, cleanup: "preserved" },
        });
      }
      lifecycle.stopRequested = true;
      lifecycle.phase = "stopping";
      await verifiedOwnedDirectory();
      run("pg_ctl", ["-D", data, "stop", "-m", "fast", "-w"]);
      const observedTerminal = await waitForTerminalExit(child);
      if (observedTerminal.exitCode !== 0 || observedTerminal.signal !== null) {
        throw Object.assign(new Error("m1-synthetic-pg-postgres-abnormal-stop"), {
          diagnostic: { postgresProcessId: lifecycle.postgresProcessId, terminalExitConfirmed: true,
            exitCode: observedTerminal.exitCode, signal: observedTerminal.signal, cleanup: "preserved" },
        });
      }
      const literalDirectory = await verifiedOwnedDirectory();
      await rm(literalDirectory, { recursive: true, force: false });
      lifecycle.phase = "cleaned";
      const cleanup = { stopped: true, ownedSyntheticDataRemoved: true, productionChanged: false };
      stopReceipt = Object.freeze(includeProcessEvidence ? {
        ...cleanup, schemaVersion: "runaai-synthetic-postgres-stop-receipt/v1",
        postgresProcessId: lifecycle.postgresProcessId, controlledStopRequested: true,
        terminalExitConfirmed: true, exitCode: observedTerminal.exitCode, signal: observedTerminal.signal,
      } : cleanup);
      return stopReceipt;
    })();
    return stopPromise;
  }
  try {
    await verifiedOwnedDirectory({ captureIdentity: true });
    lifecycle.port = await reserveLoopbackPort();
    run("initdb", ["-D", data, "-U", "m1_synthetic", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8", "--no-locale"]);
    const serverFd = openSync(path.join(directory, "postgres.log"), "a");
    try {
      const postgresArgs = ["-D", data, "-p", String(lifecycle.port), "-h", "127.0.0.1"];
      for (const [name, value] of [["statement_timeout", statementTimeout], ["lock_timeout", lockTimeout],
        ["idle_in_transaction_session_timeout", idleInTransactionSessionTimeout]]) {
        if (value !== null) postgresArgs.push("-c", `${name}=${value}ms`);
      }
      lifecycle.phase = "starting";
      lifecycle.child = spawn(path.join(bin, "postgres.exe"), postgresArgs, {
        windowsHide: true, stdio: ["ignore", serverFd, serverFd],
      });
    } finally { closeSync(serverFd); }
    lifecycle.child.on("error", error => { if (lifecycle.spawnError === null) lifecycle.spawnError = error; });
    lifecycle.child.once("exit", (exitCode, signal) => {
      recordTerminal(exitCode, signal);
    });
    lifecycle.postgresProcessId = lifecycle.child.pid;
    if (!Number.isSafeInteger(lifecycle.postgresProcessId) || lifecycle.postgresProcessId < 1) {
      throw new Error("m1-synthetic-pg-postgres-pid-unavailable");
    }
    await waitForReady(lifecycle.child);
    const terminalAfterReadiness = terminalState(lifecycle.child);
    if (terminalAfterReadiness !== null) {
      throw Object.assign(new Error("m1-synthetic-pg-postgres-exited-after-readiness"), {
        diagnostic: { status: terminalAfterReadiness.exitCode, signal: terminalAfterReadiness.signal,
          errorCode: null },
      });
    }
    lifecycle.phase = "ready";
    return { connectionString: `postgresql://m1_synthetic@127.0.0.1:${lifecycle.port}/postgres`,
      port: lifecycle.port, directory,
      postgresProcessId: lifecycle.postgresProcessId, stop };
  } catch (error) {
    // A start timeout is not proof the child failed to start. Exact child state wins over pg_ctl;
    // preserve both state and evidence whenever a controlled terminal state cannot be proved.
    let status;
    try {
      status = spawnSync(path.join(bin, "pg_ctl.exe"), ["-D", data, "status"],
        { windowsHide: true, timeout: 5_000, stdio: "ignore" });
    } catch (statusProbeError) {
      status = { status: null, signal: null, error: statusProbeError };
    }
    const terminal = terminalState(lifecycle.child);
    const observedState = terminal !== null ? "terminated-before-stop"
      : lifecycle.child === null ? "not-started"
        : status.status === 0 && Number.isSafeInteger(lifecycle.postgresProcessId)
          ? "running" : "unknown";
    let postgresLogTail = "", pgCtlLogTail = "";
    try { postgresLogTail = (await readFile(path.join(directory, "postgres.log"), "utf8")).slice(-8_192); } catch {}
    try { pgCtlLogTail = (await readFile(path.join(directory, "pg_ctl.log"), "utf8")).slice(-8_192); } catch {}
    let cleanup = "preserved";
    let cleanupFailure = null;
    let processReceipt = null;
    if (observedState === "not-started") {
      try {
        const literalDirectory = await verifiedOwnedDirectory();
        await rm(literalDirectory, { recursive: true, force: false });
        lifecycle.phase = "cleaned";
        cleanup = "removed-before-child-start";
      } catch (cleanupError) {
        cleanup = "preserved-cleanup-failed";
        cleanupFailure = cleanupError;
      }
    } else if (observedState === "running") {
      try { await stop(); cleanup = "removed-after-successful-stop"; }
      catch (stopError) { cleanup = "preserved-stop-failed"; cleanupFailure = stopError; }
      processReceipt = stopReceipt;
    }
    const diagnostic = {
      schemaVersion: "runaai-synthetic-postgres-startup-diagnostic/v1",
      error: error.message,
      launch: error.diagnostic ?? null,
      statusProbe: { status: status.status, signal: status.signal ?? null, errorCode: status.error?.code ?? null },
      postgresProcessId: lifecycle.postgresProcessId,
      terminalExitConfirmed: terminalState(lifecycle.child) !== null,
      terminal: terminalState(lifecycle.child),
      observedState,
      cleanup,
      cleanupFailure: cleanupFailure ? { message: cleanupFailure.message,
        errorCode: cleanupFailure.code ?? null } : null,
      processReceipt,
      directory: cleanup.startsWith("preserved") ? directory : null,
      postgresLogTail,
      pgCtlLogTail,
      productionChanged: false,
    };
    const diagnosticPath = path.join(root, `m1-synthetic-pg-startup-failure-${Date.now()}-${process.pid}.json`);
    error.startupDiagnostic = diagnostic;
    try {
      await verifiedArtifactRoot();
      await writeFile(diagnosticPath, JSON.stringify(diagnostic, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      error.diagnosticPath = diagnosticPath;
    } catch (diagnosticWriteError) {
      error.diagnosticWriteFailure = { message: diagnosticWriteError.message,
        errorCode: diagnosticWriteError.code ?? null, attemptedPath: diagnosticPath };
    }
    throw error;
  }
}
