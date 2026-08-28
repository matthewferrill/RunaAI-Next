import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sha} from './tls-primitives.mjs';

/** Exact-byte evidence copy only. Does not contact a host or modify an earlier attempt. */
export function retainOwnerStatus(source,target,expectedSeal){
  assert.ok(path.isAbsolute(source)&&path.isAbsolute(target)&&!existsSync(target));
  assert.match(expectedSeal,/^[a-f0-9]{64}$/);
  const sealRaw=readFileSync(path.join(source,'seal.json'));
  assert.equal(sha(sealRaw),expectedSeal);const seal=JSON.parse(sealRaw);
  assert.equal(seal.schemaVersion,'runaai-owner-status-package/v1');
  const files={'seal.json':sealRaw};
  for(const [name,pin]of Object.entries(seal.sourceFiles)){
    assert.ok(['Run-HomeOwnerStatus.ps1','Runtime-Windows.ps1'].includes(name));
    const raw=readFileSync(path.join(source,name));assert.equal(sha(raw),pin);files[name]=raw;
  }
  let collected=null,cleanup=null;
  for(const mode of ['Stage','Run','Inspect','Collect','Cleanup','CleanupFailed']){
    const name=mode+'-result.json',file=path.join(source,name);
    if(!existsSync(file))continue;
    const raw=readFileSync(file),value=JSON.parse(raw);
    assert.equal(value.schemaVersion,'runaai-owner-status-operator/v1');
    assert.equal(value.mode,mode);assert.equal(value.packageSha256,expectedSeal);
    assert.equal(value.taskName,seal.taskName);
    for(const key of ['privateValuesIncluded','inferenceCalled','settingsChanged'])assert.equal(value[key],false);
    files[name]=raw;
    if(mode==='Collect')collected=value;
    if(mode==='Cleanup'||mode==='CleanupFailed'){assert.equal(cleanup,null);cleanup=mode;}
  }
  assert.ok(files['Stage-result.json']&&files['Run-result.json']&&files['Inspect-result.json']);
  assert.ok(cleanup,'An exact task retirement receipt is required before retaining this outcome.');
  let passed=false;
  if(collected){
    assert.match(collected.resultBase64,/^[A-Za-z0-9+/]+={0,2}$/);
    const raw=Buffer.from(collected.resultBase64,'base64');
    assert.equal(raw.toString('base64'),collected.resultBase64);assert.ok(raw.length<=8192);
    const value=JSON.parse(raw);
    assert.equal(value.schemaVersion,'runaai-owner-status-result/v1');
    assert.equal(value.packageSha256,expectedSeal);assert.equal(value.identity,'RUNA-HOME\\Matthew');
    assert.equal(value.executionStopped,true);assert.deepEqual(value.command,['ps','--json']);
    for(const key of ['credentialsCopied','credentialReadByWrapper','privateValuesIncluded','inferenceCalled',
      'settingsChanged','admissionClosed','drainProved','positiveBusyStateProved'])assert.equal(value[key],false);
    passed=value.passed===true;assert.equal(cleanup,'Cleanup');files['result.json']=raw;
  }else assert.equal(cleanup,'CleanupFailed');
  for(const base of [source,path.dirname(target)]){const item=lstatSync(base);assert.ok(item.isDirectory()&&!item.isSymbolicLink());}
  mkdirSync(target);
  for(const [name,raw]of Object.entries(files))writeFileSync(path.join(target,name),raw,{flag:'wx'});
  const index={schemaVersion:'runaai-owner-status-retention/v1',packageSha256:expectedSeal,root:seal.root,
    taskName:seal.taskName,passed,cleanup,credentialsIncluded:false,drainProved:false,
    files:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,{bytes:raw.length,sha256:sha(raw)}]))};
  writeFileSync(path.join(target,'EXPORT.json'),JSON.stringify(index,null,2)+'\n',{flag:'wx'});
  return {target,...index};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [source,target,pin,...extra]=process.argv.slice(2);assert.equal(extra.length,0);
  console.log(JSON.stringify(retainOwnerStatus(source,target,pin)));
}
