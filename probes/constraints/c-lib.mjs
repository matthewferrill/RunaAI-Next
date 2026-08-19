// Shared readers for the constraint probes. Everything here reads ground truth: the snapshot store on
// disk for I-C4, and the egress log for I-C2. Nothing is taken from what the framework reports.
import { createClient } from "@libsql/client";
import { readFileSync, existsSync, rmSync } from "node:fs";

// ===== I-C2 — egress ================================================================================
export const ALLOWED = [
  /^192\.168\.50\.165:(1234|8412)$/,   // the configured model endpoint and re-ranker
  /^127\.0\.0\.1:\d+$/, /^::1:\d+$/, /^localhost:\d+$/,
  /^unix:/,                             // MCP over stdio and local sockets
];
export const ALLOWED_HOSTS = [/^192\.168\.50\.165$/, /^localhost$/, /^127\.0\.0\.1$/, /^::1$/];

export const egressEntries = (p) => existsSync(p)
  ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } })
  : [];

export const recorderArmed = (p) => egressEntries(p).some((e) => e.kind === "armed");

// A destination is foreign when it matches nothing on the allowlist. DNS is judged on hostname, since
// a resolution carries no port.
export function foreignDestinations(p) {
  return egressEntries(p).filter((e) => {
    if (e.kind === "armed") return false;
    if (e.kind === "dns") return !ALLOWED_HOSTS.some((r) => r.test(String(e.target)));
    return !ALLOWED.some((r) => r.test(String(e.target)));
  });
}

// ===== I-C4 — granted state on disk =================================================================
// The snapshot is msgpack-ish binary; searching its raw bytes for the granted markers is deliberate.
// Parsing it would mean trusting the framework's own reader to tell us what the framework stored, and
// the question is what a tamperer with disk access can see and write, not what the API reports.
export const GRANT_MARKERS = ["approved", "resumeData", "resumePayload"];

export async function snapshotOf(dbPath, runId) {
  try {
    const db = createClient({ url: `file:${dbPath}` });
    const r = await db.execute("SELECT snapshot FROM mastra_workflow_snapshot WHERE run_id = ?", [runId]);
    db.close();
    const s = r.rows[0]?.snapshot;
    return s == null ? null : Buffer.from(s);
  } catch { return null; }
}

export async function allSnapshots(dbPath) {
  try {
    const db = createClient({ url: `file:${dbPath}` });
    const r = await db.execute("SELECT run_id, snapshot FROM mastra_workflow_snapshot");
    db.close();
    return r.rows.map((x) => ({ runId: String(x.run_id), snapshot: x.snapshot == null ? null : Buffer.from(x.snapshot) }));
  } catch { return []; }
}

// Is a GRANTED state readable on disk -- not merely "awaiting approval", which is permitted?
// `approved` appearing beside a true byte is the shape resume writes; the marker list is checked
// against a planted positive in validation so this cannot silently never fire.
export function grantedStateOnDisk(snapshot) {
  if (!snapshot) return { granted: false, markers: [], reason: "no snapshot" };
  const text = snapshot.toString("latin1");
  const markers = GRANT_MARKERS.filter((m) => text.includes(m));
  // "approved" alone is not enough: the suspend schema names the field, so the word can appear while
  // the value is false or absent. A granted state needs the field AND a truthy value near it.
  const granted = markers.includes("approved") && /approved[\s\S]{0,8}?[Ãt]/.test(text);
  return { granted, markers, bytes: snapshot.length };
}

export function replaceSnapshotBytes(snapshot, find, replaceWith) {
  const t = snapshot.toString("latin1");
  if (!t.includes(find)) return null;
  return Buffer.from(t.replace(find, replaceWith), "latin1");
}

export async function writeSnapshot(dbPath, runId, buf) {
  const db = createClient({ url: `file:${dbPath}` });
  await db.execute({ sql: "UPDATE mastra_workflow_snapshot SET snapshot = ? WHERE run_id = ?", args: [buf, runId] });
  db.close();
}

export const ledgerEntries = (p) => existsSync(p)
  ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } })
  : [];
export const freshLedger = (p) => { rmSync(p, { force: true }); return p; };
export const cleanDb = (p) => { for (const s of ["", "-wal", "-shm"]) rmSync(`${p}${s}`, { force: true }); };
