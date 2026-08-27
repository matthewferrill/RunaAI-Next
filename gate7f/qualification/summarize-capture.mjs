import {readFileSync,writeFileSync,existsSync,mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {hash,requireValue} from "./runtime.mjs";
import {buildRequest,assistantMessage} from "./adapter.mjs";
import {soakSchedule,SOAK_POLICY} from "./runner.mjs";
import {integrationScenarios,buildIntegrationInput,INTEGRATION_REQUEST_IDS} from "./model-integration.mjs";
import {agentReceiptDigest,canonicalDigest,parseAgentReceipt} from "../contracts.mjs";
import {verifyCapture} from "./verify.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const check=(ok,code)=>requireValue(ok,"summary-"+code);
const json=file=>JSON.parse(readFileSync(file,"utf8"));
export function loadEvents(file){return readFileSync(file,"utf8").trim().split(/\r?\n/).map(JSON.parse);}
export function reconstructSchedule(bundle,events){
  const observations=new Map(events.filter(e=>e.type==="observation").map(e=>[e.id,e.normalized]));
  const expected=[];
  for(const item of bundle.inputs.cases)for(let attempt=1;attempt<=bundle.inputs.attemptsPerCase;attempt++){
    const conversation=structuredClone(item.messages);
    for(const [turnIndex,turn] of [null,...(item.turns??[])].entries()){
      if(turn)conversation.push({role:"user",content:turn.user});
      const id=`acceptance:${item.id}:${attempt}:${turnIndex}`;
      expected.push({id,...buildRequest(item,conversation)});
      check(observations.has(id),"missing-acceptance-reply");conversation.push(assistantMessage(observations.get(id)));
    }
  }
  const traces=events.filter(e=>e.type==="integration-state");check(traces.length===4,"integration-traces");
  for(const scenario of integrationScenarios()){
    const trace=traces.find(e=>e.scenarioId===scenario.id);check(trace,"integration-trace-missing");
    const before=buildIntegrationInput({scenario,phase:"proposal",state:trace.before});
    const after=buildIntegrationInput({scenario,phase:"continuation",state:trace.after,
      assistantContent:trace.rawProposalContent,actualDelivery:trace.actualDelivery});
    expected.push({id:before.id,...buildRequest(before)},{id:after.id,...buildRequest(after)});
  }
  for(const [slot,batch] of soakSchedule().entries())for(const item of batch)
    expected.push({id:item.id,concurrencyGroup:"soak:"+slot,...buildRequest(item)});
  check(expected.length===256,"request-count");return expected;
}
export function checkIntegration(events){
  const traces=events.filter(e=>e.type==="integration-state"),outcomes=[];
  for(const scenario of integrationScenarios()){
    const t=traces.find(e=>e.scenarioId===scenario.id);check(t,"integration-missing");
    check(t.containmentPassed===true&&t.noGeneratedCodeExecuted===true&&t.developmentOnly===true,"integration-boundary");
    const unchanged=canonicalDigest(t.beforeWorkspace)===canonicalDigest(t.afterWorkspace);
    if(!unchanged){
      check(scenario.expectProposal&&scenario.allowedProposal.capabilityId==="workspace.apply-synthetic-change","unexpected-effect");
      check(canonicalDigest(t.emittedAgentOutput?.proposal)===canonicalDigest(scenario.allowedProposal),"effect-arguments");
      const expected=structuredClone(t.beforeWorkspace);expected.files[scenario.allowedProposal.arguments.path]=scenario.allowedProposal.arguments.content;expected.revision++;
      check(canonicalDigest(expected)===canonicalDigest(t.afterWorkspace),"effect-workspace");
    }
    if(t.actualReceipt){
      const receipt=parseAgentReceipt(t.actualReceipt);
      check(agentReceiptDigest(receipt)===receipt.receiptSha256,"receipt-digest");
      check(receipt.beforeSha256===canonicalDigest(t.beforeWorkspace)&&receipt.afterSha256===canonicalDigest(t.afterWorkspace),"receipt-workspace");
      check(receipt.participantId===t.context.actorId&&receipt.projectId===t.context.projectId
        &&receipt.taskId===t.after.grant.taskId&&receipt.environmentId===t.context.environmentId,"receipt-context");
      check(canonicalDigest(t.after.receipt)===canonicalDigest(receipt)&&t.after.executionStatus==="recorded","receipt-state");
      check(receipt.output.path===scenario.allowedProposal.arguments.path,"receipt-path");
    }else check(unchanged,"effect-without-receipt");
    if(t.actualDelivery){check(scenario.allowedProposal.capabilityId==="workspace.inspect","unexpected-delivery");
      check(t.actualDelivery.content===scenario.files[scenario.allowedProposal.arguments.path],"delivery-content");}
    outcomes.push({scenarioId:scenario.id,proposalConformance:t.proposalConformance,modelCode:t.modelCode,
      applicationCode:t.applicationCode,executionStatus:t.after.executionStatus,receiptPresent:!!t.actualReceipt,
      containmentPassed:true,semanticReviewRequired:true});
  }
  const summary=events.filter(e=>e.type==="integration-summary");check(summary.length===1,"integration-summary");
  check(summary[0].complete===true&&summary[0].containmentPassed===true&&summary[0].observedRequests===8
    &&canonicalDigest(summary[0].observedRequestIds)===canonicalDigest(INTEGRATION_REQUEST_IDS),"integration-complete");
  return {containmentPassed:true,outcomes};
}
const quantile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??null;};
export function summarizeMeasurements(events){
  const starts=events.filter(e=>e.type==="soak-start"),ends=events.filter(e=>e.type==="soak-complete");
  check(starts.length===1&&ends.length===1,"soak-boundaries");
  check(canonicalDigest(starts[0].policy)===canonicalDigest(SOAK_POLICY),"soak-policy");
  check(ends[0].elapsedMs>=SOAK_POLICY.durationMs&&ends[0].requests===131&&ends[0].completed===true,"soak-incomplete");
  check(Math.abs((Date.parse(ends[0].time)-Date.parse(starts[0].time))-ends[0].elapsedMs)<=100,"soak-clock");
  const slots=events.filter(e=>e.type==="soak-slot");check(slots.length===120,"soak-slots");
  for(const [i,slot] of slots.entries())check(slot.slot===i&&slot.plannedOffsetMs===i*30000&&slot.actualOffsetMs>=slot.plannedOffsetMs
    &&slot.concurrency===(i>0&&i%10===0?2:1),"soak-slot-policy");
  const replies=events.filter(e=>e.type==="response"&&e.id.startsWith("soak:")),observations=events.filter(e=>e.type==="observation"&&e.id.startsWith("soak:"));
  check(replies.length===131&&observations.length===131,"soak-replies");
  const metrics=list=>({requests:list.length,p50ClientLatencyMs:quantile(list.map(e=>e.elapsedMs),.5),
    p95ClientLatencyMs:quantile(list.map(e=>e.elapsedMs),.95),maximumClientLatencyMs:Math.max(...list.map(e=>e.elapsedMs))});
  const telemetry=events.filter(e=>e.type==="telemetry");
  return {durationMs:ends[0].elapsedMs,...metrics(replies),byWorkload:Object.fromEntries(Array.from({length:6},(_,kind)=>
    [String(kind),metrics(replies.filter(e=>Number(e.id.split(":")[1])%6===kind))])),
    incompleteResponses:observations.filter(e=>e.normalized.finishReason==="length").length,
    longContextMaximumPromptTokens:Math.max(...observations.filter(e=>Number(e.id.split(":")[1])%6===2).map(e=>e.normalized.promptTokens)),
    maximumPromptTokens:Math.max(...observations.map(e=>e.normalized.promptTokens)),
    minimumFreeHostGiB:Math.min(...telemetry.map(e=>e.freeMemoryBytes))/1024**3,
    gpu:[0,1].map(index=>({index,maximumUsedMiB:Math.max(...telemetry.map(e=>e.gpus.find(g=>g.index===index).usedMemoryMiB)),
      maximumTemperatureC:Math.max(...telemetry.map(e=>e.gpus.find(g=>g.index===index).temperatureC))})),
    modelInternalTtftAvailable:false,modelInternalTokensPerSecondAvailable:false,exclusiveTrafficAttested:false};
}
export function summarizeCapture({packageDir,captureDir,sealFile=path.join(root,"gate7f/qualification/RUN-SEAL.json")}){
  const seal=json(sealFile),manifestFile=path.join(packageDir,"package-manifest.json"),bundleFile=path.join(packageDir,"qualification/bundle.json");
  check(hash(readFileSync(manifestFile))===seal.packageManifestSha256&&hash(readFileSync(bundleFile))===seal.bundleSha256,"external-seal");
  for(const [file,sha] of Object.entries(seal.verificationFiles))check(hash(readFileSync(path.join(root,file)))===sha,"verifier-drift");
  const packageManifest=json(manifestFile),bundle=json(bundleFile),eventsFile=path.join(captureDir,"events.jsonl"),resultFile=path.join(captureDir,"result.json");
  const events=loadEvents(eventsFile),result=json(resultFile),expectedSchedule=reconstructSchedule(bundle,events);
  return {schemaVersion:"runa2-qualification-verified-summary/v1",candidate:result.candidate,
    provenance:verifyCapture({packageManifest,packageManifestSha256:seal.packageManifestSha256,bundle,events,result,expectedSchedule}),
    integration:checkIntegration(events),endurance:summarizeMeasurements(events),
    captureHashes:{events:hash(readFileSync(eventsFile)),result:hash(readFileSync(resultFile))},
    startedAt:result.startedAt,endedAt:result.endedAt,modelRolesPendingIndependentReview:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [packageDir,captureDir,outputFile]=process.argv.slice(2);check(packageDir&&captureDir&&outputFile,"cli-arguments");
  check(!existsSync(outputFile),"output-exists");mkdirSync(path.dirname(path.resolve(outputFile)),{recursive:true});
  const result=summarizeCapture({packageDir:path.resolve(packageDir),captureDir:path.resolve(captureDir)});
  writeFileSync(outputFile,JSON.stringify(result,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify(result));
}
