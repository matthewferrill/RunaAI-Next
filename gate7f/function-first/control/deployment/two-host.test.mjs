import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {syntheticAssembly} from './deployment.fixtures.mjs';
import {buildSupervisedCompanion} from './closed-adapter.mjs';
import {OwnerDeploymentJournal} from './owner-journal.mjs';
import {createTwoHostDeploymentCoordinator,validateOwnerActivationAuthority} from './two-host.mjs';
import {APPLICATION,hash} from './assembly.mjs';

const id=n=>n.toString(16).padStart(32,'0'),sha=n=>n.toString(16).padStart(64,'0'),clockValue=Date.parse('2026-08-29T00:00:05.000Z');
const read=file=>readFile(new URL(file,import.meta.url));
async function pack(){return buildSupervisedCompanion({sourceBytes:await read('./fixtures/frozen-9556-deployer.ps1'),childBytes:await read('./Bounded-DeploymentChild.cs'),
  functionsBytes:await read('./Closed-Phase-Functions.ps1'),aclBytes:await read('../../../../gate7e/control/TargetOnlyAcl.cs'),
  wrapperBytes:await read('./Invoke-ClosedCompanionWatchdog.ps1'),jobBytes:await read('./ClosedCompanionJob.cs'),hostBytes:await read('./Watchdog-Host.mjs')});}
