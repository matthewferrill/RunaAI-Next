import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {randomInt} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {hash,requireValue} from "./runtime.mjs";
import {boundModelReply} from "./summarize-capture.mjs";
const check=(ok,code)=>requireValue(ok,"review-packet-"+code);
export function acceptancePrefix(file){
  const rows=[];for(const line of readFileSync(file,"utf8").split(/\r?\n/)){
    if(!line.trim())continue;const row=JSON.parse(line);rows.push(row);
    if(row.type==="acceptance-complete"){check(row.requests===117,"count");return rows;}
  }throw Error("qualification-review-packet-acceptance-incomplete");
}
export function expectedAcceptanceIds(bundle){
  const inputs=bundle?.inputs;check(inputs&&Array.isArray(inputs.cases)&&Number.isInteger(inputs.attemptsPerCase)
    &&inputs.attemptsPerCase>0,"input-schedule");
  const ids=[];
  for(const item of inputs.cases){check(typeof item.id==="string"&&item.id.length>0
    &&(item.turns===undefined||Array.isArray(item.turns)),"input-case");
    for(let attempt=1;attempt<=inputs.attemptsPerCase;attempt++)for(let turn=0;turn<= (item.turns?.length??0);turn++)
      ids.push(`acceptance:${item.id}:${attempt}:${turn}`);}
  check(ids.length===117&&new Set(ids).size===117,"input-identities");return ids;
}
export function anonymousResponses(events,{expectedIds}={}){
  check(Array.isArray(expectedIds)&&expectedIds.length===117&&new Set(expectedIds).size===117
    &&expectedIds.every(id=>typeof id==="string"&&/^acceptance:.+:[1-9][0-9]*:[0-9]+$/.test(id)),"expected-identities");
  for(const type of ["request","response","observation"]){const rows=events.filter(e=>e.type===type&&e.id.startsWith("acceptance:"));
    check(rows.length===117&&new Set(rows.map(row=>row.id)).size===117,"unique-"+type);
    check(JSON.stringify(rows.map(row=>row.id).sort())===JSON.stringify([...expectedIds].sort()),"schedule-"+type);}
  return expectedIds.map(id=>{const normalized=boundModelReply(events,id).normalized;
    const parts=id.split(":"),turnIndex=Number(parts.pop()),attempt=Number(parts.pop());
    const caseId=parts.slice(1).join(":");
    const toolCalls=normalized.toolCalls.map(call=>({id:call.id,type:call.type,
      function:{name:call.function.name,arguments:call.function.arguments}}));
    return {caseId,attempt,turnIndex,content:normalized.content,toolCalls,finishReason:normalized.finishReason};});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [first,second,target,bundleFile]=process.argv.slice(2);check(first&&second&&target&&bundleFile&&!existsSync(target),"arguments");
  const bundleBytes=readFileSync(path.resolve(bundleFile)),expectedIds=expectedAcceptanceIds(JSON.parse(bundleBytes.toString("utf8")));
  const files=[path.resolve(first),path.resolve(second)],labels=randomInt(2)?["Candidate-A","Candidate-B"]:["Candidate-B","Candidate-A"];
  const prefixes=files.map(acceptancePrefix),responses=prefixes.map(events=>anonymousResponses(events,{expectedIds}));
  mkdirSync(path.resolve(target),{recursive:true});
  for(let i=0;i<2;i++){
    const packet={schemaVersion:"runa2-qualification-blind-review-packet/v1",candidateLabel:labels[i],responses:responses[i],
      acceptancePrefixSha256:hash(JSON.stringify(prefixes[i])),suppliedBundleSha256:hash(bundleBytes),
      providerMetadataOmitted:true,modelAnswerContentUnmodified:true,modelSelfIdentificationPossible:true,
      fullCaptureVerificationPending:true,modelQualityNotYetGraded:true};
    writeFileSync(path.join(target,labels[i]+".json"),JSON.stringify(packet,null,2)+"\n",{flag:"wx"});
  }
  const mapping={schemaVersion:"runa2-qualification-review-mapping/v1",files:files.map((file,i)=>({file,candidateLabel:labels[i]}))};
  // Keep mapping outside the directory supplied to the independent judge.
  writeFileSync(path.resolve(target)+"-mapping.json",JSON.stringify(mapping,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({target:path.resolve(target),packets:2,responsesPerPacket:117,providerMetadataOmitted:true,
    fullCaptureVerificationPending:true}));
}
