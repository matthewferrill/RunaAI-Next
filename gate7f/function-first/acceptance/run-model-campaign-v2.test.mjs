import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ACCEPTANCE_POLICY,CASE_BUNDLE_SHA256,MODEL_CASES} from './cases.mjs';
import {newObservation,QDRANT_PIN,sha256} from './runner-contract.mjs';
import {assertCampaignAttemptWindow,campaignExecutionWindow,campaignPlan,executeCandidateAttempts,validateHomeReady} from './run-model-campaign.mjs';
import {CAMPAIGN_V2_POLICY,CAMPAIGN_V2_EXTENDED_POLICY,campaignV2Windows} from '../readiness/lease-v2-contract.mjs';

const hash='a'.repeat(64),hardwareHash='b'.repeat(64),runtimeHash='c'.repeat(64),sourceCommit='d'.repeat(40);
const candidateId='gemma4-26b-a4b',readyAt=Date.parse('2026-08-29T12:00:00.000Z');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const digest=value=>sha256(JSON.stringify(stable(value)));
function seal(){return {schemaVersion:'runaai-m1-functional-runtime-seal/v3',sourceCommit,caseBundleSha256:CASE_BUNDLE_SHA256,
  runtime:{nodeSha256:hash,sourceArchiveSha256:hash,packageLockSha256:hash,qdrantSha256:QDRANT_PIN.sha256,
    modelRuntimeSha256:runtimeHash,modelRuntimeVersion:'model-free-v2-fixture'},
  candidates:ACCEPTANCE_POLICY.roster.map(value=>({candidateId:value.candidateId,modelId:value.candidateId,artifactSha256:hash,artifactBytes:123,
    requestControls:Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role=>[role,{reasoningEffort:'none'}]))})),
  roles:Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role=>[role,{maximumOutputTokens:['code','agent'].includes(role)?1536:512,
    maximumContextTokens:32768,deadlineMs:['code','agent'].includes(role)?30000:60000}])),
  providerBaseUrl:'http://127.0.0.1:9770/v1',embedding:{baseUrl:'http://127.0.0.1:9770/v1',modelId:'text-embedding-nomic-embed-text-v1.5',artifactSha256:hash},
  reranker:{baseUrl:'http://127.0.0.1:8412',artifactSha256:hash,windowCharacters:2000,overlapCharacters:300,batchSize:32},
  residency:{oneLargeModelAtATime:true,readinessEvidenceSha256:hash,effectiveReasoningEvidenceSha256:hash,telemetryPolicySha256:hardwareHash},
  suites:Object.fromEntries(MODEL_CASES.flatMap(item=>(item.setup.suites??[]).map(value=>[value.suiteId,digest(value)]))),
  qualificationCriteria:{schemaVersion:'runaai-m1-r7-qualification-criteria/v1',
    path:'gate7f/function-first/M1-S2-R7-CORRECTIVE-CRITERIA-2026-08-30.md',sha256:hash,normalizedSha256:hash,
    rubricVersion:'2026-08-30.r7-function-contract'},
  evaluatorId:'independent-v2-fixture',maximumBatchMs:3600000,productionRoutingChanged:false};}
function ready(){return {schemaVersion:'runa-m1-campaign-lease-ready/v2',leaseId:'20260829-campaign-gemma-r6',sealSha256:hash,
  campaignHardwarePlanSha256:hardwareHash,candidateId:'gemma',modelId:candidateId,primaryInstanceId:'primary',primaryArtifactSha256:hash,
  embeddingModelId:'text-embedding-nomic-embed-text-v1.5',embeddingInstanceId:'embedding',embeddingArtifactSha256:hash,
  readyAt:new Date(readyAt).toISOString(),expiresAt:new Date(readyAt+CAMPAIGN_V2_POLICY.readyLeaseMs).toISOString(),reasoningEffort:'none'};}
