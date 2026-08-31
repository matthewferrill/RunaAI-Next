import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CAMPAIGN_V2_EXTENDED_POLICY} from './lease-v2-contract.mjs';
import {verifyCompletedCampaignV2} from './verify-completed-campaign-v2.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value)+'\n');
const LEASE='20260829-campaign-gemma-r99',SOURCE='a'.repeat(40),RUNTIME='b'.repeat(64);
const [GPU1,GPU2]=CAMPAIGN_V2_EXTENDED_POLICY.gpuUuids;

function fixture(){
  const writer=Buffer.from('synthetic exact completion writer');
  const plan={schemaVersion:'runa-m1-campaign-hardware-plan/v2',createdAt:'2026-08-30T00:00:00Z',createdBeforeLoads:true,
    sourceCommit:SOURCE,host:'RUNA-HOME',node:'v22.22.1',classification:'synthetic-retention-test',policy:CAMPAIGN_V2_EXTENDED_POLICY,
    sourceFiles:{},operatorFiles:{'Write-HomeCampaignCompletionV2.ps1':sha(writer)},runtimeFiles:[],
    auxiliary:{artifact:{key:'embedding',sha256:'c'.repeat(64)}},candidates:[{id:'gemma',candidateId:'gemma-candidate',
      artifact:{id:'gemma',key:'primary',sha256:'d'.repeat(64)}}],inferenceOwnership:'synthetic',leaseOwnership:'synthetic',
    maximumConcurrentPrimaries:1,existingReranker:{changed:false},productionRoutingChanged:false,protectedDataIncluded:false};
  const planBytes=json(plan);
  const config={schemaVersion:'runa-m1-campaign-lease/v2',leaseId:LEASE,candidate:plan.candidates[0].artifact,
    auxiliary:plan.auxiliary.artifact,policy:CAMPAIGN_V2_EXTENDED_POLICY,profile:'campaign-v2-extended',
    campaignHardwarePlanSha256:sha(planBytes),homeRoot:`C:\\synthetic\\${LEASE}`,createdBeforeInference:true,
    inferenceOwner:'root-actual-application-adapters',lifecycleOwner:'roadmap_review'};
  const sealed={'home-campaign-lease-v2.mjs':Buffer.from('worker'),'lease-v2-contract.mjs':Buffer.from('contract-v2'),
    'lease-contract.mjs':Buffer.from('contract'),'Run-HomeCampaignLeaseV2.ps1':Buffer.from('runner'),
    'gguf-metadata.mjs':Buffer.from('gguf'),'campaign-hardware-plan.json':planBytes,'runtime.json':json({files:[]}),
    'lease-config.json':json(config)};
  const sealBytes=json({schemaVersion:'runa-m1-campaign-lease-seal/v2',createdAt:'2026-08-30T00:00:01Z',sourceCommit:SOURCE,
    leaseId:LEASE,createdBeforeModelLoads:true,files:Object.fromEntries(Object.entries(sealed).map(([name,bytes])=>[name,sha(bytes)]))});
  const leaseSeal=sha(sealBytes),readyAt='2026-08-30T00:01:00Z';
  const markerBytes=json({schemaVersion:'runa-m1-campaign-completion/v2',leaseId:LEASE,sealSha256:leaseSeal,reason:'completed'});
  const leaseResult={schemaVersion:'runa-m1-campaign-lease-result/v2',leaseId:LEASE,sealSha256:leaseSeal,
    endedAt:'2026-08-30T00:04:00Z',failure:null,completion:'completed',cleanupVerified:true,powerRestored:true,
    owned:[{key:'primary',id:'primary-instance'},{key:'embedding',id:'embedding-instance'}],ambiguousLoad:null,
    productionRoutingChanged:false,protectedDataIncluded:false,inferenceCalledByOperator:false};
  const events=[{type:'start',sealSha256:leaseSeal,config:{leaseId:LEASE}},
    {type:'load-response',key:'primary',value:{status:'loaded',instance_id:'primary-instance'}},
    {type:'load-response',key:'embedding',value:{status:'loaded',instance_id:'embedding-instance'}},
    {type:'telemetry',gpus:[]},{type:'unload',key:'primary',id:'primary-instance'},
    {type:'unload',key:'embedding',id:'embedding-instance'}];
  const dynamic={'seal.json':sealBytes,'ready.json':json({schemaVersion:'runa-m1-campaign-lease-ready/v2',leaseId:LEASE,
    campaignHardwarePlanSha256:sha(planBytes),sealSha256:leaseSeal,candidateId:'gemma',modelId:'primary',
    primaryInstanceId:'primary-instance',embeddingModelId:'embedding',embeddingInstanceId:'embedding-instance',
    primaryArtifactSha256:'d'.repeat(64),embeddingArtifactSha256:'c'.repeat(64),readyAt,
    expiresAt:new Date(Date.parse(readyAt)+CAMPAIGN_V2_EXTENDED_POLICY.readyLeaseMs).toISOString(),reasoningEffort:'none',completionPath:'synthetic'}),
    'complete.json':markerBytes,'lease-result.json':json(leaseResult),'supervisor-result.json':json({schemaVersion:'runa-m1-campaign-supervisor-result/v2',
      time:'2026-08-30T00:04:01Z',exitCode:0,productionRoutingChanged:false,failure:null,zeroResidencyAndPowerRestored:true}),
    'events.jsonl':Buffer.from(events.map(JSON.stringify).join('\n')+'\n'),'supervisor.jsonl':Buffer.from('{}\n'),
    'worker.json':json({pid:1}),'worker-stdout.txt':Buffer.alloc(0),'worker-stderr.txt':Buffer.alloc(0)};
  const packet={...sealed,...dynamic};
  const exportPacketBytes=json(Object.fromEntries(Object.entries(packet).map(([name,bytes])=>[name,bytes.toString('base64')])));
  const resultBytes=json({schemaVersion:'runaai-m1-candidate-batch-result/v2',candidateId:'gemma-candidate',sourceCommit:SOURCE,
    runtimeSealSha256:RUNTIME,plannedCampaignAttempts:360,plannedCandidateAttempts:120,recordedAttempts:120,
    attempts:Array.from({length:120},(_,id)=>({id})),notExecuted:[],stopCode:null,denominatorChanged:false,
    productionChanged:false,protectedDataRead:false,finishedAt:'2026-08-30T00:02:00Z'});
  const resultSha=sha(resultBytes),receiptRaw=json({published:true,privateValuesIncluded:false,markerSha256:sha(markerBytes),
    lifecycleCalled:false,time:'2026-08-30T00:03:00Z',sealSha256:leaseSeal,leaseId:LEASE,reason:'completed',
    schemaVersion:'runaai-atomic-completion-publication/v2'});
  const completionPublicationBytes=json({writerSha256:sha(writer),writerSource:writer.toString('base64'),
    transportScriptSha256:'e'.repeat(64),maximumWrappedChars:4000,resultSha256:resultSha,
    receiptRaw:receiptRaw.toString('base64'),receiptSha256:sha(receiptRaw)});
  const observation=(time,tasks)=>json({protectedDataIncluded:false,readOnly:true,listeners:[{LocalAddress:'0.0.0.0',LocalPort:1234}],
    time,host:'RUNA-HOME',models:[{key:'primary',loadedInstances:[]},{key:'embedding',loadedInstances:[]}],
    ownedTaskRegistrations:tasks,schemaVersion:'runa-m1-campaign-final-observation/v2',
    gpus:[`0, ${GPU1}, 260.00, 40, 100, 0`,`1, ${GPU2}, 260.00, 40, 100, 0`]});
  return rebuild({writer,plan,config,sealed,dynamic,resultBytes,resultSha,completionPublicationBytes,
    beforeFinalObservationBytes:observation('2026-08-30T00:05:00Z',[{TaskName:`Runa-M1-${LEASE}`,State:3}]),
    afterFinalObservationBytes:observation('2026-08-30T00:06:00Z',[])});
}

