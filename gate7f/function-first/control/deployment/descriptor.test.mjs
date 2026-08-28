import test from 'node:test';
import assert from 'node:assert/strict';
import {APPLICATION,hash} from './assembly.mjs';
import {buildAssemblyDescriptor,closedCompanionArguments,UNIMPLEMENTED_BOUNDARIES} from './descriptor.mjs';
import {syntheticAssembly,bytes} from './deployment.fixtures.mjs';

test('synthetic packaging plan binds exact source and all supplied bytes without claiming qualification/activation',()=>{
  const fixture=syntheticAssembly(),d=fixture.descriptor;
  assert.equal(d.application.sourceCommit,APPLICATION.sourceCommit);assert.equal(d.activationPermitted,false);
  assert.equal(d.qualification.verified,false);assert.equal(d.home.activated,false);assert.equal(d.home.installationValidated,false);
  assert.deepEqual(d.blockers,UNIMPLEMENTED_BOUNDARIES);assert.equal(fixture.descriptorSha256,hash(d));
  assert.equal(Object.keys(d.filePins).length,8);assert.equal(Object.keys(d.operatorFiles).length,4);
});
for(const [name,edit] of [
  ['changed identity',v=>{const c=JSON.parse(v.files['candidate.json']);c.gate7a.ordinaryClient.clientId='other';v.files['candidate.json']=bytes(c);}],
  ['wrong app source',v=>{const m=JSON.parse(v.files['gate7a-release.json']);m.commit='2'.repeat(40);v.files['gate7a-release.json']=bytes(m);}],
  ['wrong frozen seal',v=>{const p=JSON.parse(v.files['m1-successor-plan.json']);p.runtimeSealSha256='2'.repeat(64);v.files['m1-successor-plan.json']=bytes(p);}],
  ['mixed Home profile',v=>v.homeProfile.candidateId='coder'],
  ['wrong grades',v=>v.homeProfile.qualificationGradesSha256='2'.repeat(64)],
  ['wrong candidate route bytes',v=>v.caddy.candidateClosedBytes=Buffer.from('open')],
  ['unknown TLS file',v=>v.files['client-key.pem']=Buffer.from('not a credential, forbidden anyway')],
  ['path-injected companion',v=>v.companion.files[0].path='../foreign.ps1'],
  ['altered helper byte',v=>v.companion.files[1].bytes=Buffer.from('changed')],
  ['manifest stale role selection',v=>{const m=JSON.parse(v.files['gate7a-release.json']);m.model.models.code='other';v.files['gate7a-release.json']=bytes(m);}],
  ['wrong launcher',v=>v.files['Run-Application.ps1']=Buffer.from('node old-app')],
])test('packaging rejects '+name,()=>{const {input}=syntheticAssembly();edit(input);assert.throws(()=>buildAssemblyDescriptor(input));});

test('later closed-phase argv is exact data only and keeps final config separate from held candidate-closed Caddy',()=>{
  const {descriptor,descriptorSha256}=syntheticAssembly();
  const result=closedCompanionArguments({descriptor,expectedDescriptorSha256:descriptorSha256,
    heldCaddySha256:descriptor.caddy.candidateClosedSha256,heldCaddyETag:'"synthetic-etag"'});
  const values=Object.fromEntries(Array.from({length:result.arguments.length/2},(_,index)=>result.arguments.slice(index*2,index*2+2)));
  assert.equal(values['-CaddyfileSha256'],descriptor.caddy.finalSha256);assert.equal(values['-HeldCaddySha256'],descriptor.caddy.candidateClosedSha256);
  assert.equal(values['-ExpectedCommit'],APPLICATION.sourceCommit);assert.equal(result.executionAuthorized,false);
  assert.throws(()=>closedCompanionArguments({descriptor,expectedDescriptorSha256:descriptorSha256,
    heldCaddySha256:descriptor.caddy.finalSha256,heldCaddyETag:'"other"'}));
});
