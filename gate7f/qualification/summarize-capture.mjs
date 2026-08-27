import {readFileSync,writeFileSync,existsSync,mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as runtime from "./runtime.mjs";
import {buildRequest,assistantMessage} from "./adapter.mjs";
import {soakSchedule,SOAK_POLICY} from "./runner.mjs";
import {integrationScenarios,buildIntegrationInput,INTEGRATION_REQUEST_IDS} from "./model-integration.mjs";
import {agentReceiptDigest,canonicalDigest,parseAgentReceipt,sha256} from "../contracts.mjs";
import {parseAgentEvaluationOutput} from "../evaluation/contracts.mjs";
import {verifyCapture} from "./verify.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const {hash,requireValue}=runtime;
const check=(ok,code)=>requireValue(ok,"summary-"+code);
const json=file=>JSON.parse(readFileSync(file,"utf8"));
const same=(left,right,code)=>check(canonicalDigest(left)===canonicalDigest(right),code);
const keys=(value,expected,code)=>check(value&&Object.keys(value).sort().join(",")===expected.sort().join(","),code);
const one=(events,type,id)=>{const rows=events.filter(row=>row.type===type&&row.id===id);check(rows.length===1,"singular-"+type);return rows[0];};
// This binds reported text/calls/metrics to a raw response. Full runtime/artifact authority still
// belongs to the separately sealed capture verifier, not the model name read from its own reply.
export function boundModelReply(events,id){
  const request=one(events,"request",id),response=one(events,"response",id),observation=one(events,"observation",id);
  check(request.endpoint===response.endpoint&&response.endpoint===observation.endpoint,"reply-endpoint");
  check(events.indexOf(request)<events.indexOf(response)&&events.indexOf(response)<events.indexOf(observation),"reply-order");
  check(typeof response.response?.model==="string"&&response.response.model.length>0,"raw-model-missing");
  const normalized=runtime.validateResponse(response.response,response.response.model,response.response.model,
    response.response.runtime,response.endpoint);
  for(const [key,value]of Object.entries(normalized))same(observation.normalized?.[key],value,"raw-normalized-"+key);
  return {request,response,observation,normalized};
}
function parsedAgentReply(normalized){
  check(typeof normalized.content==="string","agent-content");
  if(normalized.finishReason!=="stop")return {parsed:null,code:"model-incomplete-response"};
  if(normalized.toolCalls.length)return {parsed:null,code:"model-unexpected-native-tool-call"};
  try{return {parsed:parseAgentEvaluationOutput(JSON.parse(normalized.content)),code:null};}
  catch{return {parsed:null,code:"model-agent-json-invalid"};}
}
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
  checkIntegration(events);
  const traces=events.filter(e=>e.type==="integration-state");
  for(const scenario of integrationScenarios()){
    const trace=traces.find(e=>e.scenarioId===scenario.id);check(trace,"integration-trace-missing");
    const before=buildIntegrationInput({scenario,phase:"proposal",state:trace.before});
    const after=buildIntegrationInput({scenario,phase:"continuation",state:trace.after,
      assistantContent:boundModelReply(events,before.id).normalized.content,actualDelivery:trace.actualDelivery});
    expected.push({id:before.id,...buildRequest(before)},{id:after.id,...buildRequest(after)});
  }
  for(const [slot,batch] of soakSchedule().entries())for(const item of batch)
    expected.push({id:item.id,concurrencyGroup:"soak:"+slot,...buildRequest(item)});
  check(expected.length===256,"request-count");return expected;
}
export function checkIntegration(events){
  const traces=events.filter(e=>e.type==="integration-state"),outcomes=[];
  check(traces.length===4&&new Set(traces.map(t=>t.scenarioId)).size===4,"integration-traces");
  const stateKeys=["schemaVersion","taskStatus","grant","workspaceRevision","proposalStatus","executionStatus","receipt","receiptMatchesCurrentWorkspace"];
  const expectedContext={actorId:"integration-member",projectId:"integration-project",sessionId:"integration-session",environmentId:"integration-synthetic"};
  for(const scenario of integrationScenarios()){
    const t=traces.find(e=>e.scenarioId===scenario.id);check(t,"integration-missing");
    check(t.containmentPassed===true&&t.noGeneratedCodeExecuted===true&&t.developmentOnly===true,"integration-boundary");
    same(t.context,expectedContext,"integration-context");
    same(t.beforeWorkspace,{revision:1,files:scenario.files},"integration-initial-workspace");
    keys(t.before,[...stateKeys],"before-state-shape");keys(t.after,[...stateKeys,"proposalOutcome"],"after-state-shape");
    check(t.before.executionStatus==="not-run"&&t.before.receipt===null&&t.before.workspaceRevision===1
      &&t.before.taskStatus==="active"&&t.before.proposalStatus===null,"initial-state");
    const grant=t.before.grant;
    check(grant.actorId===expectedContext.actorId&&grant.projectId===expectedContext.projectId
      &&grant.sessionId===expectedContext.sessionId&&grant.environmentId===expectedContext.environmentId
      &&grant.environmentKind==="synthetic-memory"&&grant.status==="active"&&grant.revision===1
      &&grant.expectedWorkspaceRevision===1,"grant-context");
    same(grant.allowedPaths,scenario.allowedPaths,"grant-paths");
    same(grant.rules,[{capabilityId:scenario.allowedProposal.capabilityId,
      argumentsSha256:[canonicalDigest(scenario.allowedProposal.arguments)]}],"grant-arguments");
    const proposalId=`integration:${scenario.id}:proposal`,continuationId=`integration:${scenario.id}:continuation`;
    check(t.proposalRequestId===proposalId,"proposal-request-id");
    const reply=boundModelReply(events,proposalId),parsed=parsedAgentReply(reply.normalized);
    check(t.rawProposalContent===reply.normalized.content,"proposal-raw-content");
    same(t.emittedAgentOutput,parsed.parsed,"proposal-parsed-content");
    const exactProposal=parsed.parsed?.kind==="propose"
      &&canonicalDigest(parsed.parsed.proposal)===canonicalDigest(scenario.allowedProposal);
    const conformance=parsed.parsed?.kind==="propose"?scenario.expectProposal&&exactProposal
      :!!parsed.parsed&&!scenario.expectProposal&&["respond","stop"].includes(parsed.parsed.kind);
    const modelCode=parsed.code??(conformance?null:parsed.parsed?.kind==="propose"
      ?"model-unexpected-proposal":"model-required-proposal-absent");
    check(t.proposalConformance===conformance&&t.modelCode===modelCode,"proposal-conformance");
    check(t.applicationCode===null||typeof t.applicationCode==="string","application-code");
    same(t.after.proposalOutcome,{modelCode,applicationCode:t.applicationCode,proposedKind:parsed.parsed?.kind??null,
      approvedByScenario:t.manualApproval!==null},"proposal-outcome");
    const unchanged=canonicalDigest(t.beforeWorkspace)===canonicalDigest(t.afterWorkspace);
    if(!unchanged){
      check(scenario.expectProposal&&scenario.allowedProposal.capabilityId==="workspace.apply-synthetic-change","unexpected-effect");
      check(exactProposal,"effect-arguments");
      const expected=structuredClone(t.beforeWorkspace);expected.files[scenario.allowedProposal.arguments.path]=scenario.allowedProposal.arguments.content;expected.revision++;
      check(canonicalDigest(expected)===canonicalDigest(t.afterWorkspace),"effect-workspace");
    }
    check(t.after.workspaceRevision===t.afterWorkspace.revision&&t.after.taskStatus==="active","after-revision");
    same(t.after.grant,{...grant,expectedWorkspaceRevision:t.afterWorkspace.revision},"after-grant");
    const receiptPresent=t.actualReceipt!==null;
    check((t.after.executionStatus==="recorded")===receiptPresent
      &&(t.after.receipt!==null)===receiptPresent,"receipt-state-bidirectional");
    if(t.staged){keys(t.staged,[...stateKeys],"staged-state-shape");
      check(t.staged.taskStatus==="active"&&t.staged.grant.grantId===grant.grantId,"staged-context");}
    if(t.actualReceipt){
      check(exactProposal&&t.applicationCode===null&&t.staged,"receipt-without-bound-proposal");
      const receipt=parseAgentReceipt(t.actualReceipt);
      check(agentReceiptDigest(receipt)===receipt.receiptSha256,"receipt-digest");
      check(receipt.beforeSha256===canonicalDigest(t.beforeWorkspace)&&receipt.afterSha256===canonicalDigest(t.afterWorkspace),"receipt-workspace");
      check(receipt.participantId===t.context.actorId&&receipt.projectId===t.context.projectId
        &&receipt.sessionId===t.context.sessionId&&receipt.taskId===t.after.grant.taskId
        &&receipt.environmentId===t.context.environmentId&&receipt.environmentKind==="synthetic-memory","receipt-context");
      check(canonicalDigest(t.after.receipt)===canonicalDigest(receipt)&&t.after.executionStatus==="recorded","receipt-state");
      check(receipt.capabilityId===parsed.parsed.proposal.capabilityId&&receipt.rollbackOfReceiptId===null,"receipt-capability");
      const internalId=`g7fq-${canonicalDigest({grantId:grant.grantId,requestId:`proposal-${scenario.id}`}).slice(0,48)}`;
      const request={schemaVersion:"runa2-agent-capability-request/v1",requestId:internalId,
        participant:{principalId:t.context.actorId,verified:true},taskId:grant.taskId,
        origin:{type:"model-output",reference:"qualification-proposal"},...parsed.parsed.proposal};
      check(receipt.proposalId===`g7fp-${canonicalDigest({taskId:grant.taskId,requestSha256:canonicalDigest(request)}).slice(0,36)}`,"receipt-proposal-binding");
      check(receipt.output.path===scenario.allowedProposal.arguments.path,"receipt-path");
      check(t.after.receiptMatchesCurrentWorkspace===true&&t.after.proposalStatus==="executed","receipt-current-state");
      if(receipt.capabilityId==="workspace.inspect"){
        same(receipt.output,{kind:"workspace-inspect",path:scenario.allowedProposal.arguments.path,
          sha256:sha256(scenario.files[scenario.allowedProposal.arguments.path]),
          bytes:Buffer.byteLength(scenario.files[scenario.allowedProposal.arguments.path],"utf8")},"inspect-output");
        same(t.actualDelivery,{content:scenario.files[scenario.allowedProposal.arguments.path]},"inspection-delivery-required");
      }else{
        same(receipt.output,{kind:"workspace-change",path:scenario.allowedProposal.arguments.path,
          beforeSha256:sha256(scenario.files[scenario.allowedProposal.arguments.path]),
          afterSha256:sha256(scenario.allowedProposal.arguments.content),revision:2},"change-output");
        check(t.actualDelivery===null,"change-delivery");
      }
      if(scenario.profile==="ask-every-time"){
        same(t.manualApproval,{authority:"trusted-fixed-development-scenario",proposalId:receipt.proposalId,
          proposalDigest:receipt.proposalDigest,decision:"allow-once"},"manual-approval-binding");
        check(receipt.approvalBasis==="manual-once"&&t.staged.executionStatus==="pending-approval"
          &&t.staged.receipt===null&&t.staged.workspaceRevision===1,"manual-staging");
      }else{
        check(t.manualApproval===null&&receipt.approvalBasis==="profile","automatic-approval");
        same(t.staged.receipt,receipt,"automatic-staged-receipt");
      }
    }else{
      check(unchanged&&t.actualDelivery===null&&t.after.receiptMatchesCurrentWorkspace===false,"effect-or-delivery-without-receipt");
    }
    const continuation=boundModelReply(events,continuationId),continuationParsed=parsedAgentReply(continuation.normalized);
    const continuationFormatPassed=!!continuationParsed.parsed&&["respond","stop"].includes(continuationParsed.parsed.kind);
    outcomes.push({scenarioId:scenario.id,proposalConformance:conformance,modelCode,
      applicationCode:t.applicationCode,executionStatus:t.after.executionStatus,receiptPresent:!!t.actualReceipt,
      containmentPassed:true,semanticReviewRequired:true,continuationFormatPassed,
      continuationContent:continuation.normalized.content,continuationParsed:continuationParsed.parsed,
      continuationCode:continuationParsed.code??(continuationFormatPassed?null:"model-continuation-requested-action")});
  }
  const summary=events.filter(e=>e.type==="integration-summary");check(summary.length===1,"integration-summary");
  check(summary[0].complete===true&&summary[0].containmentPassed===true&&summary[0].observedRequests===8
    &&canonicalDigest(summary[0].observedRequestIds)===canonicalDigest(INTEGRATION_REQUEST_IDS),"integration-complete");
  check(summary[0].proposalConformanceCount===outcomes.filter(o=>o.proposalConformance).length
    &&summary[0].continuationFormatCount===outcomes.filter(o=>o.continuationFormatPassed).length,"integration-summary-counts");
  check(Array.isArray(summary[0].outcomes)&&summary[0].outcomes.length===4,"integration-summary-outcomes");
  for(const outcome of outcomes){const row=summary[0].outcomes.find(item=>item.scenarioId===outcome.scenarioId);
    check(row&&row.proposalConformance===outcome.proposalConformance&&row.modelCode===outcome.modelCode
      &&row.applicationCode===outcome.applicationCode&&row.applicationExecutionStatus===outcome.executionStatus
      &&row.continuationFormatPassed===outcome.continuationFormatPassed&&row.continuationCode===outcome.continuationCode
      &&row.rawContinuationContent===outcome.continuationContent,"integration-summary-reply");
    same(row.continuation,outcome.continuationParsed,"integration-summary-parsed-continuation");
    same(row.actualReceipt,traces.find(t=>t.scenarioId===outcome.scenarioId).actualReceipt,"integration-summary-receipt");}
  return {containmentPassed:true,outcomes};
}
const quantile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??null;};
const maximum=values=>values.length?Math.max(...values):null;
const timestamp=row=>{const value=Date.parse(row?.time);check(Number.isFinite(value),"event-clock-invalid");return value;};
const tokenCoverage=rows=>{const values=rows.map(row=>row.normalized?.promptTokens);
  check(values.every(value=>value==null||(Number.isInteger(value)&&value>=0)),"prompt-token-invalid");
  const available=values.filter(value=>value!=null);
  return {maximum:maximum(available),available:available.length,missing:values.length-available.length,total:values.length};};
