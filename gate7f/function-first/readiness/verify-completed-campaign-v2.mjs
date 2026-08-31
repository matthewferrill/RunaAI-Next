import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {policyForV2Lease,validV2BatchResult,validV2Completion} from './lease-v2-contract.mjs';

const HEX=/^[a-f0-9]{64}$/;
const LEASE=/^20260829-campaign-(gemma|coder|qwen36)-r[1-9][0-9]*$/;
const EXPORT_NAMES=Object.freeze([
  'Run-HomeCampaignLeaseV2.ps1','campaign-hardware-plan.json','complete.json','events.jsonl','gguf-metadata.mjs',
  'home-campaign-lease-v2.mjs','lease-config.json','lease-contract.mjs','lease-result.json','lease-v2-contract.mjs',
  'ready.json','runtime.json','seal.json','supervisor-result.json','supervisor.jsonl','worker-stderr.txt','worker-stdout.txt','worker.json',
]);
const SEALED_NAMES=Object.freeze([
  'Run-HomeCampaignLeaseV2.ps1','campaign-hardware-plan.json','gguf-metadata.mjs','home-campaign-lease-v2.mjs',
  'lease-config.json','lease-contract.mjs','lease-v2-contract.mjs','runtime.json',
]);
const PUBLICATION_KEYS=Object.freeze([
  'maximumWrappedChars','receiptRaw','receiptSha256','resultSha256','transportScriptSha256','writerSha256','writerSource',
]);
const RECEIPT_KEYS=Object.freeze([
  'leaseId','lifecycleCalled','markerSha256','privateValuesIncluded','published','reason','schemaVersion','sealSha256','time',
]);

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw new Error(`completed-campaign-v2-${code}`);};
const check=(condition,code)=>{if(!condition)fail(code);};
const exactKeys=(value,keys,code)=>check(value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.slice().sort().join(),code);
const parse=(bytes,code)=>{try{return JSON.parse(bytes);}catch{fail(code);}};
const canonicalBase64=(value,maximum,code)=>{
  check(typeof value==='string',code);const bytes=Buffer.from(value,'base64');
  check(bytes.length<=maximum&&bytes.toString('base64')===value,code);return bytes;
};
const instant=(value,code)=>{const result=Date.parse(value);check(Number.isFinite(result),code);return result;};

function decodeExport(exportPacketBytes){
  const packet=parse(exportPacketBytes,'export-json');
  exactKeys(packet,EXPORT_NAMES,'export-files');
  let total=0;const files={};
  for(const name of EXPORT_NAMES){
    const bytes=canonicalBase64(packet[name],8*1024*1024,'export-base64');total+=bytes.length;files[name]=bytes;
  }
  check(total<=32*1024*1024,'export-cap');return files;
}

function validateObservation(bytes,{leaseId,config,phase}){
  const value=parse(bytes,`${phase}-json`);
  exactKeys(value,['gpus','host','listeners','models','ownedTaskRegistrations','protectedDataIncluded','readOnly','schemaVersion','time'],`${phase}-shape`);
  check(value.schemaVersion==='runa-m1-campaign-final-observation/v2'&&value.host==='RUNA-HOME'
    &&value.readOnly===true&&value.protectedDataIncluded===false,`${phase}-authority`);
  check(Array.isArray(value.models)&&value.models.length>0&&value.models.every(model=>
    model&&typeof model.key==='string'&&Array.isArray(model.loadedInstances)&&model.loadedInstances.length===0),`${phase}-residency`);
  const modelKeys=value.models.map(model=>model.key);
  check(new Set(modelKeys).size===modelKeys.length&&modelKeys.includes(config.candidate.key)&&modelKeys.includes(config.auxiliary.key),`${phase}-models`);
  check(Array.isArray(value.listeners)&&value.listeners.length>0&&value.listeners.every(listener=>
    listener&&typeof listener.LocalAddress==='string'&&Number.isInteger(listener.LocalPort)&&listener.LocalPort>0&&listener.LocalPort<=65535),`${phase}-listeners`);
  check(Array.isArray(value.gpus)&&value.gpus.length===config.policy.gpuUuids.length,`${phase}-gpus`);
  const gpus=value.gpus.map(line=>{
    check(typeof line==='string',`${phase}-gpu-line`);const fields=line.split(',').map(field=>field.trim());
    check(fields.length===6&&Number.isInteger(Number(fields[0]))&&Number.isFinite(Number(fields[2])),`${phase}-gpu-line`);
    return {index:Number(fields[0]),uuid:fields[1],powerWatts:Number(fields[2])};
  });
  check(new Set(gpus.map(gpu=>gpu.uuid)).size===gpus.length
    &&JSON.stringify(gpus.map(gpu=>gpu.uuid).sort())===JSON.stringify([...config.policy.gpuUuids].sort())
    &&gpus.every(gpu=>gpu.powerWatts===config.policy.originalPowerWatts),`${phase}-power`);
  check(Array.isArray(value.ownedTaskRegistrations),`${phase}-tasks`);
  if(phase==='before')check(value.ownedTaskRegistrations.length===1
    &&value.ownedTaskRegistrations[0]?.TaskName===`Runa-M1-${leaseId}`,`${phase}-tasks`);
  else check(value.ownedTaskRegistrations.length===0,`${phase}-tasks`);
  return value;
}

