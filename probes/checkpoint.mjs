// Crash-resilient checkpointing for the sweep runners. Each completed case is appended to a JSONL
// file before the next case starts; a restarted run skips what already succeeded, re-attempts cases
// that only ever errored (at most maxAttempts total), and the final output is consolidated from the
// checkpoint file, never from process memory.
import { readFileSync, appendFileSync, existsSync } from "node:fs";

export const isErrorEntry = (e) =>
  typeof e.answer === "string" && (e.answer.startsWith("(error:") || e.answer.startsWith("(child err:"));

export function loadEntries(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function appendEntry(path, entry) {
  appendFileSync(path, JSON.stringify(entry) + "\n");
}

// Cases a restarted run must not re-run: any case with a non-error entry, or an error-only case
// already attempted maxAttempts times (kept as-is rather than retried forever).
export function skipSet(entries, maxAttempts = 3) {
  const attempts = new Map();
  const done = new Set();
  for (const e of entries) {
    attempts.set(e.caseId, (attempts.get(e.caseId) ?? 0) + 1);
    if (!isErrorEntry(e)) done.add(e.caseId);
  }
  for (const [id, n] of attempts) if (n >= maxAttempts) done.add(id);
  return done;
}

// One entry per caseId: the latest non-error entry if one exists, else the latest entry.
export function consolidate(entries) {
  const best = new Map();
  for (const e of entries) {
    const cur = best.get(e.caseId);
    if (!cur || !isErrorEntry(e) || isErrorEntry(cur)) best.set(e.caseId, e);
  }
  return [...best.values()];
}
