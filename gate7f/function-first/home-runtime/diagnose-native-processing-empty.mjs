// Bounded read-only failure classification. Raw CLI output remains in Home-local memory only.
import {execFileSync} from 'node:child_process';
import {writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const output=path.join(import.meta.dirname,'evidence/20260828-native-processing-empty-diagnostic.json');assert.equal(existsSync(output),false);
const script=`import{readFileSync}from'node:fs';import{hostname}from'node:os';import{spawn}from'node:child_process';
import{createHash}from'node:crypto';import assert from'node:assert/strict';
assert.equal(hostname().toUpperCase(),'RUNA-HOME');const hash=b=>createHash('sha256').update(b).digest('hex');
const cli='C:\\\\Users\\\\Matthew\\\\.lmstudio\\\\bin\\\\lms.exe',descriptor='C:\\\\Users\\\\Matthew\\\\.lmstudio\\\\.internal\\\\http-server.json';
assert.equal(hash(readFileSync(cli)),'976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5');
assert.equal(hash(readFileSync(descriptor)),'0aeff4b66f35f258f6ec60fc661add55e4e2d38fbc1791278ab0c0c4713ec8c3');
const startedAt=new Date().toISOString();
const result=await new Promise(resolve=>{const out=[],err=[];let bytes=0,ended=false,timer,stop;
 const child=spawn(cli,['ps','--json'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,LMS_API_SERVER_INFO_PATH:descriptor}});
 const done=(closed,code)=>{if(ended)return;ended=true;clearTimeout(timer);clearTimeout(stop);
 const stdout=Buffer.concat(out),stderr=Buffer.concat(err),text=stdout.toString('utf8')+'\\n'+stderr.toString('utf8');
 const terms=['authentication','permission','unauthorized','forbidden','API server','local LM Studio','ECONNREFUSED','lms-key','token','fetch failed','TypeError','ReferenceError','unknown option','failed to connect','connection refused','cannot connect','not running','Invalid JSON','EPERM','EACCES','Client identifier','passkey','API key','Error'];
 resolve({closed,exitCode:code,stdoutBytes:stdout.length,stderrBytes:stderr.length,stdoutSha256:hash(stdout),stderrSha256:hash(stderr),
 classifications:terms.filter(term=>text.toLowerCase().includes(term.toLowerCase()))});};
 const fail=()=>{try{child.kill();}catch{}if(!stop)stop=setTimeout(()=>{child.stdout.destroy();child.stderr.destroy();child.unref();done(false,null);},1000);};
 timer=setTimeout(fail,5000);child.on('error',fail);
 child.stdout.on('data',b=>{bytes+=b.length;if(bytes>16384)fail();else out.push(b);});child.stderr.on('data',b=>{bytes+=b.length;if(bytes>16384)fail();else err.push(b);});
 child.on('close',code=>done(true,code));});
const response=await fetch('http://127.0.0.1:1234/api/v1/models',{redirect:'error',headers:{connection:'close'},signal:AbortSignal.timeout(5000)});
assert.equal(response.status,200);const registry=await response.json();assert.equal(registry.models.flatMap(v=>v.loaded_instances).length,0);
console.log(JSON.stringify({schemaVersion:'runaai-native-processing-diagnostic/v1',startedAt,endedAt:new Date().toISOString(),...result,
 afterResidentCount:0,rawOutputRetained:false,readOnly:true,inferenceCalled:false,settingsChanged:false,credentialsReadByCollector:false,privateValuesIncluded:false}));`;
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],
  {input:Buffer.from(script),timeout:20000,maxBuffer:16384,windowsHide:true});
const result=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
writeFileSync(output,raw,{flag:'wx'});console.log(JSON.stringify({output,sha256:sha(raw),collectorScriptSha256:sha(script),...result}));
