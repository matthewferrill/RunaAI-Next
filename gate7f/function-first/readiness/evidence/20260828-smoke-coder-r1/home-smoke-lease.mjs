import {createReadStream,readFileSync,writeFileSync,appendFileSync,lstatSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {hostname,freemem} from 'node:os';
import path from 'node:path';
import {LEASE_POLICY as P,NOMICS,sha,assert,checkHardware,checkResidents,residentList,validCompletion,primaryLoad} from './lease-contract.mjs';
import {readGgufMetadata} from './gguf-metadata.mjs';
const root=import.meta.dirname,config=JSON.parse(readFileSync(path.join(root,'lease-config.json'),'utf8'));
const sealBytes=readFileSync(path.join(root,'seal.json')),seal=JSON.parse(sealBytes),sealHash=sha(sealBytes);
assert(hostname().toUpperCase()==='RUNA-HOME'&&process.version==='v22.22.1','host-runtime');
assert(root===config.homeRoot&&/^20260828-smoke-(gemma|coder|qwen36)-r[1-9][0-9]*$/.test(config.leaseId),'root');
for(const [name,hash] of Object.entries(seal.files)){
  assert(/^[a-zA-Z-]+\.(mjs|json|ps1)$/.test(name),'seal-path');
  assert(!lstatSync(path.join(root,name)).isSymbolicLink()&&sha(readFileSync(path.join(root,name)))===hash,'seal-drift');
}
const candidate=config.candidate,owned=[],changed=[];
const output=(name,v)=>writeFileSync(path.join(root,name),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
writeFileSync(path.join(root,'events.jsonl'),'',{flag:'wx'});
const event=(type,v={})=>appendFileSync(path.join(root,'events.jsonl'),JSON.stringify({type,time:new Date().toISOString(),...v})+'\n');
const controller=new AbortController();let pendingKey=null,sampling=false,lastSample=Date.now(),failure=null,cleanupVerified=false,powerRestored=false,completion=null;
let phase='baseline',expectedPower=260,expiry=null;
async function api(endpoint,body,ms=10000,signal=controller.signal){
  assert(['/api/v1/models','/api/v1/models/load','/api/v1/models/unload'].includes(endpoint),'lifecycle-only');
  const response=await fetch('http://127.0.0.1:1234'+endpoint,{method:body?'POST':'GET',redirect:'error',
    headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.any([AbortSignal.timeout(ms),...(signal?[signal]:[])])});
  const chunks=[];let count=0;for await(const c of response.body){count+=c.length;assert(count<=1048576,'response-cap');chunks.push(c);}
  const raw=Buffer.concat(chunks).toString('utf8');assert(response.ok,'http');return JSON.parse(raw);
}
function hardware(){
  const raw=execFileSync('nvidia-smi.exe',['--query-gpu=index,name,uuid,memory.total,memory.used,temperature.gpu,power.limit,power.draw,utilization.gpu','--format=csv,noheader,nounits'],{encoding:'utf8',timeout:5000,windowsHide:true});
  return {freeMemoryBytes:freemem(),gpus:raw.trim().split(/\r?\n/).map(l=>{const f=l.split(',').map(s=>s.trim());return {index:+f[0],name:f[1],uuid:f[2],memoryTotalMiB:+f[3],memoryUsedMiB:+f[4],temperatureC:+f[5],powerLimitWatts:+f[6],powerWatts:+f[7],utilization:+f[8]};})};
}
async function sample(){
  const now=Date.now(),hw=hardware();event('telemetry',{phase,...hw,gapMs:now-lastSample});
  assert(now-lastSample<=P.maximumGapMs,'telemetry-gap');lastSample=now;checkHardware(hw,expectedPower);
  checkResidents(await api('/api/v1/models'),owned,pendingKey);return hw;
}
const monitor=setInterval(()=>{if(sampling||phase==='power-transition'||phase==='cleanup')return;sampling=true;
  sample().catch(e=>{event('watchdog-failure',{code:e.message});controller.abort(e);}).finally(()=>{sampling=false;});},P.sampleMs);
async function pause(){await new Promise(r=>setTimeout(r,5000));controller.signal.throwIfAborted();}
async function hash(file){assert(!lstatSync(file).isSymbolicLink(),'pin-link');const h=createHash('sha256');for await(const b of createReadStream(file,{highWaterMark:4194304}))h.update(b);return h.digest('hex');}
function power(uuid,watts){execFileSync('nvidia-smi.exe',['-i',uuid,'-pl',String(watts)],{timeout:5000,windowsHide:true});}
async function load(model,request){
  controller.signal.throwIfAborted();checkResidents(await api('/api/v1/models'),owned);
  pendingKey=model.key;event('load-request',{key:model.key,request});
  const v=await api('/api/v1/models/load',request,P.loadMs);
  event('load-response',{key:model.key,value:v});
  assert(v.status==='loaded'&&typeof v.instance_id==='string','load-response');
  const item={key:model.key,id:v.instance_id};owned.push(item);pendingKey=null;
  const found=checkResidents(await api('/api/v1/models'),owned),resident=found.find(i=>i.id===item.id);
  item.fingerprint=sha(JSON.stringify(resident.config));event('owned',{item,loadConfig:v.load_config});
  if(model.key===candidate.key){const c=v.load_config;
    assert(c?.context_length===32768&&c.flash_attention===true&&c.offload_kv_cache_to_gpu===true&&c.speculative_draft_mtp===candidate.mtp&&c.speculative_draft_simple===false&&c.speculative_draft_model===''&&sha(c.prompt_template?.template??'')===candidate.templateSha256,'primary-envelope');
    if(candidate.mtp)assert(c.speculative_draft_max_tokens===2&&c.speculative_draft_min_tokens===0&&c.speculative_draft_min_continue_probability===0.75,'mtp-envelope');
  }else assert(v.load_config?.context_length===2048,'embedding-context');
  return item;
}
const preparationDeadline=setTimeout(()=>controller.abort(Error('lease-preparation-deadline')),P.preparationMs);
try{
  event('start',{config,sealSha256:sealHash,classification:'unscored-actual-adapter-smoke-hardware-only'});
  assert(residentList(await api('/api/v1/models')).length===0,'unowned-baseline');checkHardware(hardware(),260);
  phase='hashing';for(const model of [candidate,NOMICS]){
    assert(lstatSync(model.artifactPath).size===model.bytes&&await hash(model.artifactPath)===model.sha256,'artifact-drift');event('artifact-pin',{key:model.key,sha256:model.sha256,bytes:model.bytes});
  }
  const runtime=JSON.parse(readFileSync(path.join(root,'runtime.json'),'utf8'));
  for(const f of runtime.files){assert(await hash(f.path)===f.sha256,'runtime-drift');event('runtime-pin',{path:f.path,sha256:f.sha256});}
  assert(readGgufMetadata(candidate.artifactPath).chatTemplateSha256===candidate.templateSha256,'template-drift');
  const registry=await api('/api/v1/models');
  assert(registry.models.filter(m=>m.key===candidate.key&&m.size_bytes===candidate.bytes&&m.architecture===candidate.architecture&&m.quantization?.name===candidate.quantization).length===1,'primary-registry');
  assert(registry.models.filter(m=>m.key===NOMICS.key&&m.type==='embedding'&&m.size_bytes===NOMICS.bytes&&m.max_context_length===2048).length===1,'embedding-registry');
  phase='power-transition';for(const uuid of P.gpuUuids){changed.push(uuid);power(uuid,160);}expectedPower=160;event('power-applied',{watts:160});
  phase='cooldown';while(true){const hw=await sample();if(hw.gpus.every(g=>g.temperatureC<=45))break;await pause();}
  controller.signal.throwIfAborted();phase='loading';
  // Primary first preserves the already measured primary load envelope; the auxiliary is bounded independently.
  const primary=await load(candidate,primaryLoad(candidate));
  const embedding=await load(NOMICS,{model:NOMICS.key,context_length:2048,echo_load_config:true});
  phase='ready';clearTimeout(preparationDeadline);expiry=Date.now()+P.readyLeaseMs;
  await sample();output('ready.json',{schemaVersion:'runa-m1-smoke-lease-ready/v1',leaseId:config.leaseId,
    sealSha256:sealHash,candidateId:candidate.id,modelId:candidate.key,primaryInstanceId:primary.id,
    embeddingModelId:NOMICS.key,embeddingInstanceId:embedding.id,primaryArtifactSha256:candidate.sha256,
    embeddingArtifactSha256:NOMICS.sha256,readyAt:new Date().toISOString(),expiresAt:new Date(expiry).toISOString(),
    reasoningEffort:candidate.id==='coder'?null:'none',completionPath:path.join(root,'complete.json')});
  while(true){controller.signal.throwIfAborted();
    if(existsSync(path.join(root,'complete.json'))){completion=validCompletion(JSON.parse(readFileSync(path.join(root,'complete.json'),'utf8')),sealHash,config.leaseId);break;}
    assert(Date.now()<expiry,'expired');await pause();
  }
}catch(e){failure=/^lease-[a-z0-9-]+$/.test(e.message)?e.message:'lease-operator-failed';event('failure',{code:failure,errorClass:e.name});}
finally{
  phase='cleanup';clearInterval(monitor);clearTimeout(preparationDeadline);
  try{
    // Wait for an in-flight monitor to settle; it may only observe registry/hardware, never mutate.
    while(sampling)await new Promise(r=>setTimeout(r,50));
    for(const o of [...owned]){const current=residentList(await api('/api/v1/models',undefined,10000,null));
      assert(current.some(i=>i.id===o.id&&i.key===o.key),'cleanup-ownership');
      event('unload',{key:o.key,id:o.id,value:await api('/api/v1/models/unload',{instance_id:o.id},120000,null)});
    }
    cleanupVerified=residentList(await api('/api/v1/models',undefined,10000,null)).length===0&&pendingKey===null;
    assert(cleanupVerified,'cleanup-unverified');
    for(const uuid of changed)power(uuid,260);checkHardware(hardware(),260);powerRestored=true;
  }catch(e){event('cleanup-failure',{code:e.message});}
  output('lease-result.json',{schemaVersion:'runa-m1-smoke-lease-result/v1',leaseId:config.leaseId,sealSha256:sealHash,
    endedAt:new Date().toISOString(),failure,completion,cleanupVerified,powerRestored,owned,
    ambiguousLoad:pendingKey,productionRoutingChanged:false,protectedDataIncluded:false,inferenceCalledByOperator:false});
  if(failure||!cleanupVerified||!powerRestored)process.exitCode=1;
}
