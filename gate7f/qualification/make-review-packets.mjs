import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {randomInt} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {hash,requireValue} from "./runtime.mjs";
const check=(ok,code)=>requireValue(ok,"review-packet-"+code);
export function acceptancePrefix(file){
  const rows=[];for(const line of readFileSync(file,"utf8").split(/\r?\n/)){
    if(!line.trim())continue;const row=JSON.parse(line);rows.push(row);
    if(row.type==="acceptance-complete"){check(row.requests===117,"count");return rows;}
  }throw Error("qualification-review-packet-acceptance-incomplete");
}
export function anonymousResponses(events){
  const observations=events.filter(e=>e.type==="observation"&&e.id.startsWith("acceptance:"));
  check(observations.length===117,"reply-count");
  return observations.map(row=>{const parts=row.id.split(":"),turnIndex=Number(parts.pop()),attempt=Number(parts.pop());
    const caseId=parts.slice(1).join(":");
    return {caseId,attempt,turnIndex,content:row.normalized.content,toolCalls:row.normalized.toolCalls,finishReason:row.normalized.finishReason};});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [first,second,target]=process.argv.slice(2);check(first&&second&&target&&!existsSync(target),"arguments");
  const files=[path.resolve(first),path.resolve(second)],labels=randomInt(2)?["Candidate-A","Candidate-B"]:["Candidate-B","Candidate-A"];
  mkdirSync(path.resolve(target),{recursive:true});
  for(let i=0;i<2;i++){
    const events=acceptancePrefix(files[i]);
    const packet={schemaVersion:"runa2-qualification-blind-review-packet/v1",candidateLabel:labels[i],responses:anonymousResponses(events),
      acceptancePrefixSha256:hash(JSON.stringify(events)),hardwareAndModelIdentityOmitted:true,modelQualityNotYetGraded:true};
    writeFileSync(path.join(target,labels[i]+".json"),JSON.stringify(packet,null,2)+"\n",{flag:"wx"});
  }
  const mapping={schemaVersion:"runa2-qualification-review-mapping/v1",files:files.map((file,i)=>({file,candidateLabel:labels[i]}))};
  // Keep mapping outside the directory supplied to the independent judge.
  writeFileSync(path.resolve(target)+"-mapping.json",JSON.stringify(mapping,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({target:path.resolve(target),packets:2,responsesPerPacket:117,modelIdentityOmitted:true}));
}
