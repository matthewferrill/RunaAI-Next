import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {demand} from './tls-primitives.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
const sourceRoot=path.dirname(fileURLToPath(import.meta.url)),sources=['Run-HomeOwnerCommand.ps1','Runtime-Windows.ps1'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const idFor=commandId=>commandId.replaceAll('-','');
export function ownerCommandArgs(mode,bind){
  demand(['status','stop','start'].includes(mode),'owner-command-mode');
  if(mode!=='start'){demand(bind===null||bind===undefined,'owner-command-bind');return mode==='status'?['ps','--json']:['server','stop'];}
  demand(['127.0.0.1','0.0.0.0'].includes(bind),'owner-command-bind');return ['server','start','--port','1234','--bind',bind];
}
export function prepareOwnerCommand({commandId,mode,bind=null,engine,descriptorSha256}){
  demand(UUID.test(commandId)&&HASH.test(descriptorSha256),'owner-command-binding');ownerCommandArgs(mode,bind);
  demand(engine&&Object.keys(engine).sort().join()==='executable,pid,startedAt'&&Number.isSafeInteger(engine.pid)&&engine.pid>0
    &&Number.isFinite(Date.parse(engine.startedAt))&&engine.executable==='C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe','owner-command-engine');
  const id=idFor(commandId),rawSources=Object.fromEntries(sources.map(name=>[name,readFileSync(path.join(sourceRoot,name))]));
  const manifest={schemaVersion:'runaai-owner-command-package/v1',commandId,mode,bind:mode==='start'?bind:null,
    root:'C:\\ProgramData\\RunaAI-Next-NativeCommand-'+id,taskName:'Runa-M1-NativeCommand-'+id,engine,
    engineSha256:'428c46865482aef24712eb5bcbbc7b966e0d8173a946b0b2f307672e4c1529c1',
    cliSha256:'976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5',descriptorSha256,
    sourceFiles:Object.fromEntries(Object.entries(rawSources).map(([name,raw])=>[name,sha(raw)]))};
  const seal=canonical(manifest),packageSha256=sha(seal);
  return Object.freeze({manifest,packageSha256,files:Object.freeze({...rawSources,'seal.json':seal})});
}
export function writeOwnerCommandPackage(directory,prepared){
  demand(path.isAbsolute(directory)&&!existsSync(directory)&&prepared?.files&&HASH.test(prepared.packageSha256),'owner-command-package-write');
  mkdirSync(directory);for(const[name,raw]of Object.entries(prepared.files))writeFileSync(path.join(directory,name),raw,{flag:'wx'});
  return {directory,packageSha256:prepared.packageSha256,commandId:prepared.manifest.commandId,root:prepared.manifest.root,taskName:prepared.manifest.taskName};
}
export function loadOwnerCommandPackage(directory,expected){
  demand(path.isAbsolute(directory)&&HASH.test(expected),'owner-command-package-load');const seal=readFileSync(path.join(directory,'seal.json'));
  demand(sha(seal)===expected,'owner-command-package-seal');const manifest=JSON.parse(seal);ownerCommandArgs(manifest.mode,manifest.bind);
  const replay=prepareOwnerCommand({commandId:manifest.commandId,mode:manifest.mode,bind:manifest.bind,engine:manifest.engine,descriptorSha256:manifest.descriptorSha256});
  demand(replay.packageSha256===expected,'owner-command-package-manifest');
  for(const[name,pin]of Object.entries(manifest.sourceFiles))demand(sha(readFileSync(path.join(directory,name)))===pin,'owner-command-package-source');
  return replay;
}
export function validateOwnerCommandResult(raw,prepared){
  demand(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=8192,'owner-command-result-cap');let value;
  try{value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}catch{demand(false,'owner-command-result-json');}
  const keys=['schemaVersion','packageSha256','commandId','mode','bind','startedAt','endedAt','passed','errorCode','dispatched','executionStopped',
    'stdoutSha256','stderrSha256','identity','credentialsCopied','credentialReadByWrapper','privateValuesIncluded','inferenceCalled','settingsChanged',
    'nativeOutcomeConfirmed','admissionClosed','drainProved'];
  demand(value&&Object.keys(value).sort().join()===keys.sort().join()&&value.schemaVersion==='runaai-owner-command-result/v1'
    &&value.packageSha256===prepared.packageSha256&&value.commandId===prepared.manifest.commandId&&value.mode===prepared.manifest.mode
    &&value.bind===prepared.manifest.bind&&value.identity==='RUNA-HOME\\Matthew'&&typeof value.passed==='boolean'
    &&value.dispatched===true&&typeof value.executionStopped==='boolean'&&HASH.test(value.stderrSha256)
    &&[value.stdoutSha256===null,HASH.test(value.stdoutSha256)].some(Boolean)
    &&[value.errorCode===null,typeof value.errorCode==='string'&&/^(owner-command|runtime-probe)-[a-z0-9-]+$/.test(value.errorCode)].some(Boolean)
    &&Number.isFinite(Date.parse(value.startedAt))&&Date.parse(value.endedAt)>=Date.parse(value.startedAt)
    &&['credentialsCopied','credentialReadByWrapper','privateValuesIncluded','inferenceCalled','settingsChanged','nativeOutcomeConfirmed','admissionClosed','drainProved'].every(key=>value[key]===false)
    &&(!value.passed||value.executionStopped===true&&value.errorCode===null&&HASH.test(value.stdoutSha256)),'owner-command-result');
  return Object.freeze(value);
}

/** Adapter for the existing controller. The callback owns staging/task collection and must return raw
 * immutable result bytes. This adapter cannot confirm the native mutation; the controller does that. */
export function createOwnerCommandExecutor({executeTask}){
  demand(typeof executeTask==='function','owner-command-executor');
  return async({commandId,mode,bind=null,baseline})=>{
    const prepared=prepareOwnerCommand({commandId,mode,bind,engine:baseline.engine,descriptorSha256:baseline.descriptorSha256});
    const raw=await executeTask(prepared);const result=validateOwnerCommandResult(raw,prepared);
    if(!result.passed||!result.executionStopped){const error=Object.assign(Error('owner-command-unconfirmed'),
      {code:'owner-command-unconfirmed',executionStopped:result.executionStopped===true});throw error;}
    return {stdoutSha256:result.stdoutSha256,stderrSha256:result.stderrSha256,packageSha256:prepared.packageSha256,result};
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [mode,directory,...extra]=process.argv.slice(2);demand(mode==='PrepareStatus'&&path.isAbsolute(directory)&&extra.length===0,'owner-command-cli');
  const prepared=prepareOwnerCommand({commandId:randomUUID(),mode:'status',engine:{pid:14568,startedAt:'2026-08-23T14:19:15.3385098Z',
    executable:'C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe'},descriptorSha256:'0aeff4b66f35f258f6ec60fc661add55e4e2d38fbc1791278ab0c0c4713ec8c3'});
  process.stdout.write(JSON.stringify(writeOwnerCommandPackage(directory,prepared))+'\n');
}
