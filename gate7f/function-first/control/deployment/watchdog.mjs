import {lstat,open,readdir,realpath} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';

export const POWERSHELL=String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
export const WATCHDOG_LIMITS=Object.freeze({maximumMs:600000,cleanupMs:5000,maximumBytes:262144});
const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const argvDigest=args=>digest(args.map(value=>Buffer.byteLength(value)+':'+value).join(''));
export const packageDigest=pins=>digest(pins.map(({path:file,sha256})=>Buffer.byteLength(file)+':'+file+sha256).join(''));
const fail=code=>Object.assign(Error('m1-watchdog-'+code),{code:'m1-watchdog-'+code});
const demand=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys.split(',').sort().join();
const hostEnvironment=directory=>({ComSpec:String.raw`C:\Windows\System32\cmd.exe`,LOCALAPPDATA:path.join(directory,'host-localappdata'),OS:'Windows_NT',
  PATHEXT:'.COM;.EXE;.BAT;.CMD;.CPL',PROCESSOR_ARCHITECTURE:'AMD64',SystemDrive:'C:',SystemRoot:String.raw`C:\Windows`,
  TEMP:path.join(directory,'host-temp'),TMP:path.join(directory,'host-temp'),WINDIR:String.raw`C:\Windows`});
function fixedV2Environment(value){
  demand(value.ComSpec===String.raw`C:\Windows\System32\cmd.exe`&&value.OS==='Windows_NT'&&value.PATHEXT==='.COM;.EXE;.BAT;.CMD'
    &&value.PROCESSOR_ARCHITECTURE==='AMD64'&&value.SystemDrive==='C:'&&value.SystemRoot===String.raw`C:\Windows`
    &&value.WINDIR===String.raw`C:\Windows`&&/^[a-f0-9]{32}$/u.test(value.RUNAAI_GATE3_RESOURCE_PROOF_METHOD),'environment-values');
  const local=path.resolve(value.LOCALAPPDATA),temp=path.resolve(value.TEMP),tmp=path.resolve(value.TMP);
  demand(local===value.LOCALAPPDATA&&temp===value.TEMP&&tmp===value.TMP&&temp===tmp&&path.basename(local)==='localappdata'
    &&path.basename(temp)==='temp'&&path.dirname(local).toLowerCase()===path.dirname(temp).toLowerCase(),'environment-scratch');
}
function v2Contract(value){
  demand(exact(value.admission,'phase,envelopeSha256,eligibilitySealSha256')&&['eligibility','resource-proof'].includes(value.admission.phase)
    &&HASH.test(value.admission.envelopeSha256)&&(value.admission.phase==='eligibility'?value.admission.eligibilitySealSha256===null:HASH.test(value.admission.eligibilitySealSha256)),'admission');
  demand(exact(value.entrypoint,'path,sha256')&&path.isAbsolute(value.entrypoint.path)&&HASH.test(value.entrypoint.sha256)
    &&path.basename(value.entrypoint.path)==='native-gate3-control-node-bootstrap.mjs'
    &&path.basename(value.executable).toLowerCase()==='node.exe'&&value.arguments.length===1&&value.arguments[0]===value.entrypoint.path,'entrypoint');
  demand(exact(value.manifest,'path,sha256')&&path.isAbsolute(value.manifest.path)&&HASH.test(value.manifest.sha256),'manifest');
  demand(value.environment&&typeof value.environment==='object'&&!Array.isArray(value.environment),'environment');
  const names=Object.keys(value.environment),allowed=['ComSpec','LOCALAPPDATA','OS','PATHEXT','PROCESSOR_ARCHITECTURE','SystemDrive','SystemRoot','TEMP','TMP','WINDIR','RUNAAI_GATE3_RESOURCE_PROOF_METHOD'];
  demand(names.slice().sort().join()===allowed.slice().sort().join()&&names.every(name=>typeof value.environment[name]==='string'
    &&!value.environment[name].includes('\0')&&value.environment[name].length<=4096),'environment');
  fixedV2Environment(value.environment);
  demand(value.pins.length===6,'package-membership');
  demand(value.pins.some(pin=>pin.path===value.manifest.path&&pin.sha256===value.manifest.sha256)
    &&value.pins.some(pin=>pin.path===value.entrypoint.path&&pin.sha256===value.entrypoint.sha256)
    &&value.pins.some(pin=>pin.path===value.executable&&pin.sha256===value.executableSha256),'manifest-binding');
}
export async function plainFile(file,maximum=1048576,systemExecutable=false){
  demand(path.isAbsolute(file),'absolute-path');
  for(let item=file;item!==path.dirname(item);item=path.dirname(item))demand(!(await lstat(item)).isSymbolicLink(),'linked-path');
  demand(path.resolve(await realpath(file)).toLowerCase()===path.resolve(file).toLowerCase(),'file-alias');
  const handle=await open(file,'r');
  const links=systemExecutable&&file===POWERSHELL?2:1;
  try{const before=await handle.stat();demand(before.isFile()&&before.nlink===links&&before.size>0&&before.size<=maximum,'file-boundary');
    const bytes=await handle.readFile(),after=await handle.stat();
    demand(before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&after.nlink===links&&bytes.length===before.size,'file-drift');return bytes;
  }finally{await handle.close();}
}
async function validateV2Package(value,{hostFile=null,wrapperFile=null,helperFile=null}={}){
  const raw=await plainFile(value.manifest.path,16777216);demand(digest(raw)===value.manifest.sha256,'manifest-drift');
  let manifest;try{manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}catch{throw fail('manifest-json');}
  demand(exact(manifest,'schemaVersion,members,privateValuesIncluded')&&manifest.schemaVersion==='runaai-native-gate3-supervisor-package/v1'
    &&manifest.privateValuesIncluded===false&&Array.isArray(manifest.members)&&manifest.members.length===5,'manifest-contract');
  const uniqueNamed=name=>{const matches=value.pins.filter(pin=>path.basename(pin.path)===name);demand(matches.length===1,'manifest-role-pin');return matches[0];};
  const bound=(file,name)=>file===null?uniqueNamed(name):value.pins.find(pin=>pin.path.toLowerCase()===path.resolve(file).toLowerCase());
  const expectedRoles=new Map([
    ['node-runtime',{path:value.executable,sha256:value.executableSha256}],
    ['control-bootstrap',value.entrypoint],
    ['supervisor-host',bound(hostFile,'Watchdog-Host.mjs')],
    ['supervisor-wrapper',bound(wrapperFile,'Invoke-ClosedCompanionWatchdog.ps1')],
    ['supervisor-helper',bound(helperFile,'ClosedCompanionJob.cs')],
  ]);
  demand([...expectedRoles.values()].every(Boolean),'manifest-role-pin');
  const seen=new Set();for(const member of manifest.members){demand(exact(member,'role,path,sha256')&&expectedRoles.has(member.role)&&!seen.has(member.role)
    &&member.path===expectedRoles.get(member.role)?.path&&member.sha256===expectedRoles.get(member.role)?.sha256,'manifest-member');seen.add(member.role);}
  demand(seen.size===expectedRoles.size,'manifest-membership');
}
async function directoryBoundary(directory,assertOwnerPrivate){
  demand(typeof assertOwnerPrivate==='function'&&path.isAbsolute(directory),'private-boundary');
  for(let item=directory;item!==path.dirname(item);item=path.dirname(item))demand(!(await lstat(item)).isSymbolicLink(),'linked-path');
  demand((await lstat(directory)).isDirectory()&&path.resolve(await realpath(directory)).toLowerCase()===path.resolve(directory).toLowerCase(),'directory');
  await assertOwnerPrivate(directory);
}
async function v2ScratchBoundary(environment,assertOwnerPrivate){
  const root=path.dirname(environment.LOCALAPPDATA);demand(path.dirname(environment.TEMP).toLowerCase()===root.toLowerCase(),'environment-scratch');
  await directoryBoundary(root,assertOwnerPrivate);await directoryBoundary(environment.LOCALAPPDATA,assertOwnerPrivate);await directoryBoundary(environment.TEMP,assertOwnerPrivate);
}
function requestContract(value){
  const v2=value?.schemaVersion==='runaai-m1-watchdog-request/v2';
  demand(exact(value,v2?'schemaVersion,operationId,transitionId,descriptorSha256,packageSha256,executable,executableSha256,supervisorExecutable,supervisorExecutableSha256,arguments,argumentsSha256,createdAt,deadline,maximumMs,maximumBytes,pins,admission,entrypoint,environment,manifest':'schemaVersion,operationId,transitionId,descriptorSha256,packageSha256,executable,executableSha256,supervisorExecutable,supervisorExecutableSha256,arguments,argumentsSha256,createdAt,deadline,maximumMs,maximumBytes,pins')
    &&(v2||value.schemaVersion==='runaai-m1-watchdog-request/v1')&&ID.test(value.operationId)&&ID.test(value.transitionId)
    &&['descriptorSha256','packageSha256','executableSha256','supervisorExecutableSha256','argumentsSha256'].every(key=>HASH.test(value[key]))
    &&typeof value.supervisorExecutable==='string'&&path.isAbsolute(value.supervisorExecutable)
    &&typeof value.executable==='string'&&path.isAbsolute(value.executable)&&Array.isArray(value.arguments)&&value.arguments.length<=100
    &&value.arguments.every(arg=>typeof arg==='string'&&!arg.includes('\0')&&Buffer.byteLength(arg)<=3000)
    &&argvDigest(value.arguments)===value.argumentsSha256&&Number.isInteger(value.maximumMs)&&value.maximumMs>0&&value.maximumMs<=WATCHDOG_LIMITS.maximumMs
    &&Number.isInteger(value.maximumBytes)&&value.maximumBytes>0&&value.maximumBytes<=WATCHDOG_LIMITS.maximumBytes
    &&Number.isFinite(Date.parse(value.createdAt))&&Date.parse(value.deadline)-Date.parse(value.createdAt)===value.maximumMs
    &&Array.isArray(value.pins)&&value.pins.length>0&&value.pins.length<=12,'request');
  const seen=new Set();for(const pin of value.pins){demand(exact(pin,'path,sha256')&&path.isAbsolute(pin.path)&&HASH.test(pin.sha256)&&!seen.has(pin.path.toLowerCase()),'request-pin');seen.add(pin.path.toLowerCase());}
  if(v2)demand(value.pins.every((pin,index)=>index===0||value.pins[index-1].path.toLowerCase()<pin.path.toLowerCase())&&value.packageSha256===packageDigest(value.pins),'package-binding');
  if(v2)v2Contract(value);
  return value;
}

