import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {sha,policyForLease} from './lease-contract.mjs';

const evidence=path.join(import.meta.dirname,'evidence');
const planBytes=readFileSync(path.join(evidence,'20260828-campaign-hardware-plan-r1.json'));
const plan=JSON.parse(planBytes);
const planHash='d4e0d0b96ff4d1c15fb05801dff5c9b0f166c1c308cbbbf4e1a5eeed404e6c80';
test('prospective common campaign plan has immutable bytes and bounded authority',()=>{
  assert.equal(sha(planBytes),planHash);
  assert.equal(plan.createdBeforeLoads,true);
  assert.equal(plan.maximumConcurrentPrimaries,1);
  assert.equal(plan.policy.readyLeaseMs,3600000);
  assert.equal(plan.policy.taskDeadlineMs,4440000);
  assert.equal(plan.productionRoutingChanged,false);
  assert.equal(plan.protectedDataIncluded,false);
  assert.equal(plan.candidates.length,3);
});
test('retained orchestration bytes survive checkout normalization',()=>{
  for(const[name,hash]of Object.entries(plan.operatorFiles)){
    assert.equal(sha(readFileSync(path.join(evidence,'20260828-campaign-operator-r1',name))),hash);
  }
});
for(const candidate of plan.candidates)test(`sealed ${candidate.id} campaign package binds common policy and exact sources`,()=>{
  const dir=path.join(evidence,`20260828-campaign-${candidate.id}-r1`);
  const seal=JSON.parse(readFileSync(path.join(dir,'seal.json')));
  const config=JSON.parse(readFileSync(path.join(dir,'lease-config.json')));
  const packet=JSON.parse(readFileSync(path.join(dir,'transfer.json')));
  assert.equal(seal.schemaVersion,'runa-m1-campaign-lease-seal/v1');
  assert.equal(seal.createdBeforeModelLoads,true);
  assert.equal(seal.leaseId,config.leaseId);
  assert.equal(config.campaignHardwarePlanSha256,planHash);
  assert.deepEqual(config.candidate,candidate.artifact);
  assert.deepEqual(policyForLease(config),plan.policy);
  assert.deepEqual(config.auxiliary,plan.auxiliary.artifact);
  for(const[name,hash]of Object.entries(seal.files)){
    const bytes=readFileSync(path.join(dir,name));
    assert.equal(sha(bytes),hash);
    assert.deepEqual(Buffer.from(packet[name],'base64'),bytes);
  }
  for(const[name,hash]of Object.entries(plan.sourceFiles))assert.equal(seal.files[name],hash);
  assert.equal(sha(readFileSync(path.join(dir,'campaign-hardware-plan.json'))),planHash);
});
