// Explicit between-model static inspection only. Does not execute lms or read its private stores.
import {execFileSync} from 'node:child_process';
import {writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const output=path.join(import.meta.dirname,'evidence/20260828-native-processing-cli-static.json');
assert.equal(existsSync(output),false);
const pin='976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5';
const script=`import{openSync,closeSync,fstatSync,lstatSync,readFileSync}from'node:fs';
import{hostname}from'node:os';import{createHash}from'node:crypto';import path from'node:path';import assert from'node:assert/strict';
assert.equal(hostname().toUpperCase(),'RUNA-HOME');assert.equal(process.version,'v22.22.1');
const file='C:\\\\Users\\\\Matthew\\\\.lmstudio\\\\bin\\\\lms.exe';
for(let current=file;current!==path.dirname(current);current=path.dirname(current))assert.equal(lstatSync(current).isSymbolicLink(),false);
const fd=openSync(file,'r');let bytes;try{const before=fstatSync(fd);assert.equal(before.size,120772792);assert.equal(before.nlink,1);
bytes=readFileSync(fd);const after=fstatSync(fd);assert.equal(after.ino,before.ino);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.nlink,1);
assert.equal(bytes.length,before.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),'${pin}');}finally{closeSync(fd);}
const source=bytes.toString('utf8'),sections=[];
for(const [needle,length]of [['psCommand.action',6500],['process.env.LMS_API_SERVER_INFO_PATH === undefined',2400],['getInstanceProcessingState()',1400]]){
const offsets=[];let offset=0;while(true){const found=source.indexOf(needle,offset);if(found<0)break;offsets.push(found);offset=found+needle.length;}
const selected=needle==='getInstanceProcessingState()'?offsets.slice(-2):offsets.slice(0,1);
sections.push({needle,count:offsets.length,matches:selected.map(index=>({index,code:source.slice(Math.max(0,index-100),index+length)}))});}
console.log(JSON.stringify({schemaVersion:'runaai-native-processing-cli-static/v1',observedAt:new Date().toISOString(),sourceSha256:'${pin}',
sourceBytes:bytes.length,readOnly:true,cliExecuted:false,modelsCalled:false,settingsRead:false,credentialsRead:false,privateValuesIncluded:false,sections}));`;
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],
  {input:Buffer.from(script),timeout:30000,maxBuffer:32768,windowsHide:true});
const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
assert.equal(value.sourceSha256,pin);assert.equal(value.cliExecuted,false);assert.equal(value.credentialsRead,false);
assert.equal(value.schemaVersion,'runaai-native-processing-cli-static/v1');
writeFileSync(output,raw,{flag:'wx'});console.log(JSON.stringify({output,sha256:sha(raw),collectorScriptSha256:sha(script),
  sections:value.sections.map(({needle,count})=>({needle,count})),observedAt:value.observedAt}));
