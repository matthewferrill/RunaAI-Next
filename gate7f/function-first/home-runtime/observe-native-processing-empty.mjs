// One bounded between-model status call. No lifecycle, inference, settings or credential operation.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {privateChildText} from './private-child-result.mjs';
import {demand,sha} from './tls-primitives.mjs';
const output=path.join(import.meta.dirname,'evidence/20260828-native-processing-empty.json');assert.equal(existsSync(output),false);
const staticBytes=readFileSync(path.join(import.meta.dirname,'evidence/20260828-native-processing-cli-static.json'));
assert.equal(sha(staticBytes),'9b228891db967b818f5bf92566d0aa61b6e4cb0b278b32ee7d8b28abc39ce603');
const staticProof=JSON.parse(staticBytes);assert.equal(staticProof.cliExecuted,false);
assert.ok(staticProof.sections.find(value=>value.needle==='psCommand.action').matches[0].code.includes('queued: instanceProcessingState.queued'));
const script=`import{readFileSync,lstatSync}from'node:fs';import{hostname}from'node:os';import{spawn}from'node:child_process';
import{createHash}from'node:crypto';import assert from'node:assert/strict';
const demand=${demand.toString()};const privateChildText=${privateChildText.toString()};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hostname().toUpperCase(),'RUNA-HOME');assert.equal(process.version,'v22.22.1');
assert.equal(hash(readFileSync(process.execPath)),'923a41f268ab49ede2e3363fbdd9e790609e385c6f3ca880b4ee9a56a8133e5a');
const cli='C:\\\\Users\\\\Matthew\\\\.lmstudio\\\\bin\\\\lms.exe';
const descriptor='C:\\\\Users\\\\Matthew\\\\.lmstudio\\\\.internal\\\\http-server.json';
for(const file of[cli,descriptor]){const st=lstatSync(file);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1);}
assert.equal(hash(readFileSync(cli)),'976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5');
const rawDescriptor=readFileSync(descriptor),descriptorSha256=hash(rawDescriptor);assert.equal(JSON.parse(rawDescriptor).port,41343);
async function emptyInventory(){const reply=await fetch('http://127.0.0.1:1234/api/v1/models',
 {redirect:'error',headers:{connection:'close'},signal:AbortSignal.timeout(5000)});assert.equal(reply.status,200);
 let count=0;const chunks=[];for await(const chunk of reply.body){count+=chunk.length;assert.ok(count<=1048576);chunks.push(chunk);}
 const value=JSON.parse(Buffer.concat(chunks));assert.ok(Array.isArray(value.models));
 const loaded=value.models.flatMap(model=>{assert.ok(Array.isArray(model.loaded_instances));return model.loaded_instances;});assert.equal(loaded.length,0);return loaded.length;}
const beforeResidentCount=await emptyInventory(),startedAt=new Date().toISOString();
let reply=null,error=null;try{const child=spawn(cli,['ps','--json'],{windowsHide:true,stdio:['pipe','pipe','pipe'],
 env:{...process.env,LMS_API_SERVER_INFO_PATH:descriptor}});const pending=privateChildText(child,{timeoutMs:5000});child.stdin.end();reply=await pending;
 const parsed=JSON.parse(reply.stdout);assert.ok(Array.isArray(parsed)&&parsed.length===0);
}catch(caught){error={code:'native-processing-empty-unconfirmed',executionStopped:caught?.executionStopped===true};reply=null;}
const endedAt=new Date().toISOString(),afterResidentCount=await emptyInventory();assert.equal(hash(readFileSync(descriptor)),descriptorSha256);
console.log(JSON.stringify({schemaVersion:'runaai-native-processing-empty-proof/v1',startedAt,endedAt,host:'RUNA-HOME',passed:error===null,
 command:['ps','--json'],descriptorSha256,internalPort:41343,beforeResidentCount,afterResidentCount,
 stdoutBase64:reply?Buffer.from(reply.stdout).toString('base64'):null,stdoutSha256:reply?hash(reply.stdout):null,
 stderrBytes:reply?Buffer.byteLength(reply.stderr):null,error,readOnly:true,inferenceCalled:false,admissionClosed:false,
 drainProved:false,positiveBusyStateProved:false,settingsChanged:false,credentialsRead:false,privateValuesIncluded:false}));`;
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],
  {input:Buffer.from(script),timeout:30000,maxBuffer:16384,windowsHide:true});
const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));assert.equal(value.schemaVersion,'runaai-native-processing-empty-proof/v1');
writeFileSync(output,raw,{flag:'wx'});console.log(JSON.stringify({output,sha256:sha(raw),collectorScriptSha256:sha(script),...value}));
if(!value.passed)process.exitCode=1;
