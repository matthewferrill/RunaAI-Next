// One prospective post-campaign probe. No default-server discovery, credential, or lifecycle call.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {privateChildText} from './private-child-result.mjs';
import {demand,sha} from './tls-primitives.mjs';
const output=path.join(import.meta.dirname,'evidence/20260828-native-remote-processing-empty.json');
assert.equal(existsSync(output),false);
const identityScript=String.raw`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$connections=@(Get-NetTCPConnection -State Listen -LocalPort 1234,41343 -ErrorAction Stop)
if(@($connections|Where-Object{$_.OwningProcess-ne14568}).Count-ne0-or@($connections|Select-Object -ExpandProperty LocalPort -Unique).Count-ne2){throw 'native-status-listener-drift'}
$p=Get-Process -Id 14568 -ErrorAction Stop
try{if($p.Path-cne'C:\Users\Matthew\AppData\Local\Programs\LM Studio\LM Studio.exe'-or$p.StartTime.ToUniversalTime().ToString('o')-cne'2026-08-23T14:19:15.3385098Z'){throw 'native-status-engine-drift'}
 @{pid=$p.Id;startedAt=$p.StartTime.ToUniversalTime().ToString('o');executable=$p.Path}|ConvertTo-Json -Compress
}finally{$p.Dispose()}`;
const script=`import{readFileSync,lstatSync}from'node:fs';import{hostname}from'node:os';import{spawn}from'node:child_process';
import{createHash}from'node:crypto';import assert from'node:assert/strict';
const demand=${demand.toString()};const privateChildText=${privateChildText.toString()};
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(hostname().toUpperCase(),'RUNA-HOME');assert.equal(process.version,'v22.22.1');
assert.equal(hash(readFileSync(process.execPath)),'923a41f268ab49ede2e3363fbdd9e790609e385c6f3ca880b4ee9a56a8133e5a');
const cli='C:\\\\Users\\\\Matthew\\\\.lmstudio\\\\bin\\\\lms.exe',descriptor='C:\\\\Users\\\\Matthew\\\\.lmstudio\\\\.internal\\\\http-server.json';
for(const file of[cli,descriptor]){const st=lstatSync(file);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1);}
const cliRaw=readFileSync(cli);assert.equal(cliRaw.length,120772792);
assert.equal(hash(cliRaw),'976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5');
const source=cliRaw.toString('utf8'),at=source.indexOf('async function createClient(');assert.ok(at>0);
const section=source.slice(at,at+6500),remoteAt=section.indexOf('if (isRemote)');assert.ok(remoteAt>0);
const remoteBranch=section.slice(remoteAt,section.indexOf('} else {',remoteAt));
assert.ok(remoteBranch.includes('lms-cli-remote-')&&!remoteBranch.includes('readFile')&&!remoteBranch.includes('clientPasskey'));
assert.ok(section.includes('if (port === undefined && host === "127.0.0.1")')&&section.includes('checkHttpServer'));
const descriptorRaw=readFileSync(descriptor),descriptorSha256=hash(descriptorRaw);assert.equal(JSON.parse(descriptorRaw).port,41343);
async function identity(){const child=spawn('C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe',
 ['-NoProfile','-NonInteractive','-EncodedCommand',${JSON.stringify(Buffer.from(identityScript,'utf16le').toString('base64'))}],
 {windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PSModulePath:'C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\Modules'}});
 const pending=privateChildText(child,{timeoutMs:10000});child.stdin.end();return JSON.parse((await pending).stdout);}
async function inventory(){const reply=await fetch('http://127.0.0.1:1234/api/v1/models',
 {redirect:'error',headers:{connection:'close'},signal:AbortSignal.timeout(5000)});assert.equal(reply.status,200);
 let count=0;const pieces=[];for await(const part of reply.body){count+=part.length;assert.ok(count<=1048576);pieces.push(part);}
 const value=JSON.parse(Buffer.concat(pieces));assert.ok(Array.isArray(value.models));
 const loaded=value.models.flatMap(model=>{assert.ok(Array.isArray(model.loaded_instances));return model.loaded_instances;});assert.equal(loaded.length,0);return 0;}
const beforeIdentity=await identity(),beforeResidentCount=await inventory(),startedAt=new Date().toISOString();
const command=['ps','--json','--host','127.0.0.1','--port','1234'];let raw=null,error=null,executionStopped=false;
try{const child=spawn(cli,command,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env}});
 const pending=privateChildText(child,{timeoutMs:5000});child.stdin.end();raw=await pending;executionStopped=true;
 const value=JSON.parse(raw.stdout);assert.ok(Array.isArray(value)&&value.length===0);
}catch(caught){raw=null;error={code:'native-remote-processing-unconfirmed',executionStopped:executionStopped||caught?.executionStopped===true};}
const endedAt=new Date().toISOString(),afterResidentCount=await inventory(),afterIdentity=await identity();assert.deepEqual(afterIdentity,beforeIdentity);assert.equal(hash(readFileSync(descriptor)),descriptorSha256);
console.log(JSON.stringify({schemaVersion:'runaai-native-remote-processing-proof/v1',host:'RUNA-HOME',startedAt,endedAt,passed:error===null,
 command,descriptorSha256,engine:afterIdentity,beforeResidentCount,afterResidentCount,clientMode:'unprivileged-explicit-loopback',
 installedBranch:{index:at,sha256:hash(section),remoteBranch,explicitPortBypassesDiscovery:true},
 stdoutBase64:raw?Buffer.from(raw.stdout).toString('base64'):null,stdoutSha256:raw?hash(raw.stdout):null,
 stderrBytes:raw?Buffer.byteLength(raw.stderr):null,error,readOnly:true,inferenceCalled:false,settingsChanged:false,
 credentialsRead:false,admissionClosed:false,drainProved:false,positiveBusyStateProved:false,privateValuesIncluded:false}));`;
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],
  {input:Buffer.from(script),timeout:45000,maxBuffer:16384,windowsHide:true});
const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
assert.equal(value.schemaVersion,'runaai-native-remote-processing-proof/v1');
writeFileSync(output,raw,{flag:'wx'});console.log(JSON.stringify({output,sha256:sha(raw),collectorScriptSha256:sha(script),...value}));
if(!value.passed)process.exitCode=1;
