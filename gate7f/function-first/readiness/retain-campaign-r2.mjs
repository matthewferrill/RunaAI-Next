import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './lease-contract.mjs';
const here=import.meta.dirname,repository=path.resolve(here,'../../..');
const artifacts=path.join(repository,'artifacts/m1-readiness');
const finalExport=JSON.parse(readFileSync(path.join(artifacts,'20260828-campaign-gemma-r1-final-export.json')));
const files=Object.fromEntries(Object.entries(finalExport).map(([name,value])=>{
  assert.match(name,/^[a-z][a-z-]*\.(?:jsonl|json|mjs|ps1|txt)$/i);return [name,Buffer.from(value,'base64')];}));
const seal=JSON.parse(files['seal.json']),result=JSON.parse(files['lease-result.json']),supervisor=JSON.parse(files['supervisor-result.json']);
assert.equal(sha(files['seal.json']),'3ac3526b578dd6e6a12ce611c4c06b03793e00483e62fe0d19e2cf0c694ee616');
for(const[name,digest]of Object.entries(seal.files))assert.equal(sha(files[name]),digest);
assert.equal(result.completion,'abort');assert.equal(result.cleanupVerified,true);assert.equal(result.powerRestored,true);assert.equal(result.failure,null);
assert.equal(supervisor.zeroResidencyAndPowerRestored,true);assert.equal(supervisor.exitCode,0);
const finalBytes=readFileSync(path.join(artifacts,'20260828-campaign-gemma-r1-final-observation.json')),final=JSON.parse(finalBytes);
assert.equal(final.models.flatMap(m=>m.loadedInstances).length,0);assert.equal(final.ownedTaskRegistrations.length,0);
assert.ok(final.gpus.every(g=>g.split(',')[2].trim()==='260.00'));
const events=files['events.jsonl'].toString().trim().split(/\r?\n/).map(JSON.parse),telemetry=events.filter(e=>e.type==='telemetry');
const outcome=path.join(here,'evidence/20260828-campaign-gemma-r1-outcome');assert.equal(existsSync(outcome),false);mkdirSync(outcome);
for(const[name,bytes]of Object.entries({...files,'final-observation.json':finalBytes}))writeFileSync(path.join(outcome,name),bytes,{flag:'wx'});
const summary={schemaVersion:'runaai-m1-campaign-hardware-outcome/v1',leaseId:result.leaseId,sealSha256:result.sealSha256,
  completion:'abort',hardwareFailure:null,functionalQualityEvaluatedHere:false,applicationAttemptCountsNotInferred:true,
  cleanupVerified:true,powerRestored:true,taskUnregistered:true,finalObservedAt:final.time,
  telemetrySamples:telemetry.length,peakTemperatureC:Math.max(...telemetry.flatMap(t=>t.gpus.map(g=>g.temperatureC))),
  maximumSampleGapMs:Math.max(...telemetry.map(t=>t.gapMs)),minimumFreeHostBytes:Math.min(...telemetry.map(t=>t.freeMemoryBytes)),
  minimumFreeGpuMiB:Math.min(...telemetry.flatMap(t=>t.gpus.map(g=>g.memoryTotalMiB-g.memoryUsedMiB))),
  files:Object.fromEntries(Object.entries({...files,'final-observation.json':finalBytes}).map(([n,b])=>[n,{bytes:b.length,sha256:sha(b)}]))};
writeFileSync(path.join(outcome,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const packetPins={};
for(const id of ['gemma','coder','qwen36']){
  const name=`20260828-campaign-${id}-r2`,from=path.join(artifacts,name),to=path.join(here,'evidence',name);assert.equal(existsSync(to),false);mkdirSync(to);
  const packet=JSON.parse(readFileSync(path.join(from,'transfer.json')));
  for(const[name,value]of Object.entries(packet)){const bytes=Buffer.from(value,'base64');assert.deepEqual(bytes,readFileSync(path.join(from,name)));}
  const nextSeal=JSON.parse(readFileSync(path.join(from,'seal.json')));
  for(const[name,digest]of Object.entries(nextSeal.files))assert.equal(sha(readFileSync(path.join(from,name))),digest);
  assert.equal(nextSeal.files['campaign-hardware-plan.json'],'d4e0d0b96ff4d1c15fb05801dff5c9b0f166c1c308cbbbf4e1a5eeed404e6c80');
  for(const name of [...Object.keys(packet),'transfer.json'])writeFileSync(path.join(to,name),readFileSync(path.join(from,name)),{flag:'wx'});
  packetPins[id]=sha(readFileSync(path.join(to,'seal.json')));
}
console.log(JSON.stringify({outcome:summary,prospectivePacketPins:packetPins,homeChanged:false}));
