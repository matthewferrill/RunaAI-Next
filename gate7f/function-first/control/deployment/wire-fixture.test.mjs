import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {listen,closeServer,observeSockets,raw,localCaddyConfig,sleep,evidenceWireFrames,EVIDENCE_WIRE_RESPONSE,verifySources} from './wire-fixture.mjs';
import {HEALTH_EXPRESSION} from './assembly.mjs';
import {fileURLToPath} from 'node:url';
import {EVIDENCE_RESPONSE_FORMAT,isEvidenceOutput} from '../../evidence-output.mjs';
import {validateProfile,validateRequest} from '../../home-runtime/contracts.mjs';

const binary=process.env.M1_CADDY_BINARY??(existsSync('D:\\Projects\\Runalab\\artifacts\\tools\\caddy\\bin\\caddy.exe')
  ?'D:\\Projects\\Runalab\\artifacts\\tools\\caddy\\bin\\caddy.exe':'C:\\AI\\RunaAI-Next-Candidate\\tools\\caddy\\caddy.exe');
const certificates={directory:path.join(tmpdir(),'synthetic-unopened-certificate-path'),pin:()=> 'a'.repeat(64)};
const input=()=>({binary,certificates,frontPort:53219,tlsPort:53220});
const collect=(node,name,out=[])=>{if(!node||typeof node!=='object')return out;
  if(node.handler===name)out.push(node);for(const child of Object.values(node))collect(child,name,out);return out;};

test('wire projection retains exact closed/final routing without sticky input/write deadlines',()=>{
  for(const phase of ['candidate-closed','final']){
    const {config,original}=localCaddyConfig({...input(),phase});
    assert.deepEqual(config.apps.http.servers.synthetic.listen,['127.0.0.1:53219']);
    assert.deepEqual(original.listen,['127.0.0.1:9770']);
    assert.equal(collect(config,'request_body').length,0);
    for(const proxy of collect(config,'reverse_proxy')){
      assert.deepEqual(proxy.upstreams,[{dial:'127.0.0.1:53220'}]);
      assert.equal(proxy.transport.response_header_timeout,65e9);assert.equal(proxy.transport.tls.handshake_timeout,10e9);
    }
    const serialized=JSON.stringify(config);assert.ok(!serialized.includes('write_timeout'));assert.ok(!serialized.includes('read_timeout'));
    assert.equal(serialized.includes(HEALTH_EXPRESSION.replaceAll('"','\\"')),phase==='candidate-closed');
  }
});
for(const mutate of [value=>value.frontPort=9770,value=>value.tlsPort=1234,value=>value.tlsPort='192.168.50.165:9776',
  value=>value.client='../real-key',value=>value.issuer='../real-ca',value=>value.serverName='other.example',value=>value.phase='unverified']){
  test('wire helper refuses unsafe fixture substitution '+String(mutate),()=>{const value=input();mutate(value);assert.throws(()=>localCaddyConfig(value));});
}
async function socketFixture(handler,run){
  const sockets=new Set(),server=net.createServer({allowHalfOpen:true},handler);observeSockets(server,sockets);const port=await listen(server);
  try{return await run(port);}finally{for(const socket of sockets)socket.destroy();await closeServer(server);}
}
test('raw ordinary HTTP fixture does not TCP-half-close before its server response',async()=>{
  let prematureEnd=false,received='';
  await socketFixture(socket=>{socket.on('end',()=>{prematureEnd=true;});socket.on('data',async bytes=>{
    received+=bytes.toString();await sleep(25);assert.equal(prematureEnd,false);
    socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK');});},async port=>{
    const wire='GET /health HTTP/1.1\r\nHost: synthetic\r\nConnection: close\r\n\r\n';
    const result=await raw(port,wire,{timeout:1000});assert.equal(result.status,200);assert.equal(result.error,null);
    assert.equal(result.tcpHalfClose,false);assert.equal(result.serverTerminated,true);assert.equal(result.requestWire,wire);assert.equal(received,wire);
  });
});
test('raw client guard remains an explicit failure, not server timeout evidence',async()=>{
  await socketFixture(()=>{},async port=>{const result=await raw(port,'GET / HTTP/1.1\r\n',{timeout:75});
    assert.equal(result.status,null);assert.equal(result.error,'fixture-client-timeout');assert.equal(result.serverTerminated,false);assert.equal(result.termination,'fixture');});
});
test('raw response-free server closure is distinct from the fixture client guard',async()=>{
  await socketFixture(socket=>socket.on('data',()=>socket.end()),async port=>{
    const result=await raw(port,'GET / HTTP/1.1\r\n\r\n',{timeout:1000});assert.equal(result.status,null);
    assert.equal(result.error,null);assert.equal(result.serverTerminated,true);assert.equal(result.termination,'server-end');});
});

test('new wire source includes exact shared schema and all current proxy pins',()=>{
  const pins=verifySources(fileURLToPath(new URL('../../',import.meta.url)));
  assert.equal(pins.length,8);assert.ok(pins.some(pin=>pin.file==='evidence-output.mjs'));
});

test('four prospective schema frames retain one valid contract and three independently denied changes',()=>{
  const profile=validateProfile({schemaVersion:'runaai-qualified-home-profile/v1',candidateId:'gemma',
    appSourceCommit:'1'.repeat(40),runtimeSealSha256:'2'.repeat(64),qualificationGradesSha256:'3'.repeat(64)});
  const base={model:profile.candidate.key,max_tokens:512,temperature:0,reasoning_effort:'none',messages:[{role:'user',content:'Synthetic wire fixture.'}]};
  const original=JSON.stringify(EVIDENCE_RESPONSE_FORMAT),frames=evidenceWireFrames(base,EVIDENCE_RESPONSE_FORMAT);
  assert.equal(frames.length,4);assert.equal(JSON.stringify(EVIDENCE_RESPONSE_FORMAT),original);assert.equal(base.response_format,undefined);
  assert.equal(frames.filter(frame=>!frame.denied).length,1);
  for(const frame of frames){const run=()=>validateRequest(profile,'/v1/chat/completions','POST',Buffer.from(JSON.stringify(frame.body)));
    if(frame.denied)assert.throws(run,/runtime-response-format-not-qualified/u);else assert.doesNotThrow(run);
  }
  assert.equal(isEvidenceOutput(JSON.parse(JSON.parse(EVIDENCE_WIRE_RESPONSE).choices[0].message.content)),true);
});
