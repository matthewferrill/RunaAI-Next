import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './lease-contract.mjs';
const round=process.argv[2];assert.match(round,/^r[3-9][0-9]*$/);
const here=import.meta.dirname,repository=path.resolve(here,'../../..');
const hardwareSha256='d4e0d0b96ff4d1c15fb05801dff5c9b0f166c1c308cbbbf4e1a5eeed404e6c80';
const results=[];
for(const candidateId of ['coder','qwen36','gemma']){
  const leaseId=`20260828-campaign-${candidateId}-${round}`;
  const source=path.join(repository,'artifacts/m1-readiness',leaseId),target=path.join(here,'evidence',leaseId);
  assert.equal(existsSync(target),false);
  const packetBytes=readFileSync(path.join(source,'transfer.json'));
  const packet=JSON.parse(packetBytes),files={};
  for(const[name,value]of Object.entries(packet)){
    assert.match(name,/^[a-z][a-z-]*\.(?:mjs|ps1|json)$/i);
    const bytes=Buffer.from(value,'base64');assert.deepEqual(bytes,readFileSync(path.join(source,name)));files[name]=bytes;
  }
  const seal=JSON.parse(files['seal.json']);assert.equal(seal.leaseId,leaseId);
  assert.equal(seal.createdBeforeModelLoads,true);assert.equal(seal.files['campaign-hardware-plan.json'],hardwareSha256);
  for(const[name,digest]of Object.entries(seal.files))assert.equal(sha(files[name]),digest);
  mkdirSync(target);
  for(const[name,bytes]of Object.entries({...files,'transfer.json':packetBytes}))writeFileSync(path.join(target,name),bytes,{flag:'wx'});
  results.push({leaseId,sealSha256:sha(files['seal.json']),sourceCommit:seal.sourceCommit});
}
console.log(JSON.stringify({hardwareSha256,results,homeChanged:false}));
