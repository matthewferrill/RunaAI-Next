import { spawnSync } from "node:child_process";
import path from "node:path";
import { assertOwnedStage } from "./runner-contract.mjs";

const [rawRoot, parentText, qdrantText, durationText] = process.argv.slice(2);
const root = assertOwnedStage(rawRoot), parent = Number(parentText), qdrant = Number(qdrantText), duration = Number(durationText);
if (process.platform !== "win32" || ![parent, qdrant, duration].every(value => Number.isSafeInteger(value) && value > 0) || duration > 4500000) process.exit(2);
const deadline = Date.now() + duration;
const timer = setInterval(() => {
  let alive = true; try { process.kill(parent, 0); } catch { alive = false; }
  if (alive && Date.now() < deadline) return;
  clearInterval(timer);
  spawnSync("C:\\AI\\RunaAI-Next-Candidate\\tools\\postgresql\\pgsql\\bin\\pg_ctl.exe",
    ["-D", path.join(root, "disposable-postgres"), "stop", "-m", "fast", "-w"], { windowsHide: true, stdio: "ignore", timeout: 30000 });
  // Verify the exact unique executable before stopping a PID, guarding against reuse.
  const expected = path.join(root, "tools/qdrant/bin/qdrant.exe").replaceAll("'", "''");
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$candidate = Get-CimInstance Win32_Process -Filter 'ProcessId=${qdrant}' -ErrorAction SilentlyContinue; if ($candidate -and $candidate.ExecutablePath -eq '${expected}') { Stop-Process -Id ${qdrant} -ErrorAction SilentlyContinue }`],
  { windowsHide: true, stdio: "ignore", timeout: 10000 });
}, 2000);
