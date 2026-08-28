import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertOwnedStage, fail, newObservation, ObservationLedger } from "./runner-contract.mjs";
import { createOwnedControlResources, fileSha256 } from "./owned-control-resources.mjs";
import { createFunctionalTestbed } from "./functional-testbed.mjs";
import { CASE_BUNDLE_SHA256 } from "./cases.mjs";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export function validateHealthBrowserAck(ack, { smokeId, sourceCommit, baseUrl, startedAt }) {
  if (ack?.schemaVersion !== "runaai-m1-health-browser-ack/v1" || ack.smokeId !== smokeId
      || ack.sourceCommit !== sourceCommit || !Array.isArray(ack.observations) || ack.observations.length !== 2) {
    throw fail("m1-health-browser-ack-invalid");
  }
  for (const [index, item] of ack.observations.entries()) {
    const at = Date.parse(item.observedAt);
    if (item.source !== "browser" || item.action !== (index ? "reload" : "initial-load")
        || item.url !== `${baseUrl}/` || !Number.isFinite(at) || at < Date.parse(startedAt) || at > Date.now() + 1000
        || typeof item.domText !== "string" || item.domText.length > 100000
        || !item.domText.includes("Synthetic ordinary tester") || !item.domText.includes("Chat with Runa")
        || item.domText.includes("service status is unavailable")) throw fail("m1-health-browser-observation-invalid");
  }
  if (Date.parse(ack.observations[1].observedAt) - Date.parse(ack.observations[0].observedAt) < 15000) {
    throw fail("m1-health-browser-interval-unproved");
  }
  return structuredClone(ack);
}

