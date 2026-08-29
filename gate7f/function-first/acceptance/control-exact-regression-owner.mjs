import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseControlRegressionArguments} from './control-exact-regression.mjs';

const MAXIMUM_MS=1_020_000,MAXIMUM_OUTPUT_BYTES=65_536,POST_STOP_MS=10_000;
const safeKeys=Object.freeze(['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','PSModulePath','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','TEMP','TMP']);
const coded=code=>Object.assign(new Error(code),{code});

export function ownerSafeEnvironment(source=process.env){
  const output={};for(const key of safeKeys)if(source[key])output[key]=source[key];
  if(process.platform==='win32'){output.SystemDrive='C:';output.OS='Windows_NT';}
  return Object.freeze(output);
}

export function ownerSafeEnvironmentForRoot(root,source=process.env){
  const output={...ownerSafeEnvironment(source),LOCALAPPDATA:path.join(path.resolve(root),'transient')};
  return Object.freeze(output);
}

export function stopWindowsProcessTree(processId,{run=spawnSync,systemRoot=process.env.SystemRoot??'C:\\Windows'}={}){
  if(process.platform!=='win32'||!Number.isSafeInteger(processId)||processId<=0)throw coded('m1-control-regression-owner-stop-input');
  const executable=path.join(systemRoot,'System32','taskkill.exe');
  const result=run(executable,['/PID',String(processId),'/T','/F'],{encoding:'utf8',windowsHide:true,timeout:10_000,maxBuffer:1_048_576});
  if(result.error||result.status!==0)throw coded('m1-control-regression-owner-stop-unconfirmed');
  return Object.freeze({processId,tree:true,confirmed:true});
}

export async function runBoundedOwnerChild({file,args,cwd,environment=ownerSafeEnvironment(),maximumMs=MAXIMUM_MS,
  maximumOutputBytes=MAXIMUM_OUTPUT_BYTES,postStopMs=POST_STOP_MS,stopTree=stopWindowsProcessTree,
  fallbackKill=child=>child.kill()}){
  if(typeof file!=='string'||!Array.isArray(args)||typeof cwd!=='string'||!Number.isSafeInteger(maximumMs)||maximumMs<=0
    ||!Number.isSafeInteger(maximumOutputBytes)||maximumOutputBytes<=0||!Number.isSafeInteger(postStopMs)||postStopMs<=0)throw coded('m1-control-regression-owner-child-input');
  const child=spawn(file,args,{cwd,env:environment,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const output={stdout:[],stderr:[]},counts={stdout:0,stderr:0};let errorCode=null,stopProof=null,stopAttempted=false,postStopTimer=null,resolvePostStop;
  const postStop=new Promise(resolve=>{resolvePostStop=resolve;});
  const stop=code=>{
    errorCode??=code;if(stopAttempted)return;stopAttempted=true;
    try{stopProof=stopTree(child.pid);}catch(error){errorCode='m1-control-regression-owner-stop-unconfirmed';try{fallbackKill(child);}catch{}}
    postStopTimer=setTimeout(()=>resolvePostStop({postStopExceeded:true,code:null,signal:null,spawnError:null}),postStopMs);postStopTimer.unref?.();
  };
  for(const name of ['stdout','stderr'])child[name].on('data',chunk=>{
    const bytes=Buffer.from(chunk);counts[name]+=bytes.length;
    const retained=Math.max(0,maximumOutputBytes-output[name].reduce((total,item)=>total+item.length,0));
    if(retained)output[name].push(bytes.subarray(0,retained));
    if(counts[name]>maximumOutputBytes)stop('m1-control-regression-owner-output-cap');
  });
  const completion=new Promise(resolve=>{
    child.once('error',error=>resolve({code:null,signal:null,spawnError:error}));
    child.once('close',(code,signal)=>resolve({code,signal,spawnError:null}));
  });
  const timer=setTimeout(()=>stop('m1-control-regression-owner-timeout'),maximumMs);timer.unref?.();
  let terminal=await Promise.race([completion,postStop]);clearTimeout(timer);if(postStopTimer)clearTimeout(postStopTimer);const postStopExceeded=terminal.postStopExceeded===true;
  if(postStopExceeded){errorCode='m1-control-regression-owner-terminal-unconfirmed';
    try{child.stdout.destroy();}catch{}try{child.stderr.destroy();}catch{}try{child.unref();}catch{}
    terminal={code:null,signal:null,spawnError:null};
  }
  if(terminal.spawnError)errorCode??='m1-control-regression-owner-start';
  if(!errorCode&&terminal.code!==0)errorCode='m1-control-regression-run-failed';
  return Object.freeze({passed:!errorCode,errorCode,childProcessId:child.pid,stopAttempted,postStopExceeded,exitCode:terminal.code,signal:terminal.signal,
    stdout:Buffer.concat(output.stdout).toString('utf8'),stderr:Buffer.concat(output.stderr).toString('utf8'),
    stdoutBytes:counts.stdout,stderrBytes:counts.stderr,stopProof});
}

export async function runOwnerSupervisor(rawArguments){
  const parsed=parseControlRegressionArguments(rawArguments),root=path.resolve(parsed.root);
  const core=path.join(import.meta.dirname,'control-exact-regression.mjs');
  return runBoundedOwnerChild({file:process.execPath,args:[core,'--owned-root',root,'--manifest',parsed.manifestPath,
    '--manifest-sha256',parsed.manifestSha256],cwd:root,environment:ownerSafeEnvironmentForRoot(root)});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  process.stdout.write(JSON.stringify({errorCode:'m1-control-regression-owner-direct-entry-retired',modelsInvoked:false,
    protectedDataRead:false,productionChanged:false})+'\n');process.exitCode=1;
}
