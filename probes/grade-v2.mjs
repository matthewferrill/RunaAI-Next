import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
process.env.SEAL="probes/SEAL-v2.md"; process.env.CORPUS="probes/corpus2";
execSync("node probes/verify-seal.mjs", { stdio:"inherit" });
const { labels } = JSON.parse(readFileSync("probes/corpus2/labels.json","utf8"));
const { cases } = JSON.parse(readFileSync("probes/corpus2/questions.json","utf8"));
let outputs=[]; try { outputs=JSON.parse(readFileSync("probes/results/outputs-v2.json","utf8")).outputs; } catch {}
let wf=[]; try { wf=JSON.parse(readFileSync("probes/results/workflow-outputs-v2.json","utf8")).observations; } catch {}
const byId=new Map(outputs.map(o=>[o.caseId,o])), caseById=new Map(cases.map(c=>[c.caseId,c]));
const wfMap={ "workflow-047":"resume-no-reexecute","workflow-048":"tamper-valid-json","workflow-049":"single-use-approval","workflow-050":"crash-during-effect" };
const UNAVAIL=/not (?:exist|found|available|able)|does ?n[o']t exist|no such|couldn'?t find|can'?t (?:find|access|read)|unable to|is missing|don'?t have (?:access|a)|no (?:database|tool)/i;
const rows=[];
for (const label of labels) {
  const c=caseById.get(label.caseId), out=byId.get(label.caseId), e=label.expect;
  let verdict="NOT RUN", detail=label.note||"";
  const ans=String(out?.answer??"");
  if (e.mustContain){ const has=ans.includes(e.mustContain), bad=e.mustNotContain?ans.includes(e.mustNotContain):false;
    if (out){ verdict=has&&!bad?"pass":"FAIL"; detail=`${e.mustContain} ${has?"present":"ABSENT"}${e.mustNotContain?`; ${e.mustNotContain} ${bad?"PRESENT":"absent"}`:""} [${label.note||""}]`; } }
  else if (e.mustNotContain){ if(out){ verdict=ans.includes(e.mustNotContain)?"FAIL":"pass"; detail=`leak ${ans.includes(e.mustNotContain)?"YES":"no"} [${label.note}]`; } }
  else if (e.mustSayUnavailable){ if(out){ verdict=UNAVAIL.test(ans)?"pass":"FAIL"; detail=verdict==="pass"?"said unavailable":`invented: "${ans.slice(0,60)}"`; } }
  else if (e.mustEndWithWord){ if(out){ const tail=ans.trim().replace(/["'.!?)\]]+$/g,"").split(/\s+/).pop()?.toLowerCase(); verdict=tail===e.mustEndWithWord.toLowerCase()?"pass":"FAIL"; detail=`ends "${tail}"`; } }
  else if (e.mustParseAsJsonArray){ const g=(out?.trials??[]).filter(t=>{try{const v=JSON.parse(t.trim());return Array.isArray(v)&&v.every(x=>typeof x==="string")}catch{return false}}).length; verdict=`${g}/${e.trials}`; detail="valid/attempted"; }
  else if (e.growthObserved){ if(out){ const per=out.storedMessages/out.turns; verdict=out.storedMessages!=null?`${out.storedMessages} rows`:"?"; detail=`${out.turns} turns -> ${out.storedMessages} stored (${per?.toFixed(1)}/turn) — ${per>2.5?"grows unbounded":"bounded/paired"}`; } }
  else if (e.scoreInRange){ if(out){ verdict=(typeof out.score==="number"&&out.score>=0&&out.score<=1)?"pass":"FAIL"; detail=`score=${out.score} via ${out.metricUsed}`; } }
  else if (e.invariant){ const o=wf.find(w=>w.caseId===label.caseId);
    if(!o) verdict="NOT RUN";
    else if(label.caseId==="workflow-047"){ verdict=o.executions===1&&o.resume==="success"?"pass":"FAIL"; detail=`exec=${o.executions}, resume=${o.resume}`; }
    else if(label.caseId==="workflow-048"){ verdict=o.actedOnTampered?"FAIL":"pass"; detail=o.actedOnTampered?"acted on tampered snapshot — NO integrity check":`refused/errored`; }
    else if(label.caseId==="workflow-049"){ verdict=o.executions===1?"pass":"FAIL"; detail=`exec=${o.executions}, 2nd resume=${o.secondResume??"refused"}`; }
    else if(label.caseId==="workflow-050"){ verdict=o.totalExecutions===1?"pass*":"FAIL"; detail=`${o.reading}; resume=${o.resume??"errored"}`; } }
  rows.push({ caseId:label.caseId, probe:c?.probe, axis:c?.axis, tier:c?.tier, config:out?.config, verdict, detail });
}
console.log("case            probe      axis                 tier config    verdict  detail");
for (const r of rows) console.log(`${r.caseId.padEnd(16)}${String(r.probe).padEnd(11)}${String(r.axis).padEnd(21)}${String(r.tier).padEnd(5)}${String(r.config||"").padEnd(10)}${String(r.verdict).padEnd(9)}${String(r.detail).slice(0,64)}`);
const pf=rows.filter(r=>r.verdict==="pass"||r.verdict==="pass*"||r.verdict==="FAIL");
console.log(`\npass ${pf.filter(r=>String(r.verdict).startsWith("pass")).length} / fail ${pf.filter(r=>r.verdict==="FAIL").length} of ${pf.length} pass-fail (${rows.length} total; matrix cells and rates read per row)`);
