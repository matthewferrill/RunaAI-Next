// Actual-process test fixture only. It has no native adapter, model/network call or privileged action.
import {readFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {PinnedAdmissionBroker} from './admission-broker.mjs';
import {BrokerFileServer} from './file-ipc.mjs';
const root=process.argv[2],key=readFileSync(path.join(root,'test-key.bin'));
const worker=JSON.parse(readFileSync(path.join(root,'test-worker.json'),'utf8'));
const controller={status:{phase:'ready',generation:randomUUID(),profileSha256:'a'.repeat(64)},
  admit:async({signal})=>({generation:controller.status.generation,signal,release(){}}),poll:async()=>{},fault:async()=>{},stop:async()=>{}};
const sessionId=path.basename(root),broker=new PinnedAdmissionBroker({controller,sessionId,worker,key,verifyStopped:async()=>false});
const server=new BrokerFileServer({root,sessionId,key,broker});const until=Date.now()+10000;
process.stdout.write('ready\n');while(Date.now()<until&&!existsSync(path.join(root,'test-stop'))){await server.pump();await new Promise(r=>setTimeout(r,10));}