const samples=()=>[2,3,4].map(second=>({observedAt:`2026-08-29T00:00:0${second}.000Z`,numRequests:0}));
function closure(transitionId){const entry=(callerId,endpoint,intent=2,receipt=3)=>({callerId,endpoint,authorityId:callerId.startsWith('legacy')?'legacy-admission-v1':'next-caddy-v2',
  intentId:id(intent),terminalReceiptSha256:sha(receipt),observationSha256:sha(receipt+1),samples:samples()});
  return {schemaVersion:'runaai-managed-native-closure/v1',transitionId,observedAt:'2026-08-29T00:00:05.000Z',pendingEffect:null,entries:[
    entry('next-provider-9770','127.0.0.1:9770',10,11),entry('legacy-primary-1234','192.168.50.165:1234'),entry('legacy-embedding-1234','192.168.50.165:1234'),
    {callerId:'home-native-1234',endpoint:'192.168.50.165:1234',authorityId:'home-native-observer-v1',intentId:id(20),terminalReceiptSha256:sha(21),
      observationSha256:sha(22),observedAt:'2026-08-29T00:00:04.500Z',established:0,engineSha256:sha(23),descriptorSha256:sha(24)},
    {callerId:'legacy-reranker-8412',endpoint:'192.168.50.165:8412',authorityId:'legacy-reranker-observer-v1',intentId:id(30),terminalReceiptSha256:sha(31),
      observationSha256:sha(32),observedAt:'2026-08-29T00:00:04.500Z',available:true,expectedSha256:sha(33),currentSha256:sha(33)}],privateValuesIncluded:false};}
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'m1-two-host-')),directory=path.join(root,'journal');await mkdir(directory);
  const value=syntheticAssembly(),manifest=(await pack()).manifest,binding={schemaVersion:'runaai-owner-deployment-binding/v1',transitionId:value.descriptor.transitionId,
    descriptorSha256:value.descriptorSha256,packageSha256:hash(manifest)},journal=new OwnerDeploymentJournal({directory,binding,assertOwnerPrivate:async()=>{}});
  const state={calls:[],app:'predecessor',sequence:100};
  const qualification={observe:async()=>({schemaVersion:'runaai-owner-qualification-receipt/v1',transitionId:value.descriptor.transitionId,descriptorSha256:value.descriptorSha256,
    sourceCommit:APPLICATION.sourceCommit,runtimeSealSha256:APPLICATION.runtimeSealSha256,acceptanceGradesSha256:value.descriptor.qualification.acceptanceGradesSha256,
    observedAt:'2026-08-29T00:00:04.000Z',expiresAt:'2026-08-29T00:00:08.000Z',evidenceSha256:sha(40),privateValuesIncluded:false})};
  const homeReceipt=()=>({schemaVersion:'runaai-owner-home-readiness-receipt/v1',transitionId:value.descriptor.transitionId,descriptorSha256:value.descriptorSha256,
    installationSha256:value.descriptor.home.installationSha256,profileSha256:value.descriptor.home.profileSha256,observedAt:'2026-08-29T00:00:04.000Z',
    expiresAt:'2026-08-29T00:00:08.000Z',evidenceSha256:sha(41),taskProcessConfirmed:true,nativeConfirmed:true,mtlsConfirmed:true,privateValuesIncluded:false});
  const managedCallers={close:async()=>{state.calls.push('closure.close');return closure(value.descriptor.transitionId);},
    assertFresh:async()=>{state.calls.push('closure.fresh');return closure(value.descriptor.transitionId);},
    restore:async({forwardReceiptSha256})=>({schemaVersion:'runaai-managed-native-closure-restore/v1',transitionId:value.descriptor.transitionId,forwardReceiptSha256,
      observedAt:'2026-08-29T00:00:05.000Z',pendingEffect:null,effects:[
        {scope:'next-provider-9770',authorityId:'next-caddy-v2',forwardIntentId:id(10),restoreIntentId:id(50),terminalReceiptSha256:sha(51),observationSha256:sha(52)},
        {scope:'legacy-primary-embedding-1234',authorityId:'legacy-admission-v1',forwardIntentId:id(2),restoreIntentId:id(53),terminalReceiptSha256:sha(54),observationSha256:sha(55)}],privateValuesIncluded:false})};
  const home={apply:async()=>{state.calls.push('home.apply');return {schemaVersion:'runaai-native-settings-transition/v1',transactionId:value.descriptor.transitionId,passed:true,
      stage:'jit-denial-proved',admissionOpened:false,productionPromoted:false,powerRestored:false};},confirm:async()=>{state.calls.push('home.confirm');return homeReceipt();},
    restore:async()=>{state.calls.push('home.restore');return {schemaVersion:'runaai-native-settings-restore/v1',transactionId:value.descriptor.transitionId,passed:true,
      admissionOpened:false,productionPromoted:false,powerRestored:false};}};
  const control={prepare:async({phase})=>({phase,fileSha256:phase==='candidate-caddy'?value.descriptor.caddy.candidateClosedSha256:value.descriptor.caddy.finalSha256,
      configSha256:phase==='candidate-caddy'?sha(60):sha(61)}),publish:async({phase,plan})=>{state.calls.push('caddy.'+phase);return {schemaVersion:'runaai-owner-caddy-publication/v1',
      transitionId:value.descriptor.transitionId,phase,mutationId:id(++state.sequence),fromFileSha256:sha(62),toFileSha256:plan.fileSha256,fromConfigSha256:sha(63),
      toConfigSha256:plan.configSha256,expectedEtag:'"synthetic"',observedEtag:'"synthetic"',terminalReceiptSha256:sha(64),evidenceSha256:sha(65),
      observedAt:'2026-08-29T00:00:05.000Z',pendingMutation:null,privateValuesIncluded:false};},restoreInitialClosed:async()=>{state.calls.push('caddy.restore');return {
      schemaVersion:'runaai-owner-caddy-restore/v1',transitionId:value.descriptor.transitionId,passed:true,currentFileSha256:value.descriptor.caddy.initialClosedSha256,pendingMutation:null};}};
  const application={observe:async({expected})=>{state.calls.push('app.observe.'+expected);const target=expected==='predecessor'?value.descriptor.predecessor:value.descriptor.application;
      return {schemaVersion:'runaai-control-application-observation/v1',releaseId:target.releaseId,commit:expected==='predecessor'?target.commit:target.sourceCommit,
        artifactDigest:target.artifactDigest,observedAt:'2026-08-29T00:00:05.000Z',evidenceSha256:sha(expected==='predecessor'?70:71),admissionClosed:true,privateValuesIncluded:false};},
    restore:async({operationId})=>{state.calls.push('app.restore');state.app='predecessor';return {schemaVersion:'runaai-owner-application-restore/v1',transitionId:value.descriptor.transitionId,
      forwardOperationId:operationId,passed:true,releaseId:value.descriptor.predecessor.releaseId,commit:value.descriptor.predecessor.commit,
      artifactDigest:value.descriptor.predecessor.artifactDigest,admissionOpened:false};}};
  const closedAdapter={execute:async()=>{state.calls.push('app.deploy');const writerId=id(80),operationId=id(81),requestSha256=sha(82);
    await journal.record({type:'writer-intent',writerId,transitionId:value.descriptor.transitionId,startedAt:'2026-08-29T00:00:05.000Z'});
    await journal.record({type:'dispatch-intent',writerId,transitionId:value.descriptor.transitionId,operationId,requestSha256,descriptorSha256:value.descriptorSha256,
      packageSha256:hash(manifest),deadline:'2026-08-29T00:00:50.000Z'});
    await journal.record({type:'dispatch-result',writerId,transitionId:value.descriptor.transitionId,operationId,requestSha256,descriptorSha256:value.descriptorSha256,
      packageSha256:hash(manifest),status:'closed-deployment-complete',resultSha256:sha(83),recordedAt:'2026-08-29T00:00:05.000Z'});
    await journal.record({type:'writer-result',writerId,transitionId:value.descriptor.transitionId,outcome:'succeeded',recordedAt:'2026-08-29T00:00:05.000Z'});
    state.app='successor';return {status:'closed-deployment-complete'};}};
  let next=90;const options={descriptor:value.descriptor,manifest,journal,qualification,managedCallers,home,control,application,closedAdapter,
    allowSyntheticFixture:true,clock:()=>clockValue,randomId:()=>id(next++)};
  return {root,value,manifest,journal,state,options,coordinator:createTwoHostDeploymentCoordinator(options),async close(){await rm(root,{recursive:true,force:true});}};}

