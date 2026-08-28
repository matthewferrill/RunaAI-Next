import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {X509Certificate,createHash} from 'node:crypto';
import {request,Agent} from 'node:https';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {createRuntimeTlsProxy,verifiedPeer} from './tls-proxy.mjs';
import {validateProfile} from './contracts.mjs';

const openssl='C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
const pin=pem=>createHash('sha256').update(new X509Certificate(pem).raw).digest('hex');
function makeCertificates(root){
  const run=args=>execFileSync(openssl,args,{cwd:root,stdio:'ignore',timeout:15000,windowsHide:true});
  for(const ca of ['issuer','foreign'])run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',ca+'.key','-out',ca+'.crt','-days','1','-subj','/CN=synthetic-'+ca,'-addext','basicConstraints=critical,CA:TRUE']);
  const leaf=(name,ca,usage,days='1')=>{
    run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN=synthetic-'+name]);
    writeFileSync(path.join(root,name+'.ext'),`basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=${usage}\nsubjectAltName=DNS:synthetic-home\n`);
    run(['x509','-req','-in',name+'.csr','-CA',ca+'.crt','-CAkey',ca+'.key','-CAcreateserial','-out',name+'.crt',
      ...(days==='expired'?['-not_before','20000101000000Z','-not_after','20000102000000Z']:['-days',days]),'-sha256','-extfile',name+'.ext']);
  };
  leaf('home','issuer','serverAuth');leaf('control','issuer','clientAuth');leaf('other','issuer','clientAuth');leaf('untrusted','foreign','clientAuth');leaf('expired','issuer','clientAuth','expired');
  const read=(name,suffix)=>readFileSync(path.join(root,name+suffix));
  return {issuer:read('issuer','.crt'),foreign:read('foreign','.crt'),home:read('home','.crt'),homeKey:read('home','.key'),
    client:name=>({cert:read(name,'.crt'),key:read(name,'.key')})};
}
const profile=()=>validateProfile({schemaVersion:'runaai-qualified-home-profile/v1',candidateId:'gemma',appSourceCommit:'1'.repeat(40),runtimeSealSha256:'2'.repeat(64),qualificationGradesSha256:'3'.repeat(64)});
function send(server,{ca,cert,key,servername='synthetic-home',body,method='POST'}){
  return new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path:method==='GET'?'/healthz':'/v1/chat/completions',method,
      ca,cert,key,servername,agent:new Agent({maxCachedSessions:0}),headers:{'content-type':'application/json'}},async res=>{
        const chunks=[];for await(const chunk of res)chunks.push(chunk);resolve({status:res.statusCode,body:Buffer.concat(chunks)});});
    req.once('error',reject);req.end(body);
  });
}

test('mutual TLS requires exact Control identity and preserves bytes over an actual encrypted local request',async()=>{
  const parent=realpathSync(os.tmpdir()),root=mkdtempSync(path.join(parent,'runa-runtime-tls-'));let server;
  try{
    const certificates=makeCertificates(root),p=profile();let admissions=0,polls=0;const seen=[];
    const controller={profile:p,admit:async()=>{admissions++;return {signal:new AbortController().signal,generation:'synthetic',release(){}};},poll:async()=>{polls++;return {phase:'ready'};}};
    const response=Buffer.from('{\n "synthetic" : true\n}\n');
    const tls={key:certificates.homeKey,cert:certificates.home,ca:certificates.issuer,caSha256:pin(certificates.issuer),
      clientCertificateSha256:pin(certificates.client('control').cert),serverCertificateSha256:pin(certificates.home)};
    assert.throws(()=>createRuntimeTlsProxy({controller,tls:{...tls,caSha256:'0'.repeat(64)}}),/tls-material-pin/);
    assert.throws(()=>createRuntimeTlsProxy({controller,tls:{...tls,rejectUnauthorized:false}}),/tls-shape/);
    server=createRuntimeTlsProxy({controller,allowedClients:['127.0.0.1'],tls,fetchImpl:async(_url,request)=>{
      seen.push(request);return {status:200,headers:{get:()=>null},body:(async function*(){yield response;})()};}});
    assert.equal(server.listening,false);server.listen(0,'127.0.0.1');await once(server,'listening');
    const body=Buffer.from('{"model":"gemma-4-26b-a4b-it-qat", "max_tokens":512,"temperature":0,"reasoning_effort":"none", "messages":[{"role":"user","content":"synthetic"}]}\n');
    const accepted=await send(server,{ca:certificates.issuer,...certificates.client('control'),body});
    assert.equal(accepted.status,200);assert.deepEqual(accepted.body,response);assert.deepEqual(seen[0].body,body);
    assert.deepEqual(Object.keys(seen[0].headers),['content-type'],'TLS credentials never forwarded to the model');
    const other=await send(server,{ca:certificates.issuer,...certificates.client('other'),body});assert.equal(other.status,403);
    for(const client of [null,'untrusted','expired'])await assert.rejects(send(server,{ca:certificates.issuer,...(client?certificates.client(client):{}),body}));
    await assert.rejects(send(server,{ca:certificates.foreign,...certificates.client('control'),body}));
    await assert.rejects(send(server,{ca:certificates.issuer,...certificates.client('control'),servername:'wrong-server',body}));
    const health=await send(server,{ca:certificates.issuer,...certificates.client('control'),method:'GET'});assert.equal(health.status,200);
    assert.equal(admissions,1);assert.equal(polls,1);
    const peer=new X509Certificate(certificates.client('control').cert);
    const socket={encrypted:true,authorized:true,getProtocol:()=> 'TLSv1.3',isSessionReused:()=>false,getPeerX509Certificate:()=>peer};
    assert.equal(verifiedPeer(socket,pin(peer.raw)),true);
    assert.equal(verifiedPeer(socket,pin(peer.raw),Date.parse(peer.validTo)+1),false,'long-lived connections cannot outlive certificate expiry');
    assert.equal(verifiedPeer({...socket,isSessionReused:()=>true},pin(peer.raw)),false);
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    const resolved=realpathSync(root);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('runa-runtime-tls-'));rmSync(resolved,{recursive:true,force:false});
  }
});
