import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {digest,verifySources,modules,certificates,realController,listen,unusedPort,portClosed,closeServer,
  observeSockets,backend,localCaddyConfig,startCaddy,stopCaddy,send,raw,removeFixture,sleep,SLOW_COMPLETION_RESPONSE} from './wire-fixture.mjs';

/** Local transport integration only. Real proxy/controller/Caddy, synthetic
 * lifecycle observation and ordinary loopback HTTP servers; never a real model. */
export async function runClosedWireProof({sourceRoot,binary,openssl,outputDirectory,onProgress=()=>{}}){
  assert.equal(process.platform,'win32');sourceRoot=realpathSync(sourceRoot);
  const sourcePins=verifySources(sourceRoot),proofDeadline=Date.now()+240000;
  const output=path.resolve(outputDirectory);mkdirSync(output);
  const parent=realpathSync(tmpdir()),directory=mkdtempSync(path.join(parent,'m1-closed-tls-'));
  const report={schemaVersion:'runaai-m1-closed-tls-wire-proof/v1',startedAt:new Date().toISOString(),
    sourcePins,caddySha256:digest(readFileSync(binary)),opensslSha256:digest(readFileSync(openssl)),
    nodeVersion:process.version,nodeSha256:digest(readFileSync(process.execPath)),cases:[],nativeRequests:[],proxyEvents:[],lifecycle:[],caddyChildren:[],
    realController:true,syntheticLifecycleAdapter:true,realLoopbackBackends:true,realModelsLoaded:0,homeContacted:false,controlContacted:false,productionChanged:false,passed:false};
  report.harnessSources=['run-wire-proof.mjs','wire-fixture.mjs','assembly.mjs'].map(file=>{
    const bytes=readFileSync(new URL(file,import.meta.url));return {file,sha256:digest(bytes),bytes:bytes.length,source:bytes.toString()};});
  writeFileSync(path.join(output,'harness-source.json'),JSON.stringify(report.harnessSources,null,2)+'\n',{flag:'wx'});
  const allSockets=new Set(),servers=[],ports=[],held=new Set(),modes={primary:'good',bge:'good',redirect:null};
  let caddy=null,fixtureController=null,loaded=null,certs=null,frontPort=null,tlsPort=null,redirects=0;
  const snapshot=()=>({admitAttempts:fixtureController.state.admitAttempts,admitted:fixtureController.state.admitted,released:fixtureController.state.released,
    active:fixtureController.controller.status.activeRequests,polls:fixtureController.state.polls,
    primary:report.nativeRequests.filter(v=>v.kind==='primary').length,bge:report.nativeRequests.filter(v=>v.kind==='bge').length,redirects});
  const record=async(name,action,{status=[503],admissions=0,primary=0,bge=0,minimumMs=0,maximumMs=7000,allowSocketError=false,check=()=>{}}={})=>{
    if(Date.now()>proofDeadline)throw Error('wire-proof-deadline');
    const before=snapshot(),eventStart=report.proxyEvents.length,nativeStart=report.nativeRequests.length;let result,error,errorMessage;
    try{
      result=await action();const deadline=Date.now()+1500;
      while(fixtureController.controller.status.activeRequests&&Date.now()<deadline)await sleep(10);
      assert.notEqual(result.error,'fixture-client-timeout','fixture timeout is not evidence of server enforcement');
      if(result.status)assert.ok(status.includes(result.status),'unexpected response '+result.status);
      else assert.ok(allowSocketError&&(result.error||result.serverTerminated),'missing HTTP response');
      assert.ok(result.elapsedMs>=minimumMs&&result.elapsedMs<=maximumMs,'response deadline '+result.elapsedMs);
      const after=snapshot();assert.equal(after.admitAttempts-before.admitAttempts,admissions,'controller attempted admission');
      assert.equal(after.admitted-before.admitted,admissions,'successful admission');assert.equal(after.released-before.released,admissions,'ticket release');
      assert.equal(after.primary-before.primary,primary,'actual primary requests');assert.equal(after.bge-before.bge,bge,'actual BGE requests');
      assert.equal(after.redirects-before.redirects,0,'redirect target reached');assert.equal(after.active,0,'active ticket leaked');
      check(result,report.nativeRequests.slice(nativeStart));
    }catch(e){error=e.code??e.message;errorMessage=e.message;}
    const observation={name,passed:!error,error:error??null,errorMessage:errorMessage??null,result:result??null,before,after:snapshot(),
      nativeRequests:report.nativeRequests.slice(nativeStart),proxyEvents:report.proxyEvents.slice(eventStart)};
    report.cases.push(observation);writeFileSync(path.join(output,`case-${String(report.cases.length).padStart(2,'0')}.json`),JSON.stringify(observation,null,2)+'\n',{flag:'wx'});
    onProgress({case:name,passed:observation.passed,error:observation.error});return observation;
  };
  const switchCaddy=async options=>{
    await stopCaddy(caddy);caddy=null;
    const projection=localCaddyConfig({binary,certificates:certs,frontPort,tlsPort,...options});
    report.closedProjectionSha256=projection.sourceSha256;
    caddy=await startCaddy({binary,directory,config:projection.config,report});
    caddy.record.phase=projection.phase;caddy.record.sourceProjectionSha256=projection.sourceSha256;
  };
  try{
    loaded=await modules(sourceRoot);certs=certificates(directory,openssl);report.certificatePins={issuer:certs.pin('issuer.crt'),server:certs.pin('home.crt'),client:certs.pin('control.crt')};
    fixtureController=await realController(sourceRoot,loaded,report);
    const redirect=createServer((_req,res)=>{redirects++;res.end('must not be reached');});servers.push(redirect);observeSockets(redirect,allSockets);
    const redirectPort=await listen(redirect);ports.push(redirectPort);modes.redirect=`http://127.0.0.1:${redirectPort}/trap`;
    const primary=backend('primary',report,modes,held),bge=backend('bge',report,modes,held);servers.push(primary,bge);
    for(const server of [primary,bge])observeSockets(server,allSockets);
    const primaryPort=await listen(primary),bgePort=await listen(bge);ports.push(primaryPort,bgePort);
    const proxy=loaded.tls.createRuntimeTlsProxy({controller:fixtureController.controller,tls:certs.tls,allowedClients:['127.0.0.1'],
      upstream:`http://127.0.0.1:${primaryPort}`,rerankerUpstream:`http://127.0.0.1:${bgePort}`,event:e=>report.proxyEvents.push({...e,at:Date.now()})});
    servers.push(proxy);observeSockets(proxy,allSockets);tlsPort=await listen(proxy);ports.push(tlsPort);
    proxy.on('tlsClientError',error=>{report.proxyEvents.push({type:'tls-client-error',code:error.code??'TLS_ERROR',at:Date.now()});});
    frontPort=await unusedPort();ports.push(frontPort);assert.equal(new Set(ports).size,ports.length);
    await switchCaddy({});
    const health=route=>send(frontPort,{route});
    await record('empty GET models reaches exactly primary backend',()=>health('/v1/models'),{status:[200],admissions:1,primary:1});
    await record('empty GET health reaches exactly BGE backend',()=>health('/health'),{status:[200],admissions:1,bge:1});
    for(const route of ['/v1/models?x=1','/health?x=1','/v1/models/','/v1/%6dodels','/health#suffix','/healthz','/api/v1/models/load','/unknown'])
      await record('closed path '+route,()=>health(route));
    for(const method of ['POST','HEAD','OPTIONS'])await record('closed method '+method,()=>send(frontPort,{route:'/health',method,body:method==='POST'?'{}':undefined}));
    await record('nonempty fixed length GET denied',()=>send(frontPort,{headers:{'content-length':'1'},body:'x'}));
    await record('content encoding denied',()=>send(frontPort,{headers:{'content-encoding':'gzip','content-length':'0'}}));
    const wire=(headers,body='',target='/v1/models')=>`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${frontPort}\r\nConnection: close\r\n${headers}\r\n${body}`;
    await record('nonempty chunked GET denied before admission',()=>raw(frontPort,wire('Transfer-Encoding: chunked\r\n','1\r\nx\r\n0\r\n\r\n')),{status:[400,502,503],allowSocketError:true});
    await record('empty decoded chunked GET is explicitly observed',()=>raw(frontPort,wire('Transfer-Encoding: chunked\r\n','0\r\n\r\n')),{status:[200],admissions:1,primary:1});
    const emptyRead=(response,requests)=>{assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');assert.equal(requests[0].path,'/v1/models');
      assert.equal(response.serverTerminated,true,'mixed framing must close after its one response');
      assert.equal(requests[0].bodyBytes,0);assert.equal(requests[0].bodySha256,digest(Buffer.alloc(0)));
      assert.equal(requests[0].headers['transfer-encoding'],undefined);assert.ok([undefined,'0'].includes(requests[0].headers['content-length']));
      assert.equal((response.response.match(/HTTP\/1\.[01] /gu)??[]).length,1);};
    await record('mixed CL plus empty chunked normalizes to one exact empty read, not header denial',
      ()=>raw(frontPort,wire('Content-Length: 1\r\nTransfer-Encoding: chunked\r\n','0\r\n\r\n')),{status:[200],admissions:1,primary:1,check:emptyRead});
    await record('mixed CL plus empty chunked cannot smuggle appended forbidden request',
      ()=>raw(frontPort,wire('Content-Length: 1\r\nTransfer-Encoding: chunked\r\n','0\r\n\r\n')+
        `POST /api/v1/models/load HTTP/1.1\r\nHost: 127.0.0.1:${frontPort}\r\nContent-Length: 2\r\n\r\n{}`),
      {status:[200],admissions:1,primary:1,check:emptyRead});
    for(const [name,headers,body] of [
      ['nonempty mixed content length and transfer encoding denied','Content-Length: 1\r\nTransfer-Encoding: chunked\r\n','1\r\nx\r\n0\r\n\r\n'],
      ['negative content length','Content-Length: -1\r\n',''],
      ['different duplicate lengths','Content-Length: 0\r\nContent-Length: 1\r\n','x'],
      ['invalid chunk syntax','Transfer-Encoding: chunked\r\n','Q\r\nx\r\n0\r\n\r\n']])
      await record(name,()=>raw(frontPort,wire(headers,body)),{status:[400,502,503],allowSocketError:true});
    await record('slow incomplete chunk ends under actual body deadline',()=>raw(frontPort,wire('Transfer-Encoding: chunked\r\n','1\r\n'),{end:false,timeout:16000}),
      {status:[408],minimumMs:9000,maximumMs:15000,check:response=>assert.ok(response.response.includes('runtime-request-body-timeout'))});
    await record('incomplete fixed length cannot leave an unbounded request',()=>raw(frontPort,wire('Content-Length: 1\r\n'),{end:false,timeout:16000}),
      {status:[400,502,503],maximumMs:15000,allowSocketError:true});
    modes.bge='redirect';await record('backend redirect rejected without following',()=>health('/health'),{status:[503],admissions:1,bge:1});modes.bge='good';
    modes.bge='failure';await record('backend failure status preserved',()=>health('/health'),{status:[503],admissions:1,bge:1});modes.bge='good';
    modes.bge='stall';await record('actual 15 second BGE timeout releases admission',()=>send(frontPort,{route:'/health',timeout:22000}),
      {status:[502,503],admissions:1,bge:1,minimumMs:14000,maximumMs:21000});modes.bge='good';
    modes.primary='stall';await record('actual 65 second primary timeout releases admission',()=>send(frontPort,{timeout:72000}),
      {status:[502,503,504],admissions:1,primary:1,minimumMs:64000,maximumMs:71000});modes.primary='good';
    await switchCaddy({phase:'final'});
    const completionBody=JSON.stringify({model:fixtureController.controller.profile.candidate.key,max_tokens:512,temperature:0,reasoning_effort:'none',
      messages:[{role:'user',content:'Return the fixed synthetic transport fixture response.'}]});
    modes.primary='slow-completion';
    await record('valid sixty second completion remains byte exact under input-only deadline',
      ()=>send(frontPort,{method:'POST',route:'/v1/chat/completions',headers:{'content-type':'application/json','content-length':Buffer.byteLength(completionBody)},body:completionBody,timeout:70000}),
      {status:[200],admissions:1,primary:1,minimumMs:59000,maximumMs:64000,check:(response,requests)=>{
        assert.equal(response.body,SLOW_COMPLETION_RESPONSE);assert.equal(requests.length,1);assert.equal(requests[0].path,'/v1/chat/completions');
        assert.equal(requests[0].method,'POST');assert.equal(requests[0].bodySha256,digest(Buffer.from(completionBody)));}});
    modes.primary='good';
    for(const [name,options,status] of [['same issuer wrong client pin',{client:'other'},[403]],['foreign issuer client',{client:'untrusted'},[502]],
      ['missing client certificate',{client:'none'},[502]],['wrong server name',{serverName:'wrong.synthetic'},[502]],['wrong server trust',{issuer:'foreign'},[502]]]){
      await switchCaddy(options);await record(name,()=>health('/v1/models'),{status});
    }
    const stalledTls=net.createServer();servers.push(stalledTls);observeSockets(stalledTls,allSockets);const stalledPort=await listen(stalledTls);ports.push(stalledPort);
    await switchCaddy({tlsPort:stalledPort});await record('actual 10 second TLS handshake timeout has zero controller admission',()=>send(frontPort,{timeout:16000}),
      {status:[502,504],minimumMs:9000,maximumMs:15000});
    verifySources(sourceRoot);report.passed=report.cases.every(c=>c.passed);
  }catch(error){report.error=error.code??error.message;}
  finally{
    try{await stopCaddy(caddy);}catch(error){report.cleanupError=error.code??error.message;}
    for(const res of held)res.destroy();for(const socket of allSockets)socket.destroy();
    for(const server of servers)await closeServer(server);
    if(fixtureController){try{await fixtureController.controller.stop();}catch(error){report.controllerCleanupError=error.code??error.message;}}
    report.cleanup={ownedCaddyStopped:report.caddyChildren.every(c=>c.stopped),ownedPortsClosed:await Promise.all(ports.map(portClosed)),
      activeControllerRequests:fixtureController?.controller.status.activeRequests??0,syntheticInstances:fixtureController?.state.loaded.length??0,privateFilesRemoved:false};
    try{removeFixture(directory,parent);report.cleanup.privateFilesRemoved=!existsSync(directory);}catch(error){report.cleanupError=error.code??error.message;}
    if(report.cleanupError||report.controllerCleanupError||!report.cleanup.ownedCaddyStopped||report.cleanup.ownedPortsClosed.some(v=>!v)
      ||report.cleanup.activeControllerRequests!==0||report.cleanup.syntheticInstances!==0||!report.cleanup.privateFilesRemoved)report.passed=false;
    report.finishedAt=new Date().toISOString();writeFileSync(path.join(output,'proof.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==6)throw Error('usage: run-wire-proof.mjs FUNCTION_FIRST_SOURCE_ROOT CADDY OPENSSL NEW_OUTPUT_DIRECTORY');
  const report=await runClosedWireProof({sourceRoot:process.argv[2],binary:process.argv[3],openssl:process.argv[4],outputDirectory:process.argv[5],onProgress:value=>console.log(JSON.stringify(value))});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,failures:report.cases.filter(v=>!v.passed).map(v=>({name:v.name,error:v.error})),error:report.error??null,cleanup:report.cleanup}));process.exitCode=report.passed?0:1;
}
