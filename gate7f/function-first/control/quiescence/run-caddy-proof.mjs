import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CaddyAdmin} from './caddy-admin.mjs';
import {WindowsCaddyFile} from './windows-file.mjs';
import {CaddyQuiescenceCoordinator,configDigest,digest} from './coordinator.mjs';

const binarySha256='5cb9ab71e5756ce72840b8234177a2f40c8b4ab47a806b8e841e2b784e9df62b';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
async function backend(handler){const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');return {server,port:server.address().port};}
async function get(url){const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(5000)});return {status:response.status,text:await response.text()};}
async function closed(portNumber){return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port:portNumber});
  socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));socket.setTimeout(500,()=>{socket.destroy();resolve(false);});});}

export async function runCaddyQuiescenceProof({binary,outputDirectory}){
  assert.equal(process.platform,'win32');assert.equal(digest(await readFile(binary)),binarySha256);
  const output=path.resolve(outputDirectory);await mkdir(output);
  const fixture=await mkdtemp(path.join(await realpath(tmpdir()),'m1-caddy-quiescence-'));
  const report={schemaVersion:'runaai-caddy-quiescence-proof/v1',startedAt:new Date().toISOString(),binarySha256,
    fixture,checks:[],events:[],modelCalls:0,homeChanges:false,productionChanges:false,passed:false};
  const servers=[],ports=[],logs=[];let child=null,held=null,startedResolve=null,logBytes=0;
  const started=new Promise(resolve=>{startedResolve=resolve;});
  const check=(name,actual,expected)=>{report.checks.push({name,actual,expected});assert.deepEqual(actual,expected,name);};
  try{
    const application=await backend((request,response)=>{
      if(request.url==='/api/slow'){held=response;startedResolve();return;}
      response.end('application');
    });servers.push(application.server);ports.push(application.port);
    const provider=await backend((_request,response)=>response.end('provider'));servers.push(provider.server);ports.push(provider.port);
    const other=await backend((_request,response)=>response.end('unrelated'));servers.push(other.server);ports.push(other.port);
    const [adminPort,appPort,privatePort,providerPort,otherPort]=await Promise.all(Array.from({length:5},port));
    ports.push(adminPort,appPort,privatePort,providerPort,otherPort);assert.equal(new Set(ports).size,ports.length);
    const base=`{\n  admin 127.0.0.1:${adminPort}\n  default_bind 127.0.0.1\n  auto_https off\n  persist_config off\n}\n`
      +`http://127.0.0.1:${appPort} {\n  handle_path /auth/* {\n    reverse_proxy 127.0.0.1:${other.port}\n  }\n  handle {\n    reverse_proxy 127.0.0.1:${application.port}\n  }\n}\n`
      +`http://127.0.0.1:${privatePort} {\n  reverse_proxy 127.0.0.1:${application.port}\n}\n`
      +`http://127.0.0.1:${providerPort} {\n  reverse_proxy 127.0.0.1:${provider.port}\n}\n`
      +`http://127.0.0.1:${otherPort} {\n  reverse_proxy 127.0.0.1:${other.port}\n}\n`;
    const original=Buffer.from(base),filename=path.join(fixture,'Caddyfile');await writeFile(filename,original,{flag:'wx'});
    child=spawn(binary,['run','--config',filename,'--adapter','caddyfile'],{cwd:fixture,windowsHide:true,stdio:['ignore','pipe','pipe'],
      env:{...process.env,APPDATA:path.join(fixture,'appdata'),LOCALAPPDATA:path.join(fixture,'localappdata'),XDG_CONFIG_HOME:path.join(fixture,'config'),XDG_DATA_HOME:path.join(fixture,'data')}});
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logBytes+=chunk.length;if(logBytes<262144)logs.push(chunk);});
    report.ownedCaddyPid=child.pid;
    const admin=new CaddyAdmin({baseUrl:`http://127.0.0.1:${adminPort}`,operationMs:3000});
    let snapshot=null;const readyUntil=Date.now()+10000;
    while(Date.now()<readyUntil&&!snapshot){if(child.exitCode!==null)throw Error('fixture-caddy-exited');
      snapshot=await admin.snapshot().catch(()=>null);if(!snapshot)await pause(100);}
    assert.ok(snapshot,'fixture admin is ready');
    check('every synthetic Caddy listener is explicitly loopback',Object.values(snapshot.config.apps.http.servers)
      .flatMap(server=>server.listen).every(address=>address.startsWith('127.0.0.1:')),true);
    const file=new WindowsCaddyFile({directory:fixture,allowSyntheticFixture:true,operationMs:5000});
    let sequence=0;
    const journal={async save(state){report.events.push({phase:state.phase,event:state.events.at(-1)});
      await writeFile(path.join(fixture,'journal-'+String(++sequence).padStart(4,'0')+'.json'),JSON.stringify(state),{flag:'wx'});}};
    const coordinator=new CaddyQuiescenceCoordinator({admin,file,journal,maximumDrainMs:5000,pollMs:100,stableSamples:3});
    const scopes=[{siteAddress:`http://127.0.0.1:${appPort}`,mode:'api'},
      {siteAddress:`http://127.0.0.1:${privatePort}`,mode:'api'},
      {siteAddress:`http://127.0.0.1:${providerPort}`,mode:'all'}];
    const upstreams=[`127.0.0.1:${application.port}`,`127.0.0.1:${provider.port}`];
    const prepare=()=>coordinator.prepare({transitionId:randomUUID().replaceAll('-',''),expectedFileSha256:digest(original),
      expectedConfigSha256:configDigest(snapshot.config),scopes,upstreams});
    const prepared=await prepare();
    const slow=fetch(`http://127.0.0.1:${appPort}/api/slow`,{signal:AbortSignal.timeout(15000)}).then(async response=>({status:response.status,text:await response.text()}));
    // Attach the rejection handler immediately: a fixture failure must not leave
    // an unhandled pending network promise while cleanup closes its own sockets.
    slow.catch(()=>{});
    await Promise.race([started,pause(5000).then(()=>{if(!held)throw Error('fixture-no-real-dispatch');})]);
    check('actual slow request counted before reload',(await admin.upstreams()).find(value=>value.address===upstreams[0]).num_requests,1);
    const closedState=await coordinator.closeAdmission(prepared);
    check('actual same slow request still counted after reload',(await admin.upstreams()).find(value=>value.address===upstreams[0]).num_requests,1);
    await assert.rejects(admin.replace({config:snapshot.config,etag:snapshot.etag}),/quiescence-admin-etag-drift/u);
    check('actual stale ETag leaves maintenance config unchanged',configDigest((await admin.snapshot()).config),closedState.overlayConfigSha256);
    check('new application API rejected',(await get(`http://127.0.0.1:${appPort}/api/new`)).status,503);
    check('new private-address API rejected',(await get(`http://127.0.0.1:${privatePort}/api/new`)).status,503);
    check('new provider request rejected',(await get(`http://127.0.0.1:${providerPort}/v1/models`)).status,503);
    check('unrelated host continues',await get(`http://127.0.0.1:${otherPort}/`),{status:200,text:'unrelated'});
    check('authentication route preserved',await get(`http://127.0.0.1:${appPort}/auth/check`),{status:200,text:'unrelated'});
    check('static application route preserved',await get(`http://127.0.0.1:${appPort}/`),{status:200,text:'application'});
    const release=setTimeout(()=>{held.end('completed original request');held=null;},250);
    let quiescent;try{quiescent=await coordinator.drain(closedState);}finally{clearTimeout(release);}
    check('held request completes normally',await slow,{status:200,text:'completed original request'});
    check('control receipt requires actual stable drain',quiescent.phase,'control-quiescent');
    check('control receipt does not claim Home quiescence',quiescent.homeQuiescenceProved,false);
    const restored=await coordinator.rollback(quiescent);
    check('rollback recorded',restored.phase,'restored');
    check('exact original file restored',digest(await readFile(filename)),digest(original));
    check('exact original active config restored',configDigest((await admin.snapshot()).config),configDigest(snapshot.config));
    check('application works after restore',await get(`http://127.0.0.1:${appPort}/api/new`),{status:200,text:'application'});
    check('provider works after restore',await get(`http://127.0.0.1:${providerPort}/v1/models`),{status:200,text:'provider'});
    await assert.rejects(file.compareAndSwap('0'.repeat(64),Buffer.from('not the original')),/quiescence-file-cas-rejected/u);
    check('real stale byte CAS left original intact',digest(await readFile(filename)),digest(original));
    report.passed=true;
  }catch(error){report.errorCode=error.code??error.message;report.errorMessage=error.message;}
  finally{
    held?.end('fixture cleanup');
    if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await Promise.race([exited,pause(5000)]);}
    for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    report.cleanup={ownedCaddyStopped:!!child&&(child.exitCode!==null||child.signalCode!==null),ownedPortsClosed:await Promise.all(ports.map(closed)),
      retainedSyntheticFixtureAndJournal:true,productionChanges:false};
    if(!report.cleanup.ownedCaddyStopped||report.cleanup.ownedPortsClosed.some(value=>!value))report.passed=false;
    report.finishedAt=new Date().toISOString();
    await writeFile(path.join(output,'caddy.log'),Buffer.concat(logs),{flag:'wx'});
    await writeFile(path.join(output,'proof.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4)throw Error('usage: run-caddy-proof.mjs PINNED_CADDY_PATH NEW_OUTPUT_DIRECTORY');
  const report=await runCaddyQuiescenceProof({binary:process.argv[2],outputDirectory:process.argv[3]});
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,errorCode:report.errorCode??null,cleanup:report.cleanup,outputDirectory:process.argv[3]}));
  process.exitCode=report.passed?0:1;
}
