import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {processingProofRequest} from './processing-proof-operator.mjs';import {sha} from './processing-proof-contract.mjs';
const here=import.meta.dirname;
function fixture(){const root=mkdtempSync(path.join(tmpdir(),'runa-processing-proof-')),target=path.join(root,'package'),preflight=path.join(root,'preflight.json');
  writeFileSync(preflight,JSON.stringify({schemaVersion:'runaai-native-processing-proof-preflight/v1',observedAt:'2026-08-29T00:00:00.000Z',
    host:'RUNA-HOME',engine:{pid:1234,startedAt:'2026-08-28T00:00:00.000Z',executable:'C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe'},
    engineSha256:'1'.repeat(64),cliSha256:'2'.repeat(64),descriptorSha256:'3'.repeat(64),node:{path:'C:\\Program Files\\nodejs\\node.exe',version:'v22.22.1',sha256:'4'.repeat(64)},
    residentCount:0,gpus:['synthetic-0','synthetic-1'],readOnly:true,privateValuesIncluded:false})+'\n');
  execFileSync(process.execPath,[path.join(here,'build-processing-proof.mjs'),target,preflight,'20260829-native-processing-nomic-r2']);
  const expected=sha(readFileSync(path.join(target,'seal.json')));return {root,target,expected};}
test('prospective package freezes the prior synthetic request and exact separate task identities',()=>{
  const value=fixture();try{const config=JSON.parse(readFileSync(path.join(value.target,'config.json'))),request=JSON.parse(readFileSync(path.join(value.target,'request.json')));
    assert.equal(config.frozenRequest.commit,'35e01bf557881ad4ff10f739c59e55c041ffcdaa');assert.equal(request.input.model,'text-embedding-nomic-embed-text-v1.5');
    assert.equal(config.proofId,'20260829-native-processing-nomic-r2');assert.notEqual(config.mainTask,config.samplerTask);assert.match(config.homeRoot,/^C:\\ProgramData\\RunaAI-Next-ProcessingProof-/);
  }finally{rmSync(value.root,{recursive:true,force:true});}});
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
