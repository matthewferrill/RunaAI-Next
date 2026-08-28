// Local evidence assembly only. A completed hardware lease is never a model-quality pass.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha,validCompletion} from './lease-contract.mjs';

export function completedHardwareOutcome({leaseId,expectedSeal,packet,finalBytes,publicationBytes}){
  assert.match(leaseId,/^20260828-campaign-(?:gemma|coder|qwen36)-r[1-9][0-9]*$/);
  assert.match(expectedSeal,/^[a-f0-9]{64}$/);
  const files=Object.fromEntries(Object.entries(packet).map(([name,value])=>{
    assert.match(name,/^[a-z][a-z-]*\.(?:jsonl|json|mjs|ps1|txt)$/i);
    assert.equal(typeof value,'string');const bytes=Buffer.from(value,'base64');
    assert.equal(bytes.toString('base64'),value);assert.ok(bytes.length<=8388608);return [name,bytes];
  }));
  assert.equal(sha(files['seal.json']),expectedSeal);
  const parse=name=>JSON.parse(files[name]);
  const seal=parse('seal.json'),config=parse('lease-config.json'),result=parse('lease-result.json'),supervisor=parse('supervisor-result.json');
  for(const [name,digest]of Object.entries(seal.files))assert.equal(sha(files[name]),digest);
  for(const value of [seal,config,result])assert.equal(value.leaseId,leaseId);
  assert.equal(result.sealSha256,expectedSeal);assert.equal(result.completion,'completed');
  assert.equal(validCompletion(parse('complete.json'),expectedSeal,leaseId),'completed');
  assert.equal(result.failure,null);assert.equal(result.ambiguousLoad,null);
  assert.equal(result.cleanupVerified,true);assert.equal(result.powerRestored,true);
  for(const field of ['productionRoutingChanged','protectedDataIncluded','inferenceCalledByOperator'])assert.equal(result[field],false);
  assert.equal(supervisor.zeroResidencyAndPowerRestored,true);assert.equal(supervisor.exitCode,0);assert.equal(supervisor.failure,null);
  const publication=JSON.parse(publicationBytes),receiptRaw=Buffer.from(publication.receiptRaw,'base64');
  assert.equal(sha(Buffer.from(publication.writerSource,'base64')),publication.writerSha256);
  assert.equal(sha(receiptRaw),publication.receiptSha256);const receipt=JSON.parse(receiptRaw);
  assert.equal(receipt.schemaVersion,'runaai-atomic-completion-publication/v1');
  assert.equal(receipt.leaseId,leaseId);assert.equal(receipt.sealSha256,expectedSeal);
  assert.equal(receipt.markerSha256,sha(files['complete.json']));assert.equal(receipt.reason,'completed');
  assert.equal(receipt.published,true);assert.equal(receipt.lifecycleCalled,false);assert.equal(receipt.privateValuesIncluded,false);
  const final=JSON.parse(finalBytes);assert.equal(final.host,'RUNA-HOME');
  assert.equal(final.models.flatMap(model=>model.loadedInstances).length,0);assert.equal(final.ownedTaskRegistrations.length,0);
  const gpus=final.gpus.map(line=>line.split(',').map(value=>value.trim()));
  assert.deepEqual(gpus.map(gpu=>gpu[1]).sort(),[...config.policy.gpuUuids].sort());
  assert.ok(gpus.every(gpu=>Number(gpu[2])===config.policy.originalPowerWatts));
  const events=files['events.jsonl'].toString().trim().split(/\r?\n/).map(JSON.parse),telemetry=events.filter(event=>event.type==='telemetry');
  assert.ok(telemetry.length>0);assert.equal(result.owned.length,2);
  assert.deepEqual(result.owned.map(item=>item.key).sort(),[config.candidate.key,config.auxiliary.key].sort());
  for(const owned of result.owned){
    assert.ok(events.some(event=>event.type==='load-response'&&event.key===owned.key&&event.value.instance_id===owned.id&&event.value.status==='loaded'));
    assert.ok(events.some(event=>event.type==='unload'&&event.key===owned.key&&event.id===owned.id));
  }
  const retained={...files,'final-observation.json':finalBytes,'completion-publication.json':publicationBytes};
  const summary={schemaVersion:'runaai-m1-campaign-hardware-outcome/v1',leaseId,sealSha256:expectedSeal,
    completion:'completed',hardwareFailure:null,functionalQualityEvaluatedHere:false,applicationAttemptCountsNotInferred:true,
    cleanupVerified:true,powerRestored:true,taskUnregistered:true,finalObservedAt:final.time,telemetrySamples:telemetry.length,
    peakTemperatureC:Math.max(...telemetry.flatMap(sample=>sample.gpus.map(gpu=>gpu.temperatureC))),
    maximumSampleGapMs:Math.max(...telemetry.map(sample=>sample.gapMs)),minimumFreeHostBytes:Math.min(...telemetry.map(sample=>sample.freeMemoryBytes)),
    minimumFreeGpuMiB:Math.min(...telemetry.flatMap(sample=>sample.gpus.map(gpu=>gpu.memoryTotalMiB-gpu.memoryUsedMiB))),
    files:Object.fromEntries(Object.entries(retained).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:sha(bytes)}]))};
  return {retained,summary};
}

if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){
  const [leaseId,expectedSeal,...extra]=process.argv.slice(2);assert.equal(extra.length,0);
  const artifacts=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness');
  const {retained,summary}=completedHardwareOutcome({leaseId,expectedSeal,
    packet:JSON.parse(readFileSync(path.join(artifacts,leaseId+'-export.json'))),
    finalBytes:readFileSync(path.join(artifacts,leaseId+'-final.json')),
    publicationBytes:readFileSync(path.join(artifacts,leaseId+'-completion-publication.json'))});
  const output=path.join(import.meta.dirname,'evidence',leaseId+'-outcome');assert.equal(existsSync(output),false);mkdirSync(output);
  for(const[name,bytes]of Object.entries(retained))writeFileSync(path.join(output,name),bytes,{flag:'wx'});
  writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(summary));
}
