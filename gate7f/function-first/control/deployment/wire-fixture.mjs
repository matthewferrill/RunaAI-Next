import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {createHash,X509Certificate} from 'node:crypto';
import {createServer,request} from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {APPLICATION,HEALTH_EXPRESSION,buildCaddyProjection} from './assembly.mjs';
import {caddyfile} from '../../../../gate7a/lan-release.mjs';

export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const SOURCE_PINS=Object.freeze({
  'home-runtime/tls-proxy.mjs':'1c063e289ad2f1fc5be25c32fc7b39796d0a415943a868f0de5ae977ed0ef7f9',
  'home-runtime/proxy.mjs':'f4c6f6f9fbf092633aaf1b2338ce53ab31e23a9f668545b12e161c3316703a18',
  'home-runtime/contracts.mjs':'995339141c0928312827ed7169a98d8ab2f2de7d7fbbf52e6ae1b54377de39e0',
  'evidence-output.mjs':'ef61fd605d598dfda83782c54c8a1d019bc8a3d21a08aa81aa709ebe691d9f9a',
  'home-runtime/controller.mjs':'6e05d363c882fd1909d31893c0ab3cfee1eef4bdf148e2c6a177cb07d9957daa',
  'readiness/manifest.mjs':'16f780c577b670a640d84a1c28ebbe11efef53235beb712825db4fd7ec1ef88d',
  'readiness/lease-contract.mjs':'0fe24a0ee7bb7258bb76264bf57a69f602b6fdd9658d9012739cc45c24ed8269',
  'readiness/evidence/20260828-smoke-gemma-r1/events.jsonl':'e8329085a4bd3eccbe0ba9ae2be5afe32a85f9e5c774c2f83bd34fdf19cd6eaf',
});
export function verifySources(root){return Object.entries(SOURCE_PINS).map(([file,sha256])=>{
  const bytes=readFileSync(path.join(root,file));assert.equal(digest(bytes),sha256,'wire-source-drift:'+file);return {file,sha256,bytes:bytes.length};});}
export async function modules(root){verifySources(root);const load=file=>import(pathToFileURL(path.join(root,file)).href);
  return {tls:await load('home-runtime/tls-proxy.mjs'),contracts:await load('home-runtime/contracts.mjs'),controller:await load('home-runtime/controller.mjs'),
    evidence:await load('evidence-output.mjs')};}

