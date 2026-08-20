import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const binary = path.resolve("artifacts/tools/qdrant/bin/qdrant.exe");
const outputRoot = path.resolve("artifacts/runs/stack-bakeoff-qdrant-v4");
const storagePath = path.join(outputRoot, "storage");
const endpoint = "http://127.0.0.1:9443";
const collection = "runalab_bakeoff";
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const sha256 = value => createHash("sha256").update(value).digest("hex");

const start = () => {
  const child = spawn(binary, [], { cwd: process.cwd(), env: { ...process.env,
    QDRANT__SERVICE__HOST: "127.0.0.1", QDRANT__SERVICE__HTTP_PORT: "9443",
    QDRANT__SERVICE__GRPC_PORT: "9444", QDRANT__STORAGE__STORAGE_PATH: storagePath,
    QDRANT__LOG_LEVEL: "WARN" }, stdio: ["ignore", "pipe", "pipe"] });
  child.log = "";
  child.stdout.on("data", chunk => { child.log += chunk; });
  child.stderr.on("data", chunk => { child.log += chunk; });
  return child;
};
const stop = child => new Promise(resolve => {
  if (child.exitCode != null || child.signalCode != null) return resolve();
  const timer = setTimeout(resolve, 3000);
  child.once("close", () => { clearTimeout(timer); resolve(); });
  child.kill("SIGTERM");
  setTimeout(() => { if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL"); }, 1200);
});
const request = async (method, route, body) => {
  const response = await fetch(`${endpoint}${route}`, { method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status}: ${text}`);
  return json;
};
const waitReady = async child => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { await request("GET", "/healthz"); return; } catch {}
    if (child.exitCode != null) throw new Error(`Qdrant exited: ${child.log}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Qdrant readiness timeout: ${child.log}`);
};

let server = start();
try {
  await waitReady(server);
  const create = await request("PUT", `/collections/${collection}`, {
    vectors: { size: 4, distance: "Cosine" },
    hnsw_config: { m: 16, ef_construct: 100, full_scan_threshold: 10 },
    optimizers_config: { indexing_threshold: 10 }
  });
  const points = Array.from({ length: 2000 }, (_, index) => {
    const id = index + 1;
    const payload = `payload-${id}`;
    return { id, vector: [id / 100, (100 - id) / 100, 0.25, 0.75],
      payload: { text: payload, sha256: sha256(payload), storage_state: "stored" } };
  });
  const upsert = await request("PUT", `/collections/${collection}/points?wait=true`, { points });
  let info;
  const infoDeadline = Date.now() + 10000;
  while (Date.now() < infoDeadline) {
    info = await request("GET", `/collections/${collection}`);
    if (info.result?.status === "green" && info.result?.points_count === 2000) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const retrieve = await request("POST", `/collections/${collection}/points`, {
    ids: [1, 1000, 2000], with_payload: true, with_vector: true
  });
  const count = await request("POST", `/collections/${collection}/points/count`, { exact: true });
  const query = await request("POST", `/collections/${collection}/points/query`, {
    query: [0.01, 0.99, 0.25, 0.75], limit: 3, with_payload: true, with_vector: false
  });
  await writeFile(path.join(outputRoot, "before-restart.json"), `${JSON.stringify({ create, upsert, info, count, retrieve, query }, null, 2)}\n`);
  await stop(server);
  server = start();
  await waitReady(server);
  const afterInfo = await request("GET", `/collections/${collection}`);
  const afterRetrieve = await request("POST", `/collections/${collection}/points`, {
    ids: [1, 1000, 2000], with_payload: true, with_vector: true
  });
  const afterCount = await request("POST", `/collections/${collection}/points/count`, { exact: true });
  const afterQuery = await request("POST", `/collections/${collection}/points/query`, {
    query: [0.01, 0.99, 0.25, 0.75], limit: 3, with_payload: true, with_vector: false
  });
  const returned = afterRetrieve.result ?? [];
  const postconditions = returned.map(point => {
    const payload = String(point.payload?.text ?? "");
    return { id: point.id, vectorPresent: Array.isArray(point.vector) && point.vector.length === 4,
      payloadHashValid: point.payload?.sha256 === sha256(payload),
      storageState: point.payload?.storage_state ?? null };
  });
  const report = { schemaVersion: 1, candidate: "Qdrant 1.19.0 portable",
    createStatus: create.result, upsertStatus: upsert.result?.status ?? null,
    before: { status: info.result?.status, optimizerStatus: info.result?.optimizer_status,
      pointsCount: info.result?.points_count, indexedVectorsCount: info.result?.indexed_vectors_count },
    afterRestart: { status: afterInfo.result?.status, optimizerStatus: afterInfo.result?.optimizer_status,
      pointsCount: afterInfo.result?.points_count, indexedVectorsCount: afterInfo.result?.indexed_vectors_count },
    exactCountBefore: count.result?.count ?? null,
    exactCountAfter: afterCount.result?.count ?? null,
    queryResultsBefore: query.result?.points?.length ?? null,
    queryResultsAfter: afterQuery.result?.points?.length ?? null,
    readinessRule: "upsert completed + collection green + exact count + postcondition retrieval/query; indexed_vectors_count is diagnostic because full-scan is valid",
    postconditions };
  report.passed = report.createStatus === true && report.upsertStatus === "completed" &&
    report.before.status === "green" && report.exactCountBefore === 2000 && report.queryResultsBefore === 3 &&
    report.afterRestart.status === "green" && report.exactCountAfter === 2000 && report.queryResultsAfter === 3 &&
    postconditions.length === 3 && postconditions.every(item => item.vectorPresent && item.payloadHashValid && item.storageState === "stored");
  await writeFile("probes/results/stack-bakeoff-qdrant-v4.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
} finally {
  await stop(server);
}
