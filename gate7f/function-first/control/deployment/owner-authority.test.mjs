import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {syntheticAssembly} from './deployment.fixtures.mjs';
import {buildSupervisedCompanion} from './closed-adapter.mjs';
import {OwnerDeploymentJournal} from './owner-journal.mjs';
import {createOwnerDeploymentAuthority,validateOwnerHomeReceipt} from './owner-authority.mjs';
import {configDigest,digest} from '../quiescence/coordinator.mjs';
import {APPLICATION,hash} from './assembly.mjs';

const id=n=>n.toString(16).padStart(32,'0'),sha=n=>n.toString(16).padStart(64,'0');
const clockValue=Date.parse('2026-08-29T00:00:02.000Z'),read=file=>readFile(new URL(file,import.meta.url));
async function sources(){return {sourceBytes:await read('./fixtures/frozen-9556-deployer.ps1'),childBytes:await read('./Bounded-DeploymentChild.cs'),
  functionsBytes:await read('./Closed-Phase-Functions.ps1'),aclBytes:await read('../../../../gate7e/control/TargetOnlyAcl.cs'),
  wrapperBytes:await read('./Invoke-ClosedCompanionWatchdog.ps1'),jobBytes:await read('./ClosedCompanionJob.cs'),hostBytes:await read('./Watchdog-Host.mjs')};}
function quiescence(value){const original=value.input.caddy.originalBytes,overlay=value.input.caddy.initialClosedBytes,
  originalConfig={routes:['original']},overlayConfig={routes:['closed']},mutation={mutationId:id(60),direction:'admission',
    fromConfigSha256:configDigest(originalConfig),toConfigSha256:configDigest(overlayConfig),expectedEtag:'"old"',status:'succeeded'};
  mutation.terminalReceipt={schemaVersion:'runaai-caddy-mutation-result/v1',mutationId:mutation.mutationId,direction:mutation.direction,
    fromConfigSha256:mutation.fromConfigSha256,toConfigSha256:mutation.toConfigSha256,expectedEtag:mutation.expectedEtag,
    outcome:'succeeded',completedAt:'2026-08-29T00:00:00.000Z'};
  return {schemaVersion:'runaai-caddy-quiescence/v2',revision:8,transitionId:value.descriptor.transitionId,scopes:[
    {siteAddress:'https://192.168.50.169:9761',mode:'api'},{siteAddress:'https://runa.bridgebuildersai.com',mode:'api'},
    {siteAddress:'http://127.0.0.1:9770',mode:'all'}],upstreams:['home-primary'],originalBase64:original.toString('base64'),overlayBase64:overlay.toString('base64'),
    originalSha256:digest(original),overlaySha256:digest(overlay),originalConfig,overlayConfig,
    originalConfigSha256:configDigest(originalConfig),overlayConfigSha256:configDigest(overlayConfig),phase:'control-quiescent',
    mutations:[mutation],events:[{phase:'control-quiescent',at:'2026-08-29T00:00:01.000Z'}],scope:'selected-caddy-proxied-requests-only',homeQuiescenceProved:false};}
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'m1-owner-authority-')),directory=path.join(root,'journal');await mkdir(directory);
  const value=syntheticAssembly(),pack=buildSupervisedCompanion(await sources()),binding={schemaVersion:'runaai-owner-deployment-binding/v1',
    transitionId:value.descriptor.transitionId,descriptorSha256:value.descriptorSha256,packageSha256:pack.packageSha256};
  const journal=new OwnerDeploymentJournal({directory,binding,assertOwnerPrivate:async()=>{}}),candidateConfig={routes:['candidate']};
  const inputSha256=hash({phase:'candidate-caddy',fileSha256:value.descriptor.caddy.candidateClosedSha256,configSha256:configDigest(candidateConfig)});
  await journal.record({type:'effect-intent',effectId:id(70),transitionId:value.descriptor.transitionId,kind:'candidate-caddy',inputSha256,recordedAt:'2026-08-29T00:00:00.000Z'});
  await journal.record({type:'effect-result',effectId:id(70),transitionId:value.descriptor.transitionId,kind:'candidate-caddy',inputSha256,outcome:'succeeded',receiptSha256:sha(71),recordedAt:'2026-08-29T00:00:01.000Z'});
  const qualification={observe:async()=>({schemaVersion:'runaai-owner-qualification-receipt/v1',transitionId:value.descriptor.transitionId,
    descriptorSha256:value.descriptorSha256,sourceCommit:APPLICATION.sourceCommit,runtimeSealSha256:APPLICATION.runtimeSealSha256,
    acceptanceGradesSha256:value.descriptor.qualification.acceptanceGradesSha256,observedAt:'2026-08-29T00:00:01.000Z',expiresAt:'2026-08-29T00:00:05.000Z',
    evidenceSha256:sha(80),privateValuesIncluded:false})};
  const home={observe:async()=>({schemaVersion:'runaai-owner-home-readiness-receipt/v1',transitionId:value.descriptor.transitionId,
    descriptorSha256:value.descriptorSha256,installationSha256:value.descriptor.home.installationSha256,profileSha256:value.descriptor.home.profileSha256,
    taskIdentitySha256:sha(82),processIdentitySha256:sha(83),nativeObservationSha256:sha(84),mtlsEnrollmentId:value.descriptor.home.enrollmentId,
    tlsOperatorDescriptorSha256:value.descriptor.home.tlsOperatorDescriptorSha256,
    observedAt:'2026-08-29T00:00:01.000Z',expiresAt:'2026-08-29T00:00:05.000Z',evidenceSha256:sha(81),taskProcessConfirmed:true,
    nativeConfirmed:true,mtlsConfirmed:true,privateValuesIncluded:false})};
  const options={descriptor:value.descriptor,manifest:pack.manifest,journal,quiescenceJournal:{load:async()=>quiescence(value)},
    caddyFile:{read:async()=>Buffer.from(value.input.caddy.candidateClosedBytes)},caddyAdmin:{adapt:async()=>structuredClone(candidateConfig),
      snapshot:async()=>({config:structuredClone(candidateConfig),etag:'"candidate"'})},qualification,home,assertOwnerPrivate:async()=>{},clock:()=>clockValue,randomId:()=>id(90)};
  return {root,value,pack,journal,options,authority:createOwnerDeploymentAuthority(options),async close(){await rm(root,{recursive:true,force:true});}};}

