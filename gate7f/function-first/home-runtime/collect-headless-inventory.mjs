// Explicit between-model read-only collection. The installed binaries are read/hashed, never run.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const output=path.join(import.meta.dirname,'evidence/20260828-headless-inventory.json');
assert.equal(existsSync(output),false);
const inspector=readFileSync(path.join(import.meta.dirname,'inspect-headless-inventory.mjs'));
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
 'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],
 {input:inspector,timeout:30000,maxBuffer:32768,windowsHide:true});
const value=JSON.parse(raw);assert.equal(value.schemaVersion,'runaai-headless-inventory/v1');
for(const name of ['cliExecuted','modelsCalled','settingsChanged','credentialsRead','privateValuesIncluded'])assert.equal(value[name],false);
assert.equal(value.readOnly,true);assert.equal(value.host.toUpperCase(),'RUNA-HOME');
assert.equal(value.observations.length,2);
writeFileSync(output,raw,{flag:'wx'});
console.log(JSON.stringify({output,sha256:sha(raw),inspectorSha256:sha(inspector),observedAt:value.observedAt,
 observations:value.observations}));
