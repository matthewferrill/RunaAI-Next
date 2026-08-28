import {readFileSync,openSync,writeSync,fsyncSync,closeSync,existsSync,renameSync,fstatSync} from 'node:fs';
import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {HOME_RUNTIME_ROOT,assertPlainPath} from './native-adapter.mjs';
import {demand,sha,validateProfile} from './contracts.mjs';

export const OPERATOR_FILES=Object.freeze([
  'evidence-output.mjs',
  'home-runtime/contracts.mjs','home-runtime/controller.mjs','home-runtime/native-adapter.mjs','home-runtime/Observe-HomeRuntime.ps1',
  'home-runtime/recovery.mjs','home-runtime/admission-broker.mjs','home-runtime/file-ipc.mjs','home-runtime/worker-controller.mjs',
  'home-runtime/proxy.mjs','home-runtime/tls-proxy.mjs','home-runtime/runtime-installation.mjs','home-runtime/runtime-main.mjs',
  'home-runtime/Runtime-Windows.ps1','home-runtime/Run-HomeRuntimeSupervisor.ps1','home-runtime/Run-HomeRuntimeWorker.ps1',
  'home-runtime/Install-HomeRuntime.ps1','home-runtime/Stop-HomeRuntime.ps1',
  'home-runtime/Observe-RuntimeProcess.ps1','readiness/manifest.mjs','readiness/lease-contract.mjs',
  'readiness/evidence/20260828-campaign-hardware-plan-r1.json',
]);
const HASH=/^[a-f0-9]{64}$/;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
export function validateInstallation(value){
  demand(exact(value,'codeFiles,installationId,operatorPins,profile,schemaVersion,tlsPins')
    &&value.schemaVersion==='runaai-qualified-home-installation/v1'&&HASH.test(value.installationId),'installation-shape');
  const profile=validateProfile(value.profile);
  demand(exact(value.operatorPins,'engineExecutableSha256,nodeSha256,observationScriptSha256')
    &&Object.values(value.operatorPins).every(pin=>typeof pin==='string'&&HASH.test(pin)),'installation-native-pins');
  demand(exact(value.tlsPins,'caSha256,clientCertificateSha256,serverCertificateSha256')
    &&Object.values(value.tlsPins).every(pin=>typeof pin==='string'&&HASH.test(pin)),'installation-tls-pins');
  demand(exact(value.codeFiles,[...OPERATOR_FILES].sort().join())&&Object.values(value.codeFiles).every(pin=>typeof pin==='string'&&HASH.test(pin)),
    'installation-code-pins');
  demand(value.operatorPins.observationScriptSha256===value.codeFiles['home-runtime/Observe-HomeRuntime.ps1'],'installation-observer-binding');
  return {value:structuredClone(value),profile};
}
export function boundedRuntimeRead(file,maximumBytes=65536){
  assertPlainPath(file);const fd=openSync(file,'r');
  try{const before=fstatSync(fd);demand(before.size<=maximumBytes&&before.nlink===1,'runtime-file-bounds');
    const bytes=readFileSync(fd);const after=fstatSync(fd);demand(after.size===before.size&&after.mtimeMs===before.mtimeMs&&after.ino===before.ino,'runtime-file-drift');return bytes;
  }finally{closeSync(fd);}
}
export function runtimeJson(file,maximumBytes=65536){
  let parsed;try{parsed=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(boundedRuntimeRead(file,maximumBytes)));}
  catch(error){if(error?.code)throw error;demand(false,'runtime-json');}return parsed;
}
export function readInstallation(expectedSeal){
  demand(process.platform==='win32'&&hostname().toUpperCase()==='RUNA-HOME'&&process.version==='v22.22.1','installation-host-runtime');
  demand(HASH.test(expectedSeal),'installation-seal');assertPlainPath(HOME_RUNTIME_ROOT,{directory:true});
  const bytes=boundedRuntimeRead(HOME_RUNTIME_ROOT+'\\installation.json');demand(sha(bytes)===expectedSeal,'installation-seal-drift');
  const {value,profile}=validateInstallation(JSON.parse(bytes));
  for(const [relative,pin] of Object.entries(value.codeFiles))demand(sha(boundedRuntimeRead(HOME_RUNTIME_ROOT+'\\code\\'+relative.replaceAll('/','\\'),2*1024*1024))===pin,'installation-code-drift');
  demand(sha(boundedRuntimeRead(process.execPath,128*1024*1024))===value.operatorPins.nodeSha256,'installation-node-drift');
  return {config:value,profile,sealSha256:expectedSeal};
}
export function sessionPaths(sessionId){
  demand(HASH.test(sessionId),'runtime-session');const ipc=HOME_RUNTIME_ROOT+'\\ipc\\'+sessionId;
  return {ipc,state:HOME_RUNTIME_ROOT+'\\state\\sessions\\'+sessionId,worker:ipc+'\\worker'};
}
export function writeRuntimeJson(file,value,{replace=false}={}){
  demand(file.startsWith(HOME_RUNTIME_ROOT+'\\')&&file.endsWith('.json')&&path.win32.resolve(file)===file,'runtime-output-path');
  assertPlainPath(path.win32.dirname(file),{directory:true});const bytes=Buffer.from(JSON.stringify(value)+'\n');
  demand(bytes.length<=65536,'runtime-output-cap');const pending=file+'.pending-'+randomUUID();
  if(!replace)demand(!existsSync(file),'runtime-existing-output');else if(existsSync(file))assertPlainPath(file);
  const fd=openSync(pending,'wx');try{writeSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  // Exactly one process has write authority to each target. The installer proves the directory ACLs.
  renameSync(pending,file);
}
export function validateProcessIdentity(value){
  demand(exact(value,'executable,pid,startedAt')&&Number.isSafeInteger(value.pid)&&value.pid>0&&typeof value.startedAt==='string'
    &&Number.isFinite(Date.parse(value.startedAt))&&value.executable==='C:\\Program Files\\nodejs\\node.exe','runtime-process-identity');return value;
}