/** Trusted operator-only primitive. No shell command, network route or replay.
 * Caller provides a pre-created owner-private unique directory. Its private
 * request contains paths/argv, never secrets; public projections omit them. */
export async function prepareWatchdogRequest({directory,transitionId,descriptorSha256,packageSha256,executable,executableSha256,supervisorExecutable,supervisorExecutableSha256,
  arguments:args,pins,admission=null,entrypoint=null,environment=null,manifest=null,maximumMs=WATCHDOG_LIMITS.maximumMs,maximumBytes=WATCHDOG_LIMITS.maximumBytes,assertOwnerPrivate,now=Date.now()}){
  await directoryBoundary(directory,assertOwnerPrivate);demand((await readdir(directory)).length===0,'existing-operation');
  const v2=admission!==null||entrypoint!==null||environment!==null||manifest!==null;demand(!v2||(admission&&entrypoint&&environment&&manifest),'v2-fields');
  const request=requestContract({schemaVersion:v2?'runaai-m1-watchdog-request/v2':'runaai-m1-watchdog-request/v1',operationId:randomUUID().replaceAll('-',''),transitionId,
    descriptorSha256,packageSha256,executable,executableSha256,supervisorExecutable,supervisorExecutableSha256,arguments:[...args],argumentsSha256:argvDigest(args),
    createdAt:new Date(now).toISOString(),deadline:new Date(now+maximumMs).toISOString(),maximumMs,maximumBytes,pins:structuredClone(pins),
    ...(v2?{admission:structuredClone(admission),entrypoint:structuredClone(entrypoint),environment:structuredClone(environment),manifest:structuredClone(manifest)}:{})});
  demand(digest(await plainFile(executable,104857600,true))===executableSha256,'executable-drift');
  demand(digest(await plainFile(supervisorExecutable,104857600))===supervisorExecutableSha256,'supervisor-runtime-drift');
  for(const pin of request.pins)demand(digest(await plainFile(pin.path,v2&&pin.path===request.manifest.path?16777216:pin.path===request.executable?104857600:1048576))===pin.sha256,'package-drift');
  if(v2){await validateV2Package(request);await v2ScratchBoundary(request.environment,assertOwnerPrivate);}
  const raw=Buffer.from(JSON.stringify(request));demand(raw.length<=65536,'request-cap');
  const file=path.join(directory,'request.json'),handle=await open(file,'wx');
  try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
  await assertOwnerPrivate(directory);return {directory,requestFile:file,requestSha256:digest(raw),request};
}

