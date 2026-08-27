import test from "node:test";
import assert from "node:assert/strict";
import {completedFunctionalPrefix} from "./export-review-prefix.mjs";
test("functional prefix is complete and byte-exact while later soak may still append",()=>{
  const rows=[{type:"source",value:"synthetic 🌲"},{type:"acceptance-complete",requests:117},
    {type:"integration-summary",complete:true,observedRequests:8}];
  const expected=Buffer.from(rows.map(JSON.stringify).join("\n")+"\n");
  assert.deepEqual(completedFunctionalPrefix(Buffer.concat([expected,Buffer.from('{"type":"unfinished')])),expected);
  assert.throws(()=>completedFunctionalPrefix(Buffer.from(JSON.stringify(rows[0])+"\n")));
  assert.throws(()=>completedFunctionalPrefix(Buffer.from(JSON.stringify(rows[2])+"\n")));
});
test("prefix rejects malformed UTF-8 and preserves original multibyte CRLF bytes",()=>{
  const ending=Buffer.from('\r\n{"type":"acceptance-complete","requests":117}\r\n{"type":"integration-summary","complete":true,"observedRequests":8}\r\n');
  const valid=Buffer.concat([Buffer.from('{"type":"source","value":"synthetic 🌲"}'),ending]);
  assert.deepEqual(completedFunctionalPrefix(valid),valid);
  const corrupt=Buffer.concat([Buffer.from('{"type":"source","value":"'),Buffer.from([0xc3]),Buffer.from('"}'),ending]);
  assert.throws(()=>completedFunctionalPrefix(corrupt),{name:"TypeError"});
});
