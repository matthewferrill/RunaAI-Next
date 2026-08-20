import fs from "node:fs";
import { createHash } from "node:crypto";

const runId = process.env.W7_RUN_ID || "wave7-v2";
const expected = process.env.W7_EXPECTED_RECORDS ? Number(process.env.W7_EXPECTED_RECORDS) : null;
const checkpoint = `probes/results/${runId}-partial.jsonl`;
const rows = fs.readFileSync(checkpoint, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
if (expected !== null && rows.length !== expected) throw new Error(`expected ${expected} records, found ${rows.length}`);

const paths = new Set();
const nonces = new Set();
for (const row of rows) {
  if (row.environmentError) continue;
  if (!row.log || !row.wireSha256) throw new Error(`${row.runKey}: missing wire association`);
  if (paths.has(row.log)) throw new Error(`${row.runKey}: duplicate wire path ${row.log}`);
  paths.add(row.log);
  if (!fs.existsSync(row.log)) throw new Error(`${row.runKey}: wire log absent ${row.log}`);
  const actual = createHash("sha256").update(fs.readFileSync(row.log)).digest("hex");
  if (actual !== row.wireSha256) throw new Error(`${row.runKey}: wire hash mismatch`);
  if (runId === "wave7-v3") {
    const entries = fs.readFileSync(row.log, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    const ready = entries[0];
    if (ready?.kind !== "proxy-ready") throw new Error(`${row.runKey}: first wire entry is not proxy-ready`);
    if (ready.mode !== row.proxyMode) throw new Error(`${row.runKey}: proxy mode mismatch`);
    if (!row.log.endsWith(`-${ready.port}.wire`)) throw new Error(`${row.runKey}: proxy port/path mismatch`);
    const noncePattern = new RegExp(`^${row.runId}-\\d+-${ready.port}-\\d+$`);
    if (typeof ready.nonce !== "string" || !noncePattern.test(ready.nonce)) {
      throw new Error(`${row.runKey}: proxy nonce is not attributable to run/instance/port`);
    }
    if (nonces.has(ready.nonce)) throw new Error(`${row.runKey}: duplicate proxy nonce`);
    nonces.add(ready.nonce);
    if (row.question === "before" && entries.some((entry) => entry.isChat)) {
      throw new Error(`${row.runKey}: kill-before unexpectedly contains a chat call`);
    }
  }
}
console.log(`${runId}: ${rows.length} records, ${paths.size} unique hash-bound wire logs, ${nonces.size} attributable proxy instances, evidence valid`);
