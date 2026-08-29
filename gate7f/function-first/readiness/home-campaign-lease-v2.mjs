import {createReadStream,readFileSync,writeFileSync,appendFileSync,lstatSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {hostname,freemem} from 'node:os';
import path from 'node:path';
import {policyForV2Lease,NOMICS,sha,assert,checkHardware,checkResidents,residentList,validV2Completion,primaryLoad} from './lease-v2-contract.mjs';
import {readGgufMetadata} from './gguf-metadata.mjs';

const root=import.meta.dirname,config=JSON.parse(readFileSync(path.join(root,'lease-config.json'),'utf8'));
const P=policyForV2Lease(config),sealBytes=readFileSync(path.join(root,'seal.json')),seal=JSON.parse(sealBytes),sealHash=sha(sealBytes);
assert(hostname().toUpperCase()==='RUNA-HOME'&&process.version==='v22.22.1','v2-host-runtime');
assert(root===config.homeRoot&&seal.schemaVersion==='runa-m1-campaign-lease-seal/v2','v2-root');
for(const [name,hash] of Object.entries(seal.files)){
  assert(/^[a-zA-Z0-9-]+\.(mjs|json|ps1)$/.test(name),'v2-seal-path');
  assert(!lstatSync(path.join(root,name)).isSymbolicLink()&&sha(readFileSync(path.join(root,name)))===hash,'v2-seal-drift');
}
assert(sha(readFileSync(path.join(root,'campaign-hardware-plan.json')))===config.campaignHardwarePlanSha256,'v2-campaign-plan-pin');

const candidate=config.candidate,owned=[],changed=[];
const output=(name,value)=>writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
writeFileSync(path.join(root,'events.jsonl'),'',{flag:'wx'});
const event=(type,value={})=>appendFileSync(path.join(root,'events.jsonl'),JSON.stringify({type,time:new Date().toISOString(),...value})+'\n');
const controller=new AbortController();
let pendingKey=null,sampling=false,lastSample=Date.now(),failure=null,cleanupVerified=false,powerRestored=false,completion=null;
let phase='baseline',expectedPower=260,expiry=null;

async function api(endpoint,body,ms=10000,signal=controller.signal){
  assert(['/api/v1/models','/api/v1/models/load','/api/v1/models/unload'].includes(endpoint),'v2-lifecycle-only');
  const response=await fetch('http://127.0.0.1:1234'+endpoint,{method:body?'POST':'GET',redirect:'error',
    headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.any([AbortSignal.timeout(ms),...(signal?[signal]:[])])});
  const chunks=[];let count=0;for await(const chunk of response.body){count+=chunk.length;assert(count<=1048576,'v2-response-cap');chunks.push(chunk);}
  const raw=Buffer.concat(chunks).toString('utf8');assert(response.ok,'v2-http');return JSON.parse(raw);
}
function hardware(){
  const raw=execFileSync('nvidia-smi.exe',['--query-gpu=index,name,uuid,memory.total,memory.used,temperature.gpu,power.limit,power.draw,utilization.gpu','--format=csv,noheader,nounits'],{encoding:'utf8',timeout:5000,windowsHide:true});
  return {freeMemoryBytes:freemem(),gpus:raw.trim().split(/\r?\n/).map(line=>{const f=line.split(',').map(value=>value.trim());return {index:+f[0],name:f[1],uuid:f[2],memoryTotalMiB:+f[3],memoryUsedMiB:+f[4],temperatureC:+f[5],powerLimitWatts:+f[6],powerWatts:+f[7],utilization:+f[8]};})};
}
async function sample(verifyResidency=true){
  const now=Date.now(),value=hardware();event('telemetry',{phase,...value,gapMs:now-lastSample});
  assert(now-lastSample<=P.maximumGapMs,'v2-telemetry-gap');lastSample=now;checkHardware(value,expectedPower);
  if(verifyResidency)checkResidents(await api('/api/v1/models'),owned,pendingKey);return value;
}
const monitor=setInterval(()=>{if(sampling||phase==='power-transition'||phase==='cleanup')return;sampling=true;
  sample(phase!=='loading').catch(error=>{event('watchdog-failure',{code:error.message});controller.abort(error);}).finally(()=>{sampling=false;});},P.sampleMs);
async function pause(){await new Promise(resolve=>setTimeout(resolve,5000));controller.signal.throwIfAborted();}
async function hash(file){assert(!lstatSync(file).isSymbolicLink(),'v2-pin-link');const digest=createHash('sha256');
  for await(const bytes of createReadStream(file,{highWaterMark:4194304})){controller.signal.throwIfAborted();digest.update(bytes);}return digest.digest('hex');}
function power(uuid,watts){execFileSync('nvidia-smi.exe',['-i',uuid,'-pl',String(watts)],{timeout:5000,windowsHide:true});}
async function load(model,request){
  controller.signal.throwIfAborted();checkResidents(await api('/api/v1/models'),owned);
  pendingKey=model.key;event('load-request',{key:model.key,request});const value=await api('/api/v1/models/load',request,P.loadMs);
  event('load-response',{key:model.key,value});assert(value.status==='loaded'&&typeof value.instance_id==='string','v2-load-response');
  const item={key:model.key,id:value.instance_id};owned.push(item);pendingKey=null;
  const found=checkResidents(await api('/api/v1/models'),owned),resident=found.find(instance=>instance.id===item.id);
  item.fingerprint=sha(JSON.stringify(resident.config));event('owned',{item,loadConfig:value.load_config});
  if(model.key===candidate.key){const c=value.load_config;
    assert(c?.context_length===32768&&c.flash_attention===true&&c.offload_kv_cache_to_gpu===true&&c.speculative_draft_mtp===candidate.mtp
      &&c.speculative_draft_simple===false&&c.speculative_draft_model===''&&sha(c.prompt_template?.template??'')===candidate.templateSha256,'v2-primary-envelope');
    if(candidate.mtp)assert(c.speculative_draft_max_tokens===2&&c.speculative_draft_min_tokens===0&&c.speculative_draft_min_continue_probability===0.75,'v2-mtp-envelope');
  }else assert(value.load_config?.context_length===2048,'v2-embedding-context');return item;
}

const preparationDeadline=setTimeout(()=>controller.abort(Error('lease-v2-preparation-deadline')),P.preparationMs);
try{
  event('start',{config,sealSha256:sealHash,classification:'functional-campaign-v2-hardware-only'});
  assert(residentList(await api('/api/v1/models')).length===0,'v2-unowned-baseline');checkHardware(hardware(),260);
  phase='hashing';for(const model of [candidate,NOMICS]){
    assert(lstatSync(model.artifactPath).size===model.bytes&&await hash(model.artifactPath)===model.sha256,'v2-artifact-drift');
    event('artifact-pin',{key:model.key,sha256:model.sha256,bytes:model.bytes});
  }
  const runtime=JSON.parse(readFileSync(path.join(root,'runtime.json'),'utf8'));
  for(const file of runtime.files){assert(await hash(file.path)===file.sha256,'v2-runtime-drift');event('runtime-pin',{path:file.path,sha256:file.sha256});}
  assert(readGgufMetadata(candidate.artifactPath).chatTemplateSha256===candidate.templateSha256,'v2-template-drift');
  const registry=await api('/api/v1/models');
  assert(registry.models.filter(model=>model.key===candidate.key&&model.size_bytes===candidate.bytes&&model.architecture===candidate.architecture&&model.quantization?.name===candidate.quantization).length===1,'v2-primary-registry');
  assert(registry.models.filter(model=>model.key===NOMICS.key&&model.type==='embedding'&&model.size_bytes===NOMICS.bytes&&model.max_context_length===2048).length===1,'v2-embedding-registry');
  phase='power-transition';for(const uuid of P.gpuUuids){changed.push(uuid);power(uuid,160);}expectedPower=160;event('power-applied',{watts:160});
  phase='cooldown';while(true){const value=await sample();if(value.gpus.every(gpu=>gpu.temperatureC<=45))break;await pause();}
  controller.signal.throwIfAborted();phase='loading';
  const primary=await load(candidate,primaryLoad(candidate));
  const embedding=await load(NOMICS,{model:NOMICS.key,context_length:2048,echo_load_config:true});
  phase='ready';clearTimeout(preparationDeadline);const readyAt=Date.now();expiry=readyAt+P.readyLeaseMs;
  await sample();output('ready.json',{schemaVersion:'runa-m1-campaign-lease-ready/v2',leaseId:config.leaseId,
    campaignHardwarePlanSha256:config.campaignHardwarePlanSha256,sealSha256:sealHash,candidateId:candidate.id,modelId:candidate.key,
    primaryInstanceId:primary.id,embeddingModelId:NOMICS.key,embeddingInstanceId:embedding.id,primaryArtifactSha256:candidate.sha256,
    embeddingArtifactSha256:NOMICS.sha256,readyAt:new Date(readyAt).toISOString(),expiresAt:new Date(expiry).toISOString(),
    reasoningEffort:candidate.id==='coder'?null:'none',completionPath:path.join(root,'complete.json')});
  while(true){controller.signal.throwIfAborted();
    if(existsSync(path.join(root,'complete.json'))){assert(Date.now()<expiry,'v2-late-completion');
      completion=validV2Completion(JSON.parse(readFileSync(path.join(root,'complete.json'),'utf8')),sealHash,config.leaseId);break;}
    assert(Date.now()<expiry,'v2-expired');await pause();
  }
}catch(error){failure=/^lease-[a-z0-9-]+$/.test(error.message)?error.message:'lease-v2-operator-failed';event('failure',{code:failure,errorClass:error.name});}
finally{
  phase='cleanup';clearInterval(monitor);clearTimeout(preparationDeadline);
  try{
    while(sampling)await new Promise(resolve=>setTimeout(resolve,50));
    for(const item of [...owned]){const current=residentList(await api('/api/v1/models',undefined,10000,null));
      assert(current.some(instance=>instance.id===item.id&&instance.key===item.key),'v2-cleanup-ownership');
      event('unload',{key:item.key,id:item.id,value:await api('/api/v1/models/unload',{instance_id:item.id},120000,null)});
    }
    cleanupVerified=residentList(await api('/api/v1/models',undefined,10000,null)).length===0&&pendingKey===null;
    assert(cleanupVerified,'v2-cleanup-unverified');for(const uuid of changed)power(uuid,260);checkHardware(hardware(),260);powerRestored=true;
  }catch(error){event('cleanup-failure',{code:error.message});}
  output('lease-result.json',{schemaVersion:'runa-m1-campaign-lease-result/v2',leaseId:config.leaseId,sealSha256:sealHash,
    endedAt:new Date().toISOString(),failure,completion,cleanupVerified,powerRestored,owned,ambiguousLoad:pendingKey,
    productionRoutingChanged:false,protectedDataIncluded:false,inferenceCalledByOperator:false});
  if(failure||!cleanupVerified||!powerRestored)process.exitCode=1;
}
