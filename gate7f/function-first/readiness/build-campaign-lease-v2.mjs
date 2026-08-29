import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {MANIFEST} from './manifest.mjs';
import {sha,assert,CAMPAIGN_V2_POLICY,NOMICS,validateCampaignV2Policy} from './lease-v2-contract.mjs';

const here=import.meta.dirname,root=path.resolve(here,'../../..');
const candidate=MANIFEST.candidates.find(value=>value.id===process.argv[2]),leaseId=process.argv[3];
assert(candidate&&new RegExp(`^20260829-campaign-${candidate.id}-r[1-9][0-9]*$`).test(leaseId),'v2-builder-arguments');
validateCampaignV2Policy(CAMPAIGN_V2_POLICY);
const campaignBytes=readFileSync(process.argv[4]),plan=JSON.parse(campaignBytes);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert(plan.schemaVersion==='runa-m1-campaign-hardware-plan/v2'&&plan.sourceCommit===sourceCommit,'v2-campaign-plan');
validateCampaignV2Policy(plan.policy);
const target=path.join(root,'artifacts/m1-readiness',leaseId);assert(!existsSync(target),'v2-package-exists');mkdirSync(target,{recursive:true});
const config={schemaVersion:'runa-m1-campaign-lease/v2',leaseId,candidate,auxiliary:NOMICS,policy:CAMPAIGN_V2_POLICY,
  profile:'campaign-v2',campaignHardwarePlanSha256:sha(campaignBytes),homeRoot:'C:\\Users\\codex-audit\\AppData\\Local\\RunaM1Readiness\\'+leaseId,
  createdBeforeInference:true,inferenceOwner:'root-actual-application-adapters',lifecycleOwner:'roadmap_review'};
const sourceNames=['home-campaign-lease-v2.mjs','lease-v2-contract.mjs','lease-contract.mjs','Run-HomeCampaignLeaseV2.ps1'];
const files=Object.fromEntries(sourceNames.map(name=>[name,readFileSync(path.join(here,name))]));
files['gguf-metadata.mjs']=readFileSync(path.join(root,'gate7f/evaluation/home/gguf-metadata.mjs'));
for(const [name,bytes] of Object.entries(files))assert(sha(bytes)===plan.sourceFiles[name],'v2-campaign-source-drift');
for(const name of ['Invoke-HomeCampaignLeaseV2.ps1','Write-HomeCampaignCompletionV2.ps1','complete-campaign-v2.mjs',
  'build-campaign-hardware-v2.mjs','build-campaign-lease-v2.mjs']){
  assert(sha(readFileSync(path.join(here,name)))===plan.operatorFiles[name],'v2-campaign-operator-drift');
}
assert(JSON.stringify(plan.candidates.find(value=>value.id===candidate.id)?.artifact)===JSON.stringify(candidate),'v2-campaign-profile-drift');
files['campaign-hardware-plan.json']=campaignBytes;
files['runtime.json']=readFileSync(path.join(root,'gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json'));
assert(JSON.stringify(plan.runtimeFiles)===JSON.stringify(JSON.parse(files['runtime.json']).files)&&JSON.stringify(plan.auxiliary.artifact)===JSON.stringify(NOMICS),'v2-campaign-runtime-drift');
files['lease-config.json']=Buffer.from(JSON.stringify(config,null,2)+'\n');
const seal={schemaVersion:'runa-m1-campaign-lease-seal/v2',createdAt:new Date().toISOString(),
  sourceCommit,leaseId,createdBeforeModelLoads:true,
  files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,sha(bytes)]))};
files['seal.json']=Buffer.from(JSON.stringify(seal,null,2)+'\n');
for(const [name,bytes] of Object.entries(files))writeFileSync(path.join(target,name),bytes,{flag:'wx'});
writeFileSync(path.join(target,'transfer.json'),JSON.stringify(Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,bytes.toString('base64')]))),{flag:'wx'});
console.log(JSON.stringify({target,sealSha256:sha(files['seal.json']),...seal}));
