import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {processingProofRequest} from './processing-proof-operator.mjs';import {sha} from './processing-proof-contract.mjs';
const here=import.meta.dirname;
function fixture(){const root=mkdtempSync(path.join(tmpdir(),'runa-processing-proof-')),repository=path.join(root,'repository'),copiedHere=path.join(repository,'gate7f','function-first','home-runtime'),target=path.join(root,'package'),preflight=path.join(root,'preflight.json');
  mkdirSync(copiedHere,{recursive:true});for(const name of ['build-processing-proof.mjs','processing-proof-contract.mjs','processing-proof-worker.mjs','Run-HomeProcessingProof.ps1','Run-HomeProcessingSampler.ps1','Runtime-Windows.ps1'])copyFileSync(path.join(here,name),path.join(copiedHere,name));
  const evidence='gate7f/function-first/readiness/evidence/20260828-actual-adapter-gemma/0017.json',runtime='gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json';
  for(const relative of [evidence,runtime]){const destination=path.join(repository,relative);mkdirSync(path.dirname(destination),{recursive:true});copyFileSync(path.resolve(here,'../../..',relative),destination);}
  writeFileSync(preflight,JSON.stringify({schemaVersion:'runaai-native-processing-proof-preflight/v1',observedAt:'2026-08-29T00:00:00.000Z',
    host:'RUNA-HOME',engine:{pid:1234,startedAt:'2026-08-28T00:00:00.000Z',executable:'C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe'},
    engineSha256:'1'.repeat(64),cliSha256:'2'.repeat(64),descriptorSha256:'3'.repeat(64),node:{path:'C:\\Program Files\\nodejs\\node.exe',version:'v22.22.1',sha256:'4'.repeat(64)},
    residentCount:0,gpus:['synthetic-0','synthetic-1'],readOnly:true,privateValuesIncluded:false})+'\n');
  const identity=path.join(repository,'SOURCE-IDENTITY.json');writeFileSync(identity,JSON.stringify({schemaVersion:'runaai-m1-source-identity/v1',
    sourceCommit:'a'.repeat(40),sourceArchiveSha256:'b'.repeat(64),caseBundleSha256:'c'.repeat(64),qdrantSha256:'d'.repeat(64),productionChanged:false})+'\n');
  const builder=path.join(copiedHere,'build-processing-proof.mjs');execFileSync(process.execPath,[builder,target,preflight,'20260829-native-processing-nomic-r2',identity,sha(readFileSync(identity))]);
  const expected=sha(readFileSync(path.join(target,'seal.json')));return {root,repository,target,expected,identity,builder,preflight};}
test('prospective package freezes the prior synthetic request and exact separate task identities',()=>{
  const value=fixture();try{const config=JSON.parse(readFileSync(path.join(value.target,'config.json'))),request=JSON.parse(readFileSync(path.join(value.target,'request.json')));
    assert.equal(config.frozenRequest.commit,'35e01bf557881ad4ff10f739c59e55c041ffcdaa');assert.equal(request.input.model,'text-embedding-nomic-embed-text-v1.5');
    assert.equal(config.sourceIdentity.sourceCommit,'a'.repeat(40));assert.equal(config.sourceIdentity.sourceArchiveSha256,'b'.repeat(64));
    assert.equal(config.proofId,'20260829-native-processing-nomic-r2');assert.notEqual(config.mainTask,config.samplerTask);assert.match(config.homeRoot,/^C:\\ProgramData\\RunaAI-Next-ProcessingProof-/);
  }finally{rmSync(value.root,{recursive:true,force:true});}});
test('package build has no ambient Git dependency and rejects unsealed source identity',()=>{
  const source=readFileSync(path.join(here,'build-processing-proof.mjs'),'utf8');assert.doesNotMatch(source,/child_process|execFile|git /u);
  const value=fixture();try{
    const foreign=path.join(value.root,'foreign-source-identity.json');writeFileSync(foreign,readFileSync(value.identity));
    assert.throws(()=>execFileSync(process.execPath,[value.builder,path.join(value.root,'foreign-package'),value.preflight,
      '20260829-native-processing-nomic-r3',foreign,sha(readFileSync(foreign))]),/processing-proof-build-arguments/);
    const original=readFileSync(value.identity);writeFileSync(value.identity,'{}\n');
    assert.throws(()=>execFileSync(process.execPath,[value.builder,path.join(value.root,'bad-package'),value.preflight,
      '20260829-native-processing-nomic-r4',value.identity,sha(readFileSync(value.identity))]),/processing-proof-build-source-identity/);
    writeFileSync(value.identity,original);
    assert.throws(()=>execFileSync(process.execPath,[value.builder,path.join(value.root,'mismatch-package'),value.preflight,
      '20260829-native-processing-nomic-r5',value.identity,'0'.repeat(64)]),/processing-proof-build-source-identity-pin/);
  }finally{rmSync(value.root,{recursive:true,force:true});}
});
test('operator modes remain exact-task, owner-sampler and non-production scoped',()=>{
  const value=fixture();try{for(const mode of ['Stage','Dispatch','Ready','Proof','Status','Complete','Abort','ReleaseAbort','RetirePreflightFailure','Export','Cleanup','Final']){
      const request=processingProofRequest(value.target,value.expected,mode),script=Buffer.from(request.input.toString().split('\n')[0],'base64').toString();
      execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$errors=$null;$tokens=$null;[void][Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors);if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1}`],{input:script});
      assert.match(request.nested,/runa-home-codex/);assert.doesNotMatch(script,/Remove-Item|Stop-Service/i);
      if(!['Export','Final'].includes(mode))assert.match(script,/productionRoutingChanged=\$false/);
      assert.ok(request.input.length>0);if(mode==='Proof'){assert.match(script,/RUNA-HOME\\Matthew/);assert.match(script,/Interactive/i);}
    }
  }finally{rmSync(value.root,{recursive:true,force:true});}});
test('sampler safe writes and pre-start abort are rooted and fail closed',()=>{
  const sampler=readFileSync(path.join(here,'Run-HomeProcessingSampler.ps1'),'utf8'),worker=readFileSync(path.join(here,'processing-proof-worker.mjs'),'utf8');
  assert.match(sampler,/\$script:RuntimeRoot=\[IO\.Path\]::GetDirectoryName\(\$root\)/);
  assert.match(worker,/processing-proof-aborted-before-go/);assert.match(worker,/inferenceCalled=false/);
  assert.match(worker,/inferenceCalled=true;await runRequests/);assert.match(worker,/inferenceCalledByOperator:inferenceCalled/);
});
