"use strict";
const net = require("node:net");
const { spawn } = require("node:child_process");

const validPort = value => Number.isInteger(value) && value >= 1024 && value <= 65535;
const MAXIMUM_ACTIVE_CLIENTS = 8;
const MAXIMUM_OWNED_CHILDREN = 16;
const CHILD_STOP_TIMEOUT_MS = 10000;

function parseArguments(argv) {
  if (argv.length < 2 || argv.length > 4) throw new Error("relay-arguments-invalid");
  const listenPort = Number(argv[0]);
  const stage = argv[1];
  const listenHost = argv[2] === "lan" ? "0.0.0.0" : "127.0.0.1";
  const remotePort = argv[3] === undefined ? listenPort : Number(argv[3]);
  if (!validPort(listenPort) || !validPort(remotePort) || (listenPort === remotePort && argv[3] !== undefined)) {
    throw new Error("relay-port-invalid");
  }
  if (!/^m1-task-native-[a-f0-9]{32}$/u.test(stage ?? "")) throw new Error("relay-stage-invalid");
  if (argv[2] !== undefined && argv[2] !== "loopback" && argv[2] !== "lan") throw new Error("relay-host-invalid");
  return { listenPort, remotePort, stage, listenHost };
}

function createRelay({ listenPort, remotePort, stage, listenHost = "127.0.0.1", spawnProcess = spawn,
  childStopTimeoutMs = CHILD_STOP_TIMEOUT_MS }) {
  if (!validPort(listenPort) || !validPort(remotePort) || !["127.0.0.1", "0.0.0.0"].includes(listenHost)
      || !/^m1-task-native-[a-f0-9]{32}$/u.test(stage ?? "") || !Number.isInteger(childStopTimeoutMs)
      || childStopTimeoutMs < 1 || childStopTimeoutMs > CHILD_STOP_TIMEOUT_MS) throw new Error("relay-binding-invalid");
  const remotePipe = `C:\\AI\\RunaAI-Next-Candidate\\staging\\${stage}\\m1-browser-loopback-pipe.cjs`;
  let active = 0;
  const children = new Set();
  const clients = new Set();
  const childStops = new Map();
  let shuttingDown = false;
  let shutdownFatal = false;
  let shutdownPromise = null;
  let shutdownCheck = null;
  let fatal = null;
  const failClosed = code => {
    if (fatal) return;
    fatal = new Error(code);
    shutdownFatal = true;
    void server.shutdown({ fatal: true });
    server.emit("relayFatal", fatal);
  };
  const server = net.createServer(client => {
    if (shuttingDown || fatal || active >= MAXIMUM_ACTIVE_CLIENTS || children.size >= MAXIMUM_OWNED_CHILDREN) {
      client.destroy(); return;
    }
    active++;
    clients.add(client);
    const child = spawnProcess("ssh", [
      "-F", "C:\\Users\\matth\\.ssh\\config",
      "-o", "ClearAllForwardings=yes",
      "runa-control",
      "C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc\\runtime\\node.exe",
      remotePipe,
      String(remotePort)
    ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    children.add(child);
    child.stderr.on("data", chunk => process.stderr.write(chunk));
    client.pipe(child.stdin);
    child.stdout.pipe(client);
    const close = () => { if (!client.destroyed) client.destroy(); };
    let slotReleased = false;
    const releaseSlot = () => {
      if (slotReleased) return;
      slotReleased = true; active--; clients.delete(client);
    };
    let settled = false;
    let childStopTimer = null;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (childStopTimer !== null) { clearTimeout(childStopTimer); childStopTimer = null; }
      releaseSlot(); children.delete(child); childStops.delete(child); close();
      shutdownCheck?.();
    };
    let childStopRequested = false;
    const stopAbandonedChild = () => {
      releaseSlot();
      if (settled) return true;
      if (childStopRequested) return true;
      childStopRequested = true;
      try { child.stdin.destroy(); } catch {}
      let stopRequested = false;
      try { stopRequested = child.kill() === true; } catch {}
      if (!stopRequested) { failClosed("relay-child-stop-unconfirmed"); return false; }
      if (!settled) {
        childStopTimer = setTimeout(() => failClosed("relay-child-stop-timeout"), childStopTimeoutMs);
        childStopTimer.unref?.();
      }
      return true;
    };
    childStops.set(child, stopAbandonedChild);
    child.once("exit", settle);
    child.once("error", settle);
    client.once("error", stopAbandonedChild);
    client.once("close", stopAbandonedChild);
  });
  server.stopAll = () => {
    for (const client of clients) try { client.destroy(); } catch {}
    let requested = true;
    for (const stopChild of childStops.values()) if (!stopChild()) requested = false;
    return requested;
  };
  server.shutdown = ({ fatal: requestedFatal = false, timeoutMs = CHILD_STOP_TIMEOUT_MS } = {}) => {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > CHILD_STOP_TIMEOUT_MS) {
      return Promise.reject(new Error("relay-shutdown-timeout-invalid"));
    }
    shuttingDown = true;
    if (requestedFatal) shutdownFatal = true;
    if (shutdownPromise) return shutdownPromise;
    let resolveShutdown;
    shutdownPromise = new Promise(resolve => { resolveShutdown = resolve; });
    let closeFinished = false, finished = false, deadline = null;
    const finish = childrenSettled => {
      if (finished) return;
      finished = true; shutdownCheck = null;
      if (deadline !== null) clearTimeout(deadline);
      resolveShutdown({ exitCode: shutdownFatal || !childrenSettled ? 1 : 0, childrenSettled });
    };
    shutdownCheck = () => { if (closeFinished && children.size === 0) finish(true); };
    if (!server.stopAll()) shutdownFatal = true;
    try { server.close(() => { closeFinished = true; shutdownCheck?.(); }); }
    catch { closeFinished = true; shutdownFatal = true; }
    deadline = setTimeout(() => finish(false), timeoutMs);
    shutdownCheck();
    return shutdownPromise;
  };
  return server;
}

function installCliShutdownHandlers({ server, processObject = process, timeoutMs = CHILD_STOP_TIMEOUT_MS }) {
  let completion = null;
  const beginShutdown = requestedFatal => {
    if (requestedFatal) processObject.exitCode = 1;
    const current = server.shutdown({ fatal: requestedFatal, timeoutMs });
    if (completion === null) {
      completion = Promise.resolve(current).then(result => {
        const exitCode = processObject.exitCode === 1 || result.exitCode !== 0 ? 1 : 0;
        processObject.exitCode = exitCode; processObject.exit(exitCode); return exitCode;
      }, () => {
        processObject.exitCode = 1; processObject.exit(1); return 1;
      });
    }
    return completion;
  };
  server.on("relayFatal", error => {
    processObject.stderr.write(`${error.message}\n`);
    void beginShutdown(true);
  });
  processObject.once("SIGINT", () => { void beginShutdown(false); });
  processObject.once("SIGTERM", () => { void beginShutdown(false); });
  return { beginShutdown, get completion() { return completion; } };
}

if (require.main === module) {
  const options = parseArguments(process.argv.slice(2));
  const server = createRelay(options);
  installCliShutdownHandlers({ server });
  server.listen({ host: options.listenHost, port: options.listenPort, exclusive: true }, () => {
    process.stdout.write(JSON.stringify({ schemaVersion: "runaai-m1-loopback-command-relay/v2",
      listenHost: options.listenHost, listenPort: options.listenPort, remotePort: options.remotePort,
      active: true, productionChanged: false }) + "\n");
  });
}

module.exports = { createRelay, installCliShutdownHandlers, parseArguments };
