import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CAMPAIGN_V2_POLICY,CAMPAIGN_V2_EXTENDED_POLICY,policyForV2Lease,validateCampaignV2Policy,
  validateCampaignV2ExtendedPolicy,validV2Completion,validV2BatchResult,campaignV2Windows,campaignV2Profile} from './lease-v2-contract.mjs';

const config=()=>({schemaVersion:'runa-m1-campaign-lease/v2',leaseId:'20260829-campaign-qwen36-r1',profile:'campaign-v2',policy:CAMPAIGN_V2_POLICY});
test('v2 exact70/82/86 policy preserves full60minute batch and arithmetic',()=>{
  const policy=policyForV2Lease(config());assert.equal(policy.readyLeaseMs,70*60000);assert.equal(policy.maximumBatchMs,60*60000);
  assert.equal(policy.minimumLaunchRemainingMs,63*60000);assert.equal(policy.dispatchStopMarginMs,4*60000);
  assert.equal(policy.publicationMarginMs,3*60000);assert.equal(policy.workerDeadlineMs,82*60000);
  assert.equal(policy.runnerFinalizationMs,60000);assert.equal(policy.completionPublicationMs,120000);
  assert.equal(policy.supervisorDeadlineMs,86*60000);assert.equal(policy.taskDeadlineMs,86*60000);
  assert.equal(policy.preparationMs+policy.readyLeaseMs+policy.ownedCleanupMs,policy.workerDeadlineMs);
  assert.equal(policy.workerDeadlineMs+policy.independentRecoveryMs,policy.taskDeadlineMs);
});
test('extended profile is exact85/97/101 and preserves the full75minute measured batch',()=>{
  const extended={...config(),profile:'campaign-v2-extended',policy:CAMPAIGN_V2_EXTENDED_POLICY};
  const policy=policyForV2Lease(extended);assert.equal(policy.readyLeaseMs,85*60000);assert.equal(policy.maximumBatchMs,75*60000);
  assert.equal(policy.minimumLaunchRemainingMs,78*60000);assert.equal(policy.workerDeadlineMs,97*60000);
  assert.equal(policy.supervisorDeadlineMs,101*60000);assert.equal(policy.taskDeadlineMs,101*60000);
  assert.equal(validateCampaignV2ExtendedPolicy(policy),policy);assert.throws(()=>validateCampaignV2Policy(policy));
  assert.equal(campaignV2Profile(JSON.parse(JSON.stringify(policy))),'campaign-v2-extended');
});
test('v2 rejects v1 schema, old policy and every changed margin or ceiling',()=>{
  assert.throws(()=>policyForV2Lease({...config(),schemaVersion:'runa-m1-campaign-lease/v1'}));
  assert.throws(()=>policyForV2Lease({...config(),leaseId:'20260828-campaign-qwen36-r1'}));
  for(const key of ['readyLeaseMs','maximumBatchMs','minimumLaunchRemainingMs','dispatchStopMarginMs','publicationMarginMs','ownedCleanupMs',
    'runnerFinalizationMs','completionPublicationMs','workerDeadlineMs','independentRecoveryMs','supervisorDeadlineMs','taskDeadlineMs']){
    assert.throws(()=>validateCampaignV2Policy({...CAMPAIGN_V2_POLICY,[key]:CAMPAIGN_V2_POLICY[key]+1}),key);
  }
});
test('v2 window derives exact launch dispatch hardstop and expiry boundaries',()=>{
  const ready=Date.parse('2026-08-29T12:00:00.000Z'),value=campaignV2Windows({readyAt:ready,now:ready});
  assert.equal(value.expiresAt,ready+70*60000);assert.equal(value.latestLaunchAt,ready+7*60000);
  assert.equal(value.dispatchStopAt,ready+66*60000);assert.equal(value.applicationHardStopAt,ready+67*60000);
});
test('v2 completion is exact and cannot be relabeled from v1',()=>{
  const value={schemaVersion:'runa-m1-campaign-completion/v2',leaseId:config().leaseId,sealSha256:'a'.repeat(64),reason:'completed'};
  assert.equal(validV2Completion(value,value.sealSha256,value.leaseId),'completed');
  for(const mutate of [item=>item.schemaVersion='runa-m1-campaign-completion/v1',item=>item.leaseId='other',item=>item.reason='retry',item=>item.extra=true]){
    const changed=structuredClone(value);mutate(changed);assert.throws(()=>validV2Completion(changed,value.sealSha256,value.leaseId));
  }
});
test('v2 completion publication requires a terminal synced v2 batch result',()=>{
  const value={schemaVersion:'runaai-m1-candidate-batch-result/v2',runtimeSealSha256:'a'.repeat(64),plannedCandidateAttempts:120,
    recordedAttempts:120,attempts:Array(120).fill({}),notExecuted:[],stopCode:null,productionChanged:false,protectedDataRead:false};
  assert.equal(validV2BatchResult(value,'completed'),value);
  for(const mutate of [item=>item.schemaVersion='runaai-m1-candidate-batch-result/v1',item=>item.recordedAttempts=119,
    item=>item.notExecuted=['missing'],item=>item.stopCode='late',item=>item.productionChanged=true]){
    const changed=structuredClone(value);mutate(changed);assert.throws(()=>validV2BatchResult(changed,'completed'));
  }
  const aborted={...value,recordedAttempts:119,attempts:Array(119).fill({}),notExecuted:['slot'],stopCode:'operator-stop'};
  assert.equal(validV2BatchResult(aborted,'abort'),aborted);
});
test('actual PowerShell v2 publisher closes bytes, refuses duplicate and rejects at-expiry clock',async t=>{
  if(process.platform!=='win32'){t.skip('Windows PowerShell contract');return;}
  const root=await mkdtemp(path.join(tmpdir(),'m1-completion-v2-'));t.after(async()=>rm(root,{recursive:true,force:true}));
  const source=path.join(import.meta.dirname,'Write-HomeCampaignCompletionV2.ps1');
  const ps=`. '${source.replaceAll("'","''")}' -LibraryOnly\n`+
    `$ready=[pscustomobject]@{schemaVersion='runa-m1-campaign-lease-ready/v2';readyAt='2026-08-29T12:00:00.000Z';expiresAt='2026-08-29T13:10:00.000Z'}\n`+
    `Assert-PublicationWindowV2 $ready ([DateTime]'2026-08-29T13:09:59.999Z')\n`+
    `$bytes=[Text.UTF8Encoding]::new($false).GetBytes('{"schemaVersion":"runa-m1-campaign-completion/v2"}')\n`+
    `$null=Publish-ClosedCompletionV2 '${root.replaceAll("'","''")}' $bytes\n`+
    `try{$null=Publish-ClosedCompletionV2 '${root.replaceAll("'","''")}' $bytes;throw 'duplicate-accepted'}catch{if($_.Exception.Message-cne'completion-v2-already-published'){throw}}\n`+
    `try{Assert-PublicationWindowV2 $ready ([DateTime]'2026-08-29T13:10:00.000Z');throw 'expiry-accepted'}catch{if($_.Exception.Message-cne'completion-v2-expired'){throw}}\nexit 0`;
  const encoded=Buffer.from(ps,'utf16le').toString('base64'),result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',encoded],{timeout:10000,windowsHide:true,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.error?.message);
  assert.equal((await readFile(path.join(root,'complete.json'),'utf8')),'{"schemaVersion":"runa-m1-campaign-completion/v2"}');
});
test('PowerShell supervisor and dispatcher pin finite legacy and extended ceilings and only the v2 worker',async()=>{
  const supervisor=await readFile(path.join(import.meta.dirname,'Run-HomeCampaignLeaseV2.ps1'),'utf8');
  const invoke=await readFile(path.join(import.meta.dirname,'Invoke-HomeCampaignLeaseV2.ps1'),'utf8');
  const completion=await readFile(path.join(import.meta.dirname,'complete-campaign-v2.mjs'),'utf8');
  assert.match(supervisor,/workerDeadlineMs-eq4920000/u);assert.match(supervisor,/workerDeadlineMs-eq5820000/u);
  assert.match(supervisor,/supervisorDeadlineMs-eq5160000/u);assert.match(supervisor,/supervisorDeadlineMs-eq6060000/u);
  assert.match(supervisor,/home-campaign-lease-v2\.mjs/u);assert.doesNotMatch(supervisor,/home-smoke-lease\.mjs/u);
  assert.match(invoke,/\$minutes=101/u);assert.match(invoke,/\$minutes=86/u);assert.doesNotMatch(invoke,/New-TimeSpan -Minutes 74/u);
  assert.ok(completion.indexOf('validV2BatchResult(JSON.parse(resultBytes),reason)')<completion.indexOf("execFileSync('ssh.exe'"));
});
test('v2 watchdog keeps hardware telemetry but does not query LM Studio during its load transaction',async()=>{
  const worker=await readFile(path.join(import.meta.dirname,'home-campaign-lease-v2.mjs'),'utf8');
  assert.match(worker,/async function sample\(verifyResidency=true\)/u);
  assert.match(worker,/checkHardware\(value,expectedPower\);\s*if\(verifyResidency\)checkResidents/u);
  assert.match(worker,/sample\(phase!=='loading'\)\.catch/u);
  assert.match(worker,/controller\.signal\.throwIfAborted\(\);checkResidents\(await api\('\/api\/v1\/models'\),owned\);/u);
  assert.match(worker,/const found=checkResidents\(await api\('\/api\/v1\/models'\),owned\)/u);
});
test('all v2 PowerShell operators parse under Windows PowerShell',()=>{
  if(process.platform!=='win32')return;
  for(const name of ['Run-HomeCampaignLeaseV2.ps1','Invoke-HomeCampaignLeaseV2.ps1','Write-HomeCampaignCompletionV2.ps1']){
    const filename=path.join(import.meta.dirname,name).replaceAll("'","''");
    const script=`$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${filename}',[ref]$t,[ref]$e);if($e.Count){$e|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1}`;
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:10000,windowsHide:true});
  }
});