/** Starts only the separately pinned watchdog. The watchdog (not this Node
 * process) owns the finite job. Losing this caller cannot remove its deadline. */
export async function launchWatchdog({prepared,wrapperFile,wrapperSha256,helperFile,helperSha256,hostFile,hostSha256,powershellSha256,assertOwnerPrivate,createOwnerPrivate}){
  await directoryBoundary(prepared.directory,assertOwnerPrivate);
  demand(digest(await plainFile(prepared.requestFile,65536))===prepared.requestSha256,'request-drift');
  demand(digest(JSON.stringify(prepared.request))===prepared.requestSha256,'prepared-drift');
  requestContract(prepared.request);demand(Date.now()<Date.parse(prepared.request.deadline),'expired');
  demand((await readdir(prepared.directory)).length===1,'existing-operation');
  demand(path.basename(wrapperFile)==='Invoke-ClosedCompanionWatchdog.ps1'&&path.basename(helperFile)==='ClosedCompanionJob.cs'
    &&path.basename(hostFile)==='Watchdog-Host.mjs'&&path.dirname(wrapperFile)===path.dirname(hostFile)
    &&path.dirname(wrapperFile)===path.dirname(helperFile)&&digest(await plainFile(wrapperFile))===wrapperSha256
    &&digest(await plainFile(hostFile))===hostSha256
    &&digest(await plainFile(helperFile))===helperSha256&&digest(await plainFile(POWERSHELL,104857600,true))===powershellSha256,'supervisor-drift');
  demand(digest(await plainFile(prepared.request.supervisorExecutable,104857600))===prepared.request.supervisorExecutableSha256,'supervisor-runtime-drift');
  const v2=prepared.request.schemaVersion==='runaai-m1-watchdog-request/v2';
  for(const pin of prepared.request.pins)demand(digest(await plainFile(pin.path,v2&&pin.path===prepared.request.manifest.path?16777216:pin.path===prepared.request.executable?104857600:1048576))===pin.sha256,'package-drift');
  if(v2)await validateV2Package(prepared.request,{hostFile,wrapperFile,helperFile});
  for(const [file,pin]of [[wrapperFile,wrapperSha256],[helperFile,helperSha256],[hostFile,hostSha256]])
    demand(prepared.request.pins.some(item=>item.path===file&&item.sha256===pin),'supervisor-package-binding');
  const hostEnv=v2?hostEnvironment(prepared.directory):{...process.env,NODE_OPTIONS:'',NODE_PATH:'',
    PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`};
  if(v2){demand(typeof createOwnerPrivate==='function','private-provisioner');
    await createOwnerPrivate(hostEnv.LOCALAPPDATA);await createOwnerPrivate(hostEnv.TEMP);
    await directoryBoundary(hostEnv.LOCALAPPDATA,assertOwnerPrivate);await directoryBoundary(hostEnv.TEMP,assertOwnerPrivate);}
  const secret=v2?randomBytes(32):null;
  const child=spawn(prepared.request.supervisorExecutable,[hostFile,prepared.requestFile,prepared.requestSha256,wrapperSha256,helperSha256,hostSha256,powershellSha256],
  {windowsHide:true,detached:true,stdio:v2?['pipe','ignore','ignore']:'ignore',env:hostEnv});
  // Detached Node (not PowerShell) survives the caller job. Output is discarded;
  // actual authority is the durable record. Its running C# job/deadline does not
  // depend on reading/writing the caller pipes.
  const completion=new Promise(resolve=>{let done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>finish({status:'needs-reconciliation',stopped:false}),
      Math.max(1,Date.parse(prepared.request.deadline)-Date.now())+WATCHDOG_LIMITS.cleanupMs+2000);
    child.on('error',()=>finish({status:'needs-reconciliation',stopped:false}));
    child.on('close',code=>finish({status:code===0?'returned':'needs-reconciliation',stopped:true,exitCode:code}));
  });
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  if(v2)try{await new Promise((resolve,reject)=>child.stdin.end(secret,error=>error?reject(error):resolve()));}
  finally{secret.fill(0);}
  return {child,completion};
}

export async function inspectWatchdog({directory,requestSha256,assertOwnerPrivate}){
  await directoryBoundary(directory,assertOwnerPrivate);
  const names=await readdir(directory),recordsAllowed=['request.json','writer.lock','intent.json','supervisor.json','started.json','terminal.json','failure.json','host.json'];
  demand(names.includes('request.json'),'record-set');
  const raw=await plainFile(path.join(directory,'request.json'),65536);demand(digest(raw)===requestSha256,'request-drift');
  let request;try{request=requestContract(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw)));}catch{throw fail('request');}
  const v2=request.schemaVersion==='runaai-m1-watchdog-request/v2',supportDirectories=v2?['host-localappdata','host-temp']:[],allowed=[...recordsAllowed,...supportDirectories];
  demand(names.every(name=>allowed.includes(name)),'record-set');
  for(const name of supportDirectories)if(names.includes(name))await directoryBoundary(path.join(directory,name),assertOwnerPrivate);
  if(v2)await validateV2Package(request);
  const records={},hashes={};
  for(const name of recordsAllowed.slice(2)){if(!names.includes(name))continue;const bytes=await plainFile(path.join(directory,name),524288);
    try{records[name]=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{throw fail('record-json');}hashes[name]=digest(bytes);}
  const common={schemaVersion:'runaai-m1-watchdog-observation/v1',operationId:request.operationId,transitionId:request.transitionId,
    requestSha256,descriptorSha256:request.descriptorSha256,packageSha256:request.packageSha256,automaticReplayPermitted:false,
    automaticRollbackPermitted:false,admissionOpened:false};
  const host=records['host.json'],intent=records['intent.json'],supervisor=records['supervisor.json'],started=records['started.json'],terminal=records['terminal.json'];
  if(host){demand(exact(host,'schemaVersion,operationId,requestSha256,processId,executableSha256,hostSha256,wrapperSha256,helperSha256,powershellSha256,recordedAt')
    &&host.schemaVersion===(v2?'runaai-m1-watchdog-host/v2':'runaai-m1-watchdog-host/v1')&&host.operationId===request.operationId&&host.requestSha256===requestSha256
    &&host.executableSha256===request.supervisorExecutableSha256&&Number.isInteger(host.processId)&&host.processId>0
    &&HASH.test(host.powershellSha256)&&Date.parse(host.recordedAt)>=Date.parse(request.createdAt),'host-binding');
    for(const [name,key]of [['Watchdog-Host.mjs','hostSha256'],['Invoke-ClosedCompanionWatchdog.ps1','wrapperSha256'],['ClosedCompanionJob.cs','helperSha256']])
      demand(request.pins.filter(pin=>path.basename(pin.path)===name&&pin.sha256===host[key]).length===1,'host-package-binding');}
  if(records['failure.json'])needFailure(records['failure.json'],requestSha256);
  if(intent)demand(exact(intent,'schemaVersion,operationId,transitionId,requestSha256,descriptorSha256,packageSha256,executableSha256,argumentsSha256,deadline,recordedAt,privateValuesIncluded')
    &&intent.schemaVersion==='runaai-m1-watchdog-intent/v1'&&intent.operationId===request.operationId
    &&intent.transitionId===request.transitionId&&intent.requestSha256===requestSha256
    &&intent.privateValuesIncluded===false&&Date.parse(intent.recordedAt)>=Date.parse(request.createdAt)
    &&['descriptorSha256','packageSha256','executableSha256','argumentsSha256','deadline'].every(key=>intent[key]===request[key]),'intent-binding');
  if(supervisor)demand(host&&intent&&exact(supervisor,'schemaVersion,operationId,intentSha256,hostSha256,hostProcessId,hostProcessStartedAt,processId,processStartedAt,recordedAt')
    &&supervisor.schemaVersion==='runaai-m1-watchdog-supervisor/v1'&&supervisor.operationId===request.operationId
    &&supervisor.hostSha256===hashes['host.json']&&supervisor.hostProcessId===host.processId&&Number.isFinite(Date.parse(supervisor.hostProcessStartedAt))
    &&supervisor.intentSha256===hashes['intent.json']&&Number.isInteger(supervisor.processId)&&supervisor.processId>0
    &&supervisor.processId!==host.processId&&Date.parse(supervisor.hostProcessStartedAt)>=Date.parse(request.createdAt)
    &&Date.parse(supervisor.hostProcessStartedAt)<=Date.parse(host.recordedAt)&&Date.parse(host.recordedAt)<=Date.parse(supervisor.processStartedAt)
    &&Date.parse(supervisor.processStartedAt)<=Date.parse(intent.recordedAt)&&Date.parse(intent.recordedAt)<=Date.parse(supervisor.recordedAt),'supervisor-binding');
  if(started)demand(supervisor&&exact(started,'schemaVersion,operationId,intentSha256,supervisorSha256,processId,processStartedAt,createdSuspended,atomicJobAssigned,recordedAt')
    &&started.schemaVersion==='runaai-m1-watchdog-started/v1'&&started.operationId===request.operationId
    &&started.intentSha256===hashes['intent.json']&&started.supervisorSha256===hashes['supervisor.json']
    &&started.createdSuspended===true&&started.atomicJobAssigned===true&&Number.isInteger(started.processId)&&started.processId>0
    &&started.processId!==supervisor.processId&&started.processId!==host.processId
    &&Number.isFinite(Date.parse(started.processStartedAt))
    &&Date.parse(started.recordedAt)>=Date.parse(supervisor.recordedAt),'started-binding');
  if(!terminal)return {...common,status:'needs-reconciliation',terminalRetained:false,records};
  demand(started&&exact(terminal,'schemaVersion,operationId,intentSha256,supervisorSha256,startedSha256,outcome,result,recordedAt,admissionOpened,automaticReplayPermitted,automaticRollbackPermitted')
    &&terminal.schemaVersion===(v2?'runaai-m1-watchdog-terminal/v2':'runaai-m1-watchdog-terminal/v1')&&terminal.operationId===request.operationId
    &&terminal.intentSha256===hashes['intent.json']&&terminal.supervisorSha256===hashes['supervisor.json']&&terminal.startedSha256===hashes['started.json']
    &&terminal.admissionOpened===false&&terminal.automaticRollbackPermitted===false&&terminal.automaticReplayPermitted===false,'terminal-binding');
  const result=terminal.result;
  const resultKeys=v2?'ProcessId,ExitCode,StdoutBytes,StderrBytes,ActiveProcesses,CreatedSuspended,AtomicJobAssigned,AdmissionWritten,AdmissionSha256,AdmissionAcknowledged,Resumed,StopConfirmed,ProcessAbsent,TreeAbsent,ExitCodeObserved,TimedOut,OutputLimited,OutputComplete,OutputFaulted,ProcessStartedAt,StartedAt,FinishedAt,Acknowledgement'
    :'ProcessId,ExitCode,StdoutBytes,StderrBytes,ActiveProcesses,CreatedSuspended,AtomicJobAssigned,Resumed,StopConfirmed,TimedOut,OutputLimited,OutputComplete,ProcessStartedAt,StartedAt,FinishedAt,Stdout';
  demand(exact(result,resultKeys)
    &&result.ProcessId===started.processId&&result.ProcessStartedAt===started.processStartedAt
    &&result.CreatedSuspended===true&&result.AtomicJobAssigned===true&&['terminal','unknown'].includes(terminal.outcome)
    &&['Resumed','StopConfirmed','TimedOut','OutputLimited','OutputComplete',...(v2?['AdmissionWritten','AdmissionAcknowledged','ProcessAbsent','TreeAbsent','ExitCodeObserved','OutputFaulted']:[])].every(key=>typeof result[key]==='boolean')
    &&['StdoutBytes','StderrBytes'].every(key=>Number.isInteger(result[key])&&result[key]>=0&&result[key]<=request.maximumBytes+4096)
    &&Number.isInteger(result.ActiveProcesses)&&result.ActiveProcesses>=0&&(v2?result.Stdout===undefined:typeof result.Stdout==='string'&&Buffer.byteLength(result.Stdout)<=request.maximumBytes)
    &&Date.parse(result.StartedAt)>=Date.parse(supervisor.recordedAt)&&Date.parse(result.StartedAt)<=Date.parse(started.recordedAt)
    &&Date.parse(started.recordedAt)<=Date.parse(result.FinishedAt)&&Date.parse(result.FinishedAt)<=Date.parse(terminal.recordedAt)
    &&Date.parse(terminal.recordedAt)<=Date.parse(request.deadline)+WATCHDOG_LIMITS.cleanupMs,'result-binding');
  if(v2)demand((result.AdmissionWritten===true?HASH.test(result.AdmissionSha256):result.AdmissionSha256===null)
    &&(result.AdmissionAcknowledged===true?exact(result.Acknowledgement,'schemaVersion,phase,envelopeSha256,eligibilitySealSha256,supervisorProcessId,childProcessId,capabilitySha256,manifestSha256,packageSha256,nodeVersion,consumed,eofObserved,privateValuesIncluded')
    &&result.Acknowledgement.schemaVersion==='runaai-m1-supervisor-child-ack/v1'&&result.Acknowledgement.phase===request.admission.phase
    &&result.Acknowledgement.envelopeSha256===request.admission.envelopeSha256&&result.Acknowledgement.eligibilitySealSha256===request.admission.eligibilitySealSha256
    &&result.Acknowledgement.supervisorProcessId===supervisor.processId&&result.Acknowledgement.childProcessId===result.ProcessId
    &&result.Acknowledgement.capabilitySha256===result.AdmissionSha256&&result.Acknowledgement.manifestSha256===request.manifest.sha256
    &&result.Acknowledgement.packageSha256===request.packageSha256&&result.Acknowledgement.nodeVersion==='v22.22.0'
    &&result.Acknowledgement.consumed===true&&result.Acknowledgement.eofObserved===true&&result.Acknowledgement.privateValuesIncluded===false
      :result.Acknowledgement===null),'admission-ack');
  const complete=result.Resumed===true&&result.StopConfirmed===true&&result.OutputComplete===true&&result.ActiveProcesses===0
    &&result.TimedOut===false&&result.OutputLimited===false&&Number.isInteger(result.ExitCode)
    &&(!v2||(result.ProcessAbsent===true&&result.TreeAbsent===true&&result.ExitCodeObserved===true&&result.OutputFaulted===false
      &&result.AdmissionWritten===true&&result.AdmissionAcknowledged===true));
  demand((terminal.outcome==='terminal')===complete,'terminal-claim');
  if(complete&&!v2)demand(Buffer.byteLength(result.Stdout)===result.StdoutBytes,'stdout-binding');
  return {...common,status:complete?'terminal':'needs-reconciliation',terminalRetained:true,records,result};
}

function needFailure(value,requestSha256){demand(value.schemaVersion==='runaai-m1-watchdog-failure/v1'&&value.requestSha256===requestSha256
  &&value.outcome==='unknown'&&value.privateValuesIncluded===false&&/^[a-z-]+$/u.test(value.stage)&&/^m1-supervisor-[a-z-]+$/u.test(value.errorCode),'failure-binding');}
