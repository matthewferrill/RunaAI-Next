import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {syntheticAssembly} from './deployment.fixtures.mjs';
import {hash} from './assembly.mjs';
import {buildSupervisedCompanion,createClosedCompanionAdapter,validateClosedResult,verifyClosedChildRecords} from './closed-adapter.mjs';
import {POWERSHELL,digest} from './watchdog.mjs';

const read=file=>readFile(new URL(file,import.meta.url));
async function sources(){return {sourceBytes:await read('./fixtures/frozen-9556-deployer.ps1'),childBytes:await read('./Bounded-DeploymentChild.cs'),
  functionsBytes:await read('./Closed-Phase-Functions.ps1'),aclBytes:await read('../../../../gate7e/control/TargetOnlyAcl.cs'),
  wrapperBytes:await read('./Invoke-ClosedCompanionWatchdog.ps1'),jobBytes:await read('./ClosedCompanionJob.cs'),hostBytes:await read('./Watchdog-Host.mjs')};}
async function fixture(){
  const base=await mkdtemp(path.join(tmpdir(),'m1-closed-adapter-')),packageDirectory=path.join(base,'package'),journalDirectory=path.join(base,'journal');
  await mkdir(packageDirectory);await mkdir(journalDirectory);
  const value=syntheticAssembly(),pack=buildSupervisedCompanion(await sources());
  for(const file of pack.files){const destination=path.join(packageDirectory,file.path);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,file.bytes,{flag:'wx'});}
  const held={transitionId:value.descriptor.transitionId,fileSha256:value.descriptor.caddy.candidateClosedSha256,etag:'"synthetic-closed"',pendingMutation:false};
  // Explicit synthetic authority fixtures, not Home readiness or qualification.
  const state={intents:[],results:[],homeChecks:0,heldChecks:0,pending:false};
  const authority={
    async withExclusiveClosedPhase(_descriptor,run){if(state.pending)throw Error('synthetic-unresolved-dispatch');return run();},
    async assertOwnerPrivate(){},async verifyQualification(){},async assertFreshHomeReady(){state.homeChecks++;},
    async assertCurrentClosedPhase(){state.heldChecks++;return {...held};},
    async recordDispatchIntent(record){state.intents.push(record);state.pending=true;},
    async recordDispatchResult(record){state.results.push(record);},
  };
  const options={descriptor:value.descriptor,expectedDescriptorSha256:value.descriptorSha256,manifest:pack.manifest,expectedPackageSha256:pack.packageSha256,
    packageDirectory,journalDirectory,powershellSha256:digest(await readFile(POWERSHELL)),nodeExecutable:process.execPath,
    nodeExecutableSha256:digest(await readFile(process.execPath)),authority};
  return {base,pack,value,held,state,authority,options,async close(){assert.ok(path.resolve(base).startsWith(path.resolve(tmpdir())+path.sep));await rm(base,{recursive:true,force:true});}};
}

test('seven-file assembly preserves frozen app and binds host/runtime limits separately',async()=>{
  const input=await sources(),original=Buffer.from(input.sourceBytes),result=buildSupervisedCompanion(input);
  assert.deepEqual(input.sourceBytes,original);assert.equal(result.files.length,7);assert.equal(result.packageSha256,hash(result.manifest));
  assert.equal(result.manifest.maximumMs,600000);assert.equal(result.manifest.cleanupMs,5000);assert.equal(result.manifest.admissionOpened,false);
  assert.ok(result.files.every(file=>digest(file.bytes)===file.sha256));assert.ok(result.manifest.files['watchdog/Watchdog-Host.mjs']);
});

for(const method of ['withExclusiveClosedPhase','assertOwnerPrivate','verifyQualification','assertFreshHomeReady','assertCurrentClosedPhase','recordDispatchIntent','recordDispatchResult'])
test('concrete adapter requires trusted '+method+' and never accepts a JSON-ready substitute',async()=>{
  const f=await fixture();try{f.authority[method]=true;assert.throws(()=>createClosedCompanionAdapter(f.options),/authority-adapter-required/u);
    assert.deepEqual(await readdir(f.options.journalDirectory),[]);assert.equal(f.state.intents.length,0);
  }finally{await f.close();}
});

for(const phase of ['qualification','home','held','package'])test('pre-dispatch '+phase+' denial leaves no execution intent or process',async()=>{
  const f=await fixture();try{
    if(phase==='qualification')f.authority.verifyQualification=async()=>{throw Error('synthetic-unqualified');};
    if(phase==='home')f.authority.assertFreshHomeReady=async()=>{throw Error('synthetic-home-not-ready');};
    if(phase==='held')f.authority.assertCurrentClosedPhase=async()=>({...f.held,pendingMutation:true});
    if(phase==='package')await writeFile(path.join(f.options.packageDirectory,'watchdog','Watchdog-Host.mjs'),'drift');
    await assert.rejects(createClosedCompanionAdapter(f.options).execute());
    assert.equal(f.state.intents.length,0);assert.deepEqual(await readdir(f.options.journalDirectory),[]);
  }finally{await f.close();}
});

