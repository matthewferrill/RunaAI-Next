import test from "node:test";
import assert from "node:assert/strict";
import { monitorTick,validateResponse,validateSample } from "./runtime.mjs";
import { diagnosticCases } from "./diagnostics.mjs";
test("qualification diagnostics vary one protocol axis and retain fixed attempts",()=>{
  assert.equal(diagnosticCases.length,14);
  const state=diagnosticCases.filter(c=>c.id.startsWith("state-"));
  assert.equal(state.length,3);
  assert.equal(state[0].request.messages.length,3);
  assert.equal(state[1].request.messages.length,2);
  assert.equal(diagnosticCases.find(c=>c.id==="native-result").request.messages.at(-1).role,"tool");
});
test("telemetry sink failure aborts without escaping the owned cleanup path",()=>{
  let reason;
  assert.doesNotThrow(()=>monitorTick({record:()=>{throw Error("disk-full");},sample:()=>({}),abort:code=>{reason=code;}}));
  assert.equal(reason,"qualification-resource-or-evidence-boundary");
});
test("unsafe sample is retained while unchanged thermal cutoff aborts",()=>{
  const sample={label:"periodic",freeMemoryBytes:32*1024**3,totalMemoryBytes:128*1024**3,
    gpus:[0,1].map(index=>({index,name:"Quadro RTX 6000",totalMemoryMiB:23040,usedMemoryMiB:10000,
      utilizationPercent:40,temperatureC:index===0?85:70,powerWatts:140,uuid:"gpu-"+index,powerLimitWatts:160}))};
  const events=[];let aborted;
  monitorTick({sample:()=>validateSample(sample),record:(type,payload)=>events.push({type,...payload}),abort:code=>aborted=code});
  assert.equal(aborted,"qualification-resource-or-evidence-boundary");
  assert.equal(events[0].code,"gate7f1-gpu-boundary");assert.deepEqual(events[0].boundarySample,sample);
});
test("matched hardware policy pins UUIDs power ceiling and cool start",()=>{
  const policy={gpuUuids:["gpu-0","gpu-1"],gpuPowerLimitWatts:160,maximumStartTemperatureC:50};
  const sample={label:"before-load",freeMemoryBytes:32*1024**3,totalMemoryBytes:128*1024**3,
    gpus:[0,1].map(index=>({index,name:"Quadro RTX 6000",totalMemoryMiB:23040,usedMemoryMiB:1000,
      utilizationPercent:0,temperatureC:45,powerWatts:25,uuid:"gpu-"+index,powerLimitWatts:160}))};
  assert.equal(validateSample(sample,policy),sample);
  for(const patch of [{powerLimitWatts:260},{uuid:"wrong"},{temperatureC:51}]){
    const bad=structuredClone(sample);Object.assign(bad.gpus[0],patch);
    assert.throws(()=>validateSample(bad,policy),error=>error.boundarySample===bad);
  }
});
test("response boundary keeps content and tools distinct; pins model and runtime",()=>{
  const runtime={name:"pinned",version:"1"}, response={model:"candidate",choices:[{finish_reason:"tool_calls",message:{content:null,
    tool_calls:[{id:"t",type:"function",function:{name:"inspect",arguments:"{}"}}]}}],usage:{completion_tokens:20,prompt_tokens:10},
    stats:{tokens_per_second:10,time_to_first_token:0.1},runtime,model_info:{context_length:32768}};
  const out=validateResponse(response,"candidate","instance",runtime,"/api/v0/chat/completions");
  assert.equal(out.content,null);assert.equal(out.toolCalls.length,1);assert.equal(out.firstTokenMs,100);
  const omitted=structuredClone(response);delete omitted.choices[0].message.content;
  assert.equal(validateResponse(omitted,"candidate","instance",runtime,"/v1/chat/completions").toolCalls.length,1);
  const contradictory=structuredClone(response);contradictory.choices[0].finish_reason="stop";
  assert.throws(()=>validateResponse(contradictory,"candidate","instance",runtime,"/v1/chat/completions"));
  const malformed=structuredClone(response);malformed.choices[0].message.tool_calls[0].function.arguments={};
  assert.throws(()=>validateResponse(malformed,"candidate","instance",runtime,"/v1/chat/completions"));
  assert.throws(()=>validateResponse({...response,model:"wrong"},"candidate","instance",runtime,"/api/v0/chat/completions"));
  assert.throws(()=>validateResponse({...response,stats:{}},"candidate","instance",runtime,"/api/v0/chat/completions"));
  assert.throws(()=>validateResponse({...response,choices:[{finish_reason:"stop",message:{content:"x",reasoning:"hidden"}}]},
    "candidate","instance",runtime,"/api/v0/chat/completions"));
});