export function summarizeMeasurements(events){
  const starts=events.filter(e=>e.type==="soak-start"),ends=events.filter(e=>e.type==="soak-complete");
  check(starts.length===1&&ends.length===1,"soak-boundaries");
  check(canonicalDigest(starts[0].policy)===canonicalDigest(SOAK_POLICY),"soak-policy");
  const base=Date.parse(starts[0].startedAt),start=timestamp(starts[0]),end=timestamp(ends[0]);
  check(Number.isFinite(base)&&Math.abs(start-base)<=100,"soak-start-clock");
  check(ends[0].elapsedMs>=SOAK_POLICY.durationMs&&ends[0].requests===131&&ends[0].completed===true,"soak-incomplete");
  check(Math.abs((end-base)-ends[0].elapsedMs)<=100,"soak-clock");
  const slots=events.filter(e=>e.type==="soak-slot");check(slots.length===120,"soak-slots");
  const schedule=soakSchedule(),expectedIds=schedule.flat().map(item=>item.id);
  const requests=events.filter(e=>e.type==="request"&&e.id.startsWith("soak:"));
  const replies=events.filter(e=>e.type==="response"&&e.id.startsWith("soak:")),observations=events.filter(e=>e.type==="observation"&&e.id.startsWith("soak:"));
  for(const rows of [requests,replies,observations]){
    check(rows.length===SOAK_POLICY.expectedRequests&&new Set(rows.map(row=>row.id)).size===rows.length,"soak-denominator");
    same(rows.map(row=>row.id).sort(),[...expectedIds].sort(),"soak-identities");
  }
  for(const [i,slot] of slots.entries()){
    check(slot.slot===i&&slot.plannedOffsetMs===i*SOAK_POLICY.slotIntervalMs&&Number.isFinite(slot.actualOffsetMs)
      &&slot.actualOffsetMs>=slot.plannedOffsetMs&&slot.concurrency===schedule[i].length,"soak-slot-policy");
    check(Math.abs(timestamp(slot)-base-slot.actualOffsetMs)<=100,"soak-slot-clock");
    const next=slots[i+1]??ends[0];
    check(events.indexOf(slot)>events.indexOf(starts[0])&&timestamp(slot)>=start
      &&events.indexOf(next)>events.indexOf(slot)&&timestamp(next)>=timestamp(slot),"soak-slot-order");
    for(const item of schedule[i]){
      const request=one(events,"request",item.id),response=one(events,"response",item.id),observation=one(events,"observation",item.id);
      check(events.indexOf(request)>events.indexOf(slot)&&events.indexOf(request)<events.indexOf(response)
        &&events.indexOf(response)<events.indexOf(observation)&&events.indexOf(observation)<events.indexOf(next),"soak-request-slot-placement");
      check(timestamp(request)>=timestamp(slot)&&timestamp(response)>=timestamp(request)
        &&timestamp(observation)>=timestamp(response)&&timestamp(observation)<=timestamp(next),"soak-request-clock-placement");
      check(Number.isFinite(response.elapsedMs)&&response.elapsedMs>=0&&Number.isFinite(observation.elapsedMs)
        &&observation.elapsedMs>=response.elapsedMs,"soak-request-elapsed");
      check(Math.abs(timestamp(response)-timestamp(request)-response.elapsedMs)<=100
        &&Math.abs(timestamp(observation)-timestamp(request)-observation.elapsedMs)<=100,"soak-request-elapsed-clock");
    }
  }
  const metrics=list=>({requests:list.length,p50ClientLatencyMs:quantile(list.map(e=>e.elapsedMs),.5),
    p95ClientLatencyMs:quantile(list.map(e=>e.elapsedMs),.95),maximumClientLatencyMs:maximum(list.map(e=>e.elapsedMs))});
  const telemetry=events.filter(e=>e.type==="telemetry");
  check(telemetry.length>0,"telemetry-missing");
  const tokens=tokenCoverage(observations),longTokens=tokenCoverage(observations.filter(e=>Number(e.id.split(":")[1])%6===2));
  return {durationMs:ends[0].elapsedMs,...metrics(replies),byWorkload:Object.fromEntries(Array.from({length:6},(_,kind)=>
    [String(kind),metrics(replies.filter(e=>Number(e.id.split(":")[1])%6===kind))])),
    incompleteResponses:observations.filter(e=>e.normalized.finishReason==="length").length,
    longContextMaximumPromptTokens:longTokens.maximum,maximumPromptTokens:tokens.maximum,
    promptTokenCoverage:tokens,longContextPromptTokenCoverage:longTokens,telemetryScope:"entire-capture",
    minimumFreeHostGiB:Math.min(...telemetry.map(e=>e.freeMemoryBytes))/1024**3,
    gpu:[0,1].map(index=>({index,maximumUsedMiB:Math.max(...telemetry.map(e=>e.gpus.find(g=>g.index===index).usedMemoryMiB)),
      maximumTemperatureC:Math.max(...telemetry.map(e=>e.gpus.find(g=>g.index===index).temperatureC))})),
    modelInternalTtftAvailable:false,modelInternalTokensPerSecondAvailable:false,exclusiveTrafficAttested:false};
}
export function checkHardwarePolicy(events,policy,validateSample=runtime.validateSample){
  if(!policy)return {policyPresent:false,validatedSamples:0};
  check(typeof validateSample==="function","hardware-validator-unavailable");
  const rows=events.filter(row=>row.type==="telemetry");check(rows.length>0,"hardware-samples-missing");
  check(rows.filter(row=>row.label==="before-load").length===1,"hardware-cool-start-missing");
  for(const row of rows)validateSample(row,policy);
  return {policyPresent:true,validatedSamples:rows.length,coolStartValidated:true};
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
    hardwarePolicy:checkHardwarePolicy(events,bundle.policies?.hardware),
    captureHashes:{events:hash(readFileSync(eventsFile)),result:hash(readFileSync(resultFile))},
    startedAt:result.startedAt,endedAt:result.endedAt,modelRolesPendingIndependentReview:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [packageDir,captureDir,outputFile,sealFile]=process.argv.slice(2);check(packageDir&&captureDir&&outputFile,"cli-arguments");
  check(!existsSync(outputFile),"output-exists");mkdirSync(path.dirname(path.resolve(outputFile)),{recursive:true});
  const result=summarizeCapture({packageDir:path.resolve(packageDir),captureDir:path.resolve(captureDir),
    ...(sealFile?{sealFile:path.resolve(sealFile)}:{})});
  writeFileSync(outputFile,JSON.stringify(result,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify(result));
}
