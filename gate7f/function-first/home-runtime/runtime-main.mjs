import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {QualifiedRuntimeController} from './controller.mjs';
import {PinnedAdmissionBroker} from './admission-broker.mjs';
import {BrokerFileServer,BrokerFileClient} from './file-ipc.mjs';
import {BrokerWorkerController} from './worker-controller.mjs';
import {createRuntimeTlsProxy} from './tls-proxy.mjs';
import {createPinnedNativeAdapter,HOME_RUNTIME_ROOT} from './native-adapter.mjs';
import {recoverOwnedRuntime} from './recovery.mjs';
import {demand,RUNTIME_LIMITS} from './contracts.mjs';
import {readInstallation,sessionPaths,runtimeJson,writeRuntimeJson,boundedRuntimeRead,validateProcessIdentity} from './runtime-installation.mjs';

const execute=promisify(execFile);const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const POWERSHELL='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const observer=fileURLToPath(new URL('./Observe-RuntimeProcess.ps1',import.meta.url));
async function processStopped(identity){
  validateProcessIdentity(identity);
  const result=await execute(POWERSHELL,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',observer,'-ProcessId',String(identity.pid),'-StartedAt',identity.startedAt],
    {encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:8192});
  const value=JSON.parse(result.stdout);demand(value.schemaVersion==='runaai-runtime-process-observation/v1'&&typeof value.stopped==='boolean','runtime-process-observation');return value.stopped;
}
async function waitFile(file,deadline){while(!existsSync(file)){demand(Date.now()<deadline,'runtime-bootstrap-timeout');await delay(100);}return file;}
function ipcKey(paths){const key=boundedRuntimeRead(paths.ipc+'\\session-key.bin',32);demand(key.length===32,'runtime-session-key');return key;}
function heartbeat(paths,name,value){writeRuntimeJson(paths+'\\'+name+'.json',{schemaVersion:'runaai-runtime-heartbeat/v1',time:Date.now(),...value},{replace:true});}

/** Actual entrypoint, not auto-run on import. Installer/native watchdog establishes principals,
 * immutable installation/seal, new session ACLs and exact process registrations before this runs. */