export function verifyCompletedCampaignV2({
  leaseId,expectedLeaseSealSha256,expectedRuntimeSealSha256,expectedResultSha256,expectedSourceCommit,
  resultBytes,exportPacketBytes,completionPublicationBytes,beforeFinalObservationBytes,afterFinalObservationBytes,
}){
  check(LEASE.test(leaseId??''),'lease-id');
  for(const [value,code] of [[expectedLeaseSealSha256,'lease-seal'],[expectedRuntimeSealSha256,'runtime-seal'],
    [expectedResultSha256,'result-digest']])check(HEX.test(value??''),code);
  check(/^[a-f0-9]{40}$/.test(expectedSourceCommit??''),'source-commit');
  for(const [value,code] of [[resultBytes,'result-bytes'],[exportPacketBytes,'export-bytes'],
    [completionPublicationBytes,'publication-bytes'],[beforeFinalObservationBytes,'before-bytes'],[afterFinalObservationBytes,'after-bytes']])
    check(Buffer.isBuffer(value)&&value.length>0,code);

  const result=parse(resultBytes,'result-json');
  try{validV2BatchResult(result,'completed');}catch{fail('result-contract');}
  check(sha(resultBytes)===expectedResultSha256,'result-digest');
  check(result.runtimeSealSha256===expectedRuntimeSealSha256&&result.sourceCommit===expectedSourceCommit,'result-binding');
  check(result.denominatorChanged===false&&result.productionChanged===false&&result.protectedDataRead===false,'result-authority');
  check(Number.isFinite(instant(result.finishedAt,'result-time')),'result-time');

  const files=decodeExport(exportPacketBytes);
  check(sha(files['seal.json'])===expectedLeaseSealSha256,'seal-digest');
  const seal=parse(files['seal.json'],'seal-json');
  exactKeys(seal,['createdAt','createdBeforeModelLoads','files','leaseId','schemaVersion','sourceCommit'],'seal-shape');
  check(seal.schemaVersion==='runa-m1-campaign-lease-seal/v2'&&seal.leaseId===leaseId&&seal.sourceCommit===expectedSourceCommit
    &&seal.createdBeforeModelLoads===true,'seal-binding');
  exactKeys(seal.files,SEALED_NAMES,'seal-files');
  for(const name of SEALED_NAMES)check(HEX.test(seal.files[name])&&sha(files[name])===seal.files[name],`seal-file-${name}`);

  const config=parse(files['lease-config.json'],'config-json');
  let policy;try{policy=policyForV2Lease(config);}catch{fail('config-policy');}
  check(config.leaseId===leaseId&&config.createdBeforeInference===true&&config.lifecycleOwner==='roadmap_review'
    &&config.inferenceOwner==='root-actual-application-adapters','config-binding');
  const plan=parse(files['campaign-hardware-plan.json'],'plan-json');
  check(plan.schemaVersion==='runa-m1-campaign-hardware-plan/v2'&&plan.createdBeforeLoads===true&&plan.sourceCommit===expectedSourceCommit
    &&plan.host==='RUNA-HOME'&&plan.maximumConcurrentPrimaries===1&&plan.productionRoutingChanged===false
    &&plan.protectedDataIncluded===false,'plan-authority');
  check(config.campaignHardwarePlanSha256===sha(files['campaign-hardware-plan.json'])
    &&JSON.stringify(plan.policy)===JSON.stringify(policy),'plan-binding');
  const selected=plan.candidates?.find(candidate=>candidate.id===config.candidate.id);
  check(selected&&selected.candidateId===result.candidateId&&JSON.stringify(selected.artifact)===JSON.stringify(config.candidate)
    &&JSON.stringify(plan.auxiliary?.artifact)===JSON.stringify(config.auxiliary),'candidate-binding');

  const ready=parse(files['ready.json'],'ready-json');
  check(ready.schemaVersion==='runa-m1-campaign-lease-ready/v2'&&ready.leaseId===leaseId
    &&ready.sealSha256===expectedLeaseSealSha256&&ready.campaignHardwarePlanSha256===config.campaignHardwarePlanSha256
    &&ready.candidateId===config.candidate.id&&ready.modelId===config.candidate.key
    &&ready.embeddingModelId===config.auxiliary.key&&ready.primaryArtifactSha256===config.candidate.sha256
    &&ready.embeddingArtifactSha256===config.auxiliary.sha256,'ready-binding');
  const readyAt=instant(ready.readyAt,'ready-time'),expiresAt=instant(ready.expiresAt,'ready-time');
  check(expiresAt-readyAt===policy.readyLeaseMs,'ready-window');

  const marker=parse(files['complete.json'],'marker-json');
  try{check(validV2Completion(marker,expectedLeaseSealSha256,leaseId)==='completed','marker-reason');}catch{fail('marker-binding');}
  const leaseResult=parse(files['lease-result.json'],'lease-result-json');
  check(leaseResult.schemaVersion==='runa-m1-campaign-lease-result/v2'&&leaseResult.leaseId===leaseId
    &&leaseResult.sealSha256===expectedLeaseSealSha256&&leaseResult.completion==='completed'&&leaseResult.failure===null
    &&leaseResult.ambiguousLoad===null&&leaseResult.cleanupVerified===true&&leaseResult.powerRestored===true,'lease-result-terminal');
  check(leaseResult.productionRoutingChanged===false&&leaseResult.protectedDataIncluded===false
    &&leaseResult.inferenceCalledByOperator===false,'lease-result-authority');
  check(Array.isArray(leaseResult.owned)&&leaseResult.owned.length===2
    &&JSON.stringify(leaseResult.owned.map(item=>item.key).sort())===JSON.stringify([config.candidate.key,config.auxiliary.key].sort()),'lease-result-owned');
  const supervisor=parse(files['supervisor-result.json'],'supervisor-json');
  check(supervisor.schemaVersion==='runa-m1-campaign-supervisor-result/v2'&&supervisor.exitCode===0
    &&supervisor.failure===null&&supervisor.zeroResidencyAndPowerRestored===true&&supervisor.productionRoutingChanged===false,'supervisor-terminal');

  const events=files['events.jsonl'].toString('utf8').trim().split(/\r?\n/).map((line,index)=>parse(Buffer.from(line),`event-${index}`));
  check(events.length>0&&events.some(event=>event.type==='start'&&event.sealSha256===expectedLeaseSealSha256
    &&event.config?.leaseId===leaseId),'events-start');
  for(const owned of leaseResult.owned){
    check(events.some(event=>event.type==='load-response'&&event.key===owned.key&&event.value?.status==='loaded'
      &&event.value?.instance_id===owned.id),'events-load');
    check(events.some(event=>event.type==='unload'&&event.key===owned.key&&event.id===owned.id),'events-unload');
  }
  check(events.some(event=>event.type==='telemetry'),'events-telemetry');

  const publication=parse(completionPublicationBytes,'publication-json');
  exactKeys(publication,PUBLICATION_KEYS,'publication-shape');
  for(const name of ['writerSha256','transportScriptSha256','resultSha256','receiptSha256'])check(HEX.test(publication[name]??''),'publication-digest');
  check(Number.isInteger(publication.maximumWrappedChars)&&publication.maximumWrappedChars>0&&publication.maximumWrappedChars<6500,'publication-size');
  const writerSource=canonicalBase64(publication.writerSource,1024*1024,'publication-writer');
  const receiptRaw=canonicalBase64(publication.receiptRaw,65536,'publication-receipt');
  check(sha(writerSource)===publication.writerSha256&&publication.writerSha256===plan.operatorFiles?.['Write-HomeCampaignCompletionV2.ps1'],'publication-writer');
  check(publication.resultSha256===expectedResultSha256&&sha(receiptRaw)===publication.receiptSha256,'publication-binding');
  const receipt=parse(receiptRaw,'receipt-json');exactKeys(receipt,RECEIPT_KEYS,'receipt-shape');
  check(receipt.schemaVersion==='runaai-atomic-completion-publication/v2'&&receipt.leaseId===leaseId
    &&receipt.sealSha256===expectedLeaseSealSha256&&receipt.markerSha256===sha(files['complete.json'])&&receipt.reason==='completed'
    &&receipt.published===true&&receipt.lifecycleCalled===false&&receipt.privateValuesIncluded===false,'receipt-binding');

  const before=validateObservation(beforeFinalObservationBytes,{leaseId,config,phase:'before'});
  const after=validateObservation(afterFinalObservationBytes,{leaseId,config,phase:'after'});
  check(JSON.stringify(before.listeners)===JSON.stringify(after.listeners)
    &&JSON.stringify(before.models.map(model=>model.key))===JSON.stringify(after.models.map(model=>model.key)),'observation-production-state');
  const timeline=[readyAt,instant(result.finishedAt,'result-time'),instant(receipt.time,'receipt-time'),instant(leaseResult.endedAt,'lease-result-time'),
    instant(supervisor.time,'supervisor-time'),instant(before.time,'before-time'),instant(after.time,'after-time')];
  check(timeline.every((value,index)=>index===0||value>=timeline[index-1])&&timeline[2]<expiresAt,'timeline');

  return Object.freeze({schemaVersion:'runaai-m1-completed-campaign-retention-verification/v2',leaseId,
    sourceCommit:expectedSourceCommit,runtimeSealSha256:expectedRuntimeSealSha256,leaseSealSha256:expectedLeaseSealSha256,
    resultSha256:expectedResultSha256,completionMarkerSha256:sha(files['complete.json']),exportPacketSha256:sha(exportPacketBytes),
    completionPublicationSha256:sha(completionPublicationBytes),beforeFinalObservationSha256:sha(beforeFinalObservationBytes),
    afterFinalObservationSha256:sha(afterFinalObservationBytes),completion:'completed',recordedAttempts:result.recordedAttempts,
    cleanupVerified:true,zeroResidency:true,powerRestored:true,ownedTaskRetired:true,productionChanged:false,protectedDataRead:false});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [leaseId,expectedLeaseSealSha256,expectedRuntimeSealSha256,expectedResultSha256,expectedSourceCommit,
    resultPath,exportPath,publicationPath,beforePath,afterPath,...extra]=process.argv.slice(2);
  check(extra.length===0&&afterPath,'arguments');
  console.log(JSON.stringify(verifyCompletedCampaignV2({leaseId,expectedLeaseSealSha256,expectedRuntimeSealSha256,expectedResultSha256,
    expectedSourceCommit,resultBytes:readFileSync(resultPath),exportPacketBytes:readFileSync(exportPath),
    completionPublicationBytes:readFileSync(publicationPath),beforeFinalObservationBytes:readFileSync(beforePath),
    afterFinalObservationBytes:readFileSync(afterPath)}),null,2));
}
