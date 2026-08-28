import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync,linkSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {PinnedAdmissionBroker} from './admission-broker.mjs';
import {BrokerFileClient,BrokerFileServer} from './file-ipc.mjs';

function setup(){
  const parent=realpathSync(os.tmpdir()),temporary=mkdtempSync(path.join(parent,'runa-runtime-ipc-')),sessionId=randomBytes(32).toString('hex');
  const root=path.join(temporary,sessionId);mkdirSync(root);mkdirSync(path.join(root,'requests'));mkdirSync(path.join(root,'replies'));
  const key=randomBytes(32),worker={pid:process.pid,startedAt:new Date().toISOString()};
  return {root,sessionId,key,worker,cleanup(){const actual=realpathSync(temporary);assert.equal(path.dirname(actual),parent);
    assert.ok(path.basename(actual).startsWith('runa-runtime-ipc-'));rmSync(actual,{recursive:true,force:false});}};
}
test('actual child-process file IPC authenticates and preserves generation-bound admission control',async()=>{
  const f=setup();let child;
  try{
    writeFileSync(path.join(f.root,'test-key.bin'),f.key);writeFileSync(path.join(f.root,'test-worker.json'),JSON.stringify(f.worker));
    child=spawn(process.execPath,[path.join(import.meta.dirname,'file-ipc-fixture.mjs'),f.root],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const errors=[];child.stderr.on('data',b=>errors.push(b));await once(child.stdout,'data');
    const client=new BrokerFileClient(f);assert.equal((await client.call('status')).phase,'ready');
    const grant=await client.call('admit',{requestId:randomUUID()});assert.ok(grant.grantId);assert.ok(grant.generation);
    assert.deepEqual(await client.call('release',{grantId:grant.grantId,generation:grant.generation}),{released:true});
    await client.call('status');assert.equal(readdirSync(path.join(f.root,'requests')).length,0);
    writeFileSync(path.join(f.root,'test-stop'),'');const [code]=await once(child,'exit');assert.equal(code,0,Buffer.concat(errors).toString());child=null;
  }finally{if(child&&!child.killed){child.kill();await once(child,'exit');}f.cleanup();}
});
test('lost reply faults the client rather than automatically replaying an admission',async()=>{
  const f=setup();try{const client=new BrokerFileClient({...f,timeoutMs:50});
    await assert.rejects(client.call('admit',{requestId:randomUUID()}),/response-timeout/);
    await assert.rejects(client.call('status'),/client-faulted/);assert.equal(readdirSync(path.join(f.root,'requests')).length,1);
  }finally{f.cleanup();}
});
test('incomplete pending publication is never parsed or treated as an admission request',async()=>{
  const f=setup();let calls=0;try{
    const server=new BrokerFileServer({...f,broker:{handle:async()=>{calls++;}}});
    writeFileSync(path.join(f.root,'requests','000000000000001.json.pending'),'{');
    assert.equal(await server.pump(),false);assert.equal(calls,0);assert.deepEqual(readdirSync(path.join(f.root,'replies')),[]);
  }finally{f.cleanup();}
});
test('client rejects altered or oversized replies and retains the unknown request instead of replaying',async()=>{
  for(const variant of ['mac','size']){const f=setup();try{
    const client=new BrokerFileClient({...f,timeoutMs:100});const server=new BrokerFileServer({...f,broker:{handle:async()=>({phase:'ready'})}});
    const pending=client.call('status');const rejected=assert.rejects(pending);await new Promise(r=>setImmediate(r));await server.pump();
    const output=path.join(f.root,'replies','000000000000001.json');
    if(variant==='mac'){const response=JSON.parse(readFileSync(output,'utf8'));response.mac='0'.repeat(64);writeFileSync(output,JSON.stringify(response));}
    else writeFileSync(output,'x'.repeat(32769));
    await rejected;await assert.rejects(client.call('status'),/client-faulted/);assert.equal(readdirSync(path.join(f.root,'requests')).length,1);
  }finally{f.cleanup();}}
});
test('server rejects tampered MAC, hardlinked request and unexpected directory entry before broker action',async()=>{
  for(const variant of ['mac','link','name']){const f=setup();let calls=0;
    try{
      const broker=new PinnedAdmissionBroker({controller:{admit:async()=>{calls++;},poll:async()=>{},fault:async()=>{},stop:async()=>{}},...f,verifyStopped:async()=>false});
      const server=new BrokerFileServer({...f,broker});const client=new BrokerFileClient({...f,timeoutMs:100});
      const pending=client.call('status');const rejected=assert.rejects(pending);await new Promise(r=>setTimeout(r,10));
      const input=path.join(f.root,'requests','000000000000001.json');
      if(variant==='mac'){const message=JSON.parse(readFileSync(input,'utf8'));message.mac='0'.repeat(64);writeFileSync(input,JSON.stringify(message));}
      if(variant==='link')linkSync(input,path.join(f.root,'other-link'));
      if(variant==='name')writeFileSync(path.join(f.root,'requests','unexpected.txt'),'no');
      await assert.rejects(server.pump());await rejected;assert.equal(calls,0);assert.equal(readdirSync(path.join(f.root,'replies')).length,0);
    }finally{f.cleanup();}
  }
});