function hardware(){return {schemaVersion:'runa-m1-campaign-hardware-plan/v2',createdBeforeLoads:true,maximumConcurrentPrimaries:1,
  productionRoutingChanged:false,policy:CAMPAIGN_V2_POLICY,candidates:[{candidateId,id:'gemma',artifact:{key:candidateId,sha256:hash,bytes:123},requestReasoningEffort:'none'}],
  auxiliary:{artifact:{sha256:hash}},runtimeFiles:[{sha256:runtimeHash}]};}
function plan(now=readyAt){return campaignPlan({seal:seal(),runtimeSealSha256:hash,candidateId,controlsSha256:hash,readySha256:hash,
  hardwarePlanSha256:hardwareHash,hardwarePolicy:CAMPAIGN_V2_POLICY,ready:ready(),now});}

test('fake clock enforces exact63minute launch window while retaining full60minute batch',()=>{
  const windows=campaignV2Windows({readyAt,now:readyAt});
  const value=plan(windows.latestLaunchAt);assert.equal(value.schemaVersion,'runaai-m1-candidate-batch-plan/v2');
  assert.equal(value.maximumBatchMs,3600000);assert.equal(value.publicationMarginMs,180000);
  assert.equal(value.runnerFinalizationMs,60000);assert.equal(value.completionPublicationMs,120000);
  assert.equal(campaignExecutionWindow(value,ready(),{now:windows.latestLaunchAt}).maximumMs,3600000);
  assert.throws(()=>plan(windows.latestLaunchAt+1),/launch-window-insufficient/u);
});

test('fake clock refuses new attempts at exact4minute cutoff and hard-stops before3minute publication reserve',()=>{
  const value=plan(readyAt),dispatch=Date.parse(value.dispatchStopAt),hard=Date.parse(value.applicationHardStopAt);
  assert.equal(assertCampaignAttemptWindow(value,{now:dispatch-1}),true);
  assert.throws(()=>assertCampaignAttemptWindow(value,{now:dispatch}),/publication-margin/u);
  assert.equal(campaignExecutionWindow(value,ready(),{now:hard-1000}).maximumMs,1000);
  assert.throws(()=>campaignExecutionWindow(value,ready(),{now:hard-999}),/lease-expired/u);
});

test('v2 READY validation binds exact70minute policy and rejects old or widened expiry',()=>{
  validateHomeReady(ready(),hardware(),{seal:seal(),candidateId,hardwarePlanSha256:hardwareHash,now:readyAt+1000});
  const widened=ready();widened.expiresAt=new Date(readyAt+CAMPAIGN_V2_POLICY.readyLeaseMs+1).toISOString();
  assert.throws(()=>validateHomeReady(widened,hardware(),{seal:seal(),candidateId,hardwarePlanSha256:hardwareHash,now:readyAt+1000}),/lease-invalid/u);
  const old=hardware();old.schemaVersion='runa-m1-campaign-hardware-plan/v1';
  assert.throws(()=>validateHomeReady(ready(),old,{seal:seal(),candidateId,hardwarePlanSha256:hardwareHash,now:readyAt+1000}),/lease-invalid/u);
});

