import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
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
    const result = spawnSync(path.join(bin, name + ".exe"), args, {
      encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000,
      // PostgreSQL inherits the launcher's pipes on Windows; pg_ctl must not retain them.
      ...(name === "pg_ctl" ? { stdio: "ignore" } : {}),
    });
    if (result.status !== 0) throw new Error("m1-synthetic-pg-" + name + "-failed", { cause: result.error });
  }
  let running = false;
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
    run("pg_ctl", ["-D", data, "-l", path.join(directory, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "start", "-w"]);
    running = true;
    return { connectionString: `postgresql://m1_synthetic@127.0.0.1:${port}/postgres`, port, directory, stop };
  } catch (error) {
    // A start timeout is not proof the child failed to start. Ask pg_ctl before cleanup.
    const status = spawnSync(path.join(bin, "pg_ctl.exe"), ["-D", data, "status"], { windowsHide: true, timeout: 5_000, stdio: "ignore" });
    running = status.status === 0;
    await stop();
    throw error;
  }
}
