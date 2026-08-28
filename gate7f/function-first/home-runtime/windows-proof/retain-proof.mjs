import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const id=process.argv[2];assert.match(id,/^[a-f0-9]{32}$/);
const local=resolve('artifacts/m1-readiness/windows-os-proof-'+id);
const target=resolve('gate7f/function-first/home-runtime/evidence/20260828-control-os-proof-'+id);
const raw=readFileSync(resolve(local,'collect-result.json'));const exported=JSON.parse(raw);
const decoded=Object.fromEntries(Object.entries(exported.files).map(([name,data])=>[name,Buffer.from(data,'base64')]));
const result=JSON.parse(decoded['result.json']);const worker=JSON.parse(decoded['requests\\localservice-result.json']);
const supervisor=JSON.parse(decoded['public\\supervisor-result.json']);
assert.equal(result.passed,true);assert.equal(result.failure,null);assert.equal(result.nodeVersion,'v24.19.0');
assert.equal(result.root,'C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-runtime-os-proof-'+id);
assert.equal(Object.keys(result.checks).length,7);assert.ok(Object.values(result.checks).every(value=>value===true));
assert.equal(worker.principalSid,'S-1-5-19');assert.equal(worker.passed,true);
assert.equal(Object.keys(worker.checks).length,7);assert.ok(Object.values(worker.checks).every(value=>value===true));
assert.equal(supervisor.principalSid,'S-1-5-18');assert.equal(supervisor.survivedChildExit,true);
assert.equal(exported.remainingOwnedTasks.length,0);assert.equal(result.taskResults.length,2);
assert.ok(result.taskResults.every(task=>task.lastResult===0));
assert.ok(Object.values(exported.acls).every(acl=>acl.protected===true&&acl.owner==='BUILTIN\\Administrators'));
assert.doesNotMatch(exported.acls.state.sddl,/;;;LS\)/);assert.match(exported.acls.requests.sddl,/0x1301bf;;;LS\)/);
assert.equal(exported.modelOperations,false);assert.equal(exported.productionChanges,false);
const packet=JSON.parse(readFileSync(resolve(local,'transfer.json')));
const manifest=JSON.parse(Buffer.from(packet['package.json'],'base64'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(Buffer.from(packet['package.json'],'base64')),result.packageSha256);
for(const [name,pin] of Object.entries(manifest.files))assert.equal(sha(Buffer.from(packet[name],'base64')),pin);
mkdirSync(target);mkdirSync(resolve(target,'package'));
const write=(name,bytes)=>writeFileSync(resolve(target,name),bytes,{flag:'wx'});
write('raw-export.json',raw);
for(const [name,data] of Object.entries(packet)){assert.match(name,/^[A-Za-z0-9.-]+$/);write('package/'+name,Buffer.from(data,'base64'));}
for(const [name,bytes] of Object.entries(decoded)){assert.match(name,/^[A-Za-z0-9._\\-]+$/);write(name.replaceAll('\\','--'),bytes);}
const index={schemaVersion:'runaai-windows-os-proof-retention/v1',id,rawExportSha256:sha(raw),packageSha256:result.packageSha256,
  pass:true,scope:'Control Windows principals, ACLs, exclusive native lock, independent watchdog and exact cleanup only',
  nativeHomeRuntimeQualified:false,files:Object.fromEntries(Object.entries(decoded).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:sha(bytes)}]))};
write('retention.json',JSON.stringify(index,null,2)+'\n');console.log(JSON.stringify({retained:true,target,rawExportSha256:index.rawExportSha256}));