function rebuild(state){
  const planBytes=json(state.plan);state.config.campaignHardwarePlanSha256=sha(planBytes);
  state.sealed['campaign-hardware-plan.json']=planBytes;state.sealed['lease-config.json']=json(state.config);
  const sealBytes=json({schemaVersion:'runa-m1-campaign-lease-seal/v2',createdAt:'2026-08-30T00:00:01Z',sourceCommit:SOURCE,
    leaseId:LEASE,createdBeforeModelLoads:true,files:Object.fromEntries(Object.entries(state.sealed).map(([name,bytes])=>[name,sha(bytes)]))});
  const leaseSeal=sha(sealBytes);state.dynamic['seal.json']=sealBytes;
  const rebind=name=>JSON.parse(state.dynamic[name]);
  const ready=rebind('ready.json');ready.campaignHardwarePlanSha256=sha(planBytes);ready.sealSha256=leaseSeal;state.dynamic['ready.json']=json(ready);
  const marker={schemaVersion:'runa-m1-campaign-completion/v2',leaseId:LEASE,sealSha256:leaseSeal,reason:'completed'};
  state.dynamic['complete.json']=json(marker);
  const leaseResult=rebind('lease-result.json');leaseResult.sealSha256=leaseSeal;state.dynamic['lease-result.json']=json(leaseResult);
  const events=state.dynamic['events.jsonl'].toString().trim().split(/\r?\n/).map(JSON.parse);events[0].sealSha256=leaseSeal;
  state.dynamic['events.jsonl']=Buffer.from(events.map(JSON.stringify).join('\n')+'\n');
  const receipt={published:true,privateValuesIncluded:false,markerSha256:sha(state.dynamic['complete.json']),lifecycleCalled:false,
    time:'2026-08-30T00:03:00Z',sealSha256:leaseSeal,leaseId:LEASE,reason:'completed',schemaVersion:'runaai-atomic-completion-publication/v2'};
  const receiptRaw=json(receipt);state.completionPublicationBytes=json({writerSha256:sha(state.writer),writerSource:state.writer.toString('base64'),
    transportScriptSha256:'e'.repeat(64),maximumWrappedChars:4000,resultSha256:state.resultSha,
    receiptRaw:receiptRaw.toString('base64'),receiptSha256:sha(receiptRaw)});
  const packet={...state.sealed,...state.dynamic};
  return {leaseId:LEASE,expectedLeaseSealSha256:leaseSeal,expectedRuntimeSealSha256:RUNTIME,
    expectedResultSha256:state.resultSha,expectedSourceCommit:SOURCE,resultBytes:state.resultBytes,
    exportPacketBytes:json(Object.fromEntries(Object.entries(packet).map(([name,bytes])=>[name,bytes.toString('base64')]))),
    completionPublicationBytes:state.completionPublicationBytes,beforeFinalObservationBytes:state.beforeFinalObservationBytes,
    afterFinalObservationBytes:state.afterFinalObservationBytes};
}

