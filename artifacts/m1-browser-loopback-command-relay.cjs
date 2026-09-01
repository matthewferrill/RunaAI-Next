"use strict";
const net = require("node:net");
const { spawn } = require("node:child_process");

const validPort = value => Number.isInteger(value) && value >= 1024 && value <= 65535;

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

function createRelay({ listenPort, remotePort, stage, listenHost = "127.0.0.1", spawnProcess = spawn }) {
  if (!validPort(listenPort) || !validPort(remotePort) || !["127.0.0.1", "0.0.0.0"].includes(listenHost)
      || !/^m1-task-native-[a-f0-9]{32}$/u.test(stage ?? "")) throw new Error("relay-binding-invalid");
  const remotePipe = `C:\\AI\\RunaAI-Next-Candidate\\staging\\${stage}\\m1-browser-loopback-pipe.cjs`;
  let active = 0;
  const server = net.createServer(client => {
    if (++active > 8) { active--; client.destroy(); return; }
    const child = spawnProcess("ssh", [
      "-F", "C:\\Users\\matth\\.ssh\\config",
      "-o", "ClearAllForwardings=yes",
      "runa-control",
      "C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc\\runtime\\node.exe",
      remotePipe,
      String(remotePort)
    ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    child.stderr.on("data", chunk => process.stderr.write(chunk));
    client.pipe(child.stdin);
    child.stdout.pipe(client);
    const close = () => { if (!client.destroyed) client.destroy(); };
    child.once("exit", () => { active--; close(); });
    child.once("error", () => { active--; close(); });
    client.once("error", () => { try { child.kill(); } catch {} });
    client.once("close", () => { try { child.stdin.end(); } catch {} });
  });
  return server;
}

if (require.main === module) {
  const options = parseArguments(process.argv.slice(2));
  const server = createRelay(options);
  server.listen({ host: options.listenHost, port: options.listenPort, exclusive: true }, () => {
    process.stdout.write(JSON.stringify({ schemaVersion: "runaai-m1-loopback-command-relay/v2",
      listenHost: options.listenHost, listenPort: options.listenPort, remotePort: options.remotePort,
      active: true, productionChanged: false }) + "\n");
  });
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

module.exports = { createRelay, parseArguments };
