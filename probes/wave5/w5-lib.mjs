// Wave 5 instrument primitives. Everything here reads the store on disk directly, independent of the
// agent and independent of the memory API, because the deed must be establishable without asking the
// thing under test whether it succeeded.
import { createClient } from "@libsql/client";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";

export const VEC_TABLE = "memory_messages_768";

export function openDb(dbPath) { return createClient({ url: `file:${dbPath}` }); }

export async function tableNames(db) {
  const r = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
  return r.rows.map((x) => String(x.name));
}

// The message rows actually on disk. This is the deed for E04.
export async function messageIds(db) {
  try { const r = await db.execute("SELECT id FROM mastra_messages ORDER BY id"); return r.rows.map((x) => String(x.id)); }
  catch { return []; }
}

// The embedding rows actually on disk. `null` distinguishes "the index does not exist" from "the index
// exists and is empty" -- a distinction this wave turns on, since a missing index is silent
// unrecallability while an empty one is a visible zero.
export async function vectorCount(db) {
  try { const r = await db.execute(`SELECT COUNT(*) n FROM "${VEC_TABLE}"`); return Number(r.rows[0].n); }
  catch { return null; }
}

// A message stored with no embedding is silently unrecallable: nothing errored, the store is
// internally consistent, and the memory can never be found by semantic recall again.
export async function orphanCount(db) {
  const msgs = await messageIds(db);
  const vecs = await vectorCount(db);
  if (vecs === null) return msgs.length;      // no index at all: every message is an orphan
  return Math.max(0, msgs.length - vecs);
}

export async function storeState(dbPath) {
  const db = openDb(dbPath);
  try {
    const ids = await messageIds(db);
    const vecs = await vectorCount(db);
    return { messageIds: ids, messages: ids.length, vectors: vecs, indexExists: vecs !== null, orphans: await orphanCount(db) };
  } catch (e) { return { readError: String(e.message).slice(0, 120) }; }
  finally { db.close(); }
}

// Is the SQLite file itself still readable after an interruption? A store that cannot be opened is a
// harder failure than a store that lost a row, and the two must not be reported as the same thing.
export async function storeReadable(dbPath) {
  const db = openDb(dbPath);
  try { await db.execute("SELECT 1"); return true; } catch { return false; } finally { try { db.close(); } catch {} }
}

export function cleanDb(dbPath) { for (const s of ["", "-wal", "-shm"]) rmSync(`${dbPath}${s}`, { force: true }); }

export function writeRun(family, runKey, rec) {
  const dir = `artifacts/runs/${family}`;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${runKey}.json`, JSON.stringify(rec, null, 1));
}
