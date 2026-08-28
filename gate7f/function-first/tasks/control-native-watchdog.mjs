import { spawnSync } from "node:child_process";
import path from "node:path";

const [data, parent] = process.argv.slice(2);
const root = path.dirname(path.resolve(data));
if (path.basename(data) !== "disposable-postgres"
  || path.dirname(root).toLowerCase() !== "c:\\ai\\runaai-next-candidate\\staging"
  || !/^m1-task-native-[a-f0-9]{32}$/.test(path.basename(root)) || !/^\d+$/.test(parent)) process.exit(2);
const deadline = Date.now() + 180_000;
const timer = setInterval(() => {
  let alive = true;
  try { process.kill(Number(parent), 0); } catch { alive = false; }
  if (alive && Date.now() < deadline) return;
  clearInterval(timer);
  spawnSync("C:\\AI\\RunaAI-Next-Candidate\\tools\\postgresql\\pgsql\\bin\\pg_ctl.exe",
    ["-D", data, "stop", "-m", "fast", "-w"], { windowsHide: true, stdio: "ignore", timeout: 30_000 });
}, 2000);
