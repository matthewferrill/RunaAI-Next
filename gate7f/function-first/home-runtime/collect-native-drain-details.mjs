// Bounded, read-only second static inspection. No vendor code execution, HTTP call, settings,
// credentials, logging files or model operations. Retain new bytes, never rewrite the first report.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const output=path.join(import.meta.dirname,'evidence/20260828-native-drain-details.json');
assert.equal(existsSync(output),false);
const original=readFileSync(path.join(import.meta.dirname,'inspect-native-drain-source.mjs'),'utf8');
const needleLine=original.split(/\r?\n/).find(line=>line.startsWith('const needles='));assert.ok(needleLine);
const needles=['openPredictions','DiagnosticsExternalAPIProvider','predictionStatus','getModelInfo',
 'modelInstancesSignal','httpServerConfigFile','settingsFile','tryStopServer','No models loaded',
 'noModelLoaded','noModelsLoaded','justInTimeModelLoading'];
let inspector=original.replace(needleLine,`const needles=${JSON.stringify(needles)};`)
 .replace('matches.length<3','matches.length<8').replace('index-450','index-700').replace('index+1800','index+3500')
 .replace('runaai-native-drain-source-inspection/v1','runaai-native-drain-details-inspection/v1');
assert.notEqual(inspector,original);
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
 'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],
 {input:Buffer.from(inspector),timeout:30000,maxBuffer:524288,windowsHide:true});
const value=JSON.parse(raw);assert.equal(value.schemaVersion,'runaai-native-drain-details-inspection/v1');
assert.equal(value.readOnly,true);assert.equal(value.vendorCodeExecuted,false);assert.equal(value.credentialStoreRead,false);
assert.equal(value.sourceSha256,'6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f');
writeFileSync(output,raw,{flag:'wx'});
console.log(JSON.stringify({output,sha256:sha(raw),inspectorSha256:sha(inspector),observedAt:value.observedAt,
 sections:value.sections.map(({needle,count})=>({needle,count}))}));
