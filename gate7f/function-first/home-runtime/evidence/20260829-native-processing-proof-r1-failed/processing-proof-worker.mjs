import {appendFileSync,createReadStream,existsSync,lstatSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {freemem,hostname} from 'node:os';import path from 'node:path';
import {NOMIC,PROOF_POLICY,checkHardware,demand,sha,validateRequestFixture} from './processing-proof-contract.mjs';
const root=import.meta.dirname,config=JSON.parse(readFileSync(path.join(root,'config.json'),'utf8')),outputRoot=config.outputRoot;
const sealBytes=readFileSync(path.join(root,'seal.json')),seal=JSON.parse(sealBytes),sealSha256=sha(sealBytes);
demand(hostname().toUpperCase()==='RUNA-HOME'&&process.version==='v22.22.1','host-runtime');
demand(root===config.homeRoot&&path.dirname(outputRoot)===path.dirname(root)&&path.basename(outputRoot)==='results'
  &&config.schemaVersion==='runaai-native-processing-proof/v1'
  &&config.proofId==='20260829-native-processing-nomic-r1'&&JSON.stringify(config.policy)===JSON.stringify(PROOF_POLICY),'config');
for(const[name,pin]of Object.entries(seal.files)){const file=path.join(root,name);demand(!lstatSync(file).isSymbolicLink()&&sha(readFileSync(file))===pin,'source-drift');}
const fixture=validateRequestFixture(JSON.parse(readFileSync(path.join(root,'request.json'),'utf8')));
const output=(name,value)=>writeFileSync(path.join(outputRoot,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
writeFileSync(path.join(outputRoot,'events.jsonl'),'',{flag:'wx'});
const event=(type,value={})=>appendFileSync(path.join(outputRoot,'events.jsonl'),JSON.stringify({type,time:new Date().toISOString(),...value})+'\n');
const owned=[],controller=new AbortController();let pendingKey=null,phase='baseline',expectedPower=260,lastSample=Date.now(),sampling=false;
let cleanupVerified=false,powerRestored=false,failure=null,completion=null,instanceId=null;
async function api(endpoint,body,timeoutMs=10000,signal=controller.signal){
  demand(['/api/v1/models','/api/v1/models/load','/api/v1/models/unload'].includes(endpoint),'lifecycle-endpoint');
  const response=await fetch('http://127.0.0.1:1234'+endpoint,{method:body?'POST':'GET',redirect:'error',
    headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]),});
  const raw=await bounded(response,1048576);demand(response.ok,'lifecycle-http');try{return JSON.parse(raw);}catch{demand(false,'lifecycle-json');}
}
async function bounded(response,cap){const reader=response.body.getReader(),chunks=[];let count=0;
  try{while(true){const next=await reader.read();if(next.done)break;count+=next.value.length;demand(count<=cap,'response-cap');chunks.push(Buffer.from(next.value));}
    return Buffer.concat(chunks).toString('utf8');}finally{await reader.cancel().catch(()=>{});}}
function residents(value){demand(Array.isArray(value?.models),'inventory');return value.models.flatMap(model=>{
  demand(typeof model.key==='string'&&Array.isArray(model.loaded_instances),'inventory');return model.loaded_instances.map(instance=>{
    demand(typeof instance.id==='string'&&instance.config&&typeof instance.config==='object','instance');return {key:model.key,id:instance.id,config:instance.config};});});}
function checkResidents(value){const found=residents(value);for(const item of found){const match=owned.find(value=>value.key===item.key&&value.id===item.id);
    demand(match||item.key===pendingKey,'unexpected-residency');if(match)demand(match.fingerprint===sha(JSON.stringify(item.config)),'config-drift');}
  for(const item of owned)demand(found.some(value=>value.key===item.key&&value.id===item.id),'owned-lost');return found;}
function hardware(){const raw=execFileSync('nvidia-smi.exe',['--query-gpu=index,name,uuid,memory.total,memory.used,temperature.gpu,power.limit,power.draw,utilization.gpu','--format=csv,noheader,nounits'],{encoding:'utf8',timeout:5000,windowsHide:true});
  return {freeMemoryBytes:freemem(),gpus:raw.trim().split(/\r?\n/).map(line=>{const value=line.split(',').map(item=>item.trim());return {index:+value[0],name:value[1],uuid:value[2],memoryTotalMiB:+value[3],memoryUsedMiB:+value[4],temperatureC:+value[5],powerLimitWatts:+value[6],powerWatts:+value[7],utilization:+value[8]};})};}
async function sample(){const now=Date.now(),value=hardware();event('telemetry',{phase,...value,gapMs:now-lastSample});demand(now-lastSample<=PROOF_POLICY.maximumGapMs,'telemetry-gap');lastSample=now;checkHardware(value,expectedPower);checkResidents(await api('/api/v1/models'));return value;}
const monitor=setInterval(()=>{if(sampling||['power-transition','cleanup'].includes(phase))return;sampling=true;sample().catch(error=>{event('watchdog-failure',{code:error.message});controller.abort(error);}).finally(()=>sampling=false);},PROOF_POLICY.sampleMs);
async function hashFile(file){demand(!lstatSync(file).isSymbolicLink(),'artifact-link');const hash=createHash('sha256');
  for await(const chunk of createReadStream(file,{highWaterMark:4194304})){controller.signal.throwIfAborted();hash.update(chunk);}return hash.digest('hex');}
function setPower(uuid,watts){execFileSync('nvidia-smi.exe',['-i',uuid,'-pl',String(watts)],{timeout:5000,windowsHide:true});}
async function pause(ms=250){await new Promise(resolve=>setTimeout(resolve,ms));controller.signal.throwIfAborted();}
async function oneRequest(index){const started=Date.now();let state='unknown',responseSha256=null,errorCode=null;
  try{const response=await fetch('http://127.0.0.1:1234/v1/embeddings',{method:'POST',redirect:'error',headers:{'content-type':'application/json'},
      body:JSON.stringify(fixture),signal:AbortSignal.timeout(PROOF_POLICY.requestDeadlineMs)});
    const raw=await bounded(response,PROOF_POLICY.responseCapBytes);responseSha256=sha(raw);demand(response.status===200,'request-http');let value;
    try{value=JSON.parse(raw);}catch{demand(false,'request-json');}
    demand(value?.model===NOMIC.key&&Array.isArray(value.data)&&value.data.length===2&&value.data.every((entry,position)=>entry.index===position
      &&Array.isArray(entry.embedding)&&entry.embedding.length===NOMIC.dimension&&entry.embedding.every(Number.isFinite)),'request-shape');state='succeeded';
  }catch(error){state=error?.name==='TimeoutError'?'unknown':'failed';errorCode=/^processing-proof-[a-z0-9-]+$/.test(error?.message)?error.message:`processing-proof-${error?.name==='TimeoutError'?'timeout':'request-failed'}`;}
  return {index,state,elapsedMs:Date.now()-started,responseSha256,errorCode};
}
async function runRequests(){event('requests-start',{count:PROOF_POLICY.requestCount,fixtureSha256:sha(readFileSync(path.join(root,'request.json')))});
  const attempts=await Promise.all(Array.from({length:PROOF_POLICY.requestCount},(_,index)=>oneRequest(index)));
  const succeeded=attempts.filter(value=>value.state==='succeeded').length,failed=attempts.filter(value=>value.state==='failed').length,
    unknown=attempts.filter(value=>value.state==='unknown').length;
  const value={schemaVersion:'runaai-native-processing-request-result/v1',proofId:config.proofId,sealSha256,instanceId,
    requestCount:attempts.length,succeeded,failed,unknown,maximumElapsedMs:Math.max(...attempts.map(value=>value.elapsedMs)),
    aggregateSha256:sha(JSON.stringify(attempts)),modelId:NOMIC.key,vectorCount:succeeded*2,dimension:NOMIC.dimension,
    inferenceCalled:true,syntheticOnly:true,privateValuesIncluded:false};output('requests.json',value);event('requests-end',{succeeded,failed,unknown});
  demand(succeeded===PROOF_POLICY.requestCount&&failed===0&&unknown===0,'requests-incomplete');return value;
}
const preparation=setTimeout(()=>controller.abort(Error('processing-proof-preparation-deadline')),PROOF_POLICY.preparationDeadlineMs);
try{
  event('start',{proofId:config.proofId,sealSha256,classification:'owned-synthetic-native-processing-proof'});
  demand(residents(await api('/api/v1/models')).length===0,'unowned-baseline');checkHardware(hardware(),260);
  phase='hashing';demand(lstatSync(NOMIC.artifactPath).size===NOMIC.bytes&&await hashFile(NOMIC.artifactPath)===NOMIC.sha256,'artifact-drift');
  const runtime=JSON.parse(readFileSync(path.join(root,'runtime.json'),'utf8'));for(const file of runtime.files)demand(await hashFile(file.path)===file.sha256,'runtime-drift');
  const registry=await api('/api/v1/models');demand(registry.models.filter(model=>model.key===NOMIC.key&&model.type==='embedding'
    &&model.size_bytes===NOMIC.bytes&&model.max_context_length===NOMIC.context).length===1,'registry');
  phase='power-transition';for(const uuid of PROOF_POLICY.gpuUuids)setPower(uuid,160);expectedPower=160;event('power-applied',{watts:160});
  phase='cooldown';while(true){const value=await sample();if(value.gpus.every(gpu=>gpu.temperatureC<=PROOF_POLICY.maximumStartTemperatureC))break;await pause(5000);}
  phase='loading';pendingKey=NOMIC.key;const loaded=await api('/api/v1/models/load',{model:NOMIC.key,context_length:NOMIC.context,echo_load_config:true},180000);
  event('load-response',{key:NOMIC.key,value:loaded});demand(loaded.status==='loaded'&&typeof loaded.instance_id==='string','load-response');
  instanceId=loaded.instance_id;const item={key:NOMIC.key,id:instanceId,fingerprint:null};owned.push(item);pendingKey=null;
  const found=residents(await api('/api/v1/models')),resident=found.find(value=>value.id===instanceId&&value.key===NOMIC.key);
  demand(resident&&loaded.load_config?.context_length===NOMIC.context,'load-envelope');item.fingerprint=sha(JSON.stringify(resident.config));
  phase='ready';clearTimeout(preparation);await sample();output('ready.json',{schemaVersion:'runaai-native-processing-proof-ready/v1',proofId:config.proofId,
    sealSha256,modelId:NOMIC.key,instanceId,artifactSha256:NOMIC.sha256,readyAt:new Date().toISOString(),
    expiresAt:new Date(Date.now()+PROOF_POLICY.proofDeadlineMs).toISOString(),goPath:path.join(outputRoot,'go.json'),completionPath:path.join(outputRoot,'complete.json')});
  const deadline=Date.now()+PROOF_POLICY.proofDeadlineMs;while(!existsSync(path.join(outputRoot,'go.json'))){demand(Date.now()<deadline,'go-timeout');await pause();}
  const go=JSON.parse(readFileSync(path.join(outputRoot,'go.json'),'utf8'));demand(go?.schemaVersion==='runaai-native-processing-proof-go/v1'
    &&go.proofId===config.proofId&&go.sealSha256===sealSha256&&Number.isFinite(Date.parse(go.startedAt)),'go');
  phase='requests';await runRequests();phase='await-completion';while(!existsSync(path.join(outputRoot,'complete.json'))){demand(Date.now()<deadline,'completion-timeout');await pause();}
  const value=JSON.parse(readFileSync(path.join(outputRoot,'complete.json'),'utf8'));demand(value?.schemaVersion==='runaai-native-processing-proof-completion/v1'
    &&value.proofId===config.proofId&&value.sealSha256===sealSha256&&['completed','abort'].includes(value.reason),'completion');completion=value.reason;
}catch(error){failure=/^processing-proof-[a-z0-9-]+$/.test(error.message)?error.message:'processing-proof-worker-failed';event('failure',{code:failure,errorClass:error.name});}
finally{
  phase='cleanup';clearTimeout(preparation);clearInterval(monitor);while(sampling)await new Promise(resolve=>setTimeout(resolve,50));
  try{for(const item of [...owned]){const current=residents(await api('/api/v1/models',undefined,10000,null));
      demand(current.some(value=>value.key===item.key&&value.id===item.id),'cleanup-ownership');
      event('unload',{key:item.key,id:item.id,value:await api('/api/v1/models/unload',{instance_id:item.id},120000,null)});}
    cleanupVerified=residents(await api('/api/v1/models',undefined,10000,null)).length===0&&pendingKey===null;demand(cleanupVerified,'cleanup-unverified');
    for(const uuid of PROOF_POLICY.gpuUuids)setPower(uuid,260);checkHardware(hardware(),260);powerRestored=true;
  }catch(error){event('cleanup-failure',{code:error.message});}
  output('lease-result.json',{schemaVersion:'runaai-native-processing-proof-lease-result/v1',proofId:config.proofId,sealSha256,
    endedAt:new Date().toISOString(),failure,completion,cleanupVerified,powerRestored,owned,ambiguousLoad:pendingKey,
    productionRoutingChanged:false,settingsChanged:false,protectedDataIncluded:false,inferenceCalledByOperator:true});
  if(failure||!cleanupVerified||!powerRestored)process.exitCode=1;
}
