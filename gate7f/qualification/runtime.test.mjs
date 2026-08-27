import test from "node:test";
import assert from "node:assert/strict";
import { validateResponse } from "./runtime.mjs";
import { diagnosticCases } from "./diagnostics.mjs";
test("qualification diagnostics vary one protocol axis and retain fixed attempts",()=>{
  assert.equal(diagnosticCases.length,9);
  const state=diagnosticCases.filter(c=>c.id.startsWith("state-"));
  assert.equal(state.length,3);
  assert.equal(state[0].request.messages.length,3);
  assert.equal(state[1].request.messages.length,2);
  assert.equal(diagnosticCases.find(c=>c.id==="native-result").request.messages.at(-1).role,"tool");
});
test("response boundary keeps content and tools distinct; pins model and runtime",()=>{
  const runtime={name:"pinned",version:"1"}, response={model:"candidate",choices:[{finish_reason:"tool_calls",message:{content:null,
    tool_calls:[{id:"t",type:"function",function:{name:"inspect",arguments:"{}"}}]}}],usage:{completion_tokens:20,prompt_tokens:10},
    stats:{tokens_per_second:10,time_to_first_token:0.1},runtime,model_info:{context_length:32768}};
  const out=validateResponse(response,"candidate","instance",runtime,"/api/v0/chat/completions");
  assert.equal(out.content,null);assert.equal(out.toolCalls.length,1);assert.equal(out.firstTokenMs,100);
  assert.throws(()=>validateResponse({...response,model:"wrong"},"candidate","instance",runtime,"/api/v0/chat/completions"));
  assert.throws(()=>validateResponse({...response,stats:{}},"candidate","instance",runtime,"/api/v0/chat/completions"));
  assert.throws(()=>validateResponse({...response,choices:[{finish_reason:"stop",message:{content:"x",reasoning:"hidden"}}]},
    "candidate","instance",runtime,"/api/v0/chat/completions"));
});