test('one-effect continuation records exact closure home caddy app and final order',async()=>{const f=await fixture();try{
  const results=[];for(let index=0;index<6;index++)results.push(await f.coordinator.advance());
  assert.deepEqual(results.map(value=>value.status),['advanced','advanced','advanced','advanced','advanced','complete']);
  assert.deepEqual(results.slice(0,5).map(value=>value.kind),['managed-closure','home-apply','candidate-caddy','application-observed','final-caddy']);
  assert.equal(results[5].productionPromoted,true);assert.ok(f.state.calls.indexOf('closure.close')<f.state.calls.indexOf('home.apply'));
  assert.ok(f.state.calls.indexOf('caddy.candidate-caddy')<f.state.calls.indexOf('app.deploy'));
  assert.ok(f.state.calls.indexOf('app.observe.successor')<f.state.calls.indexOf('caddy.final-caddy'));
}finally{await f.close();}});

test('Next-only closure stays unknown and cannot retry or rollback',async()=>{const f=await fixture();try{
  f.options.managedCallers.close=async()=>{const value=closure(f.value.descriptor.transitionId);value.entries=value.entries.filter(entry=>entry.callerId==='next-provider-9770');return value;};
  const coordinator=createTwoHostDeploymentCoordinator(f.options),first=await coordinator.advance();assert.equal(first.status,'needs-reconciliation');
  assert.equal((await coordinator.advance()).status,'needs-reconciliation');assert.equal((await coordinator.rollback()).status,'needs-reconciliation');
  assert.equal(f.state.calls.includes('home.apply'),false);
}finally{await f.close();}});

test('owner command return without fresh Home confirmation stays unknown before Caddy or app',async()=>{const f=await fixture();try{
  await f.coordinator.advance();f.options.home.confirm=async()=>({ready:true});const coordinator=createTwoHostDeploymentCoordinator(f.options),result=await coordinator.advance();
  assert.equal(result.status,'needs-reconciliation');assert.equal(f.state.calls.includes('caddy.candidate-caddy'),false);assert.equal(f.state.calls.includes('app.deploy'),false);
}finally{await f.close();}});

