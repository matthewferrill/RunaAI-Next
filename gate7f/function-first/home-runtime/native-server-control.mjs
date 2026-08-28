import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hostname} from 'node:os';
import {fileURLToPath} from 'node:url';
import {demand,sha,residentList} from './contracts.mjs';
import {assertPlainPath} from './native-adapter.mjs';
const execute=promisify(execFile);
export const NATIVE_SERVER_PATHS=Object.freeze({cli:'C:\\Users\\Matthew\\.lmstudio\\bin\\lms.exe',
  descriptor:'C:\\Users\\Matthew\\.lmstudio\\.internal\\http-server.json',
  settings:'C:\\Users\\Matthew\\.lmstudio\\.internal\\http-server-config.json',
  powershell:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'});
export const NATIVE_CLI_PIN='976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5';
const OBSERVER=fileURLToPath(new URL('./Observe-NativeServer.ps1',import.meta.url));
const HOME_NODE_PIN='923a41f268ab49ede2e3363fbdd9e790609e385c6f3ca880b4ee9a56a8133e5a';
const ENGINE='C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe';
const ENGINE_PIN='428c46865482aef24712eb5bcbbc7b966e0d8173a946b0b2f307672e4c1529c1';
async function fileHash(file){assertPlainPath(file);const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
const engineKey=value=>JSON.stringify(value.engine);
export function validateNativeServerObservation(value,{expectedEngine,expectedDescriptorSha256,now=Date.now()}={}){
  demand(value?.schemaVersion==='runaai-native-server-observation/v1'&&Number.isFinite(value.observedAt)
    &&now-value.observedAt>=0&&now-value.observedAt<=5000,'native-server-stale');
  demand(value.engine?.executable===ENGINE&&Number.isSafeInteger(value.engine.pid)&&value.engine.pid>0
    &&Number.isFinite(Date.parse(value.engine.startedAt)),'native-server-engine');
  demand(Number.isInteger(value.internalPort)&&value.internalPort>0&&value.internalPort<=65535&&value.internalPort!==1234
    &&/^[a-f0-9]{64}$/.test(value.descriptorSha256),'native-server-descriptor');
  demand(value.http&&Array.isArray(value.http.addresses)&&value.http.addresses.length<=2
    &&value.http.addresses.every(address=>['127.0.0.1','::1','0.0.0.0','::'].includes(address))
    &&Number.isInteger(value.http.established)&&value.http.established>=0,'native-server-listeners');
  if(expectedEngine)demand(engineKey(value)===JSON.stringify(expectedEngine),'native-server-engine-drift');
  if(expectedDescriptorSha256)demand(value.descriptorSha256===expectedDescriptorSha256,'native-server-descriptor-drift');
  return value;
}
export function validateNativeServerBaseline(value){
  // A persisted pre-transition identity can outlive the observation freshness window. It does
  // not authorize a command by itself: command() compares it with a new fresh observation.
  demand(Number.isFinite(value?.observedAt)&&value.observedAt<=Date.now(),'native-server-baseline-time');
  return validateNativeServerObservation(value,{now:value.observedAt});
}
export function nativeServerCommand(mode,bind){
  demand(['stop','start'].includes(mode),'native-server-command');
  if(mode==='stop'){demand(bind===undefined,'native-server-stop-bind');return ['server','stop'];}
  demand(['127.0.0.1','0.0.0.0'].includes(bind),'native-server-bind');
  return ['server','start','--port','1234','--bind',bind];
}
/** Real narrow host adapter, no effects at construction. Only the privileged transaction calls it.
 * assertQuiescent must verify its independent native lock and the live Control/caller drain; a stale
 * JSON claim is not supplied by this class and is never treated as application-drain evidence.
 * No HOME/USERPROFILE override, daemon command, credential read/copy, model loading or broad kill. */
export function createNativeServerController({codePins,assertQuiescent,record}){
  demand(codePins&&Object.keys(codePins).sort().join()==='Observe-NativeServer.ps1,Runtime-Windows.ps1,Settings-FileTransaction.ps1'
    &&Object.values(codePins).every(pin=>/^[a-f0-9]{64}$/.test(pin))
    &&typeof assertQuiescent==='function'&&typeof record==='function','native-server-controller');
  let verified=false;
  function requireHome(){demand(process.platform==='win32'&&hostname().toUpperCase()==='RUNA-HOME'&&process.version==='v22.22.1','native-server-host');}
  async function observe(){
    requireHome();demand(verified,'native-server-not-verified');
    const result=await execute(NATIVE_SERVER_PATHS.powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',OBSERVER],
      {encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16384,
        env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
    return validateNativeServerObservation(JSON.parse(result.stdout));
  }
  async function emptyRegistry(){
    const reply=await fetch('http://127.0.0.1:1234/api/v1/models',{redirect:'error',headers:{connection:'close'},signal:AbortSignal.timeout(5000)});
    demand(reply.ok,'native-server-registry-status');let size=0;const pieces=[];
    for await(const piece of reply.body){size+=piece.length;demand(size<=1024*1024,'native-server-registry-cap');pieces.push(piece);}
    demand(residentList(JSON.parse(Buffer.concat(pieces))).length===0,'native-server-residency');
  }
  return {
    async verify(){requireHome();for(const [file,pin] of [[NATIVE_SERVER_PATHS.cli,NATIVE_CLI_PIN],[process.execPath,HOME_NODE_PIN],[ENGINE,ENGINE_PIN],
      ...Object.entries(codePins).map(([name,pin])=>[fileURLToPath(new URL('./'+name,import.meta.url)),pin])]){
      demand(await fileHash(file)===pin,'native-server-pin');}assertPlainPath(NATIVE_SERVER_PATHS.descriptor);verified=true;},
    observe,
    async command(mode,{bind,baseline}){
      const args=nativeServerCommand(mode,bind);requireHome();demand(verified,'native-server-not-verified');
      validateNativeServerBaseline(baseline);await assertQuiescent();
      const before=validateNativeServerObservation(await observe(),{expectedEngine:baseline.engine,expectedDescriptorSha256:baseline.descriptorSha256});
      demand(before.http.established===0,'native-server-active-connection');
      if(mode==='stop'){demand(before.http.addresses.length>0,'native-server-already-stopped');await emptyRegistry();}
      else demand(before.http.addresses.length===0,'native-server-already-started');
      demand(await fileHash(NATIVE_SERVER_PATHS.cli)===NATIVE_CLI_PIN,'native-server-cli-drift');await assertQuiescent();
      await record({type:'native-server-command-intent',mode,bind:bind??null,engine:before.engine,descriptorSha256:before.descriptorSha256,time:Date.now()});
      let result=null,failure=null;
      try{result=await execute(NATIVE_SERVER_PATHS.cli,args,{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16384,
        // Installed exact CLI source proves this branch uses only tryFindLocalAPIServer; missing
        // selected API fails, rather than launching llmster or trying an unbound default instance.
        env:{...process.env,LMS_API_SERVER_INFO_PATH:NATIVE_SERVER_PATHS.descriptor}});}
      catch(error){failure={code:typeof error.code==='number'?error.code:'unknown',timedOut:error.killed===true};}
      await record({type:'native-server-command-returned',mode,failure,stdoutSha256:result?sha(result.stdout):null,
        stderrSha256:result?sha(result.stderr):null,time:Date.now()});
      // Never infer successful mutation from exit status or retry a timed-out command.
      const after=validateNativeServerObservation(await observe(),{expectedEngine:baseline.engine,expectedDescriptorSha256:baseline.descriptorSha256});
      const expected=mode==='stop'?after.http.addresses.length===0:
        after.http.addresses.length>0&&after.http.addresses.every(address=>address===bind||(bind==='127.0.0.1'&&address==='::1'));
      demand(!failure&&expected,'native-server-command-unconfirmed');
      if(mode==='start')await emptyRegistry();await assertQuiescent();
      return {mode,after,settingsEnforced:false};
    },
  };
}
