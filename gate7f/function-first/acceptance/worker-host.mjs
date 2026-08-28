import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { createEnvelopeCipher } from "../../../gate4/envelope.mjs";
import { MxcJavascriptExecutor } from "../../../gate7e/mxc-javascript-executor.mjs";
import { createFunctionalHost } from "./functional-host.mjs";
import { CONTROL_SUITES } from "./model-free-controls.mjs";
import { assertOwnedStage, fail } from "./runner-contract.mjs";

// Internal IPC construction only. No HTTP endpoint accepts this object. The
// parent owns the unique data/server lifecycle; restart reopens exactly that
// authority and the same ephemeral cipher, never a new or production database.
export async function createAcceptanceWorkerHost(init, getLedger, { taskHooks, faults } = {}) {
  const root = assertOwnedStage(init.root);
  if (process.platform !== "win32" || await realpath(root) !== root) throw fail("m1-worker-root-invalid");
  const paths = { runtimeRoot: path.join(root, "sandbox-runtime"), runnerPath: path.join(root, "sandbox-runtime/quickjs-child.mjs"),
    nodeExecutable: path.join(root, "runtime/node.exe"), temporaryRoot: path.join(root, "transient") };
  if (Object.entries(paths).some(([key, value]) => path.resolve(init.native?.[key] ?? "") !== value)
      || path.resolve(init.dataDirectory) !== path.join(root, "data")) throw fail("m1-worker-resource-invalid");
  const pid = (await readFile(path.join(root, "disposable-postgres/postmaster.pid"), "utf8")).split(/\r?\n/);
  if (!Number.isSafeInteger(init.postgresPort) || Number(pid[3]) !== init.postgresPort) throw fail("m1-worker-database-not-owned");
  for (const key of [init.encryptionKeyHex, init.hmacKeyHex]) if (!/^[a-f0-9]{64}$/.test(key ?? "")) throw fail("m1-worker-cipher-invalid");
  const cipher = createEnvelopeCipher({ encryptionKey: Buffer.from(init.encryptionKeyHex, "hex"),
    hmacKey: Buffer.from(init.hmacKeyHex, "hex"), keyId: "m1-owned-acceptance" });
  const pool = new pg.Pool({ connectionString: `postgresql://m1_synthetic@127.0.0.1:${init.postgresPort}/postgres`, max: 12, connectionTimeoutMillis: 2000 });
  try {
    const host = await createFunctionalHost({ pool, cipher, configuration: init.configuration, provider: init.provider,
      javascriptExecutor: new MxcJavascriptExecutor(paths), dataDirectory: init.dataDirectory, sourceRoot: root,
      extraSuites: CONTROL_SUITES, getLedger, taskHooks, faults });
    return { ...host, async close() { await host.close(); await pool.end(); cipher.destroy(); } };
  } catch (error) { await pool.end(); cipher.destroy(); throw error; }
}
