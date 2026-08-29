import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './lease-contract.mjs';
import {retainedCompletionMarker} from './retained-completion-marker.mjs';

// New local retention path for an actual worker failure whose exact-owned cleanup succeeded.
// Do not turn a failed lease into a clean abort or alter the old retention runner/evidence.
const [leaseId,expectedSeal]=process.argv.slice(2);
assert.match(leaseId,/^20260828-campaign-(?:gemma|coder|qwen36)-r[2-9][0-9]*$/);assert.match(expectedSeal,/^[a-f0-9]{64}$/);
const here=import.meta.dirname,repository=path.resolve(here,'../../..'),artifacts=path.join(repository,'artifacts/m1-readiness');
const exported=JSON.parse(readFileSync(path.join(artifacts,`${leaseId}-export.json`)));
const files=Object.fromEntries(Object.entries(exported).map(([name,value])=>{
  assert.match(name,/^[a-z][a-z-]*\.(?:jsonl|json|mjs|ps1|txt)$/i);assert.equal(typeof value,'string');return [name,Buffer.from(value,'base64')];}));
assert.equal(sha(files['seal.json']),expectedSeal);
const seal=JSON.parse(files['seal.json']),result=JSON.parse(files['lease-result.json']),supervisor=JSON.parse(files['supervisor-result.json']);
assert.equal(seal.leaseId,leaseId);assert.equal(result.leaseId,leaseId);assert.equal(result.sealSha256,expectedSeal);
for(const [name,digest]of Object.entries(seal.files))assert.equal(sha(files[name]),digest);
assert.equal(result.completion,null);assert.match(result.failure,/^lease-[a-z0-9-]+$/);
assert.equal(result.cleanupVerified,true);assert.equal(result.powerRestored,true);
assert.equal(supervisor.zeroResidencyAndPowerRestored,true);assert.equal(supervisor.exitCode,1);assert.equal(supervisor.failure,null);
const marker=retainedCompletionMarker(files,expectedSeal,leaseId);
const finalBytes=readFileSync(path.join(artifacts,`${leaseId}-final.json`)),final=JSON.parse(finalBytes);
assert.equal(final.models.flatMap(model=>model.loadedInstances).length,0);assert.equal(final.ownedTaskRegistrations.length,0);
assert.ok(final.gpus.every(gpu=>gpu.split(',')[2].trim()==='260.00'));
const events=files['events.jsonl'].toString().trim().split(/\r?\n/).map(JSON.parse),telemetry=events.filter(event=>event.type==='telemetry');
assert.ok(telemetry.length>0);const retained={...files,'final-observation.json':finalBytes};
const summary={schemaVersion:'runaai-m1-campaign-hardware-outcome/v1',leaseId,sealSha256:expectedSeal,completion:result.completion,
  completionMarkerRetained:marker,hardwareFailure:result.failure,exactFailureCauseEstablished:false,functionalQualityEvaluatedHere:false,
  applicationAttemptCountsNotInferred:true,cleanupVerified:true,powerRestored:true,taskUnregistered:true,finalObservedAt:final.time,
  telemetrySamples:telemetry.length,peakTemperatureC:Math.max(...telemetry.flatMap(sample=>sample.gpus.map(gpu=>gpu.temperatureC))),
  maximumSampleGapMs:Math.max(...telemetry.map(sample=>sample.gapMs)),minimumFreeHostBytes:Math.min(...telemetry.map(sample=>sample.freeMemoryBytes)),
  minimumFreeGpuMiB:Math.min(...telemetry.flatMap(sample=>sample.gpus.map(gpu=>gpu.memoryTotalMiB-gpu.memoryUsedMiB))),
  files:Object.fromEntries(Object.entries(retained).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:sha(bytes)}]))};
const outcome=path.join(here,'evidence',`${leaseId}-outcome`);assert.equal(existsSync(outcome),false);mkdirSync(outcome);
for(const[name,bytes]of Object.entries(retained))writeFileSync(path.join(outcome,name),bytes,{flag:'wx'});
writeFileSync(path.join(outcome,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary));
