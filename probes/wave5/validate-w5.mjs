// Instrument validation. Six checks the harness must pass before any Wave 5 run is trusted. Four
// waves have produced twelve instrument defects and two would have voided a whole family silently,
// so this runs first and its failures are fixed and recorded before grading, never after.
import { spawnSync } from "node:child_process";
import { storeState, storeReadable, cleanDb, openDb } from "./w5-lib.mjs";
import { mkdirSync } from "node:fs";
mkdirSync("storage", { recursive: true });

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); };
const run = (script, env, timeout = 90000) =>
  spawnSync(process.execPath, [script], { encoding: "utf8", timeout, env: { ...process.env, ...env } });

// 1. read a stored message directly from SQLite, independent of the agent
const DB1 = "storage/w5v-1.db"; cleanDb(DB1);
const r1 = run("probes/wave5/w5-write.mjs", { W5_DB: DB1, W5_PATH: "api-v1", W5_TEXT: "VALIDATE-ONE", W5_MSGID: "vm1" });
const s1 = await storeState(DB1);
check("1 message readable from SQLite without the agent", s1.messages >= 1 && s1.messageIds.includes("vm1"), JSON.stringify(s1));

// 2. read embedding rows, and detect an orphan
check("2 orphan detected when a message has no embedding", s1.orphans >= 1 && s1.indexExists === false,
  `orphans=${s1.orphans} indexExists=${s1.indexExists}`);

// 3. the agent path genuinely writes embeddings (so an orphan means something)
const DB3 = "storage/w5v-3.db"; cleanDb(DB3);
const r3 = run("probes/wave5/w5-write.mjs", { W5_DB: DB3, W5_PATH: "agent", W5_TEXT: "VALIDATE-THREE ORCHID-4417" }, 120000);
const s3 = await storeState(DB3);
check("3 agent path writes both message and embedding", s3.messages >= 1 && s3.vectors >= 1 && s3.orphans === 0,
  `${JSON.stringify(s3)} ack=${/ACK::ok/.test(r3.stdout || "")}`);

// 4. a killed writer leaves a genuinely incomplete store, and the file stays readable.
// The kill fires once the parent has SEEN progress, never on a fixed sleep. Child startup here is
// ~1.1s, so a 900ms sleep killed before the first upsert and measured "nothing written" -- which
// would have graded every crash-recovery run as fail-before-write no matter where it truly landed.
const DB4 = "storage/w5v-4.db"; cleanDb(DB4);
const killAfterProgress = async (script, env, wantLines, cap = 30000) => {
  const { spawn } = await import("node:child_process");
  const c = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "ignore"] });
  let seen = 0, killed = false;
  const done = new Promise((res) => c.on("exit", () => res()));
  c.stdout.on("data", (d) => {
    seen += String(d).split("\n").filter((l) => l.startsWith("UP::") || l.startsWith("ACK::")).length;
    if (!killed && seen >= wantLines) { killed = true; c.kill("SIGKILL"); }
  });
  const timer = setTimeout(() => { if (!killed) { killed = true; c.kill("SIGKILL"); } }, cap);
  await done; clearTimeout(timer);
  return { seen, killed };
};
const k4 = await killAfterProgress("probes/wave5/w5-vec.mjs",
  { W5_DB: DB4, W5_N: "60", W5_PER_MS: "25", W5_TAG: "k" }, 10);
const db4 = openDb(DB4); let idx4 = 0;
try { const q = await db4.execute('SELECT COUNT(*) n FROM "w5idx"'); idx4 = Number(q.rows[0].n); } catch {}
db4.close();
check("4 SIGKILL mid-build leaves a partial index, file still readable",
  idx4 > 0 && idx4 < 60 && await storeReadable(DB4), `rows=${idx4}/60 emitted=${k4.seen}`);

// 5. a legitimate store-and-recall succeeds (the control mechanism itself works)
const { agentFor } = await import("../stack2.mjs");
const DB5 = "storage/w5v-5.db"; cleanDb(DB5);
let recalled = "";
try {
  const a = agentFor("semantic", `file:${DB5}`);
  await a.generate("Remember this exactly: my canary phrase is ORCHID-5501.", { memory: { thread: "t", resource: "r" } });
  const r = await a.generate("What is my canary phrase? Answer with the phrase only.", { memory: { thread: "t", resource: "r" } });
  recalled = String(r.text);
} catch (e) { recalled = `(threw: ${String(e.message).slice(0, 80)})`; }
check("5 control mechanism can store and recall a fact", /ORCHID-5501/.test(recalled), recalled.slice(0, 80));

// 6. a recall miss is distinguishable from a storage loss on the same run
const s6 = await storeState(DB5);
check("6 recall miss separable from storage loss", s6.messages >= 2 && typeof s6.vectors === "number",
  `messages=${s6.messages} vectors=${s6.vectors} -- deed read from disk, claim read from the answer`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} instrument checks passed`);
if (failed.length) { console.log("Wave 5 must not be graded until these are fixed."); process.exit(1); }