test('successor observation is mandatory before final publication',async()=>{const f=await fixture();try{
  await f.coordinator.advance();await f.coordinator.advance();await f.coordinator.advance();f.options.application.observe=async({expected})=>{
    const target=expected==='predecessor'?f.value.descriptor.predecessor:f.value.descriptor.application;return {schemaVersion:'runaai-control-application-observation/v1',
      releaseId:target.releaseId,commit:expected==='predecessor'?target.commit:'f'.repeat(40),artifactDigest:target.artifactDigest,
      observedAt:'2026-08-29T00:00:05.000Z',evidenceSha256:sha(99),admissionClosed:true,privateValuesIncluded:false};};
  const coordinator=createTwoHostDeploymentCoordinator(f.options),first=await coordinator.advance();assert.equal(first.status,'needs-reconciliation');
  assert.equal(f.state.calls.includes('caddy.final-caddy'),false);const state=await f.journal.load();assert.equal(state.applicationObservation,null);
  assert.equal((await coordinator.rollback()).status,'needs-reconciliation');
  const deploymentCalls=f.state.calls.filter(value=>value==='app.deploy').length;f.options.application.observe=async({expected})=>{
    const target=expected==='predecessor'?f.value.descriptor.predecessor:f.value.descriptor.application;return {schemaVersion:'runaai-control-application-observation/v1',
      releaseId:target.releaseId,commit:expected==='predecessor'?target.commit:target.sourceCommit,artifactDigest:target.artifactDigest,
      observedAt:'2026-08-29T00:00:05.000Z',evidenceSha256:sha(98),admissionClosed:true,privateValuesIncluded:false};};
  assert.equal((await createTwoHostDeploymentCoordinator(f.options).advance()).kind,'application-observed');
  assert.equal(f.state.calls.filter(value=>value==='app.deploy').length,deploymentCalls);
}finally{await f.close();}});

test('diagnostic descriptor cannot construct a live coordinator without a future activation authority',async()=>{const f=await fixture();try{
  const options={...f.options,allowSyntheticFixture:false,activationAuthority:{observe:async()=>({activationPermitted:true})}};
  assert.throws(()=>createTwoHostDeploymentCoordinator(options),/activation-blocked/u);
}finally{await f.close();}});

test('activation authority binds exact future descriptor package and qualification',async()=>{const f=await fixture();try{
  const descriptor=structuredClone(f.value.descriptor);descriptor.activationPermitted=true;descriptor.blockers=[];
  const receipt={schemaVersion:'runaai-owner-activation-authority/v1',transitionId:descriptor.transitionId,descriptorSha256:hash(descriptor),
    packageSha256:hash(f.manifest),sourceCommit:descriptor.application.sourceCommit,runtimeSealSha256:descriptor.qualification.runtimeSealSha256,
    acceptanceGradesSha256:descriptor.qualification.acceptanceGradesSha256,observedAt:'2026-08-29T00:00:04.000Z',expiresAt:'2026-08-29T00:00:08.000Z',
    evidenceSha256:sha(97),activationPermitted:true,privateValuesIncluded:false};
  assert.equal(validateOwnerActivationAuthority(receipt,descriptor,f.manifest,()=>clockValue).activationPermitted,true);
  assert.throws(()=>validateOwnerActivationAuthority({...receipt,packageSha256:sha(1)},descriptor,f.manifest,()=>clockValue),/activation-authority/u);
  assert.throws(()=>validateOwnerActivationAuthority({...receipt,ready:true},descriptor,f.manifest,()=>clockValue),/activation-authority/u);
}finally{await f.close();}});

test('candidate-only rollback restores Caddy before Home and caller admission',async()=>{const f=await fixture();try{
  await f.coordinator.advance();await f.coordinator.advance();await f.coordinator.advance();
  const results=[];for(let index=0;index<4;index++)results.push(await f.coordinator.rollback());
  assert.deepEqual(results.map(value=>value.kind??value.status),['caddy-restore','home-restore','caller-restore','restored']);
  assert.deepEqual(f.state.calls.filter(value=>['caddy.restore','home.restore'].includes(value)),['caddy.restore','home.restore']);
}finally{await f.close();}});

test('rollback is reverse ordered and consumes exact forward receipts',async()=>{const f=await fixture();try{
  for(let index=0;index<6;index++)await f.coordinator.advance();const results=[];for(let index=0;index<5;index++)results.push(await f.coordinator.rollback());
  assert.deepEqual(results.map(value=>value.kind??value.status),['caddy-restore','application-restore','home-restore','caller-restore','restored']);
  const tail=f.state.calls.filter(value=>['caddy.restore','app.restore','home.restore'].includes(value));assert.deepEqual(tail,['caddy.restore','app.restore','home.restore']);
}finally{await f.close();}});
