// Explicit between-model static-code copy. Never execute/import vendor source, inspect stores,
// call models/settings, or publish the vendor bundle. Only its metadata enters repo evidence.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const pin='6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f';
const output=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness/native-source-cache',pin+'.bin');
assert.equal(readFileSync(path.join(path.dirname(output),'.gitignore'),'utf8').trim(),'*');assert.equal(existsSync(output),false);
const script=`import {openSync,closeSync,fstatSync,lstatSync,readFileSync} from 'node:fs';
import {hostname} from 'node:os';import {createHash} from 'node:crypto';import path from 'node:path';import assert from 'node:assert/strict';
assert.equal(hostname().toUpperCase(),'RUNA-HOME');
const file='C:\\\\Users\\\\Matthew\\\\AppData\\\\Local\\\\Programs\\\\LM Studio\\\\resources\\\\app\\\\.webpack\\\\main\\\\index.js';
for(let current=file;current!==path.dirname(current);current=path.dirname(current))assert.equal(lstatSync(current).isSymbolicLink(),false);
const fd=openSync(file,'r');try{const before=fstatSync(fd);assert.equal(before.size,24258428);assert.equal(before.nlink,1);
const bytes=readFileSync(fd),after=fstatSync(fd);assert.equal(after.ino,before.ino);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.nlink,1);
assert.equal(bytes.length,before.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),'${pin}');process.stdout.write(bytes);
}finally{closeSync(fd);}`;
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],
  {input:Buffer.from(script),timeout:30000,maxBuffer:25*1024*1024,windowsHide:true});
assert.equal(raw.length,24258428);assert.equal(sha(raw),pin);writeFileSync(output,raw,{flag:'wx'});
const value={schemaVersion:'runaai-native-static-source-cache/v1',observedAt:new Date().toISOString(),sourceSha256:pin,sourceBytes:raw.length,
  collectorScriptSha256:sha(script),readOnly:true,vendorCodeExecuted:false,modelsCalled:false,settingsRead:false,credentialsRead:false,
  cachedOnlyInIgnoredLocalArtifacts:true,vendorBundlePublished:false};
const evidence=path.join(import.meta.dirname,'evidence/20260828-native-source-cache.json');
writeFileSync(evidence,JSON.stringify(value,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,evidence,...value}));