export async function runRuntimeMain(mode,expectedSeal,sessionId){
  demand(['supervisor','worker','recover'].includes(mode),'runtime-mode');
  const installation=readInstallation(expectedSeal),paths=sessionPaths(sessionId);
  const binding=runtimeJson(paths.ipc+'\\binding.json');
  demand(binding.sessionId===sessionId&&binding.installationSha256===expectedSeal,'runtime-session-binding');
  if(mode==='recover'){
    const identities=runtimeJson(paths.state+'\\processes.json');
    const adapter=createPinnedNativeAdapter({operatorPins:installation.config.operatorPins});
    const file=HOME_RUNTIME_ROOT+'\\state\\operator-events.jsonl';
    const rawJournal=existsSync(file)?boundedRuntimeRead(file,64*1024*1024):Buffer.alloc(0);
    const result=await recoverOwnedRuntime({rawJournal,profile:installation.config.profile,adapter,
      verifyStopped:async()=>await processStopped(identities.supervisor)&&await processStopped(identities.worker)});
    const receipt={schemaVersion:'runaai-runtime-recovery/v1',...result,time:Date.now()};
    writeRuntimeJson(paths.state+'\\recovery-result-'+randomUUID()+'.json',receipt);
    writeRuntimeJson(paths.state+'\\recovery-result.json',receipt,{replace:true});return result;
  }
  const approved=runtimeJson(await waitFile(paths.ipc+'\\approved-worker.json',Date.now()+30000));
  const identity=validateProcessIdentity(approved);const worker={pid:identity.pid,startedAt:identity.startedAt};
  if(mode==='supervisor'){
    const nativeApproval=runtimeJson(await waitFile(paths.state+'\\approved-supervisor.json',Date.now()+30000));
    demand(validateProcessIdentity(nativeApproval).pid===process.pid,'runtime-supervisor-process');
    const controller=new QualifiedRuntimeController({profile:installation.config.profile,
      adapter:createPinnedNativeAdapter({operatorPins:installation.config.operatorPins})});
    const nativeAlive=()=>{const value=runtimeJson(paths.state+'\\native-heartbeat.json');
      demand(value.sessionId===sessionId&&Number.isFinite(value.time)&&Date.now()>=value.time&&Date.now()-value.time<=15000,'runtime-native-watchdog-lost');};
    let watchdogLost=false;
    const pulse=setInterval(()=>{
      heartbeat(paths.state,'controller-heartbeat',{mode,...controller.status});
      try{nativeAlive();}catch{
        if(!watchdogLost){watchdogLost=true;
          // Monitor during artifact hashing/loading as well as steady state. An orphaned Node
          // supervisor must not complete preparation after its native ownership lock disappeared.
          const stopped=controller.status.phase==='warming'?controller.stop():controller.fault('runtime-native-watchdog-lost');
          stopped.catch(()=>{});
        }
      }
    },1000);pulse.unref();
    const broker=new PinnedAdmissionBroker({controller,sessionId,worker,key:ipcKey(paths),verifyStopped:()=>processStopped(identity)});
    const transport=new BrokerFileServer({root:paths.ipc,sessionId,key:ipcKey(paths),broker});
    let failure=null;
    try{
      nativeAlive();heartbeat(paths.state,'controller-heartbeat',{mode,...controller.status});await controller.start();
      demand(!watchdogLost&&controller.status.phase==='ready','runtime-native-watchdog-lost');
      writeRuntimeJson(paths.ipc+'\\broker-ready.json',{schemaVersion:'runaai-runtime-broker-ready/v1',sessionId,installationSha256:expectedSeal,
        profileSha256:installation.profile.profileSha256,generation:controller.status.generation});
      let nextPoll=Date.now()+RUNTIME_LIMITS.sampleMs,stopping=null;
      while(true){
        nativeAlive();demand(!watchdogLost,'runtime-native-watchdog-lost');
        await transport.pump();
        if(!stopping&&existsSync(paths.state+'\\stop.json')){
          const stop=runtimeJson(paths.state+'\\stop.json');demand(stop.sessionId===sessionId&&['drain','fault'].includes(stop.mode),'runtime-stop-binding');
          // Keep pumping releases while bounded native drain is in progress.
          stopping=(stop.mode==='drain'?broker.stop():broker.workerStopped()).then(()=>({done:true}),error=>({done:true,error}));
        }
        if(stopping){const status=await Promise.race([stopping,delay(0).then(()=>null)]);if(status?.done){if(status.error)throw status.error;break;}}
        else if(Date.now()>=nextPoll){await broker.poll();nextPoll=Date.now()+RUNTIME_LIMITS.sampleMs;
          demand(controller.status.phase==='ready','runtime-controller-fault');}
        await delay(20);
      }
      writeRuntimeJson(paths.state+'\\controller-result.json',{schemaVersion:'runaai-runtime-controller-result/v1',stopped:true,time:Date.now(),status:controller.status});
    }catch(error){failure=error;
      // A still-live worker must settle or be stopped by the independent native watchdog. Do not
      // manufacture its acknowledgments from inside the process that is failing.
      await controller.fault('runtime-supervisor-failed');throw error;
    }finally{clearInterval(pulse);heartbeat(paths.state,'controller-heartbeat',{mode,...controller.status,ended:true,failed:failure!==null});}
    return controller.status;
  }
  demand(identity.pid===process.pid,'runtime-worker-process');
  const ready=runtimeJson(await waitFile(paths.ipc+'\\broker-ready.json',Date.now()+RUNTIME_LIMITS.preparationMs));
  demand(ready.sessionId===sessionId&&ready.installationSha256===expectedSeal&&ready.profileSha256===installation.profile.profileSha256,'runtime-broker-binding');
  const client=new BrokerFileClient({root:paths.ipc,sessionId,worker,key:ipcKey(paths)});
  const controller=new BrokerWorkerController({profile:installation.config.profile,client});await controller.poll();
  const tlsRoot=HOME_RUNTIME_ROOT+'\\tls';const server=createRuntimeTlsProxy({controller,allowedClients:['192.168.50.169'],tls:{...installation.config.tlsPins,
    ca:boundedRuntimeRead(tlsRoot+'\\ca.pem',32768),cert:boundedRuntimeRead(tlsRoot+'\\server.pem',32768),key:boundedRuntimeRead(tlsRoot+'\\server-key.pem',32768)}});
  // Subscribe before listening/polling so a very early IPC failure cannot close the server before
  // its close waiter exists. Handle its error immediately while listening has its own waiter.
  const closed=once(server,'close');closed.catch(()=>{});
  let polling=false,failed=null;
  const pulse=setInterval(()=>{if(polling)return;polling=true;controller.poll().then(status=>heartbeat(paths.worker,'worker-heartbeat',{mode,...status}))
    .catch(error=>{failed=error;server.close();server.closeAllConnections();}).finally(()=>{polling=false;});},1000);
  try{
    server.listen(9776,'192.168.50.165');await once(server,'listening');
    writeRuntimeJson(paths.worker+'\\listener-ready.json',{schemaVersion:'runaai-runtime-worker-listener/v1',sessionId,installationSha256:expectedSeal,
      address:'192.168.50.165',port:9776,profileSha256:installation.profile.profileSha256});
    await closed;if(failed)throw failed;
  }finally{clearInterval(pulse);server.close(()=>{});server.closeAllConnections();await controller.close();}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{await runRuntimeMain(...process.argv.slice(2));}
  catch(error){process.stderr.write(JSON.stringify({schemaVersion:'runaai-runtime-entry-error/v1',
    errorCode:/^(runtime|lease)-[a-z0-9-]+$/.test(error?.code??'')?error.code:'runtime-entry-failed',privateValuesIncluded:false})+'\n');process.exitCode=1;}
}
