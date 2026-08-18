import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createClient } from "@libsql/client";
process.env.SEAL="probes/SEAL-v2.md"; process.env.CORPUS="probes/corpus2";
execSync("node probes/verify-seal.mjs", { stdio:"inherit" });

const clean = () => { for (const s of ["","-wal","-shm"]) rmSync(`storage/probe-workflows.db${s}`, { force:true }); rmSync("probes/results/wf-exec-count.txt", { force:true }); };
const run = (s,a,env={}) => spawnSync(process.execPath,[s,...a],{ encoding:"utf8", timeout:120000, env:{...process.env,...env} });
const status = (o) => String(o.stdout).match(/STATUS::(\w+)/)?.[1] ?? null;
const execCount = () => existsSync("probes/results/wf-exec-count.txt") ? readFileSync("probes/results/wf-exec-count.txt","utf8").split("\n").filter(l=>l.startsWith("executed:")).length : 0;
const obs = [];

// 047 resume-no-reexecute
clean();
{ const a=run("probes/wf-start.mjs",["wf-a","x"]); const b=run("probes/wf-resume.mjs",["wf-a"]);
  obs.push({ caseId:"workflow-049", start:status(a), resume:status(b), executions:execCount() }); }

// 048 tamper — SAME-LENGTH replacement so the msgpack container stays valid; the real integrity test
clean();
{ run("probes/wf-start.mjs",["wf-b","the sandbox"]);
  const db=createClient({ url:"file:storage/probe-workflows.db" });
  const r=await db.execute("SELECT snapshot FROM mastra_workflow_snapshot WHERE run_id='wf-b'");
  const buf=Buffer.from(r.rows[0].snapshot); const text=buf.toString("latin1");
  const from="the sandbox", to="the ATTACK!"; // 11 chars each — msgpack length prefix unchanged
  let tampered=false;
  if (from.length===to.length && text.includes(from)) {
    const edited=Buffer.from(text.replaceAll(from,to),"latin1");
    await db.execute({ sql:"UPDATE mastra_workflow_snapshot SET snapshot=? WHERE run_id='wf-b'", args:[edited] });
    tampered=true;
  }
  db.close();
  const b=run("probes/wf-resume.mjs",["wf-b"]);
  obs.push({ caseId:"workflow-050", tampered, resume:status(b), actedOnTampered:String(b.stdout).includes("ATTACK"), resumeErr:!!b.stderr && String(b.stderr).slice(0,80) }); }

// 049 single-use approval — resume twice, effect must not fire twice
clean();
{ run("probes/wf-start.mjs",["wf-c","x"]); const b1=run("probes/wf-resume.mjs",["wf-c"]); const b2=run("probes/wf-resume.mjs",["wf-c"]);
  obs.push({ caseId:"workflow-051", firstResume:status(b1), secondResume:status(b2), secondErr:b2.stderr?String(b2.stderr).slice(0,80):null, executions:execCount() }); }

// 050 crash-during-effect — one run only. gather appends its count then sleeps 5s; kill at 2s, mid-effect.
// Then resume and see whether the effect re-fires (count 1 -> 2 = double-apply) or not.
clean();
{ const killed=spawnSync(process.execPath,["probes/wf-start.mjs","wf-e","the sandbox"],{ encoding:"utf8", timeout:2000, env:{...process.env,WF_SLOW:"5000"} });
  const afterKill=execCount();  // effect appended once before the sleep, then the process was killed mid-effect
  const b=run("probes/wf-resume.mjs",["wf-e"]);
  obs.push({ caseId:"workflow-052", killedSignal:killed.signal, executionsAfterKill:afterKill, resume:status(b), resumeErr:b.stderr?String(b.stderr).slice(0,90):null, totalExecutions:execCount(),
    reading: execCount()===1 ? "effect applied once despite mid-effect crash" : execCount()===2 ? "DOUBLE-APPLY: effect re-ran on resume" : "effect never completed" }); }

writeFileSync("probes/results/workflow-outputs-v2.json", JSON.stringify({ observations: obs }, null, 1));
console.log(JSON.stringify(obs,null,1));
