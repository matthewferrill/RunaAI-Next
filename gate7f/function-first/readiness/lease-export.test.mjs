import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';import path from 'node:path';import {sha} from './lease-contract.mjs';
function fixture(t,mutate=()=>{}){
 const root=mkdtempSync(path.join(tmpdir(),'runa-lease-export-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert.match(path.basename(root),/^runa-lease-export-[a-zA-Z0-9]+$/);rmSync(root,{recursive:true});});
 const config=JSON.stringify({leaseId:'synthetic'}),runtime=JSON.stringify({files:[]});
 const seal=JSON.stringify({leaseId:'synthetic',files:{'lease-config.json':sha(config),'runtime.json':sha(runtime)}}),sealHash=sha(seal);
 const result={leaseId:'synthetic',sealSha256:sealHash,owned:[{key:'synthetic',id:'owned'}],cleanupVerified:true,powerRestored:true,
  completion:'completed',failure:null,inferenceCalledByOperator:false,productionRoutingChanged:false,protectedDataIncluded:false};
 const complete={schemaVersion:'runa-m1-smoke-completion/v1',leaseId:'synthetic',sealSha256:sealHash,reason:'completed'};
 const events=[{type:'load-response',key:'synthetic',value:{status:'loaded',instance_id:'owned'}},
  {type:'telemetry',gapMs:5000,freeMemoryBytes:10000000000,gpus:[{temperatureC:40,memoryTotalMiB:23040,memoryUsedMiB:1000}]},
  {type:'unload',key:'synthetic',id:'owned'}];
 const state={result,complete,events,config,runtime};mutate(state);
 const files={'seal.json':seal,'lease-config.json':state.config,'runtime.json':state.runtime,'lease-result.json':JSON.stringify(result),
  'supervisor-result.json':JSON.stringify({exitCode:0,zeroResidencyAndPowerRestored:true}),'complete.json':JSON.stringify(complete),
  'events.jsonl':events.map(JSON.stringify).join('\n')+'\n'};
 const packet=Object.fromEntries(Object.entries(files).map(([n,v])=>[n,Buffer.from(v).toString('base64')]));
 const input=path.join(root,'packet.json');writeFileSync(input,JSON.stringify(packet),{flag:'wx'});
 return spawnSync(process.execPath,[path.join(import.meta.dirname,'collect-lease-export.mjs'),input,path.join(root,'output'),sealHash],{encoding:'utf8',timeout:10000,windowsHide:true});
}
test('lease export checks bindings and never qualifies function quality',t=>{const r=fixture(t);assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout);assert.equal(v.cleanupVerified,true);assert.equal(v.modelFunctionQualityQualified,false);assert.equal(v.peakTemperatureC,40);});
test('lease export rejects changed config bytes despite valid outer base64',t=>{const r=fixture(t,s=>{s.config+=' ';});assert.notEqual(r.status,0);assert.match(r.stderr,/export-pin/);});
test('lease export rejects an unowned claimed instance',t=>{const r=fixture(t,s=>{s.result.owned[0].id='other';});assert.notEqual(r.status,0);assert.match(r.stderr,/export-ownership/);});
test('lease export cannot claim cleanup without exact unload evidence',t=>{const r=fixture(t,s=>{s.events.pop();});assert.notEqual(r.status,0);assert.match(r.stderr,/export-cleanup/);});
test('lease export rejects wrong completion target',t=>{const r=fixture(t,s=>{s.complete.leaseId='other';});assert.notEqual(r.status,0);assert.match(r.stderr,/completion-binding/);});
test('lease export rejects expanded authority',t=>{const r=fixture(t,s=>{s.result.inferenceCalledByOperator=true;});assert.notEqual(r.status,0);assert.match(r.stderr,/export-authority/);});