// New isolated, unscored acceptance host. The shipped application, PostgreSQL,
// Qdrant and browser assets are real; all three model transports are deliberately
// controls-mode (zero Home/upstream contact). This is not model qualification.
export async function runHealthAppSmoke({ root: suppliedRoot, sourceCommit }, { announce = value => process.stdout.write(JSON.stringify(value) + "\n") } = {}) {
  const root = assertOwnedStage(suppliedRoot), identity = JSON.parse(await readFile(path.join(root, "SOURCE-IDENTITY.json"), "utf8"));
  if (identity.sourceCommit !== sourceCommit || !/^[a-f0-9]{40}$/.test(sourceCommit ?? "")
      || identity.caseBundleSha256 !== CASE_BUNDLE_SHA256
      || identity.sourceArchiveSha256 !== await fileSha256(path.join(root, "source.tar"))) throw fail("m1-health-smoke-source-mismatch");
  const smokeId = randomUUID(), directory = path.join(root, "acceptance-evidence", `health-smoke-${smokeId}`);
  await mkdir(directory, { recursive: true });
  const report = { schemaVersion: "runaai-m1-health-app-smoke/v1", smokeId, sourceCommit,
    sourceArchiveSha256: identity.sourceArchiveSha256, startedAt: new Date().toISOString(), passed: false,
    scored: false, modelsInvoked: false, productionChanged: false, protectedDataRead: false, samples: [], negativeControls: [] };
  let resources, testbed, ledger = new ObservationLedger(newObservation({ id: "unscored-health-app-smoke", role: "control" }));
  try {
    resources = await createOwnedControlResources({ root, maximumMs: 420000 }); report.resources = resources.report;
    testbed = await createFunctionalTestbed({ resources, mode: "controls", getLedger: () => ledger });
    const baseUrl = testbed.host.baseUrl, bootstrap = await testbed.host.createBootstrap(`m1-test-${randomBytes(16).toString("hex")}`);
    const ready = { schemaVersion: "runaai-m1-health-smoke-ready/v1", smokeId, sourceCommit, baseUrl, bootstrap,
      acknowledgementPath: path.join(directory, "browser-ack.json"), minimumBrowserIntervalMs: 15000,
      requiredObservations: ["initial-load", "reload"], expiresAt: new Date(Date.now() + 300000).toISOString() };
    await writeFile(path.join(directory, "ready.json"), JSON.stringify(ready, null, 2) + "\n", { flag: "wx" }); announce(ready);
    const request = async pathname => {
      const startedAt = new Date().toISOString(), response = await fetch(`${baseUrl}${pathname}`, { redirect: "error", signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      const item = { path: pathname, startedAt, finishedAt: new Date().toISOString(), status: response.status, body };
      report.samples.push(item); return item;
    };
    ledger.phase = "actual-application-health";
    const live = await request("/health/live"), runtime = await request("/api/runtime/status"), readiness = await request("/api/readiness/status");
    await request("/api/session/status");
    if (live.status !== 200 || runtime.body.running?.commit !== sourceCommit || runtime.body.cutover?.phase !== "closed"
        || readiness.status !== 200 || readiness.body.authority !== "active") throw fail("m1-health-smoke-application-startup-failed");
    let ack = null, nextProbe = 0;
    while (Date.now() < Date.parse(ready.expiresAt)) {
      if (Date.now() >= nextProbe) { await request("/health/ready"); nextProbe = Date.now() + 5000; }
      const stat = await lstat(ready.acknowledgementPath).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (stat) {
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 230000) throw fail("m1-health-browser-ack-file-invalid");
        ack = validateHealthBrowserAck(JSON.parse(await readFile(ready.acknowledgementPath, "utf8")), { smokeId, sourceCommit, baseUrl, startedAt: report.startedAt });
        break;
      }
      await pause(250);
    }
    if (!ack) throw fail("m1-health-browser-ack-timeout");
    report.browser = ack;
    await Promise.all(Object.values(testbed.transports).map(value => value.drain()));
    report.positiveObservation = structuredClone(ledger.observation);
    const health = report.positiveObservation.health.calls, probes = report.samples.filter(value => value.path === "/health/ready");
    if (probes.length < 4 || Date.parse(probes.at(-1).startedAt) - Date.parse(probes[0].startedAt) < 15000
        || probes.some(value => value.status !== 503)
        || health.length < 8 || health.some(value => value.upstreamContacted || value.inference || value.errorCode !== "m1-health-disabled-in-controls")
        || !health.some(value => value.kind === "embedding" && value.path === "/models")
        || !health.some(value => value.kind === "reranker" && value.path === "/health")
        || ledger.observation.provider.unexpectedCalls.length || ledger.observation.provider.calls.length
        || ledger.observation.sources.indexOperations.some(value => value.adapter !== "qdrant" || value.operation === "search")
        || !ledger.observation.evidence.some(value => value.kind === "synthetic-session-bootstrap" && value.data.issued)) {
      throw fail("m1-health-smoke-capture-contract-failed");
    }
    ledger.observation.status = "completed";
    ledger = new ObservationLedger(newObservation({ id: "unscored-health-route-negative-controls", role: "control" }));
    ledger.phase = "expected-negative-route-denials";
    for (const [kind, method, pathname] of [["embedding", "POST", "/models"], ["embedding", "GET", "/models?x=1"],
      ["reranker", "POST", "/health"], ["reranker", "GET", "/unknown"], ["provider", "GET", "/models"], ["provider", "POST", "/models/load"]]) {
      const response = await fetch(`${testbed.transports[kind].baseUrl}${pathname}`, { method, redirect: "error", signal: AbortSignal.timeout(2000) });
      report.negativeControls.push({ kind, method, path: pathname, status: response.status, body: await response.json() });
    }
    await Promise.all(Object.values(testbed.transports).map(value => value.drain()));
    report.negativeObservation = structuredClone(ledger.observation);
    if (report.negativeControls.some(value => value.status !== 503 || value.body.errorCode !== "m1-capture-route-denied")
        || ledger.observation.provider.unexpectedCalls.length !== 6) throw fail("m1-health-smoke-negative-control-failed");
    report.transportHealth = Object.fromEntries(["provider", "embedding", "reranker"].map(kind => [kind, testbed.transports[kind].healthCalls]));
    report.passed = true;
  } catch (error) { report.errorCode = error.code ?? "m1-health-smoke-failed"; report.resources ??= error.resourceReport ?? null; }
  finally {
    try { await testbed?.close(); await resources?.close(); } catch (error) { report.cleanupError = error.code ?? error.message; report.passed = false; }
    report.finishedAt = new Date().toISOString();
    await writeFile(path.join(directory, "result.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  }
  return { ...report, evidencePath: path.join(directory, "result.json") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--owned-root" || args[2] !== "--source-commit") throw fail("m1-health-smoke-arguments-invalid");
    const report = await runHealthAppSmoke({ root: args[1], sourceCommit: args[3] });
    process.stdout.write(JSON.stringify({ passed: report.passed, errorCode: report.errorCode ?? null, cleanupError: report.cleanupError ?? null,
      evidencePath: report.evidencePath, modelsInvoked: false, productionChanged: false }) + "\n");
    if (!report.passed) process.exitCode = 1;
  } catch (error) { process.stdout.write(JSON.stringify({ passed: false, errorCode: error.code ?? "m1-health-smoke-failed" }) + "\n"); process.exitCode = 1; }
}