function mutateJson(bytes,mutate){const value=JSON.parse(bytes);mutate(value);return json(value);}
function mutateExport(input,name,mutate){
  const packet=JSON.parse(input.exportPacketBytes),bytes=Buffer.from(packet[name],'base64');packet[name]=mutateJson(bytes,mutate).toString('base64');
  input.exportPacketBytes=json(packet);return input;
}

test('verifies the complete v2 retention chain without granting product qualification',()=>{
  const value=verifyCompletedCampaignV2(fixture());
  assert.equal(value.schemaVersion,'runaai-m1-completed-campaign-retention-verification/v2');
  assert.equal(value.recordedAttempts,120);assert.equal(value.cleanupVerified,true);assert.equal(value.productionChanged,false);
});
test('rejects a result whose bytes do not match the independently expected digest',()=>{
  const input=fixture();input.resultBytes=Buffer.concat([input.resultBytes,Buffer.from(' ')]);
  assert.throws(()=>verifyCompletedCampaignV2(input),/result-digest/);
});
test('rejects a completion publication bound to another result',()=>{
  const input=fixture();input.completionPublicationBytes=mutateJson(input.completionPublicationBytes,value=>value.resultSha256='f'.repeat(64));
  assert.throws(()=>verifyCompletedCampaignV2(input),/publication-binding/);
});
test('rejects a publication receipt bound to another completion marker',()=>{
  const input=fixture(),publication=JSON.parse(input.completionPublicationBytes),receipt=JSON.parse(Buffer.from(publication.receiptRaw,'base64'));
  receipt.markerSha256='f'.repeat(64);const bytes=json(receipt);publication.receiptRaw=bytes.toString('base64');publication.receiptSha256=sha(bytes);
  input.completionPublicationBytes=json(publication);assert.throws(()=>verifyCompletedCampaignV2(input),/receipt-binding/);
});
test('rejects a changed sealed export file',()=>{
  const input=mutateExport(fixture(),'campaign-hardware-plan.json',value=>value.productionRoutingChanged=true);
  assert.throws(()=>verifyCompletedCampaignV2(input),/seal-file-campaign-hardware-plan/);
});
test('rejects a foreign application runtime seal',()=>{
  const input=fixture();input.expectedRuntimeSealSha256='f'.repeat(64);
  assert.throws(()=>verifyCompletedCampaignV2(input),/result-binding/);
});
test('rejects lease cleanup or production-routing claims without terminal proof',()=>{
  const cleanup=mutateExport(fixture(),'lease-result.json',value=>value.cleanupVerified=false);
  assert.throws(()=>verifyCompletedCampaignV2(cleanup),/lease-result-terminal/);
  const route=mutateExport(fixture(),'supervisor-result.json',value=>value.productionRoutingChanged=true);
  assert.throws(()=>verifyCompletedCampaignV2(route),/supervisor-terminal/);
});
test('rejects model residency or incorrect restored power in either final observation',()=>{
  const residency=fixture();residency.afterFinalObservationBytes=mutateJson(residency.afterFinalObservationBytes,value=>value.models[0].loadedInstances.push({id:'live'}));
  assert.throws(()=>verifyCompletedCampaignV2(residency),/after-residency/);
  const power=fixture();power.beforeFinalObservationBytes=mutateJson(power.beforeFinalObservationBytes,value=>value.gpus[0]=`0, ${GPU1}, 160.00, 40, 100, 0`);
  assert.throws(()=>verifyCompletedCampaignV2(power),/before-power/);
});
test('rejects an owned task that was not retired',()=>{
  const input=fixture();input.afterFinalObservationBytes=mutateJson(input.afterFinalObservationBytes,value=>value.ownedTaskRegistrations=[{TaskName:`Runa-M1-${LEASE}`,State:3}]);
  assert.throws(()=>verifyCompletedCampaignV2(input),/after-tasks/);
});
test('rejects changed listener inventory across the final observations',()=>{
  const input=fixture();input.afterFinalObservationBytes=mutateJson(input.afterFinalObservationBytes,value=>value.listeners[0].LocalPort=9999);
  assert.throws(()=>verifyCompletedCampaignV2(input),/observation-production-state/);
});
test('rejects protected-data or mutable final observations',()=>{
  const input=fixture();input.beforeFinalObservationBytes=mutateJson(input.beforeFinalObservationBytes,value=>value.readOnly=false);
  assert.throws(()=>verifyCompletedCampaignV2(input),/before-authority/);
});
test('rejects a swapped source identity and out-of-order retention timeline',()=>{
  const source=fixture();source.expectedSourceCommit='f'.repeat(40);assert.throws(()=>verifyCompletedCampaignV2(source),/result-binding/);
  const time=fixture();time.afterFinalObservationBytes=mutateJson(time.afterFinalObservationBytes,value=>value.time='2026-08-30T00:01:30Z');
  assert.throws(()=>verifyCompletedCampaignV2(time),/timeline/);
});
