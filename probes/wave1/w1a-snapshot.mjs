// Wave 1 W1-A — snapshot integrity, six tamper variants (WAVE1-PREREGISTRATION.md).
// Deterministic contract: the question is whether ANY validation exists, so completion is variant
// coverage, not repetition. Each variant records the raw before/after snapshot bytes (hashed and
// sampled, never dumped wholesale) so a verdict can be re-derived from evidence.
//
// Invariant I-A: a resumed run must not act on state modified outside the framework.
import { spawnSync } from "node:child_process";
import { rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@libsql/client";

const DB = "file:storage/w1a-workflows.db";
const LEDGER = "probes/results/w1a-ledger.txt";
const env = { W1_DB: DB, W1_LEDGER: LEDGER };
const clean = () => { for (const s of ["", "-wal", "-shm"]) rmSync(`storage/w1a-workflows.db${s}`, { force: true }); rmSync(LEDGER, { force: true }); };
const node = (script, args, extra = {}) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 120000, env: { ...process.env, ...env, ...extra } });
const statusOf = (o) => String(o.stdout).match(/STATUS::(\w+)/)?.[1] ?? null;
const commits = () => existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter((l) => l.startsWith("COMMIT:")).length : 0;
const sha = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);

const SUBJECT = "the sandbox";      // 11 chars
const SAME_LEN = "the ATTACK!";     // 11 chars — msgpack length prefixes unchanged
const DIFF_LEN = "the ATTACK-LONGER-STILL"; // deliberately different length

const readSnap = async (db, runId) => {
  const r = await db.execute({ sql: "SELECT snapshot FROM mastra_workflow_snapshot WHERE run_id=?", args: [runId] });
  return r.rows.length ? Buffer.from(r.rows[0].snapshot) : null;
};
const writeSnap = async (db, runId, buf) =>
  db.execute({ sql: "UPDATE mastra_workflow_snapshot SET snapshot=? WHERE run_id=?", args: [buf, runId] });

// Each mutator takes the snapshot buffer and returns a tampered buffer, or null if it could not apply
// (which is recorded as NOT-APPLIED rather than counted as a pass — an unapplied tamper proves nothing).
const VARIANTS = {
  "same-length-value": (buf) => {
    const t = buf.toString("latin1");
    return t.includes(SUBJECT) ? Buffer.from(t.replaceAll(SUBJECT, SAME_LEN), "latin1") : null;
  },
  "different-length-value": (buf) => {
    const t = buf.toString("latin1");
    return t.includes(SUBJECT) ? Buffer.from(t.replaceAll(SUBJECT, DIFF_LEN), "latin1") : null;
  },
  "field-added": (buf) => {
    const t = buf.toString("latin1");
    // Append a plausible key/value pair into the serialized payload region.
    return t.includes(SUBJECT) ? Buffer.from(t.replace(SUBJECT, SUBJECT + '","injectedKey":"injectedValue'), "latin1") : null;
  },
  "field-removed": (buf) => {
    const t = buf.toString("latin1");
    return t.includes(SUBJECT) ? Buffer.from(t.replace(SUBJECT, ""), "latin1") : null;
  },
  "type-changed": (buf) => {
    const t = buf.toString("latin1");
    return t.includes(SUBJECT) ? Buffer.from(t.replaceAll(SUBJECT, "00000000042"), "latin1") : null;
  },
  "foreign-snapshot": null, // handled specially: substitute another run's snapshot wholesale
};

const results = [];
mkdirSync("probes/results", { recursive: true });

for (const [variant, mutate] of Object.entries(VARIANTS)) {
  clean();
  const runId = `w1a-${variant}`;
  const start = node("probes/wave1/w1-start.mjs", [runId, SUBJECT]);
  const startStatus = statusOf(start);
  const db = createClient({ url: DB });
  let before = await readSnap(db, runId);
  let after = null, applied = false, note = null;

  if (variant === "foreign-snapshot") {
    // A second run with different input, whose snapshot is then written over the first run's row.
    const otherId = `${runId}-other`;
    node("probes/wave1/w1-start.mjs", [otherId, "other subject"]);
    const foreign = await readSnap(db, otherId);
    if (foreign && before) { after = foreign; applied = true; }
    else note = "could not read one of the two snapshots";
  } else if (before) {
    const m = mutate(before);
    if (m) { after = m; applied = true; } else note = "marker not found in snapshot — tamper not applied";
  } else note = "no snapshot row found";

  if (applied) await writeSnap(db, runId, after);
  db.close();

  const commitsBefore = commits();
  const resume = node("probes/wave1/w1-resume.mjs", [runId]);
  const stdout = String(resume.stdout), stderr = String(resume.stderr);
  const resumeStatus = statusOf(resume);
  // Did the resumed run carry the tampered value into its observable result?
  const actedOnTampered = /ATTACK/.test(stdout) || /other subject/.test(stdout);

  results.push({
    scenario: "W1-A", variant, runId,
    tamperApplied: applied, note,
    startStatus,
    snapshotBeforeSha: before ? sha(before) : null,
    snapshotAfterSha: after ? sha(after) : null,
    snapshotBytesBefore: before?.length ?? null,
    snapshotBytesAfter: after?.length ?? null,
    resumeStatus,
    resumeExitCode: resume.status,
    resumeError: stderr ? stderr.split("\n").find((l) => /Error|error/.test(l))?.slice(0, 160) ?? stderr.slice(0, 160) : null,
    resultText: (stdout.match(/RESULT::(.*)$/m) || [])[1]?.slice(0, 200) ?? null,
    actedOnTampered,
    commitsBeforeResume: commitsBefore,
    commitsAfterResume: commits(),
    // I-A verdict, graded exactly as the sealed preregistration words it: acting on tampered state
    // violates; refusing, erroring, or detecting satisfies. Not re-interpreted after the fact.
    invariantIA: !applied ? "NOT-APPLIED" : actedOnTampered ? "VIOLATED" : resumeStatus === "success" ? "VIOLATED-SILENT" : "HELD",
    // Recorded ALONGSIDE the sealed verdict, not in place of it: an error is not the same thing as a
    // check. A deserialization crash means the tamper broke the container, which is luck, not
    // integrity enforcement — and it is what the v2 run mistook for a framework result.
    detectionQuality: !applied ? "not-applied"
      : actedOnTampered ? "acted-on-tampered-data"
      : resumeStatus === "success" ? "accepted-silently"
      : /integrity|checksum|signature|tamper|verif/i.test(stderr) ? "explicit-integrity-detection"
      : /msgpack|decode|parse|unpack|JSON/i.test(stderr) ? "crashed-on-malformed-container"
      : "errored-unclassified",
  });
  console.log(`${variant}: applied=${applied} resume=${resumeStatus} acted=${actedOnTampered} => ${results.at(-1).invariantIA}`);
}

writeFileSync("probes/results/w1a-outputs.json", JSON.stringify({ scenario: "W1-A", ranAt: new Date().toISOString(), results }, null, 1));
console.log(`\nwrote ${results.length} W1-A results`);