// Only generated disposable certificates; the directory has no inherited access
// for ordinary other users. No production enrollment/keys are opened here.
export function certificates(directory,openssl){
  assert.equal(digest(readFileSync(openssl)),'063e62dcc027fc5dbb1343de631f02a9291f8b1df0b4e37012e49a03d525aad4','wire-openssl-pin');
  const sidScript=`$ErrorActionPreference='Stop';$p='${directory.replaceAll("'","''")}';$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);foreach($s in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){$r=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($s),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r)};Set-Acl -LiteralPath $p -AclObject $a`;
  execFileSync(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(sidScript,'utf16le').toString('base64')],
    {windowsHide:true,timeout:15000,stdio:'pipe',env:{...process.env,PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
  const run=args=>execFileSync(openssl,args,{cwd:directory,windowsHide:true,timeout:15000,stdio:'pipe',maxBuffer:262144});
  for(const issuer of ['issuer','foreign'])run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',issuer+'.key','-out',issuer+'.crt','-days','1','-subj','/CN=synthetic-'+issuer,'-addext','basicConstraints=critical,CA:TRUE']);
  for(const [name,issuer,usage] of [['home','issuer','serverAuth'],['control','issuer','clientAuth'],['other','issuer','clientAuth'],['untrusted','foreign','clientAuth']]){
    run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN=synthetic-'+name]);
    writeFileSync(path.join(directory,name+'.ext'),`basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=${usage}\nsubjectAltName=DNS:runa-home-m1.internal\n`,{flag:'wx'});
    run(['x509','-req','-in',name+'.csr','-CA',issuer+'.crt','-CAkey',issuer+'.key','-CAcreateserial','-out',name+'.crt','-days','1','-sha256','-extfile',name+'.ext']);
  }
  const read=name=>readFileSync(path.join(directory,name)),pin=name=>digest(new X509Certificate(read(name)).raw);
  return {directory,read,pin,tls:{key:read('home.key'),cert:read('home.crt'),ca:read('issuer.crt'),
    caSha256:pin('issuer.crt'),serverCertificateSha256:pin('home.crt'),clientCertificateSha256:pin('control.crt')}};
}

export async function realController(root,loadedModules,report){
  const {QualifiedRuntimeController}=loadedModules.controller,{LEASE_POLICY}=loadedModules.contracts;
  const responses=new Map(readFileSync(path.join(root,'readiness/evidence/20260828-smoke-gemma-r1/events.jsonl'),'utf8')
    .trim().split(/\r?\n/u).map(JSON.parse).filter(e=>e.type==='load-response').map(e=>[e.key,e.value]));
  const state={power:260,loaded:[],admitAttempts:0,admitted:0,released:0,polls:0};
  const adapter={verifyPins:async()=>{},record:async event=>report.lifecycle.push({type:event.type,time:event.time}),
    setPower:async value=>{state.power=value;},
    load:async request=>{const result=structuredClone(responses.get(request.model));assert.ok(result);result.instance_id='synthetic-'+request.model;
      state.loaded.push({key:request.model,id:result.instance_id,config:result.load_config});return result;},
    unload:async({instance_id})=>{state.loaded=state.loaded.filter(v=>v.id!==instance_id);},
    observe:async()=>({observedAt:Date.now(),engineIdentity:'synthetic-no-native-engine',
      settings:{justInTimeModelLoading:false,logSensitiveData:false,verbose:false,dynamicRemoteMcpServer:'deny',pluginUse:'deny'},
      hardware:{freeMemoryBytes:32*1024**3,gpus:LEASE_POLICY.gpuUuids.map((uuid,index)=>({index,uuid,name:'Quadro RTX 6000',memoryTotalMiB:23040,memoryUsedMiB:8000,temperatureC:40,powerLimitWatts:state.power}))},
      inventory:{models:state.loaded.map(v=>({key:v.key,loaded_instances:[{id:v.id,config:structuredClone(v.config)}]}))}})};
  const controller=new QualifiedRuntimeController({profile:{schemaVersion:'runaai-qualified-home-profile/v1',candidateId:'gemma',
    appSourceCommit:'1'.repeat(40),runtimeSealSha256:'2'.repeat(64),qualificationGradesSha256:'3'.repeat(64)},adapter});
  const admit=controller.admit.bind(controller),poll=controller.poll.bind(controller);
  controller.admit=async args=>{state.admitAttempts++;const ticket=await admit(args);state.admitted++;const release=ticket.release;let done=false;
    return {...ticket,release(){release();if(!done){state.released++;done=true;}}};};
  controller.poll=async()=>{state.polls++;return poll();};await controller.start();return {controller,state};
}

export async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;}
export async function unusedPort(){const server=net.createServer();const port=await listen(server);await new Promise(resolve=>server.close(resolve));return port;}
export function portClosed(port){return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});let done=false;
  const end=value=>{if(done)return;done=true;socket.destroy();resolve(value);};socket.once('connect',()=>end(false));socket.once('error',()=>end(true));socket.setTimeout(500,()=>end(false));});}
export async function closeServer(server){if(!server)return;server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
export function observeSockets(server,set){server.on('connection',socket=>{set.add(socket);socket.on('close',()=>set.delete(socket));});}
export function backend(kind,report,modes,held){return createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
  report.nativeRequests.push({kind,path:req.url,method:req.method,bodyBytes:body.length,bodySha256:digest(body),headers:req.headers,at:Date.now()});
  const mode=modes[kind];if(mode==='stall'){held.add(res);res.once('close',()=>held.delete(res));return;}
  if(mode==='evidence'){res.writeHead(200,{'content-type':'application/json'});res.end(EVIDENCE_WIRE_RESPONSE);return;}
  if(mode==='redirect'){res.writeHead(302,{location:modes.redirect});res.end();return;}
  if(mode==='slow-completion'){
    held.add(res);await new Promise(resolve=>{const timer=setTimeout(resolve,60000);res.once('close',()=>{clearTimeout(timer);resolve();});});held.delete(res);
    if(!res.destroyed){res.writeHead(200,{'content-type':'application/json'});res.end(SLOW_COMPLETION_RESPONSE);}return;
  }
  const status=mode==='failure'?503:200;res.writeHead(status,{'content-type':'application/json'});res.end(kind==='primary'?' {"data":[]}\n':' {"ok":true}\n');
});}
export const SLOW_COMPLETION_RESPONSE=' {"id":"synthetic-sixty-second","choices":[{"message":{"role":"assistant","content":"Complete unchanged response after sixty seconds."}}]}\n';
export const EVIDENCE_WIRE_RESPONSE=JSON.stringify({id:'synthetic-evidence-wire',choices:[{message:{role:'assistant',
  content:JSON.stringify({answer:'The synthetic lantern is amber.',citations:[{sourceId:'synthetic-lantern',sectionId:'color'}]})}}]})+'\n';
