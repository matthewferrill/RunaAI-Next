import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

// Owned, disposable, loopback-only integration database. Never points at a release store.
export async function startSyntheticPostgres({ toolRoot, artifactRoot }) {
  if (!path.isAbsolute(toolRoot) || !path.isAbsolute(artifactRoot)) throw new Error("m1-pg-absolute-path-required");
  await mkdir(artifactRoot, { recursive: true });
  const root = await realpath(artifactRoot);
  const directory = await mkdtemp(path.join(root, "m1-synthetic-pg-"));
  const data = path.join(directory, "data");
  const bin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const selected = server.address().port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
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
  let running = false, postgres = null, postgresError = null;
  async function waitForReady(child) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (postgresError) throw Object.assign(new Error("m1-synthetic-pg-postgres-spawn-failed", { cause: postgresError }), {
        diagnostic: { status: null, signal: null, errorCode: postgresError.code ?? null },
      });
      if (child.exitCode !== null) throw Object.assign(new Error("m1-synthetic-pg-postgres-exited"), {
        diagnostic: { status: child.exitCode, signal: child.signalCode ?? null, errorCode: null },
      });
      const probe = spawnSync(path.join(bin, "pg_isready.exe"),
        ["-h", "127.0.0.1", "-p", String(port), "-U", "m1_synthetic", "-d", "postgres"],
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
  async function stop() {
    if (running) {
      run("pg_ctl", ["-D", data, "stop", "-m", "fast", "-w"]);
      running = false;
    }
    const resolved = await realpath(directory);
    if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith("m1-synthetic-pg-")) {
      throw new Error("m1-synthetic-pg-cleanup-target-invalid");
    }
    await rm(resolved, { recursive: true, force: false });
    return { stopped: true, ownedSyntheticDataRemoved: true, productionChanged: false };
  }
  try {
    run("initdb", ["-D", data, "-U", "m1_synthetic", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8", "--no-locale"]);
    const serverFd = openSync(path.join(directory, "postgres.log"), "a");
    try {
      postgres = spawn(path.join(bin, "postgres.exe"), ["-D", data, "-p", String(port), "-h", "127.0.0.1"], {
        windowsHide: true, stdio: ["ignore", serverFd, serverFd],
      });
    } finally { closeSync(serverFd); }
    postgres.on("error", error => { postgresError = error; });
    await waitForReady(postgres);
    running = true;
    return { connectionString: `postgresql://m1_synthetic@127.0.0.1:${port}/postgres`, port, directory, stop };
  } catch (error) {
    // A start timeout is not proof the child failed to start. Ask pg_ctl before cleanup,
    // and preserve both state and evidence whenever that question cannot be answered.
    const status = spawnSync(path.join(bin, "pg_ctl.exe"), ["-D", data, "status"], { windowsHide: true, timeout: 5_000, stdio: "ignore" });
    const observedState = status.status === 0 ? "running" : status.status === 3 && postgres?.exitCode !== null ? "stopped" : "unknown";
    running = observedState === "running";
    let postgresLogTail = "", pgCtlLogTail = "";
    try { postgresLogTail = (await readFile(path.join(directory, "postgres.log"), "utf8")).slice(-8_192); } catch {}
    try { pgCtlLogTail = (await readFile(path.join(directory, "pg_ctl.log"), "utf8")).slice(-8_192); } catch {}
    let cleanup = "preserved";
    if (observedState === "stopped") {
      await stop();
      cleanup = "removed-after-stopped-proof";
    } else if (observedState === "running") {
      try { await stop(); cleanup = "removed-after-successful-stop"; }
      catch { running = true; cleanup = "preserved-stop-failed"; }
    }
    const diagnostic = {
      schemaVersion: "runaai-synthetic-postgres-startup-diagnostic/v1",
      error: error.message,
      launch: error.diagnostic ?? null,
      statusProbe: { status: status.status, signal: status.signal ?? null, errorCode: status.error?.code ?? null },
      observedState,
      cleanup,
      directory: cleanup === "preserved" || cleanup === "preserved-stop-failed" ? directory : null,
      postgresLogTail,
      pgCtlLogTail,
      productionChanged: false,
    };
    const diagnosticPath = path.join(root, `m1-synthetic-pg-startup-failure-${Date.now()}-${process.pid}.json`);
    await writeFile(diagnosticPath, JSON.stringify(diagnostic, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    error.diagnosticPath = diagnosticPath;
    throw error;
  }
}
