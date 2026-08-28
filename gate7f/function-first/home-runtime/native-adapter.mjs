import {lstatSync,openSync,fstatSync,closeSync,readFileSync,writeSync,fsyncSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {hostname,freemem} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {demand,error,NOMICS,LEASE_POLICY,loadRequest,residentList} from './contracts.mjs';
const execute=promisify(execFile);
export const HOME_RUNTIME_ROOT='C:\\AI\\RunaAI-Next-HomeRuntime';
const SETTINGS='C:\\Users\\Matthew\\.lmstudio\\.internal\\http-server-config.json';
const PERMISSIONS='C:\\Users\\Matthew\\.lmstudio\\.internal\\permissions-store.json';
const ENGINE='C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe';
const NVIDIA='C:\\Windows\\System32\\nvidia-smi.exe';
const POWERSHELL='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const SOURCE_RUNTIME=JSON.parse(readFileSync(new URL('../readiness/evidence/20260828-campaign-hardware-plan-r1.json',import.meta.url))).runtimeFiles;
const hashPattern=/^[a-f0-9]{64}$/;

export function assertPlainPath(file,{directory=false}={}){
  const absolute=path.win32.resolve(file);demand(absolute===file&&!file.startsWith('\\\\')&&/^[A-Za-z]:\\/.test(file)
    &&!file.slice(2).includes(':')&&!file.split('\\').some(segment=>/[. ]$/.test(segment)),'native-path');
  for(let current=file;current!==path.win32.dirname(current);current=path.win32.dirname(current)){
    const item=lstatSync(current);demand(!item.isSymbolicLink(),'native-path-link');
  }
  const item=lstatSync(file);demand(directory?item.isDirectory():item.isFile()&&item.nlink===1,'native-path-kind');return item;
}
export function parseGpuTelemetry(raw){return raw.trim().split(/\r?\n/).map(line=>{
  const f=line.split(',').map(s=>s.trim());demand(f.length===9&&[0,3,4,5,6,7,8].every(i=>f[i]!==''&&Number.isFinite(+f[i])),'gpu-observation');return {index:+f[0],name:f[1],uuid:f[2],
    memoryTotalMiB:+f[3],memoryUsedMiB:+f[4],temperatureC:+f[5],powerLimitWatts:+f[6],powerWatts:+f[7],utilization:+f[8]};});}
export function parseServerPermissionMetadata(raw){
  // The existing vendor store may contain token entries. Return only non-secret policy fields;
  // never forward, serialize, hash or log credential entries or this raw store.
  demand(Buffer.byteLength(raw)<=1024*1024,'native-permissions-cap');let envelope,value;
  try{envelope=JSON.parse(raw);value=typeof envelope.json==='string'?JSON.parse(envelope.json):envelope.json;}
  catch{throw error('native-permissions-format');}
  demand(value&&['disabled','required'].includes(value.tokenMode),'native-permissions-mode');
  const permissions=value.serverPermissions;
  demand(permissions?.dynamicRemoteMcpServer==='deny'&&permissions.pluginUse==='deny','unsafe-native-mcp');
  return {tokenMode:value.tokenMode,dynamicRemoteMcpServer:'deny',pluginUse:'deny'};
}
async function hashFile(file,signal){
  assertPlainPath(file);const descriptor=openSync(file,'r'),before=fstatSync(descriptor),hash=createHash('sha256');
  try{demand(before.nlink===1,'native-file-links');for await(const chunk of createReadStream(file,{fd:descriptor,autoClose:false,highWaterMark:4*1024*1024})){
      signal?.throwIfAborted();hash.update(chunk);}
    const after=fstatSync(descriptor);demand(before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs,'native-file-changed');
    return {sha256:hash.digest('hex'),stat:{size:after.size,mtimeMs:after.mtimeMs,ino:after.ino}};
  }finally{closeSync(descriptor);}
}

/** No side effects at construction. Does not install, start or reconfigure LM Studio.
 * The native service package still must establish protected ACLs, an exclusive owner lock,
 * independent crash cleanup, authenticating proxy binding and a verified operational seal. */
export function createPinnedNativeAdapter({operatorPins,stateRoot=HOME_RUNTIME_ROOT+'\\state',fetchImpl=fetch}){
  demand(stateRoot===HOME_RUNTIME_ROOT+'\\state','native-state-root');
  demand(operatorPins&&Object.keys(operatorPins).sort().join()==='engineExecutableSha256,nodeSha256,observationScriptSha256'
    &&Object.values(operatorPins).every(h=>hashPattern.test(h)),'operator-pins');
  const script=path.join(import.meta.dirname,'Observe-HomeRuntime.ps1');
  const pinnedStats=new Map();let verified=false;
  const requireHome=()=>demand(process.platform==='win32'&&hostname().toUpperCase()==='RUNA-HOME'&&process.version==='v22.22.1','native-host-runtime');
  const requireVerified=()=>{requireHome();demand(verified,'native-pins-unverified');};
  const checkMetadata=()=>{for(const[file,expected]of pinnedStats){const s=assertPlainPath(file);
    demand(s.size===expected.size&&s.mtimeMs===expected.mtimeMs&&s.ino===expected.ino,'native-metadata-drift');}};
  async function api(endpoint,body,{signal,timeoutMs=10000}={}){
    requireVerified();demand(['/api/v1/models','/api/v1/models/load','/api/v1/models/unload'].includes(endpoint),'native-api');
    const response=await fetchImpl('http://127.0.0.1:1234'+endpoint,{method:body?'POST':'GET',redirect:'error',
      headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,
      signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])])});
    demand(response.ok,'native-api-status');const chunks=[];let count=0;
    for await(const bytes of response.body){count+=bytes.length;demand(count<=1024*1024,'native-api-cap');chunks.push(bytes);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw error('native-api-json');}
  }
  let selectedProfile=null;const ownedIds=new Set();
  return {
    async verifyPins(profile,{signal}={}){
      requireHome();assertPlainPath(HOME_RUNTIME_ROOT,{directory:true});assertPlainPath(stateRoot,{directory:true});
      const files=[...SOURCE_RUNTIME,{path:ENGINE,sha256:operatorPins.engineExecutableSha256},
        {path:process.execPath,sha256:operatorPins.nodeSha256},{path:script,sha256:operatorPins.observationScriptSha256},
        {path:profile.candidate.artifactPath,sha256:profile.candidate.sha256,bytes:profile.candidate.bytes},
        {path:NOMICS.artifactPath,sha256:NOMICS.sha256,bytes:NOMICS.bytes}];
      for(const file of files){const actual=await hashFile(file.path,signal);demand(actual.sha256===file.sha256
        &&(file.bytes===undefined||actual.stat.size===file.bytes),'native-file-pin');pinnedStats.set(file.path,actual.stat);}
      selectedProfile=profile;verified=true;
    },
    async observe({signal}={}){
      requireVerified();checkMetadata();assertPlainPath(SETTINGS);
      const settings=JSON.parse(readFileSync(SETTINGS,'utf8'));
      demand(settings.networkInterface==='127.0.0.1','native-server-bypass');
      assertPlainPath(PERMISSIONS);const permissions=parseServerPermissionMetadata(readFileSync(PERMISSIONS,'utf8'));
      const [inventory,hardware,engine]=await Promise.all([
        api('/api/v1/models',undefined,{signal,timeoutMs:3000}),
        execute(NVIDIA,['--query-gpu=index,name,uuid,memory.total,memory.used,temperature.gpu,power.limit,power.draw,utilization.gpu','--format=csv,noheader,nounits'],{encoding:'utf8',timeout:5000,maxBuffer:8192,windowsHide:true,signal}),
        execute(POWERSHELL,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',timeout:5000,maxBuffer:8192,windowsHide:true,signal})]);
      const identity=JSON.parse(engine.stdout);return {observedAt:identity.observedAt,engineIdentity:identity.engineIdentity,inventory,
        hardware:{freeMemoryBytes:freemem(),gpus:parseGpuTelemetry(hardware.stdout)},
        settings:{justInTimeModelLoading:settings.justInTimeModelLoading,logSensitiveData:settings.logSensitiveData,verbose:settings.verbose,
          dynamicRemoteMcpServer:permissions.dynamicRemoteMcpServer,pluginUse:permissions.pluginUse}};
    },
    async setPower(watts,{signal}={}){
      requireVerified();demand(watts===160||watts===260,'native-power');
      if(watts===260)demand(residentList(await api('/api/v1/models',undefined,{signal})).length===0,'native-power-with-residents');
      for(const uuid of LEASE_POLICY.gpuUuids)await execute(NVIDIA,['-i',uuid,'-pl',String(watts)],{timeout:5000,maxBuffer:8192,windowsHide:true,signal});
    },
    async load(request,options={}){
      requireVerified();const allowed=[selectedProfile.candidate.key,NOMICS.key];demand(allowed.includes(request?.model),'native-load-model');
      demand(JSON.stringify(request)===JSON.stringify(loadRequest(selectedProfile,request.model===NOMICS.key)),'native-load-profile');
      const response=await api('/api/v1/models/load',request,{...options,timeoutMs:180000});
      if(response?.status==='loaded'&&typeof response.instance_id==='string')ownedIds.add(response.instance_id);return response;
    },
    async unload(request){requireVerified();demand(request&&Object.keys(request).join()==='instance_id'&&typeof request.instance_id==='string','native-unload-shape');
      demand(ownedIds.has(request.instance_id),'native-unload-ownership');const response=await api('/api/v1/models/unload',request,{timeoutMs:120000});
      ownedIds.delete(request.instance_id);return response;},
    async record(event){
      requireHome();assertPlainPath(stateRoot,{directory:true});const file=stateRoot+'\\operator-events.jsonl';
      try{assertPlainPath(file);}catch(e){if(e.code!=='ENOENT')throw e;}
      const raw=JSON.stringify(event)+'\n';demand(Buffer.byteLength(raw)<=32768,'native-event-cap');
      const descriptor=openSync(file,'a');try{demand(fstatSync(descriptor).nlink===1,'native-event-links');writeSync(descriptor,raw);fsyncSync(descriptor);}finally{closeSync(descriptor);}
    },
  };
}
