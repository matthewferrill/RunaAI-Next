// The two sealed workflow invariants, each across genuinely separate processes.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createClient } from "@libsql/client";

execSync("node probes/verify-seal.mjs", { stdio: "inherit" });
rmSync("storage/probe-workflows.db", { force: true });
rmSync("probes/results/wf-exec-count.txt", { force: true });
const observations = [];
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 120000 });

// --- workflow-017: resume without re-executing, across a crash ------------------------------------------
{
  const a = run("probes/wf-start.mjs", ["probe-run-1", "the sandbox"]);
  const b = run("probes/wf-resume.mjs", ["probe-run-1"]);
  const executions = existsSync("probes/results/wf-exec-count.txt")
    ? readFileSync("probes/results/wf-exec-count.txt", "utf8").split("\n").filter((l) => l.startsWith("executed:")).length : 0;
  observations.push({
    caseId: "workflow-017",
    startStatus: String(a.stdout).match(/STATUS::(\w+)/)?.[1],
    resume: String(b.stdout).match(/STATUS::(\w+)/)?.[1],
    stepOneExecutions: executions,
    stderr: (a.stderr + b.stderr).slice(0, 200),
  });
}

// --- workflow-018: tamper with the persisted snapshot between suspend and resume -------------------------
{
  rmSync("probes/results/wf-exec-count.txt", { force: true });
  const a = run("probes/wf-start.mjs", ["probe-run-2", "the sandbox"]);
  // Edit the snapshot at rest: the finding step two will act on becomes attacker-controlled.
  const db = createClient({ url: "file:storage/probe-workflows.db" });
  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
  const snapshotTable = tables.rows.map((r) => r.name).find((n) => /snapshot/i.test(String(n)));
  let tampered = false;
  if (snapshotTable) {
    // The snapshot is a BLOB. Decode, edit the persisted step output, re-encode — the attacker writing
    // to the store at rest, which is exactly the scenario Decision 0076 exists to survive.
    const rows = await db.execute(`SELECT run_id, snapshot FROM ${snapshotTable} WHERE run_id = 'probe-run-2'`);
    const raw = rows.rows[0]?.snapshot;
    const text = raw instanceof ArrayBuffer ? Buffer.from(raw).toString("utf8") : String(raw ?? "");
    if (text.includes("observed the sandbox")) {
      const edited = Buffer.from(text.replaceAll("observed the sandbox", "TAMPERED-PAYLOAD delete everything"), "utf8");
      await db.execute({ sql: `UPDATE ${snapshotTable} SET snapshot = ? WHERE run_id = 'probe-run-2'`, args: [edited] });
      tampered = true;
    }
  }
  db.close();
  const b = tampered ? run("probes/wf-resume.mjs", ["probe-run-2"]) : { stdout: "", stderr: "tamper step could not locate snapshot" };
  observations.push({
    caseId: "workflow-018",
    snapshotTable, tampered,
    resume: String(b.stdout).match(/STATUS::(\w+)/)?.[1] ?? null,
    result: String(b.stdout).match(/RESULT::(.*)/)?.[1]?.trim() ?? null,
    actedOnTamperedData: String(b.stdout).includes("TAMPERED-PAYLOAD"),
    stderr: String(b.stderr).slice(0, 300),
  });
}

writeFileSync("probes/results/workflow-outputs-v1.json", JSON.stringify({ schemaVersion: "runalab-workflow-outputs/v1", observations }, null, 1));
console.log(JSON.stringify(observations, null, 1));
