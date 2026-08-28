import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {spawn} from 'node:child_process';
import {privateChildJson} from './private-child-result.mjs';
function fixture({closes=true}={}){
  const child=new EventEmitter();Object.assign(child,{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),
    kills:0,unrefs:0,kill(){this.kills++;if(closes)queueMicrotask(()=>this.emit('close',1));},unref(){this.unrefs++;}});return child;
}
test('private child returns bounded JSON only after successful close',async()=>{
  const child=fixture(),pending=privateChildJson(child);child.stdout.write('{"ok":true}');child.emit('close',0);
  assert.deepEqual(await pending,{ok:true});assert.equal(child.kills,0);
});
test('timeout and output cap stop exactly one owned child and expose no private output',async()=>{
  for(const kind of ['timeout','stdout','stderr']){
    const child=fixture(),pending=privateChildJson(child,{timeoutMs:20,stopMs:20,cap:16});
    if(kind!=='timeout')child[kind].write('PRIVATE-VALUE-'.repeat(10));
    await assert.rejects(pending,error=>{assert.equal(error.code,'runtime-settings-file-child-unconfirmed');
      assert.equal(error.executionStopped,true);assert.equal(JSON.stringify(error).includes('PRIVATE'),false);return true;});
    assert.equal(child.kills,1);
  }
});
test('unconfirmed OS termination still settles and closes owned pipes without claiming the process stopped',async()=>{
  const child=fixture({closes:false}),pending=privateChildJson(child,{timeoutMs:10,stopMs:10});
  await assert.rejects(pending,error=>error.executionStopped===false);assert.equal(child.kills,1);assert.equal(child.unrefs,1);
  assert.equal(child.stdout.destroyed,true);assert.equal(child.stderr.destroyed,true);assert.equal(child.stdin.destroyed,true);
  child.emit('close',0); // A late close cannot retroactively turn the unknown result into success.
});
test('actual local child with unread stdin is bounded and termination is observed',{skip:process.platform!=='win32'},async()=>{
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const pending=privateChildJson(child,{timeoutMs:200,stopMs:1000});child.stdin.write(Buffer.alloc(8192,65));
  await assert.rejects(pending,error=>error.executionStopped===true);
});
