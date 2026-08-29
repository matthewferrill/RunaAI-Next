import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {MANIFEST} from './manifest.mjs';
import {sha,assert,CAMPAIGN_V2_POLICY,NOMICS,primaryLoad,validateCampaignV2Policy} from './lease-v2-contract.mjs';

const here=import.meta.dirname,root=path.resolve(here,'../../..'),target=path.resolve(process.argv[2]);
assert(!existsSync(target),'v2-campaign-plan-exists');validateCampaignV2Policy(CAMPAIGN_V2_POLICY);
const sourceNames=['home-campaign-lease-v2.mjs','lease-v2-contract.mjs','lease-contract.mjs','Run-HomeCampaignLeaseV2.ps1'];
const sources=Object.fromEntries(sourceNames.map(name=>[name,sha(readFileSync(path.join(here,name)))]));
sources['gguf-metadata.mjs']=sha(readFileSync(path.join(root,'gate7f/evaluation/home/gguf-metadata.mjs')));
const operatorNames=['Invoke-HomeCampaignLeaseV2.ps1','Write-HomeCampaignCompletionV2.ps1','complete-campaign-v2.mjs',
  'build-campaign-hardware-v2.mjs','build-campaign-lease-v2.mjs'];
const operators=Object.fromEntries(operatorNames.map(name=>[name,sha(readFileSync(path.join(here,name)))]));
const runtime=JSON.parse(readFileSync(path.join(root,'gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json'),'utf8'));
const plan={schemaVersion:'runa-m1-campaign-hardware-plan/v2',createdAt:new Date().toISOString(),createdBeforeLoads:true,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),host:'RUNA-HOME',node:'v22.22.1',
  classification:'prospective-r6-hardware-only-not-functional-qualification',policy:CAMPAIGN_V2_POLICY,sourceFiles:sources,operatorFiles:operators,
  runtimeFiles:runtime.files,auxiliary:{artifact:NOMICS,loadRequest:{model:NOMICS.key,context_length:2048,echo_load_config:true}},
  candidates:MANIFEST.candidates.map(candidate=>({id:candidate.id,candidateId:{gemma:'gemma4-26b-a4b',coder:'qwen3-coder-30b-a3b',qwen36:'qwen36-27b-mtp'}[candidate.id],
    artifact:candidate,loadRequest:primaryLoad(candidate),requestReasoningEffort:candidate.id==='coder'?null:'none'})),
  inferenceOwnership:'root-functional-driver-and-browser-only',leaseOwnership:'roadmap_review',maximumConcurrentPrimaries:1,
  existingReranker:{url:'http://192.168.50.165:8412',changed:false},productionRoutingChanged:false,protectedDataIncluded:false};
const bytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');writeFileSync(target,bytes,{flag:'wx'});
console.log(JSON.stringify({target,hardwareTelemetryPlanSha256:sha(bytes),...plan}));
