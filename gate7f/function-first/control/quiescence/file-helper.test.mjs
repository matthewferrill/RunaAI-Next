import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {runFileHelper} from './file-helper.mjs';

function fake({closeAfterKill=true}={}){
  const child=Object.assign(new EventEmitter(),{pid:101,stdout:new PassThrough(),stderr:new PassThrough(),
    killed:false,unreferenced:false,kill(){this.killed=true;if(closeAfterKill)setTimeout(()=>this.emit('close',1),10);},
    unref(){this.unreferenced=true;}});
  const calls=[];return {child,calls,spawnImpl(...args){calls.push(args);return child;}};
}
test('fixed file helper command has no stdin, remains hidden, and captures only bounded stdout',async()=>{
  const f=fake(),pending=runFileHelper({requestPath:'synthetic-request.json',spawnImpl:f.spawnImpl});
  f.child.stdout.write('synthetic');f.child.emit('close',0);assert.equal(await pending,'synthetic');
  assert.equal(f.calls[0][0],'powershell.exe');assert.ok(f.calls[0][1].includes('-File'));
  assert.ok(f.calls[0][1].some(value=>value.endsWith('Compare-CaddyBytes.ps1')));
  assert.deepEqual(f.calls[0][2],{windowsHide:true,stdio:['ignore','pipe','pipe']});
});
test('timeout waits for actual child close before returning the uncertain write',async()=>{
  const f=fake();let observedClose=false;f.child.on('close',()=>{observedClose=true;});
  await assert.rejects(runFileHelper({requestPath:'synthetic-request.json',operationMs:5,stopGraceMs:100,spawnImpl:f.spawnImpl}),
    error=>error.code==='quiescence-file-write-uncertain'&&observedClose&&error.retainRequest!==true);
  assert.equal(f.child.killed,true);
});
test('output cap kills then drains instead of removing input while child remains alive',async()=>{
  const f=fake();let observedClose=false;f.child.on('close',()=>{observedClose=true;});
  const pending=runFileHelper({requestPath:'synthetic-request.json',operationMs:1000,spawnImpl:f.spawnImpl});
  f.child.stdout.write(Buffer.alloc(8193));
  await assert.rejects(pending,error=>error.code==='quiescence-file-output-cap'&&observedClose);
});
test('unconfirmed child stop retains the request and exact owned PID; never invents cleanup',async()=>{
  const f=fake({closeAfterKill:false});
  await assert.rejects(runFileHelper({requestPath:'synthetic-request.json',operationMs:5,stopGraceMs:5,spawnImpl:f.spawnImpl}),
    error=>error.code==='quiescence-file-helper-still-running'&&error.retainRequest===true&&error.helperPid===101);
  assert.equal(f.child.unreferenced,true);
});
test('failure to spawn is typed and does not leak the helper error text',async()=>{
  const f=fake(),pending=runFileHelper({requestPath:'synthetic-request.json',spawnImpl:f.spawnImpl});
  f.child.emit('error',Error('sensitive local environment'));
  await assert.rejects(pending,error=>error.code==='quiescence-file-helper-unavailable'&&!error.message.includes('sensitive'));
});
