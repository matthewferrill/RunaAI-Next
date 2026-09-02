import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {MANIFEST} from './manifest.mjs';
import {sha,assert,CAMPAIGN_V2_POLICY,CAMPAIGN_V2_EXTENDED_POLICY,NOMICS,primaryLoad,
  validateCampaignV2Policy,validateCampaignV2ExtendedPolicy} from './lease-v2-contract.mjs';
import {assertGitPathsMatchCommit} from './exact-source-binding.mjs';

const here=import.meta.dirname,root=path.resolve(here,'../../..'),target=path.resolve(process.argv[2]);
assert(!existsSync(target),'v2-campaign-plan-exists');validateCampaignV2Policy(CAMPAIGN_V2_POLICY);
const classification=process.argv[3]??'prospective-r6-hardware-only-not-functional-qualification';
assert(['prospective-r6-hardware-only-not-functional-qualification','prospective-r7-hardware-only-not-functional-qualification',
  'prospective-r8-hardware-only-not-functional-qualification','prospective-r9-hardware-only-not-functional-qualification',
  'prospective-r15-hardware-only-not-functional-qualification'].includes(classification),'v2-campaign-classification');
const policy=['prospective-r9-hardware-only-not-functional-qualification',
  'prospective-r15-hardware-only-not-functional-qualification'].includes(classification)
  ?CAMPAIGN_V2_EXTENDED_POLICY:CAMPAIGN_V2_POLICY;
if(policy===CAMPAIGN_V2_EXTENDED_POLICY)validateCampaignV2ExtendedPolicy(policy);else validateCampaignV2Policy(policy);
const sourceNames=['home-campaign-lease-v2.mjs','lease-v2-contract.mjs','lease-contract.mjs','Run-HomeCampaignLeaseV2.ps1'];
const sourcePaths=sourceNames.map(name=>path.join('gate7f/function-first/readiness',name));
sourcePaths.push('gate7f/evaluation/home/gguf-metadata.mjs');
const operatorNames=['Invoke-HomeCampaignLeaseV2.ps1','Write-HomeCampaignCompletionV2.ps1','complete-campaign-v2.mjs',
  'build-campaign-hardware-v2.mjs','build-campaign-lease-v2.mjs','exact-source-binding.mjs'];
const operatorPaths=operatorNames.map(name=>path.join('gate7f/function-first/readiness',name));
const archiveSourceCommit=process.argv[4]??null;
let sourceCommit;
if(archiveSourceCommit){
  assert(/^[a-f0-9]{40}$/.test(archiveSourceCommit)&&!existsSync(path.join(root,'.git')),'v2-campaign-archive-source');
  sourceCommit=archiveSourceCommit;
}else{
  sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  assertGitPathsMatchCommit({root,sourceCommit,relativePaths:[...sourcePaths,...operatorPaths]});
}
if(classification==='prospective-r15-hardware-only-not-functional-qualification')
  assert(archiveSourceCommit,'v2-r15-archive-source-required');
const sources=Object.fromEntries(sourceNames.map(name=>[name,sha(readFileSync(path.join(here,name)))]));
sources['gguf-metadata.mjs']=sha(readFileSync(path.join(root,'gate7f/evaluation/home/gguf-metadata.mjs')));
const operators=Object.fromEntries(operatorNames.map(name=>[name,sha(readFileSync(path.join(here,name)))]));
const runtime=JSON.parse(readFileSync(path.join(root,'gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json'),'utf8'));
const plan={schemaVersion:'runa-m1-campaign-hardware-plan/v2',createdAt:new Date().toISOString(),createdBeforeLoads:true,
  sourceCommit,host:'RUNA-HOME',node:'v22.22.1',
  classification,policy,sourceFiles:sources,operatorFiles:operators,
  runtimeFiles:runtime.files,auxiliary:{artifact:NOMICS,loadRequest:{model:NOMICS.key,context_length:2048,echo_load_config:true}},
  candidates:MANIFEST.candidates.map(candidate=>({id:candidate.id,candidateId:{gemma:'gemma4-26b-a4b',coder:'qwen3-coder-30b-a3b',qwen36:'qwen36-27b-mtp'}[candidate.id],
    artifact:candidate,loadRequest:primaryLoad(candidate),requestReasoningEffort:candidate.id==='coder'?null:'none'})),
  inferenceOwnership:'root-functional-driver-and-browser-only',leaseOwnership:'roadmap_review',maximumConcurrentPrimaries:1,
  existingReranker:{url:'http://192.168.50.165:8412',changed:false},productionRoutingChanged:false,protectedDataIncluded:false};
const bytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');writeFileSync(target,bytes,{flag:'wx'});
console.log(JSON.stringify({target,hardwareTelemetryPlanSha256:sha(bytes),...plan}));
