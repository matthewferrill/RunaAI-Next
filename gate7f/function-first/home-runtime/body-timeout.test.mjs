import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import net from 'node:net';
import {EventEmitter,once} from 'node:events';
import {readRequestBody,createRuntimeProxy} from './proxy.mjs';
import {error,RUNTIME_LIMITS} from './contracts.mjs';

test('body timeout attempts reply before a finite exact-reader destruction',async()=>{
  const input=new PassThrough(),abort=new AbortController(),events=[];input.on('close',()=>events.push('closed'));
  const pending=readRequestBody(input,{signal:abort.signal,replyToBodyTimeout:()=>{events.push('reply');return true;}});
  const started=Date.now();abort.abort(error('request-body-timeout'));assert.deepEqual(events,['reply']);assert.equal(input.destroyed,false);
  await assert.rejects(pending,/runtime-request-body-timeout/u);await new Promise(resolve=>setTimeout(resolve,120));
  assert.ok(Date.now()-started<1000);assert.equal(input.destroyed,true);
  assert.deepEqual(events,['reply','closed']);
});
for(const callback of [()=>false,()=>{throw Error('synthetic-write-failure');}]){
  test('unavailable timeout reply falls back to immediate destruction '+String(callback),async()=>{
    const input=new PassThrough(),abort=new AbortController();const pending=readRequestBody(input,{signal:abort.signal,replyToBodyTimeout:callback});
    abort.abort(error('request-body-timeout'));assert.equal(input.destroyed,true);await assert.rejects(pending,/runtime-request-body-timeout/u);
  });
}
test('other aborts never wait for a body-timeout reply',async()=>{
  const input=new PassThrough(),abort=new AbortController();let replies=0;
  const pending=readRequestBody(input,{signal:abort.signal,replyToBodyTimeout:()=>{replies++;return true;}});
  abort.abort(error('client-disconnected'));assert.equal(input.destroyed,true);assert.equal(replies,0);await assert.rejects(pending,/runtime-client-disconnected/u);
});
test('completed body leaves no timeout callback or later destruction',async()=>{
  const input=new PassThrough(),abort=new AbortController();let replies=0;
  const pending=readRequestBody(input,{signal:abort.signal,replyToBodyTimeout:()=>{replies++;return true;}});
  input.end(Buffer.from('unchanged input'));assert.equal((await pending).toString(),'unchanged input');abort.abort(error('request-body-timeout'));assert.equal(replies,0);
});
test('a body chunk during the selected 408 flush window cannot trigger an early response destroy',async t=>{
  let handler,releases=0,upstream=0;const server=createRuntimeProxy({controller:{profile:{},admit:async()=>({generation:'synthetic',
      signal:new AbortController().signal,release:async()=>{releases++;}})},allowedClients:['127.0.0.1'],
    fetchImpl:async()=>{upstream++;throw Error('must not dispatch');},serverFactory:value=>{handler=value;return {};}});
  assert.ok(server);t.mock.timers.enable({apis:['setTimeout']});
  const req=new PassThrough();req.on('error',()=>{});req.socket={remoteAddress:'127.0.0.1'};req.method='POST';req.url='/v1/chat/completions';
  req.headers={'content-type':'application/json','content-length':'100'};
  const res=Object.assign(new EventEmitter(),{headersSent:false,destroyed:false,writableEnded:false,status:null,headers:null,body:null,
    writeHead(status,headers){this.headersSent=true;this.status=status;this.headers=headers;return this;},
    end(bytes){this.writableEnded=true;this.body=Buffer.from(bytes);return this;},destroy(){this.destroyed=true;return this;}});
  try{
    const pending=handler(req,res);await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(RUNTIME_LIMITS.bodyMs);
    assert.equal(res.status,408);assert.equal(res.destroyed,false);req.write('x');await pending;
    assert.equal(res.destroyed,false);assert.equal(releases,1);assert.equal(upstream,0);
    assert.deepEqual(JSON.parse(res.body),{schemaVersion:'runaai-home-runtime-error/v1',errorCode:'runtime-request-body-timeout',privateValuesIncluded:false});
    t.mock.timers.tick(99);assert.equal(req.destroyed,false);t.mock.timers.tick(1);assert.equal(req.destroyed,true);
  }finally{t.mock.timers.reset();req.destroy();}
});
test('lifecycle revocation interrupts a counted incomplete body before any upstream call',async()=>{
  let active=0,upstream=0,revoke;const server=createRuntimeProxy({controller:{profile:{},admit:async()=>{const controller=new AbortController();
      revoke=()=>controller.abort(error('drain-timeout'));active++;return {generation:'synthetic',signal:controller.signal,release:async()=>{active--;}};}},
    allowedClients:['127.0.0.1'],fetchImpl:async()=>{upstream++;throw Error('must not dispatch');}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const client=net.connect(server.address().port,'127.0.0.1');
  try{
    client.on('error',()=>{});await once(client,'connect');client.write('POST /v1/chat/completions HTTP/1.1\r\nHost: synthetic\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{');
    for(let index=0;index<100&&active===0;index++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(active,1);
    revoke();await once(client,'close');for(let index=0;index<100&&active!==0;index++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(active,0);assert.equal(upstream,0);
  }finally{client.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('actual ten-second incomplete HTTP body is counted, receives complete408 and releases before close',{timeout:15000},async()=>{
  let admissions=0,releases=0,active=0,upstream=0;const events=[],sockets=new Set();
  const server=createRuntimeProxy({controller:{profile:{},admit:async()=>{admissions++;active++;return {generation:'synthetic',signal:new AbortController().signal,
      release:async()=>{releases++;active--;}};}},allowedClients:['127.0.0.1'],
    fetchImpl:async()=>{upstream++;throw Error('must not dispatch');},event:value=>events.push(value)});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port,started=Date.now();let client;
  try{
    const bytes=await new Promise((resolve,reject)=>{const chunks=[];client=net.connect(port,'127.0.0.1');
      const guard=setTimeout(()=>{client.destroy();reject(Error('test-client-timeout'));},13000);
      client.on('connect',()=>client.write('GET /v1/models HTTP/1.1\r\nHost: synthetic\r\nTransfer-Encoding: chunked\r\n\r\n1\r\n'));
      client.on('data',chunk=>chunks.push(chunk));client.on('error',reject);client.on('close',()=>{clearTimeout(guard);resolve(Buffer.concat(chunks));});});
    const text=bytes.toString();assert.match(text,/^HTTP\/1\.1 408 /u);assert.match(text,/connection: close/iu);
    const body=text.split('\r\n\r\n').slice(1).join('\r\n\r\n');assert.deepEqual(JSON.parse(body),{
      schemaVersion:'runaai-home-runtime-error/v1',errorCode:'runtime-request-body-timeout',privateValuesIncluded:false});
    const length=Number(text.match(/content-length: (\d+)/iu)[1]);assert.equal(Buffer.byteLength(body),length);
    assert.ok(Date.now()-started>=RUNTIME_LIMITS.bodyMs-100);assert.ok(Date.now()-started<11500);
    await new Promise(resolve=>setTimeout(resolve,150));assert.equal(admissions,1);assert.equal(releases,1);assert.equal(active,0);assert.equal(upstream,0);
    assert.ok(events.some(event=>event.type==='denied'));assert.equal(sockets.size,0);
  }finally{client?.destroy();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
});
