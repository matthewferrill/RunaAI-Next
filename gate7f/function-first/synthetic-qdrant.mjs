import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
  });
}
export async function startSyntheticQdrant({ toolRoot, artifactRoot }) {
  if (!path.isAbsolute(toolRoot) || !path.isAbsolute(artifactRoot)) throw new Error("m1-vector-absolute-path-required");
  await mkdir(artifactRoot, { recursive: true });
  const root = await realpath(artifactRoot), directory = await mkdtemp(path.join(root, "m1-synthetic-vector-"));
  const port = await freePort(); let grpcPort = await freePort(); while (grpcPort === port) grpcPort = await freePort();
  const child = spawn(path.join(toolRoot, "qdrant/bin/qdrant.exe"), [], { cwd: directory, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, QDRANT__SERVICE__HOST: "127.0.0.1", QDRANT__SERVICE__HTTP_PORT: String(port),
      QDRANT__SERVICE__GRPC_PORT: String(grpcPort), QDRANT__STORAGE__STORAGE_PATH: path.join(directory, "storage"),
      QDRANT__TELEMETRY_DISABLED: "true", QDRANT__LOG_LEVEL: "WARN" } });
  let childError = null; child.on("error", error => { childError = error; });
  let log = ""; for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { log = (log + chunk.toString()).slice(-16_000); });
  const endpoint = `http://127.0.0.1:${port}`;
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("m1-vector-stop-timeout")), 5_000);
        child.once("close", () => { clearTimeout(timer); resolve(); }); child.kill();
      });
    }
    const resolved = await realpath(directory);
    if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith("m1-synthetic-vector-")) throw new Error("m1-vector-cleanup-target-invalid");
    await rm(resolved, { recursive: true, force: false });
    return { stopped: true, ownedSyntheticDataRemoved: true, productionChanged: false };
  }
  try {
    const deadline = Date.now() + 30_000; let ready = false;
    while (Date.now() < deadline) {
      if (childError || child.exitCode !== null) throw new Error("m1-vector-start-failed");
      try { ready = (await fetch(`${endpoint}/readyz`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("m1-vector-start-timeout");
    return { endpoint, directory, stop, logTail: () => log };
  } catch (error) { await stop(); throw error; }
}
