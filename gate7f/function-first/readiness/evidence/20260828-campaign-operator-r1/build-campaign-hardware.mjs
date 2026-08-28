import {readFileSync,writeFileSync,existsSync} from 'node:fs';import path from 'node:path';
import {execFileSync} from 'node:child_process';import {MANIFEST} from './manifest.mjs';
import {sha,assert,CAMPAIGN_POLICY,NOMICS,primaryLoad} from './lease-contract.mjs';
const here=import.meta.dirname,root=path.resolve(here,'../../..'),target=path.resolve(process.argv[2]);assert(!existsSync(target),'campaign-plan-exists');
const sources=Object.fromEntries(['home-smoke-lease.mjs','lease-contract.mjs','Run-HomeSmokeLease.ps1'].map(n=>[n,sha(readFileSync(path.join(here,n)))]));
sources['gguf-metadata.mjs']=sha(readFileSync(path.join(root,'gate7f/evaluation/home/gguf-metadata.mjs')));
const operators=Object.fromEntries(['Invoke-HomeSmokeLease.ps1','build-campaign-hardware.mjs','build-smoke-lease.mjs'].map(n=>[n,sha(readFileSync(path.join(here,n)))]));
const runtime=JSON.parse(readFileSync(path.join(root,'gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json'),'utf8'));
const plan={schemaVersion:'runa-m1-campaign-hardware-plan/v1',createdAt:new Date().toISOString(),createdBeforeLoads:true,
 sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),host:'RUNA-HOME',node:'v22.22.1',
 classification:'prospective-hardware-only-not-functional-qualification',policy:CAMPAIGN_POLICY,sourceFiles:sources,operatorFiles:operators,
 runtimeFiles:runtime.files,auxiliary:{artifact:NOMICS,loadRequest:{model:NOMICS.key,context_length:2048,echo_load_config:true}},
 candidates:MANIFEST.candidates.map(c=>({id:c.id,candidateId:{gemma:'gemma4-26b-a4b',coder:'qwen3-coder-30b-a3b',qwen36:'qwen36-27b-mtp'}[c.id],artifact:c,loadRequest:primaryLoad(c),requestReasoningEffort:c.id==='coder'?null:'none'})),
 inferenceOwnership:'root-functional-driver-and-browser-only',leaseOwnership:'roadmap_review',maximumConcurrentPrimaries:1,
 existingReranker:{url:'http://192.168.50.165:8412',changed:false},productionRoutingChanged:false,protectedDataIncluded:false};
const bytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');writeFileSync(target,bytes,{flag:'wx'});
console.log(JSON.stringify({target,hardwareTelemetryPlanSha256:sha(bytes),...plan}));
