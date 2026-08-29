import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {readLegacyRequestBody} from './legacy-server.mjs';

test('a body chunk during the legacy 408 flush window cannot destroy the request before its bounded close',async()=>{
  const input=new PassThrough(),abort=new AbortController();let replies=0;input.on('error',()=>{});
  input.headers={};
  const reason=Object.assign(Error('synthetic legacy body timeout'),{code:'m1-legacy-server-body-timeout'});
  const pending=readLegacyRequestBody(input,100,abort.signal,()=>{replies++;return true;});
  const started=Date.now();abort.abort(reason);assert.equal(replies,1);assert.equal(input.destroyed,false);
  input.write('x');await assert.rejects(pending,/synthetic legacy body timeout/u);assert.equal(input.destroyed,false);
  await new Promise(resolve=>setTimeout(resolve,120));assert.equal(input.destroyed,true);assert.ok(Date.now()-started<1000);
});
