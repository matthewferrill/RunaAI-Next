import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {validateRequest,validateProfile,sha} from './contracts.mjs';
import {createRuntimeProxy} from './proxy.mjs';
const fixturePath=new URL('./evidence/20260828-actual-wire-shapes/fixtures.json',import.meta.url);
const fixtures=JSON.parse(readFileSync(fixturePath));
const profile=candidateId=>validateProfile({schemaVersion:'runaai-qualified-home-profile/v1',candidateId,
  appSourceCommit:'a'.repeat(40),runtimeSealSha256:'b'.repeat(64),qualificationGradesSha256:'c'.repeat(64)});
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;}
async function close(server){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}

test('retained actual Mastra answer/planner/Nomic/BGE requests satisfy the unmodified guard contract',()=>{
  assert.equal(fixtures.schemaVersion,'runaai-home-runtime-wire-fixtures/v1');assert.equal(fixtures.modelsCalled,false);
  assert.equal(fixtures.records.length,23);
  for(const candidate of ['gemma','coder','qwen36']){
    const rows=fixtures.records.filter(record=>record.id.startsWith('smoke-'+candidate+'-'));
    assert.deepEqual(rows.map(record=>record.role),['chat','research','review','code','agent','embedding','reranker']);
  }
  for(const record of fixtures.records){const bytes=Buffer.from(JSON.stringify(record.request)),before=sha(bytes);
    validateRequest(profile(record.candidateId),record.path,record.method,bytes);assert.equal(sha(bytes),before);
    assert.equal(record.sources.every(source=>/^[a-f0-9]{64}$/.test(source.sha256)),true);
  }
});

test('all23 actual synthetic request/reply projections pass through real local HTTP unchanged, no model calls',async()=>{
  let current=null;const seen=[];let admissions=0,releases=0;
  const upstream=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);
    seen.push({path:req.url,bytes:Buffer.concat(chunks)});res.writeHead(current.responseStatus,{'content-type':'application/json'});res.end(current.responseText);});
  const upstreamUrl=await listen(upstream);
  const controller={get profile(){return profile(current.candidateId);},async admit(){admissions++;return {generation:'synthetic-wire-only',signal:new AbortController().signal,release(){releases++;}};}};
  const proxy=createRuntimeProxy({controller,upstream:upstreamUrl,rerankerUpstream:upstreamUrl,allowedClients:['127.0.0.1']});
  const url=await listen(proxy);
  try{
    for(const record of fixtures.records){current=record;const bytes=Buffer.from(JSON.stringify(record.request));
      const response=await fetch(url+record.path,{method:'POST',headers:{'content-type':'application/json'},body:bytes});
      assert.equal(response.status,record.responseStatus,record.id);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(record.responseText),record.id);
      assert.equal(seen.at(-1).path,record.path);assert.deepEqual(seen.at(-1).bytes,bytes,record.id);
    }
    assert.equal(admissions,23);assert.equal(releases,23);
  }finally{await close(proxy);await close(upstream);}
});
