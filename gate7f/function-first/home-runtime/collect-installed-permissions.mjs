import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=import.meta.dirname,file=path.join(root,'evidence/20260828-installed-permissions.json');
assert.equal(existsSync(file),false);
const inspector=readFileSync(path.join(root,'inspect-installed-permissions.mjs'));
const raw=execFileSync('ssh',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],{input:inspector,timeout:30000,maxBuffer:32768,windowsHide:true});
const evidence=JSON.parse(raw);assert.equal(evidence.schemaVersion,'runaai-lmstudio-permissions-static/v1');
assert.equal(evidence.readOnly,true);assert.equal(evidence.vendorCodeExecuted,false);assert.equal(evidence.credentialStoreRead,false);
assert.equal(evidence.sourceSha256,'6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f');
mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,raw,{flag:'wx'});
console.log(JSON.stringify({path:file,sha256:createHash('sha256').update(raw).digest('hex'),observedAt:evidence.observedAt,
  handlerChecks:evidence.handlerChecks,readOnly:true,credentialValuesIncluded:false}));