test('exact current writer may continue its own dispatch and settle it',async()=>{const f=await fixture();try{
  const result=await f.authority.withExclusiveClosedPhase(f.value.descriptor,async()=>{
    await f.authority.verifyQualification();await f.authority.assertFreshHomeReady();const before=await f.authority.assertCurrentClosedPhase(f.value.descriptor);
    assert.equal(before.activeDispatch,null);const dispatch={transitionId:f.value.descriptor.transitionId,operationId:id(91),requestSha256:sha(92),
      descriptorSha256:f.value.descriptorSha256,packageSha256:f.pack.packageSha256,deadline:'2026-08-29T00:00:50.000Z'};
    await f.authority.recordDispatchIntent(dispatch);const expected=Object.fromEntries(['operationId','requestSha256','descriptorSha256','packageSha256'].map(key=>[key,dispatch[key]]));
    assert.deepEqual((await f.authority.assertCurrentClosedPhase(f.value.descriptor,expected)).activeDispatch,expected);
    await f.authority.recordDispatchResult({schemaVersion:'runaai-m1-closed-adapter-result/v1',status:'closed-deployment-complete',
      transitionId:dispatch.transitionId,operationId:dispatch.operationId,requestSha256:dispatch.requestSha256,descriptorSha256:dispatch.descriptorSha256,
      packageSha256:dispatch.packageSha256,releaseId:'synthetic',admissionOpened:false,productionPromoted:false,automaticRollbackPermitted:false,automaticReplayPermitted:false});
    return {status:'closed-deployment-complete'};
  });
  assert.equal(result.status,'closed-deployment-complete');const state=await f.journal.load();assert.equal(state.pendingWriter,null);assert.equal(state.pendingDispatch,null);
}finally{await f.close();}});

