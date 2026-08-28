import {openSync,closeSync,fstatSync,lstatSync,readFileSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {demand} from './tls-primitives.mjs';
import {createSettingsFileBridgeCore,SETTINGS_FILE_TARGET} from './native-settings-file-core.mjs';
import {privateChildJson} from './private-child-result.mjs';

export const SETTINGS_FILE_SOURCES=Object.freeze(['Invoke-NativeSettingsFile.ps1','Settings-FileTransaction.ps1',
  'Runtime-Windows.ps1','Tls-Windows.ps1','native-settings-file.mjs','native-settings-file-core.mjs','native-settings.mjs',
  'private-child-result.mjs','tls-primitives.mjs'].sort());
const NODE='C:\\Program Files\\nodejs\\node.exe';
const NODE_SHA='923a41f268ab49ede2e3363fbdd9e790609e385c6f3ca880b4ee9a56a8133e5a';
const POWERSHELL='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const SCRIPT=fileURLToPath(new URL('./Invoke-NativeSettingsFile.ps1',import.meta.url));
function plain(file){
  demand(path.win32.resolve(file)===file&&!file.startsWith('\\\\')&&!file.slice(2).includes(':'),'settings-file-path');
  for(let current=file;current!==path.win32.dirname(current);current=path.win32.dirname(current)){
    demand(!lstatSync(current).isSymbolicLink(),'settings-file-link');}
  const value=lstatSync(file);demand(value.isFile()&&value.nlink===1,'settings-file-kind');return value;
}
function privateRead(){
  plain(SETTINGS_FILE_TARGET);const descriptor=openSync(SETTINGS_FILE_TARGET,'r');
  try{const before=fstatSync(descriptor);demand(before.nlink===1&&before.size>0&&before.size<=4096,'settings-file-read-bounds');
    const bytes=readFileSync(descriptor),after=fstatSync(descriptor);
    demand(after.nlink===1&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs
      &&bytes.length===before.size,'settings-file-read-drift');return bytes;
  }finally{closeSync(descriptor);}
}
async function hashFile(file){
  plain(file);const descriptor=openSync(file,'r');
  try{const before=fstatSync(descriptor),hash=createHash('sha256');demand(before.nlink===1,'settings-file-pin-links');
    for await(const chunk of createReadStream(file,{fd:descriptor,autoClose:false}))hash.update(chunk);
    const after=fstatSync(descriptor);demand(after.nlink===1&&before.ino===after.ino&&before.size===after.size
      &&before.mtimeMs===after.mtimeMs,'settings-file-pin-drift');return hash.digest('hex');
  }finally{closeSync(descriptor);}
}
// No shell, command string, remote transfer, ambient stdin or dynamic executable. This child may
// have committed before a lost response; callers preserve that uncertainty and never auto-retry.
function executePrivate({args,input}){
  demand(Buffer.isBuffer(input)&&input.length<=8192&&args.every(value=>typeof value==='string'),'settings-file-child-input');
  const child=spawn(POWERSHELL,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',SCRIPT,...args],
    {windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
  const pending=privateChildJson(child);child.stdin.end(input);return pending;
}
/** Home-local adapter only. Private settings remain in local memory/pipes and the protected new
 * transaction subtree. External orchestration receives only sanitized hash-bound receipts.
 * Construction does not read or write anything. verify() must run before any other method. */
export function createNativeSettingsFileBridge(options){
  demand(options&&Object.keys(options).sort().join()==='assertMutationSettled,assertQuiescent,codePins,prepared,record,transactionId','settings-file-options');
  const {codePins,...rest}=options;
  demand(codePins&&Object.keys(codePins).sort().join()===SETTINGS_FILE_SOURCES.join()
    &&Object.values(codePins).every(value=>/^[a-f0-9]{64}$/.test(value)),'settings-file-code-pins');
  const pins=Object.freeze({...codePins});
  const verify=async()=>{
    demand(process.platform==='win32'&&hostname().toUpperCase()==='RUNA-HOME'&&process.version==='v22.22.1'
      &&process.execPath===NODE,'settings-file-host');
    demand(await hashFile(NODE)===NODE_SHA,'settings-file-node-pin');
    for(const [name,pin]of Object.entries(pins))demand(await hashFile(fileURLToPath(new URL('./'+name,import.meta.url)))===pin,'settings-file-code-drift');
  };
  return createSettingsFileBridgeCore({...rest,io:{verify,read:privateRead,execute:executePrivate}});
}
