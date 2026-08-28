import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {MANIFEST} from './manifest.mjs';
import {sha,assert,LEASE_POLICY,NOMICS} from './lease-contract.mjs';
const here=import.meta.dirname,root=path.resolve(here,'../../..');
const candidate=MANIFEST.candidates.find(c=>c.id===process.argv[2]),leaseId=process.argv[3];
assert(candidate&&new RegExp(`^20260828-smoke-${candidate.id}-r[1-9][0-9]*$`).test(leaseId),'builder-arguments');
const target=path.join(root,'artifacts/m1-readiness',leaseId);assert(!existsSync(target),'package-exists');mkdirSync(target,{recursive:true});
const config={schemaVersion:'runa-m1-smoke-lease/v1',leaseId,candidate,auxiliary:NOMICS,policy:LEASE_POLICY,
  homeRoot:'C:\\Users\\codex-audit\\AppData\\Local\\RunaM1Readiness\\'+leaseId,
  createdBeforeInference:true,inferenceOwner:'root-actual-application-adapters',lifecycleOwner:'roadmap_review'};
const files={};for(const name of ['home-smoke-lease.mjs','lease-contract.mjs','Run-HomeSmokeLease.ps1'])files[name]=readFileSync(path.join(here,name));
files['gguf-metadata.mjs']=readFileSync(path.join(root,'gate7f/evaluation/home/gguf-metadata.mjs'));
files['runtime.json']=readFileSync(path.join(root,'gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json'));
files['lease-config.json']=Buffer.from(JSON.stringify(config,null,2)+'\n');
const seal={schemaVersion:'runa-m1-smoke-lease-seal/v1',createdAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),leaseId,createdBeforeModelLoads:true,
  files:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)]))};
files['seal.json']=Buffer.from(JSON.stringify(seal,null,2)+'\n');
for(const[n,b]of Object.entries(files))writeFileSync(path.join(target,n),b,{flag:'wx'});
writeFileSync(path.join(target,'transfer.json'),JSON.stringify(Object.fromEntries(Object.entries(files).map(([n,b])=>[n,b.toString('base64')]))),{flag:'wx'});
console.log(JSON.stringify({target,sealSha256:sha(files['seal.json']),...seal}));
