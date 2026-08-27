import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {hostname} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const check=(ok,code)=>{if(!ok)throw Error("qualification-prefix-"+code);};
export function completedFunctionalPrefix(bytes){
  const decoder=new TextDecoder("utf-8",{fatal:true});let offset=0,acceptance=false;
  while(offset<bytes.length){
    const end=bytes.indexOf(10,offset);check(end!==-1,"incomplete");
    const line=decoder.decode(bytes.subarray(offset,end));offset=end+1;if(!line.trim())continue;
    const row=JSON.parse(line);
    if(row.type==="acceptance-complete"){check(row.requests===117,"acceptance-count");acceptance=true;}
    if(row.type==="integration-summary"){
      check(acceptance&&row.complete===true&&row.observedRequests===8,"integration-count");
      return bytes.subarray(0,offset);
    }
  }
  throw Error("qualification-prefix-incomplete");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  check(hostname().toUpperCase()==="RUNA-HOME","host");
  const root="C:\\Users\\codex-audit\\AppData\\Local\\RunaQualification\\20260827-acceptance-power-v2";
  const target=path.join(root,"review-export");check(!existsSync(target),"already-exported");
  const records=["incumbent","gemma26"].map(candidate=>{
    const bytes=readFileSync(path.join(root,"qualification","capture-"+candidate,"events.jsonl"));
    const prefix=completedFunctionalPrefix(bytes);
    return {name:candidate+"-prefix.jsonl",prefix,sourceSnapshotSha256:sha(bytes)};
  });
  mkdirSync(target);
  const files={};for(const r of records){writeFileSync(path.join(target,r.name),r.prefix,{flag:"wx"});
    files[r.name]={bytes:r.prefix.length,sha256:sha(r.prefix)};}
  const manifest={schemaVersion:"runa2-qualification-home-export/v1",host:"RUNA-HOME",time:new Date().toISOString(),
    files,reviewSnapshotNotFinalCapture:true,sourceSnapshots:records.map(r=>({file:r.name,sourceSnapshotSha256:r.sourceSnapshotSha256}))};
  writeFileSync(path.join(target,"HOME-REVIEW-EXPORT.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({target,manifestSha256:sha(readFileSync(path.join(target,"HOME-REVIEW-EXPORT.json"))),files:2,answersPrinted:false}));
}