test('foreign dispatch, pending Caddy mutation and runtime drift fail closed',async()=>{const f=await fixture();try{
  await assert.rejects(f.authority.withExclusiveClosedPhase(f.value.descriptor,async()=>{
    const dispatch={transitionId:f.value.descriptor.transitionId,operationId:id(91),requestSha256:sha(92),descriptorSha256:f.value.descriptorSha256,
      packageSha256:f.pack.packageSha256,deadline:'2026-08-29T00:00:50.000Z'};await f.authority.recordDispatchIntent(dispatch);
    await f.authority.assertCurrentClosedPhase(f.value.descriptor,{operationId:id(99),requestSha256:sha(92),descriptorSha256:f.value.descriptorSha256,packageSha256:f.pack.packageSha256});
  }),/dispatch/u);assert.equal((await f.journal.load()).pendingWriter,id(90));
}finally{await f.close();}
  const pending=await fixture();try{const q=quiescence(pending.value);q.mutations[0].status='unknown';q.mutations[0].terminalReceipt=null;
    pending.options.quiescenceJournal.load=async()=>q;const authority=createOwnerDeploymentAuthority(pending.options);
    await assert.rejects(authority.withExclusiveClosedPhase(pending.value.descriptor,()=>authority.assertCurrentClosedPhase(pending.value.descriptor)),/quiescence/u);
  }finally{await pending.close();}
  const drift=await fixture();try{drift.options.caddyAdmin.snapshot=async()=>({config:{routes:['foreign']},etag:'"foreign"'});
    const authority=createOwnerDeploymentAuthority(drift.options);await assert.rejects(authority.withExclusiveClosedPhase(drift.value.descriptor,()=>authority.assertCurrentClosedPhase(drift.value.descriptor)),/caddy-runtime/u);
  }finally{await drift.close();}});

test('stale or boolean qualification and Home claims never authorize',async()=>{const f=await fixture();try{
  f.options.qualification.observe=async()=>({ready:true});let authority=createOwnerDeploymentAuthority(f.options);
  await assert.rejects(authority.withExclusiveClosedPhase(f.value.descriptor,()=>authority.verifyQualification()),/qualification/u);
}finally{await f.close();}
  const h=await fixture();try{h.options.home.observe=async()=>({...await h.options.qualification.observe(),schemaVersion:'runaai-owner-home-readiness-receipt/v1'});
    const authority=createOwnerDeploymentAuthority(h.options);await assert.rejects(authority.withExclusiveClosedPhase(h.value.descriptor,()=>authority.assertFreshHomeReady()),/home/u);
  }finally{await h.close();}});

test('Home readiness requires exact task process native and mTLS bindings, not confirmation booleans',async()=>{const f=await fixture();try{
  const valid=await f.options.home.observe();
  for(const key of ['taskIdentitySha256','processIdentitySha256','nativeObservationSha256','mtlsEnrollmentId','tlsOperatorDescriptorSha256']){
    const value=structuredClone(valid);delete value[key];assert.throws(()=>validateOwnerHomeReceipt(value,f.value.descriptor,()=>clockValue),/home/u,key);
  }
  assert.throws(()=>validateOwnerHomeReceipt({...valid,mtlsEnrollmentId:'foreign-enrollment'},f.value.descriptor,()=>clockValue),/home/u);
  assert.throws(()=>validateOwnerHomeReceipt({schemaVersion:valid.schemaVersion,transitionId:valid.transitionId,
    taskProcessConfirmed:true,nativeConfirmed:true,mtlsConfirmed:true},f.value.descriptor,()=>clockValue),/home/u);
}finally{await f.close();}});