export function evidenceWireFrames(base,format){
  const create=()=>({...structuredClone(base),response_format:structuredClone(format)});
  const strict=create();strict.response_format.json_schema.strict=false;
  const extra=create();extra.response_format.json_schema.schema.additionalProperties=true;
  const arbitrary=create();arbitrary.response_format.json_schema.schema={type:'object',properties:{command:{type:'string'}},required:['command']};
  return [
    {name:'exact static evidence schema passes once byte exact',denied:false,body:create()},
    {name:'weakened evidence strictness denied before admission',denied:true,body:strict},
    {name:'weakened evidence additional properties denied before admission',denied:true,body:extra},
    {name:'arbitrary evidence schema denied before admission',denied:true,body:arbitrary},
  ];
}

export function localCaddyConfig({binary,certificates:certs,frontPort,tlsPort,client='control',issuer='issuer',serverName='runa-home-m1.internal',phase='candidate-closed'}){
  assert.equal(digest(readFileSync(binary)),APPLICATION.caddyBinarySha256);
  for(const value of [frontPort,tlsPort])assert.ok(Number.isSafeInteger(value)&&value>=1024&&value<=65535&&!([1234,8412,9761,9770,9774,9775,9776].includes(value)));
  assert.ok(['control','other','untrusted','none'].includes(client));assert.ok(['issuer','foreign'].includes(issuer));
  assert.ok(['runa-home-m1.internal','wrong.synthetic'].includes(serverName));
  assert.ok(['candidate-closed','final'].includes(phase));
  const enrollment={schemaVersion:'runaai-control-tls-enrollment/v1',enrollmentId:'a'.repeat(32),caSha256:certs.pin('issuer.crt'),
    serverCertificateSha256:certs.pin('home.crt'),clientCertificateSha256:certs.pin('control.crt'),serverName:'runa-home-m1.internal',
    clientExpiresAt:new Date(Date.now()+60000).toISOString(),activated:false,privateMaterialIncluded:false};
  const source=buildCaddyProjection({originalBytes:Buffer.from(caddyfile),enrollment,transitionId:'b'.repeat(32)});
  const input=phase==='final'?source.finalBytes:source.candidateClosedBytes;
  const adapted=spawnSync(binary,['adapt','--config','-','--adapter','caddyfile'],{input,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1048576});
  assert.equal(adapted.status,0,adapted.stderr);const original=Object.values(JSON.parse(adapted.stdout).apps.http.servers).find(s=>s.listen.includes('127.0.0.1:9770'));
  const server=structuredClone(original);
  const literal=phase==='final'?server.routes[0].handle[0].routes:server.routes[0].handle[0].routes[0].handle[0].routes;
  if(phase==='candidate-closed'){
    assert.equal(literal[0].match[0].expression.expr,HEALTH_EXPRESSION);assert.equal(literal[1].handle[0].status_code,503);
    assert.deepEqual(literal[1].match[0].path,['*']);
  }else{assert.equal(literal.length,1);assert.equal(literal[0].handle.length,1);assert.equal(literal[0].handle[0].handler,'reverse_proxy');}
  assert.ok(!JSON.stringify(server).includes('read_timeout'));assert.ok(!JSON.stringify(server).includes('write_timeout'));
  server.listen=[`127.0.0.1:${frontPort}`];let replacements=0;
  const change=node=>{if(!node||typeof node!=='object')return;
    if(node.handler==='reverse_proxy'){
      replacements++;assert.deepEqual(node.upstreams,[{dial:'192.168.50.165:9776'}]);node.upstreams=[{dial:`127.0.0.1:${tlsPort}`}];
      assert.equal(node.transport.response_header_timeout,65e9);assert.equal(node.transport.dial_timeout,10e9);assert.equal(node.transport.tls.handshake_timeout,10e9);
      assert.deepEqual(node.transport.versions,['1.1']);assert.deepEqual(node.load_balancing,{});
      node.transport.tls.ca.pem_files=[path.join(certs.directory,issuer+'.crt')];node.transport.tls.server_name=serverName;
      if(client==='none'){delete node.transport.tls.client_certificate_file;delete node.transport.tls.client_certificate_key_file;}
      else{node.transport.tls.client_certificate_file=path.join(certs.directory,client+'.crt');node.transport.tls.client_certificate_key_file=path.join(certs.directory,client+'.key');}
    }
    for(const value of Object.values(node))if(value&&typeof value==='object')change(value);
  };change(server);assert.equal(replacements,phase==='final'?1:2);
  return {sourceSha256:digest(input),phase,original,config:{admin:{disabled:true,config:{persist:false}},logging:{logs:{default:{level:'ERROR'}}},
    storage:{module:'file_system',root:path.join(certs.directory,'caddy-storage')},apps:{http:{servers:{synthetic:server}}}}};
}

