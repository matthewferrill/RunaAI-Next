import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';import path from 'node:path';
import {NOMIC,demand,sha,validateRequestFixture,validateRequestResult,validateSamplerResult} from './processing-proof-contract.mjs';
const[packetArg,outcome,finalArg,targetArg,...extra]=process.argv.slice(2),packetPath=path.resolve(packetArg??''),target=path.resolve(targetArg??'');
demand(extra.length===0&&['failed-r1','failed-r3','passed-r4'].includes(outcome)&&existsSync(packetPath)&&path.isAbsolute(target)&&!existsSync(target),'retention-args');
const proofId=`20260829-native-processing-nomic-${outcome.slice(-2)}`,packetRaw=readFileSync(packetPath),packet=JSON.parse(packetRaw);
demand(packet&&typeof packet==='object'&&!Array.isArray(packet)&&Object.keys(packet).length>=20,'retention-packet');
const files={};let total=0;for(const[name,encoded]of Object.entries(packet)){
  demand(/^[A-Za-z0-9][A-Za-z0-9.-]{0,127}$/.test(name)&&typeof encoded==='string','retention-name');const raw=Buffer.from(encoded,'base64');
  demand(raw.toString('base64')===encoded&&raw.length<=8*1024*1024,'retention-base64');total+=raw.length;demand(total<=16*1024*1024,'retention-cap');files[name]=raw;
}
const json=name=>{demand(files[name],'retention-file');return JSON.parse(files[name]);},seal=json('seal.json'),sealSha256=sha(files['seal.json']),config=json('config.json');
demand(seal.schemaVersion==='runaai-native-processing-proof-seal/v1'&&seal.proofId===proofId&&config.proofId===proofId
  &&config.productionRoutingChanged===false&&config.settingsChanged===false&&config.syntheticOnly===true,'retention-seal');
for(const[name,pin]of Object.entries(seal.files))demand(files[name]&&sha(files[name])===pin,'retention-source');
validateRequestFixture(json('request.json'));const ready=json('ready.json'),completion=json('complete.json'),lease=json('lease-result.json'),supervisor=json('supervisor-result.json');
demand(ready.proofId===proofId&&ready.sealSha256===sealSha256&&ready.modelId===NOMIC.key&&ready.instanceId===NOMIC.key
  &&completion.proofId===proofId&&completion.sealSha256===sealSha256&&lease.proofId===proofId&&lease.sealSha256===sealSha256
  &&lease.cleanupVerified===true&&lease.powerRestored===true&&lease.ambiguousLoad===null&&lease.productionRoutingChanged===false
  &&lease.settingsChanged===false&&lease.protectedDataIncluded===false&&supervisor.proofId===proofId&&supervisor.sealSha256===sealSha256
  &&supervisor.zeroResidencyAndPowerRestored===true&&supervisor.protectedDataIncluded===false,'retention-lifecycle');
if(outcome==='failed-r1'){
  demand(!files['requests.json']&&!files['sampler-result.json']&&files['samples.jsonl']?.length===0&&completion.reason==='abort'
    &&lease.failure==='processing-proof-go'&&lease.completion===null&&supervisor.workerExitCode===1,'retention-r1');
}else{const sampler=json('sampler-result.json'),requests=json('requests.json');validateRequestResult(requests,{proofId,sealSha256,instanceId:NOMIC.key});
  if(outcome==='failed-r3')demand(sampler.passed===false&&sampler.errorCode==='processing-proof-sampler-model-field'
    &&sampler.sampleCount===0&&completion.reason==='abort'&&lease.completion==='abort'&&supervisor.workerExitCode===0,'retention-r3');
  else{validateSamplerResult(sampler,{proofId,sealSha256,instanceId:NOMIC.key});demand(completion.reason==='completed'&&lease.failure===null
    &&lease.completion==='completed'&&lease.inferenceCalledByOperator===true&&supervisor.workerExitCode===0,'retention-r4');
    const lines=files['samples.jsonl'].toString('utf8').trim().split('\n').map(JSON.parse);demand(lines.length===sampler.sampleCount
      &&lines.some(value=>value.status==='computingEmbedding')&&lines.some(value=>value.queued>0)
      &&lines.every(value=>Object.keys(value).sort().join()==='finishedAt,identifier,modelKey,queued,startedAt,status,type'),'retention-samples');
  }
}
let final=null;if(outcome==='passed-r4'){demand(finalArg&&existsSync(path.resolve(finalArg)),'retention-final');final=JSON.parse(readFileSync(path.resolve(finalArg)));
  demand(final.schemaVersion==='runaai-native-processing-proof-final/v1'&&final.residentCount===0&&Array.isArray(final.ownedTasks)&&final.ownedTasks.length===0
    &&Array.isArray(final.gpus)&&final.gpus.length===2&&final.gpus.every(value=>value.split(',')[2].trim()==='260.00')
    &&Array.isArray(final.listeners)&&[1234,8412].every(port=>final.listeners.some(value=>value.LocalPort===port))
    &&final.readOnly===true&&final.privateValuesIncluded===false,'retention-final');
}
mkdirSync(target);for(const[name,raw]of Object.entries(files))writeFileSync(path.join(target,name),raw,{flag:'wx'});
if(final)writeFileSync(path.join(target,'FINAL.json'),readFileSync(path.resolve(finalArg)),{flag:'wx'});
const manifest={schemaVersion:'runaai-native-processing-proof-retention/v1',proofId,outcome,packetSha256:sha(packetRaw),sealSha256,
  files:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,{bytes:raw.length,sha256:sha(raw)}])),
  finalSha256:final?sha(readFileSync(path.resolve(finalArg))):null,privateValuesIncluded:false};
writeFileSync(path.join(target,'EXPORT.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});process.stdout.write(JSON.stringify(manifest)+'\n');