for(const phase of ['home','held'])test('durable outer intent then second '+phase+' check failure stays pending without launch',async()=>{
  const f=await fixture();try{
    if(phase==='home')f.authority.assertFreshHomeReady=async()=>{if(++f.state.homeChecks===2)throw Error('synthetic-home-became-unready');};
    else f.authority.assertCurrentClosedPhase=async()=>({...f.held,etag:++f.state.heldChecks===2?'"changed"':f.held.etag});
    const adapter=createClosedCompanionAdapter(f.options),result=await adapter.execute();
    assert.equal(result.status,'needs-reconciliation');assert.equal(f.state.intents.length,1);assert.equal(f.state.pending,true);
    assert.equal(result.automaticReplayPermitted,false);assert.equal(result.automaticRollbackPermitted,false);
    assert.deepEqual(await readdir(f.options.journalDirectory),['request.json']);
    assert.equal((await adapter.observe(result.requestSha256)).terminalRetained,false);
    await assert.rejects(adapter.execute(),/synthetic-unresolved-dispatch/u);
    assert.equal(f.state.intents.length,1);
  }finally{await f.close();}
});

test('actual generated companion is supervised but rejects synthetic host context before any production reads',async t=>{
  const f=await fixture(),prior=process.env.COMPUTERNAME;
  try{
    const escaped=f.options.journalDirectory.replaceAll("'","''");
    const command=`$ErrorActionPreference='Stop';$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);foreach($s in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($s),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};Set-Acl -LiteralPath '${escaped}' -AclObject $a`;
    const acl=spawnSync(POWERSHELL,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:10000,
      env:{...process.env,PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
    assert.equal(acl.status,0,acl.stderr);
    process.env.COMPUTERNAME='SYNTHETIC-NOT-CONTROL';
    const adapter=createClosedCompanionAdapter(f.options),result=await adapter.execute(),observed=await adapter.observe(result.requestSha256);
    assert.equal(result.status,'needs-reconciliation');assert.equal(result.productionPromoted,false);assert.equal(f.state.pending,true);
    assert.equal(observed.status,'terminal');assert.equal(observed.result.ExitCode,1);assert.equal(observed.result.ActiveProcesses,0);
    assert.equal(observed.result.Stdout,'');assert.ok(observed.result.StderrBytes>0);
    assert.ok(!JSON.stringify(observed).includes('gate7a-ordinary-deploy-owner-context-required'));
    t.diagnostic(JSON.stringify({kind:'actual-fixed-companion-context-denial',result,outerResult:observed.result,productionEffects:false}));
  }finally{if(prior===undefined)delete process.env.COMPUTERNAME;else process.env.COMPUTERNAME=prior;await f.close();}
});

function resultFixture(){
  const {descriptor}=syntheticAssembly(),held={fileSha256:descriptor.caddy.candidateClosedSha256,etag:'"synthetic"'};
  const prepared={requestSha256:'d'.repeat(64),request:{operationId:'e'.repeat(32),descriptorSha256:hash(descriptor),packageSha256:'f'.repeat(64),
    createdAt:'2026-08-28T00:00:00Z',deadline:'2026-08-28T00:10:00Z'}};
  const value={schemaVersion:'runaai-m1-closed-deployment/v1',transitionId:descriptor.transitionId,passed:true,deployed:true,
    heldCaddySha256:held.fileSha256,heldCaddyETag:held.etag,admissionOpened:false,caddyPublicationDeferred:true,childReceipts:[],
    releaseId:descriptor.application.releaseId,commit:descriptor.application.sourceCommit,artifactDigest:descriptor.application.artifactDigest,
    selectedCoreAuthorityUnchanged:true,ownerProofRebound:true,ownerRouteUnchanged:true,ordinaryPasswordRouteReady:true,
    applicationAndCaddyChangedTogether:false,applicationChangedWhileAdmissionClosed:true,rollbackRetained:true,legacyModified:false,
    protectedProductDataChanged:false,javascriptSandboxReady:true,m1FunctionsReady:true,privateValuesIncluded:false};
  const observation={status:'terminal',terminalRetained:true,operationId:prepared.request.operationId,requestSha256:prepared.requestSha256,
    packageSha256:prepared.request.packageSha256,transitionId:descriptor.transitionId,descriptorSha256:hash(descriptor),
    result:{ExitCode:0,ProcessStartedAt:'2026-08-28T00:00:01Z',FinishedAt:'2026-08-28T00:00:30Z',Stdout:JSON.stringify(value)}};
  return {descriptor,held,prepared,value,observation};
}
test('exact typed result accepts only its new operation and current closed phase, not model-like success text',()=>{
  const f=resultFixture();assert.deepEqual(validateClosedResult(f),f.value);
  for(const mutate of [v=>v.observation.operationId='1'.repeat(32),v=>v.observation.requestSha256='2'.repeat(64),
    v=>v.observation.packageSha256='3'.repeat(64),v=>v.observation.transitionId='4'.repeat(32),
    v=>v.observation.result.ProcessStartedAt='2026-08-27T00:00:01Z',v=>v.observation.result.FinishedAt='2026-08-28T00:10:06Z',
    v=>v.observation.result.ExitCode=1,v=>v.observation.status='needs-reconciliation',
    v=>v.observation.result.Stdout='success',v=>v.observation.result.Stdout=JSON.stringify({...v.value,extra:true}),
    v=>v.observation.result.Stdout=JSON.stringify({...v.value,admissionOpened:true}),v=>v.held.etag='"changed"']){
    const changed=resultFixture();mutate(changed);assert.throws(()=>validateClosedResult(changed));
  }
});

async function childFixture(){
  const directory=await mkdtemp(path.join(tmpdir(),'m1-child-binding-')),receipts=[],transitionId='b'.repeat(32);
  const persist=async(value,suffix)=>{const raw=Buffer.from(JSON.stringify(value));await writeFile(path.join(directory,value.childId+'-'+suffix+'.json'),raw);receipts.push(value);return digest(raw);};
  let number=1;
  for(const [operation,maximumMs]of Object.entries({'caddy-validate':20000,'archive-extract':120000,qualification:60000,'owner-rebind':60000})){
    const childId=(number++).toString(16).padStart(32,'0'),common={childId,transitionId,operation,maximumMs,argumentsSha256:'c'.repeat(64),executableSha256:'d'.repeat(64),privateValuesIncluded:false};
    const intent={...common,schemaVersion:'runaai-m1-deployment-child-intent/v1',stage:'intent',preparedAt:'2026-08-28T00:00:02Z'},intentSha256=await persist(intent,'intent');
    const identity={processId:100+number,processStartedAt:'2026-08-28T00:00:03Z'},start={...common,...identity,schemaVersion:'runaai-m1-deployment-child-started/v1',stage:'started',intentSha256,observedAt:'2026-08-28T00:00:04Z'};
    const startedRecordSha256=await persist(start,'started');
    await persist({...common,...identity,schemaVersion:'runaai-m1-deployment-child/v1',stage:'terminal',intentSha256,startedRecordSha256,
      started:true,stopConfirmed:true,outputComplete:true,timedOut:false,outputLimited:false,outcome:'terminal',exitCode:0,
      stdoutBytes:0,stderrBytes:0,finishedAt:'2026-08-28T00:00:05Z'},'terminal');
  }
  return {directory,transitionId,receipts,notBefore:'2026-08-28T00:00:01Z',notAfter:'2026-08-28T00:00:30Z',assertOwnerPrivate:async()=>{}};
}
test('twelve actual files cross-bind synthetic command records; old completed records cannot certify a fresh execution',async()=>{
  const f=await childFixture();try{
    assert.equal((await verifyClosedChildRecords(f)).recordCount,12);
    await assert.rejects(verifyClosedChildRecords({...f,notBefore:'2026-08-28T00:00:06Z'}),/child-unconfirmed/u);
    await assert.rejects(verifyClosedChildRecords({...f,notAfter:'2026-08-28T00:00:04Z'}),/child-unconfirmed/u);
    await assert.rejects(verifyClosedChildRecords({...f,transitionId:'a'.repeat(32)}),/child-intent/u);
    await assert.rejects(verifyClosedChildRecords({...f,receipts:f.receipts.slice(1)}),/child-receipts/u);
    const terminal=f.receipts.find(value=>value.stage==='terminal'),name=path.join(f.directory,terminal.childId+'-terminal.json');
    const raw=await readFile(name);await writeFile(name,JSON.stringify({...terminal,argumentsSha256:'e'.repeat(64)}));
    await assert.rejects(verifyClosedChildRecords(f),/child-stdout-binding/u);await writeFile(name,raw);
  }finally{assert.ok(f.directory.startsWith(path.join(tmpdir(),'m1-child-binding-')));await rm(f.directory,{recursive:true,force:true});}
});
