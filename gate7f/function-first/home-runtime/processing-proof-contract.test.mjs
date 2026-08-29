import test from 'node:test';import assert from 'node:assert/strict';
import {NOMIC,PROOF_POLICY,projectSample,validateRequestFixture,validateSamplerResult,validateRequestResult} from './processing-proof-contract.mjs';
const fixture={type:'request',role:'embedding',url:'http://192.168.50.165:1234/v1/embeddings',input:{model:NOMIC.key,input:[
  'search_document: In the fictional garden plan, pale stones mark the north room. The note lists no other room.',
  'search_query: Which room has pale stones?']}};
test('the frozen synthetic request body is exact and rejects changed inputs',()=>{
  assert.deepEqual(validateRequestFixture(structuredClone(fixture)),fixture.input);
  for(const mutate of [v=>v.input.model='other',v=>v.input.input.pop(),v=>v.url='http://other/v1/embeddings',v=>v.token='secret']){
    const value=structuredClone(fixture);mutate(value);assert.throws(()=>validateRequestFixture(value),/processing-proof/);}
});
test('positive samples retain only exact status and queue metadata',()=>{
  const raw=[{identifier:NOMIC.key,modelKey:NOMIC.key,type:'embedding',deviceIdentifier:null,status:'computingEmbedding',queued:4,
    displayName:'NOT EXPORTED',path:'NOT EXPORTED',newSdkMetadata:'NOT EXPORTED',prompt:'NOT EXPORTED'}];
  const value=projectSample(raw,{instanceId:NOMIC.key,startedAt:1000,finishedAt:1100,now:1200});
  assert.deepEqual(value,{startedAt:new Date(1000).toISOString(),finishedAt:new Date(1100).toISOString(),identifier:NOMIC.key,
    modelKey:NOMIC.key,type:'embedding',status:'computingEmbedding',queued:4});
  for(const mutate of [v=>v.push(v[0]),v=>v[0].identifier='other',v=>v[0].modelKey='other',v=>v[0].status='unknown',
    v=>v[0].queued=-1,v=>v[0].deviceIdentifier='remote']){const input=structuredClone(raw);mutate(input);
      assert.throws(()=>projectSample(input,{instanceId:NOMIC.key,startedAt:1000,finishedAt:1100,now:1200}),/processing-proof/);}
});
test('terminal proof requires both active and queued evidence and all requests settled',()=>{
  const hash='a'.repeat(64),base={proofId:'20260829-native-processing-nomic-r1',sealSha256:hash,instanceId:NOMIC.key};
  assert.equal(validateSamplerResult({schemaVersion:'runaai-native-processing-sampler-result/v1',...base,samplesSha256:hash,
    sampleCount:4,positiveObserved:true,queueObserved:true,maximumQueued:3,statuses:['idle','computingEmbedding'],identity:'RUNA-HOME\\Matthew',
    passed:true,errorCode:null,inferenceCalled:false,privateValuesIncluded:false,admissionClosed:false,drainProved:false},base).maximumQueued,3);
  const request={schemaVersion:'runaai-native-processing-request-result/v1',...base,requestCount:PROOF_POLICY.requestCount,
    succeeded:PROOF_POLICY.requestCount,failed:0,unknown:0,maximumElapsedMs:100,aggregateSha256:hash,modelId:NOMIC.key,
    vectorCount:PROOF_POLICY.requestCount*2,dimension:NOMIC.dimension,inferenceCalled:true,syntheticOnly:true,privateValuesIncluded:false};
  assert.equal(validateRequestResult(request,base).succeeded,PROOF_POLICY.requestCount);
  for(const change of [v=>v.failed=1,v=>v.unknown=1,v=>v.succeeded--,v=>v.dimension=1]){const value={...request};change(value);
    assert.throws(()=>validateRequestResult(value,base),/processing-proof/);}
});
