import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const output=path.join(import.meta.dirname,'evidence/20260828-native-drain-source.json');assert.equal(existsSync(output),false);
const inspector=readFileSync(path.join(import.meta.dirname,'inspect-native-drain-source.mjs'));
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
 'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],{input:inspector,timeout:30000,maxBuffer:131072,windowsHide:true});
const value=JSON.parse(raw);assert.equal(value.schemaVersion,'runaai-native-drain-source-inspection/v1');
assert.equal(value.readOnly,true);assert.equal(value.vendorCodeExecuted,false);assert.equal(value.credentialStoreRead,false);
assert.equal(value.sourceSha256,'6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f');
writeFileSync(output,raw,{flag:'wx'});console.log(JSON.stringify({output,sha256:sha(raw),observedAt:value.observedAt,sections:value.sections.map(({needle,count})=>({needle,count}))}));
