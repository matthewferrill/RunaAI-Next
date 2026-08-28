import test from 'node:test';
import assert from 'node:assert/strict';
import {hostname} from 'node:os';
import {projectNativeProcessing,nativeProcessingCommand,createNativeProcessingObserver,NATIVE_PROCESSING_SOURCES} from './native-processing.mjs';
const expected=[{identifier:'synthetic-llm',modelKey:'synthetic-llm',type:'llm'},
  {identifier:'synthetic-embedding',modelKey:'synthetic-embedding',type:'embedding'}];
const raw=()=>expected.map(value=>({...value,deviceIdentifier:null,status:'idle',queued:0,displayName:'NOT EXPORTED',path:'NOT EXPORTED'}));
const options=()=>({expectedModels:expected,startedAt:1000,finishedAt:2000,now:2500});
test('native observer has only the supported read-only ps JSON command',()=>{
  assert.deepEqual(nativeProcessingCommand(),['ps','--json']);
});
test('both language and embedding status/count metadata are projected without claiming drain or exposing other data',()=>{
  const value=projectNativeProcessing(raw(),options());assert.equal(value.observedIdle,true);assert.equal(value.drainProved,false);
  assert.equal(value.admissionClosed,false);assert.equal(value.inferenceCalled,false);assert.equal(JSON.stringify(value).includes('NOT EXPORTED'),false);
  for(const [index,status,queued]of [[0,'processingPrompt',1],[0,'generating',1],[1,'computingEmbedding',2],[0,'idle',1]]){
    const input=raw();Object.assign(input[index],{status,queued});assert.equal(projectNativeProcessing(input,options()).observedIdle,false);
  }
  const empty=projectNativeProcessing([],{...options(),expectedModels:[]});assert.equal(empty.observedIdle,true);assert.equal(empty.drainProved,false);
});
test('missing, duplicate, unknown, remote or changing model identities fail closed',()=>{
  for(const change of [v=>v.pop(),v=>v.push(v[0]),v=>v[0].identifier='other',v=>v[0].modelKey='other',v=>v[0].type='unknown',
    v=>v[0].deviceIdentifier='remote',v=>v[0].status='unknown',v=>delete v[0].status,v=>v[0].queued=-1,
    v=>v[0].queued=NaN,v=>v[0].queued=1.1,v=>v[0].privatePrompt='NEVER PRINT']){
    const input=raw();change(input);assert.throws(()=>projectNativeProcessing(input,options()),error=>{
      assert.equal(error.message.includes('NEVER PRINT'),false);return true;});
  }
  assert.throws(()=>projectNativeProcessing(raw(),{...options(),expectedModels:[expected[0],expected[0]]}),/duplicate/);
});
test('stale, future or overly long processing snapshots are never classified as current idle',()=>{
  for(const values of [{now:1900},{now:7001},{startedAt:0,finishedAt:6000,now:6000},{finishedAt:999},
    {startedAt:NaN},{finishedAt:Infinity}])assert.throws(()=>projectNativeProcessing(raw(),{...options(),...values}),/stale/);
});
test('real observer construction is inert, source bound and rejects non-Home verification',async()=>{
  let assertions=0;const codePins=Object.fromEntries(NATIVE_PROCESSING_SOURCES.map(name=>[name,'a'.repeat(64)]));
  const observer=createNativeProcessingObserver({codePins,assertOwnership:async()=>{assertions++;}});assert.equal(assertions,0);
  await assert.rejects(()=>observer.observe({baseline:null,expectedModels:[]}),/not-verified/);
  if(hostname().toUpperCase()!=='RUNA-HOME')await assert.rejects(()=>observer.verify(),/native-server-host/);
  assert.equal(assertions,0);
});
