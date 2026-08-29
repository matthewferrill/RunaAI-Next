import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,X509Certificate} from 'node:crypto';
import {createServer as createHttpServer,request as httpRequest} from 'node:http';
import {request as httpsRequest,Agent} from 'node:https';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {LegacyCompatibilityJournal} from './legacy-journal.mjs';
import {createLegacyCompatibilityAdapter} from './legacy-adapter.mjs';
import {createLegacyCompatibilityServer} from './legacy-server.mjs';

const openssl='C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
const sha=value=>createHash('sha256').update(value).digest('hex'),pin=value=>sha(new X509Certificate(value).raw);
const id=n=>n.toString(16).padStart(32,'0'),hex=n=>n.toString(16).padStart(64,'0');
function certificates(root){
  const run=args=>execFileSync(openssl,args,{cwd:root,windowsHide:true,timeout:15000,stdio:'pipe',maxBuffer:262144});
  run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','issuer.key','-out','issuer.crt','-days','1','-subj','/CN=legacy-test-ca','-addext','basicConstraints=critical,CA:TRUE']);
  const leaf=(name,usage,san)=>{run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name]);
    writeFileSync(path.join(root,name+'.ext'),`basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=${usage}\nsubjectAltName=${san}\n`,{flag:'wx'});
    run(['x509','-req','-in',name+'.csr','-CA','issuer.crt','-CAkey','issuer.key','-CAcreateserial','-out',name+'.crt','-days','1','-sha256','-extfile',name+'.ext']);};
  leaf('home','serverAuth','DNS:runa-home-legacy.internal');leaf('control','clientAuth','DNS:runa-control-legacy.internal');leaf('other','clientAuth','DNS:other.internal');
  const read=name=>readFileSync(path.join(root,name));return {ca:read('issuer.crt'),home:read('home.crt'),homeKey:read('home.key'),client:name=>({cert:read(name+'.crt'),key:read(name+'.key')})};
}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;}
async function close(server){if(!server)return;server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
function send(port,certs,{client='control',pathName='/v1/chat/completions',method='POST',body=Buffer.alloc(0)}={}){return new Promise((resolve,reject)=>{
  const credentials=client?certs.client(client):{};const req=httpsRequest({host:'127.0.0.1',port,path:pathName,method,ca:certs.ca,...credentials,
    servername:'runa-home-legacy.internal',agent:new Agent({maxCachedSessions:0}),headers:{'content-type':'application/json','content-length':String(body.length)}},async res=>{
      const chunks=[];for await(const chunk of res)chunks.push(chunk);resolve({status:res.statusCode,raw:Buffer.concat(chunks)});});req.once('error',reject);req.end(body);
});}
function requestNative(port,item){return new Promise((resolve,reject)=>{const req=httpRequest({host:'127.0.0.1',port,path:item.pathname,method:item.method,signal:item.signal,
    headers:item.raw.length?{'content-type':'application/json','content-length':String(item.raw.length)}:{}},async res=>{const chunks=[];for await(const chunk of res)chunks.push(chunk);
    resolve({status:res.statusCode,headers:{'content-type':res.headers['content-type']??''},raw:Buffer.concat(chunks)});});req.once('error',reject);req.end(item.raw);});}

test('actual disposable mTLS wire preserves legacy requests, rejects foreign clients, closes and restores without touching live endpoints',async()=>{
  const parent=realpathSync(os.tmpdir()),root=mkdtempSync(path.join(parent,'m1-legacy-wire-')),journalDirectory=path.join(root,'journal');mkdirSync(journalDirectory);
  let native,wire;const sockets=new Set(),nativeCalls=[],events=[];
  try{
    const certs=certificates(root),client=certs.client('control'),binding={schemaVersion:'runaai-legacy-compatibility-binding/v1',transitionId:id(1),
      legacy:{sourceCommit:'a'.repeat(40),configSha256:hex(2),modelAlias:'qwen/qwen3-4b',embeddingModel:'text-embedding-nomic-embed-text-v1.5'},
      control:{endpoint:'127.0.0.1:9771',sourceAddress:'127.0.0.1',caddyBinarySha256:hex(3),clientCertificateSha256:pin(client.cert)},
      home:{endpoint:'192.168.50.165:9777',serverName:'runa-home-legacy.internal',serverCertificateSha256:pin(certs.home),nativeEndpoint:'127.0.0.1:1234'},
      models:{mappedPrimaryId:'installed-primary',mappedPrimaryFingerprint:hex(6),embeddingId:'text-embedding-nomic-embed-text-v1.5',embeddingFingerprint:hex(7)},
      limits:{requestMs:65000,bodyBytes:2*1024*1024,responseBytes:4*1024*1024,maximumOutputTokens:4000,sampleMs:1},privateValuesIncluded:false};
    native=createHttpServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks),body=raw.length?JSON.parse(raw):null;
      nativeCalls.push({method:req.method,path:req.url,raw});res.writeHead(200,{'content-type':'application/json'});
      if(req.url==='/v1/chat/completions')res.end(JSON.stringify({model:body.model,choices:[{message:{role:'assistant',content:'synthetic',tool_calls:body.tools?[{id:'call-1',type:'function',function:{name:'status',arguments:'{}'}}]:undefined},finish_reason:body.tools?'tool_calls':'stop'}]}));
      else if(req.url==='/v1/embeddings')res.end(JSON.stringify({data:body.input.map((_,index)=>({index,embedding:[index,0.5]}))}));
      else if(req.url==='/v1/models')res.end(JSON.stringify({data:[{id:'installed-primary'},{id:binding.models.embeddingId}]}));
      else res.end(JSON.stringify({models:[{key:'installed-primary',loaded_instances:[{id:'installed-primary'}]}]}));});
    native.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});const nativePort=await listen(native);
    let now=Date.parse('2026-08-29T02:00:00.000Z'),routeMode='open',nextId=10;const journal=new LegacyCompatibilityJournal({directory:journalDirectory,binding,assertOwnerPrivate:async()=>{}});
    const observed=()=>({schemaVersion:'runaai-legacy-runtime-observation/v1',bindingSha256:journal.bindingSha256,observedAt:new Date(now).toISOString(),
      engineSha256:hex(8),descriptorSha256:hex(9),primaryId:binding.models.mappedPrimaryId,primaryFingerprint:binding.models.mappedPrimaryFingerprint,
      embeddingId:binding.models.embeddingId,embeddingFingerprint:binding.models.embeddingFingerprint,ready:true,privateValuesIncluded:false});
    const closed=(intentId)=>({schemaVersion:'runaai-legacy-control-route-closure/v1',transitionId:binding.transitionId,bindingSha256:journal.bindingSha256,intentId,
      endpoint:binding.control.endpoint,terminalReceiptSha256:hex(10),observationSha256:hex(11),observedAt:new Date(now).toISOString(),activeRequests:0,privateValuesIncluded:false});
    const route={close:async({intentId})=>{routeMode='closed';return closed(intentId);},assertClosed:async({intentId})=>{assert.equal(routeMode,'closed');return closed(intentId);},
      restore:async({intentId,managedReceiptSha256})=>{routeMode='open';return {schemaVersion:'runaai-legacy-control-route-restore/v1',transitionId:binding.transitionId,
        bindingSha256:journal.bindingSha256,intentId,managedReceiptSha256,endpoint:binding.control.endpoint,terminalReceiptSha256:hex(12),observationSha256:hex(13),
        observedAt:new Date(now).toISOString(),privateValuesIncluded:false};}};
    const adapter=createLegacyCompatibilityAdapter({binding,journal,upstream:{request:item=>requestNative(nativePort,item)},runtime:{observe:async()=>observed()},route,
      clock:()=>now,randomId:()=>id(nextId++),delay:async ms=>{now+=ms;},event:value=>events.push(value)});
    wire=createLegacyCompatibilityServer({binding,adapter,tls:{key:certs.homeKey,cert:certs.home,ca:certs.ca},event:value=>events.push(value)});const wirePort=await listen(wire);
    const tools=[{type:'function',function:{name:'status',parameters:{type:'object',properties:{},additionalProperties:false}}}],chat=Buffer.from(JSON.stringify({model:binding.legacy.modelAlias,
      messages:[{role:'user',content:'status'}],temperature:0.3,max_tokens:2000,tools}));
    const accepted=await send(wirePort,certs,{body:chat});assert.equal(accepted.status,200);assert.equal(JSON.parse(accepted.raw).model,binding.legacy.modelAlias);
    assert.equal(JSON.parse(nativeCalls[0].raw).model,binding.models.mappedPrimaryId);assert.deepEqual(JSON.parse(nativeCalls[0].raw).tools,tools);
    const embeddings=Buffer.from(JSON.stringify({model:binding.legacy.embeddingModel,input:['raw one','raw two']})),embedded=await send(wirePort,certs,{pathName:'/v1/embeddings',body:embeddings});
    assert.equal(embedded.status,200);assert.equal(nativeCalls[1].raw.equals(embeddings),true);assert.deepEqual(JSON.parse(embedded.raw).data.map(value=>value.index),[0,1]);
    const before=nativeCalls.length;assert.equal((await send(wirePort,certs,{client:'other',body:chat})).status,403);
    assert.equal((await send(wirePort,certs,{pathName:'/api/v1/models/load',body:Buffer.from('{}')})).status,400);assert.equal(nativeCalls.length,before);
    await assert.rejects(send(wirePort,certs,{client:null,body:chat}));assert.equal(nativeCalls.length,before);
    const closure=await adapter.close();assert.equal(closure.samples.length,3);assert.equal((await send(wirePort,certs,{body:chat})).status,503);assert.equal(nativeCalls.length,before);
    const managedReceiptSha256=hex(40);await adapter.linkManaged({managedReceiptSha256,nextReceiptSha256:hex(41),legacyReceiptSha256:closure.terminalReceiptSha256});
    await adapter.restore({managedReceiptSha256});assert.equal((await send(wirePort,certs,{method:'GET',pathName:'/v1/models'})).status,200);assert.equal(nativeCalls.length,before+1);
    assert.equal(events.some(value=>value.kind==='legacy-wire-tls-denial'),true);assert.equal(wirePort!==9777&&nativePort!==1234,true);
  }finally{
    await close(wire);for(const socket of sockets)socket.destroy();await close(native);const actual=realpathSync(root);assert.equal(path.dirname(actual),parent);
    assert.ok(path.basename(actual).startsWith('m1-legacy-wire-'));rmSync(actual,{recursive:true,force:false});
  }
});
