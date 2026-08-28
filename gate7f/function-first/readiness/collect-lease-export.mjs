import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {sha,assert,validCompletion} from './lease-contract.mjs';
const input=process.argv[2],output=process.argv[3],expectedSeal=process.argv[4];
assert(input&&output&&/^[a-f0-9]{64}$/.test(expectedSeal)&&!existsSync(output),'export-boundary');
const packet=JSON.parse(readFileSync(input,'utf8')),files={};
const allowed=/^(seal|lease-config|runtime|ready|complete|lease-result|worker|supervisor-result|campaign-hardware-plan)\.json$|^(events|supervisor)\.jsonl$|^worker-(stdout|stderr)\.txt$|^(home-smoke-lease|lease-contract|gguf-metadata)\.mjs$|^Run-HomeSmokeLease\.ps1$/;
for(const [n,v]of Object.entries(packet)){
  assert(allowed.test(n)&&typeof v==='string','export-file');const b=Buffer.from(v,'base64');
  assert(b.length<=8388608&&b.toString('base64')===v,'export-data');files[n]=b;
}
assert(sha(files['seal.json'])===expectedSeal,'export-seal');
const parse=n=>JSON.parse(files[n].toString('utf8'));
const seal=parse('seal.json'),config=parse('lease-config.json'),result=parse('lease-result.json'),supervisor=parse('supervisor-result.json');
assert(sha(files['lease-config.json'])===seal.files['lease-config.json']&&sha(files['runtime.json'])===seal.files['runtime.json'],'export-pin');
for(const [name,hash]of Object.entries(seal.files))if(files[name])assert(sha(files[name])===hash,'export-source-pin');
assert(result.sealSha256===expectedSeal&&result.leaseId===config.leaseId&&seal.leaseId===config.leaseId,'export-binding');
assert(result.inferenceCalledByOperator===false&&result.productionRoutingChanged===false&&result.protectedDataIncluded===false,'export-authority');
const events=files['events.jsonl'].toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
const loads=events.filter(e=>e.type==='load-response'),unloads=events.filter(e=>e.type==='unload');
for(const owned of result.owned)assert(loads.some(l=>l.key===owned.key&&l.value.instance_id===owned.id&&l.value.status==='loaded'),'export-ownership');
if(result.cleanupVerified)for(const owned of result.owned)assert(unloads.some(u=>u.key===owned.key&&u.id===owned.id),'export-cleanup');
if(files['complete.json'])assert(validCompletion(parse('complete.json'),expectedSeal,config.leaseId)===result.completion,'export-completion');
const samples=events.filter(e=>e.type==='telemetry');
const peak=Math.max(0,...samples.flatMap(s=>s.gpus.map(g=>g.temperatureC)));
const maxGap=Math.max(0,...samples.map(s=>s.gapMs));
const summary={leaseId:config.leaseId,sealSha256:expectedSeal,failure:result.failure,completion:result.completion,
  cleanupVerified:result.cleanupVerified,powerRestored:result.powerRestored,supervisorExitCode:supervisor.exitCode,
  supervisorRestorationVerified:supervisor.zeroResidencyAndPowerRestored,peakTemperatureC:peak,maximumSampleGapMs:maxGap,
  minimumFreeHostBytes:Math.min(...samples.map(s=>s.freeMemoryBytes)),
  minimumFreeGpuMiB:Math.min(...samples.flatMap(s=>s.gpus.map(g=>g.memoryTotalMiB-g.memoryUsedMiB))),
  readyAt:files['ready.json']?parse('ready.json').readyAt:null,endedAt:result.endedAt,
  modelFunctionQualityQualified:false,inferenceCalledByOperator:result.inferenceCalledByOperator};
mkdirSync(output,{recursive:true});for(const[n,b]of Object.entries(files))writeFileSync(path.join(output,n),b,{flag:'wx'});
writeFileSync(path.join(output,'EXPORT.json'),JSON.stringify({schemaVersion:'runa-m1-smoke-lease-export/v1',retrievedAt:new Date().toISOString(),
  files:Object.entries(files).map(([name,b])=>({name,bytes:b.length,sha256:sha(b)})),summary},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary));
