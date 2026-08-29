import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {sha} from './tls-primitives.mjs';
import {loadOwnerCommandPackage,validateOwnerCommandResult} from './owner-command.mjs';
const [source,target,pin,...extra]=process.argv.slice(2);assert.equal(extra.length,0);assert.ok(path.isAbsolute(source)&&path.isAbsolute(target)&&!existsSync(target));
const prepared=loadOwnerCommandPackage(source,pin),files={};for(const name of [...Object.keys(prepared.files),...['Stage-result.json','Run-result.json','Inspect-result.json','Collect-result.json','Cleanup-result.json']])files[name]=readFileSync(path.join(source,name));
const collect=JSON.parse(files['Collect-result.json']),raw=Buffer.from(collect.resultBase64,'base64');const result=validateOwnerCommandResult(raw,prepared);
assert.equal(result.mode,'status');assert.equal(result.passed,true);assert.equal(result.executionStopped,true);assert.equal(result.nativeOutcomeConfirmed,false);
assert.equal(JSON.parse(files['Cleanup-result.json']).workerAlive,false);files['result.json']=raw;mkdirSync(target);
for(const[name,bytes]of Object.entries(files))writeFileSync(path.join(target,name),bytes,{flag:'wx'});
const index={schemaVersion:'runaai-owner-command-retention/v1',packageSha256:pin,commandId:prepared.manifest.commandId,taskName:prepared.manifest.taskName,
  mode:'status',passed:true,nativeOutcomeConfirmed:false,drainProved:false,files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:sha(bytes)}]))};
writeFileSync(path.join(target,'EXPORT.json'),JSON.stringify(index,null,2)+'\n',{flag:'wx'});process.stdout.write(JSON.stringify({target,...index})+'\n');