export async function startCaddy({binary,directory,config,report}){
  const filename=path.join(directory,'caddy-'+report.caddyChildren.length+'.json');writeFileSync(filename,JSON.stringify(config),{flag:'wx'});
  const child=spawn(binary,['run','--config',filename],{cwd:directory,windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,APPDATA:path.join(directory,'appdata'),LOCALAPPDATA:path.join(directory,'localappdata'),XDG_CONFIG_HOME:path.join(directory,'config'),XDG_DATA_HOME:path.join(directory,'data')}});
  const record={pid:child.pid,configSha256:digest(readFileSync(filename)),startedAt:new Date().toISOString(),stopped:false,logs:[]};report.caddyChildren.push(record);let bytes=0;
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes<=262144)record.logs.push(chunk.toString());else{record.logCapExceeded=true;child.kill();}});
  const port=Number(config.apps.http.servers.synthetic.listen[0].split(':').at(-1)),deadline=Date.now()+10000;
  try{while(await portClosed(port)){if(child.exitCode!==null||Date.now()>deadline)throw Error('wire-caddy-start-failed');await sleep(50);}}
  catch(error){await stopCaddy({child,record,port});throw error;}
  return {child,record,port};
}
export async function stopCaddy(value){if(!value)return;const {child,record}=value;
  if(child.exitCode===null&&child.signalCode===null){const stopped=once(child,'exit');child.kill();await Promise.race([stopped,sleep(5000)]);}
  record.stopped=child.exitCode!==null||child.signalCode!==null;record.finishedAt=new Date().toISOString();assert.equal(record.stopped,true);assert.equal(await portClosed(value.port),true);
}
export async function send(port,{method='GET',route='/v1/models',headers={},body,timeout=70000}={}){
  return new Promise(resolve=>{const started=Date.now(),chunks=[];let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve({...value,elapsedMs:Date.now()-started});};
    const req=request({host:'127.0.0.1',port,path:route,method,headers:{connection:'close',...headers}},async res=>{
      try{for await(const chunk of res){chunks.push(chunk);assert.ok(Buffer.concat(chunks).length<=65536);}finish({status:res.statusCode,body:Buffer.concat(chunks).toString()});}
      catch(e){finish({error:e.code??'response-error'});}});
    const timer=setTimeout(()=>{req.destroy();finish({error:'fixture-client-timeout'});},timeout);req.on('error',e=>finish({error:e.code??'request-error'}));req.end(body);
  });
}
export function raw(port,wire,{timeout=16000,end=false}={}){return new Promise(resolve=>{
  const started=Date.now(),chunks=[];let done=false;const socket=net.connect({host:'127.0.0.1',port});
  const finish=(error,termination)=>{if(done)return;done=true;clearTimeout(timer);const response=Buffer.concat(chunks).toString();socket.destroy();
    resolve({status:Number(response.match(/^HTTP\/1\.[01] (\d{3})/u)?.[1])||null,response,error:error??null,elapsedMs:Date.now()-started,
      requestWire:wire,tcpHalfClose:end,termination:termination??'fixture',serverTerminated:['server-end','server-close','server-error'].includes(termination)});};
  const timer=setTimeout(()=>finish('fixture-client-timeout'),timeout);
  socket.on('connect',()=>{socket.write(wire);if(end)socket.end();});socket.on('data',chunk=>{chunks.push(chunk);if(Buffer.concat(chunks).length>65536)finish('fixture-response-cap');});
  socket.on('end',()=>finish(null,'server-end'));socket.on('close',()=>finish(null,'server-close'));socket.on('error',e=>finish(e.code??'socket-error','server-error'));
});}
export function removeFixture(directory,parent){const actual=realpathSync(directory);assert.equal(actual,directory);assert.equal(path.dirname(actual),parent);
  assert.ok(path.basename(actual).startsWith('m1-closed-tls-'));rmSync(actual,{recursive:true,force:false});}
