import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const [id,...extra]=process.argv.slice(2);assert.equal(extra.length,0);assert.match(id,/^[a-f0-9]{32}$/);
const source=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness','tls-acl-proof-'+id);
const collected=JSON.parse(readFileSync(path.join(source,'collect-result.json')));
assert.deepEqual(Object.keys(collected).sort(),['package.json','result.json']);
const rawResult=Buffer.from(collected['result.json'],'base64'),rawPackage=Buffer.from(collected['package.json'],'base64');
assert.deepEqual(rawPackage,readFileSync(path.join(source,'package.json')));
const result=JSON.parse(rawResult),manifest=JSON.parse(rawPackage);
assert.equal(result.schemaVersion,'runaai-tls-native-acl-proof/v1');assert.equal(result.passed,true);assert.equal(result.failure,null);
assert.equal(result.packageSha256,sha(rawPackage));assert.equal(result.root,manifest.root);
assert.equal(Object.keys(result.checks).length,6);assert.ok(Object.values(result.checks).every(value=>value===true));
assert.equal(result.productionChanged,false);assert.equal(result.modelsLoaded,false);assert.equal(result.tasksCreated,false);
const files={'result.json':rawResult,'package.json':rawPackage};
for(const[name,pin]of Object.entries(manifest.files)){
  assert.ok(['Runtime-Windows.ps1','Tls-Windows.ps1','Invoke-ControlTlsAclProof.ps1'].includes(name));
  const bytes=readFileSync(path.join(source,name));assert.equal(sha(bytes),pin);files[name]=bytes;
}
for(const name of ['run-result.json','run-failed-result.txt'])if(existsSync(path.join(source,name)))files[name]=readFileSync(path.join(source,name));
const target=path.join(import.meta.dirname,'evidence','20260828-tls-acl-'+id);assert.equal(existsSync(target),false);mkdirSync(target);
for(const[name,bytes]of Object.entries(files))writeFileSync(path.join(target,name),bytes,{flag:'wx'});
const index={schemaVersion:'runaai-tls-acl-proof-retention/v1',root:result.root,privateValuesIncluded:false,
  files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:sha(bytes)}]))};
writeFileSync(path.join(target,'EXPORT.json'),JSON.stringify(index,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({target,...index}));
