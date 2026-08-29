import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const FIXED_PARENT='C:\\AI\\RunaAI-Next-Candidate\\staging';
const FIXED_RELEASE='C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc';
const FIXED_NODE_SHA256='bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb';
const FIXED_ENVIRONMENT=Object.freeze({SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',ComSpec:'C:\\Windows\\System32\\cmd.exe',
  PATH:'C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;C:\\Windows\\System32\\OpenSSH',
  PATHEXT:'.COM;.EXE;.BAT;.CMD',PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',SystemDrive:'C:',OS:'Windows_NT'});
const HASH=/^[a-f0-9]{64}$/u,NAME=/^m1-task-native-[a-f0-9]{32}$/u;
const fail=code=>Object.assign(new Error(code),{code});
const samePath=(left,right)=>process.platform==='win32'?left.toLowerCase()===right.toLowerCase():left===right;
const sha256File=filename=>{const info=statSync(filename);if(!info.isFile()||info.size>512*1024*1024)throw fail('m1-control-regression-entry-file');return createHash('sha256').update(readFileSync(filename)).digest('hex');};

export function purgeToOwnerEntryEnvironment(_source=process.env,target=process.env){
  const safe=process.platform==='win32'?FIXED_ENVIRONMENT:{};
  for(const key of Object.keys(target))delete target[key];for(const[key,value]of Object.entries(safe))target[key]=value;
  return Object.freeze({...safe});
}

export function parseOwnerEntryArguments(raw){
  if(raw.length!==6||raw.some(value=>typeof value!=='string'||/["\s]/u.test(value)))throw fail('m1-control-regression-entry-arguments');
  const expected=['--owned-root','--manifest','--manifest-sha256'];for(let index=0;index<3;index++)if(raw[index*2]!==expected[index])throw fail('m1-control-regression-entry-arguments');
  const root=path.resolve(raw[1]),manifestPath=path.resolve(raw[3]),manifestSha256=raw[5];
  if(!HASH.test(manifestSha256))throw fail('m1-control-regression-entry-arguments');return Object.freeze({root,manifestPath,manifestSha256});
}

export function validateOwnerEntry(parsed,{executable=process.execPath,version=process.version,whoami=spawnSync}={}){
  if(process.platform!=='win32')throw fail('m1-control-regression-entry-platform');
  const root=realpathSync(parsed.root),repository=realpathSync(path.resolve(import.meta.dirname,'../../..'));
  if(!samePath(path.dirname(root),FIXED_PARENT)||!NAME.test(path.basename(root))||!samePath(repository,root))throw fail('m1-control-regression-entry-root');
  const manifest=realpathSync(parsed.manifestPath),expectedManifest=path.join(root,'CONTROL-REGRESSION-INPUT.json');
  if(!samePath(manifest,expectedManifest)||sha256File(manifest)!==parsed.manifestSha256)throw fail('m1-control-regression-entry-manifest');
  const expectedNode=path.join(FIXED_RELEASE,'runtime','node.exe');
  if(!samePath(realpathSync(executable),expectedNode)||version!=='v22.22.0'||sha256File(executable)!==FIXED_NODE_SHA256)throw fail('m1-control-regression-entry-node');
  const whoamiPath='C:\\Windows\\System32\\whoami.exe';if(!samePath(realpathSync(whoamiPath),whoamiPath))throw fail('m1-control-regression-entry-owner');
  const identity=whoami(whoamiPath,[],
    {encoding:'utf8',windowsHide:true,timeout:10_000,maxBuffer:65_536,env:process.env});
  if(identity.error||identity.status!==0||identity.stderr!==''||identity.stdout.trim().toLowerCase()!=='runa-control\\matthew')throw fail('m1-control-regression-entry-owner');
  return Object.freeze({root,manifestPath:manifest,manifestSha256:parsed.manifestSha256});
}

export async function runOwnerEntry(rawArguments){
  const parsed=parseOwnerEntryArguments(rawArguments);purgeToOwnerEntryEnvironment();validateOwnerEntry(parsed);
  const {runOwnerSupervisor}=await import('./control-exact-regression-owner.mjs');
  return runOwnerSupervisor(['--owned-root',parsed.root,'--manifest',parsed.manifestPath,'--manifest-sha256',parsed.manifestSha256]);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const result=await runOwnerEntry(process.argv.slice(2));
    if(result.passed){if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);}
    else if(result.stdout&&result.errorCode==='m1-control-regression-run-failed')process.stdout.write(result.stdout);
    else process.stdout.write(JSON.stringify({errorCode:result.errorCode,modelsInvoked:false,protectedDataRead:false,productionChanged:false})+'\n');
    if(!result.passed)process.exitCode=1;
  }catch(error){process.stdout.write(JSON.stringify({errorCode:error.code??'m1-control-regression-entry-failed',modelsInvoked:false,
    protectedDataRead:false,productionChanged:false})+'\n');process.exitCode=1;}
}