test('extended profile retains publication margins and provides the measured75minute batch window',()=>{
  const extendedReady={...ready(),expiresAt:new Date(readyAt+CAMPAIGN_V2_EXTENDED_POLICY.readyLeaseMs).toISOString()};
  const extendedHardware={...hardware(),policy:CAMPAIGN_V2_EXTENDED_POLICY};
  const windows=campaignV2Windows({readyAt,now:readyAt,policy:CAMPAIGN_V2_EXTENDED_POLICY});
  const value=campaignPlan({seal:{...seal(),maximumBatchMs:CAMPAIGN_V2_EXTENDED_POLICY.maximumBatchMs},runtimeSealSha256:hash,
    candidateId,controlsSha256:hash,readySha256:hash,hardwarePlanSha256:hardwareHash,
    hardwarePolicy:CAMPAIGN_V2_EXTENDED_POLICY,ready:extendedReady,now:windows.latestLaunchAt});
  assert.equal(value.maximumBatchMs,75*60000);assert.equal(value.publicationMarginMs,3*60000);
  assert.equal(campaignExecutionWindow(value,extendedReady,{now:windows.latestLaunchAt}).maximumMs,75*60000);
  assert.equal(campaignExecutionWindow(value,extendedReady,{now:windows.latestLaunchAt}).stopCode,'m1-campaign-batch-hard-stop');
  validateHomeReady(extendedReady,extendedHardware,{seal:{...seal(),maximumBatchMs:CAMPAIGN_V2_EXTENDED_POLICY.maximumBatchMs},
    candidateId,hardwarePlanSha256:hardwareHash,now:readyAt+1000});
});

test('owned disposable resources and their watchdog accept exactly the sealed75minute R9 ceiling',async()=>{
  const [resources,watchdog]=await Promise.all([
    readFile(new URL('./owned-control-resources.mjs',import.meta.url),'utf8'),
    readFile(new URL('./owned-control-watchdog.mjs',import.meta.url),'utf8')]);
  assert.match(resources,/maximumMs > 4500000/u);assert.doesNotMatch(resources,/maximumMs > 3600000/u);
  assert.match(watchdog,/duration > 4500000/u);assert.doesNotMatch(watchdog,/duration > 3600000/u);
});

test('hard-stop interruption pauses the started attempt and keeps all120 denominator slots',async()=>{
  const value=plan(readyAt),controller=new AbortController(),starts=[],finishes=[],pauses=[];
  const writer={async started(slot){starts.push(slot.attemptId);},async paused(slot,failure){pauses.push({slot,failure});},async finished(slot){finishes.push(slot.attemptId);return {file:slot.attemptId+'.json',sha256:hash,bytes:1};}};
  const result=await executeCandidateAttempts({plan:value,writer,signal:controller.signal,beforeAttempt:async()=>{},runAttempt:async slot=>{
    controller.abort(Object.assign(Error('m1-campaign-publication-hard-stop'),{code:'m1-campaign-publication-hard-stop'}));
    const observation=newObservation(MODEL_CASES.find(item=>item.id===slot.caseId),{...slot,runtimeSealSha256:hash});
    observation.sourceCommit=sourceCommit;observation.status='interrupted';
    return {observation,grade:{status:'inconclusive',passed:false,criticalProductFailures:[]},unresolved:[]};
  }});
  assert.equal(result.schemaVersion,'runaai-m1-candidate-batch-result/v2');assert.equal(result.recordedAttempts,0);
  assert.equal(result.notExecuted.length,120);assert.equal(result.stopCode,'m1-campaign-publication-hard-stop');
  assert.equal(starts.length,1);assert.equal(finishes.length,0);assert.equal(pauses.length,1);assert.equal(result.denominatorChanged,false);
});

test('existing v1 READY produces the unchanged v1 plan without R6 fields',()=>{
  const oldReady={...ready(),schemaVersion:'runa-m1-campaign-lease-ready/v1',leaseId:'synthetic-campaign-gemma-r5',
    readyAt:new Date(readyAt-1000).toISOString(),expiresAt:new Date(readyAt+3599000).toISOString()};
  const value=campaignPlan({seal:seal(),runtimeSealSha256:hash,candidateId,controlsSha256:hash,readySha256:hash,
    hardwarePlanSha256:hardwareHash,hardwarePolicy:CAMPAIGN_V2_POLICY,ready:oldReady,now:readyAt});
  assert.equal(value.schemaVersion,'runaai-m1-candidate-batch-plan/v1');assert.equal(value.lifecycleVersion,undefined);
  assert.equal(value.publicationMarginMs,undefined);assert.equal(value.maximumBatchMs,3600000);
});
