import test from "node:test";
import assert from "node:assert/strict";
import {anonymousResponses,expectedAcceptanceIds} from "./make-review-packets.mjs";

// Metadata-only fabricated schedule; no acceptance questions, answers or real captures are read.
function fixture(){
  const bundle={inputs:{attemptsPerCase:3,cases:Array.from({length:39},(_,i)=>({id:`fixture-${i}`}))}};
  const expectedIds=expectedAcceptanceIds(bundle),events=[];
  for(const id of expectedIds){
    const response={model:"fabricated-provider",choices:[{finish_reason:"stop",message:{content:"Synthetic answer."}}],
      usage:{completion_tokens:3,prompt_tokens:12}};
    const normalized={content:"Synthetic answer.",toolCalls:[],finishReason:"stop",completionTokens:3,promptTokens:12,
      firstTokenMs:null,tokensPerSecond:null};
    events.push({type:"request",id,endpoint:"/v1/chat/completions",request:{}},
      {type:"response",id,endpoint:"/v1/chat/completions",response},
      {type:"observation",id,endpoint:"/v1/chat/completions",normalized});
  }
  return {bundle,expectedIds,events};
}

test("packet identities follow the explicit schedule, not an aggregate count",()=>{
  const f=fixture(),rows=anonymousResponses(f.events,{expectedIds:f.expectedIds});
  assert.equal(rows.length,117);assert.equal(rows[0].caseId,"fixture-0");assert.equal(rows[1].attempt,2);
  assert.throws(()=>anonymousResponses(f.events));
  const wrong=[...f.expectedIds];wrong[0]="acceptance:unexpected:1:0";
  assert.throws(()=>anonymousResponses(f.events,{expectedIds:wrong}));
  assert.throws(()=>expectedAcceptanceIds({inputs:{attemptsPerCase:3,cases:[{id:"too-small"}]}}));
});

test("packet raw response and normalized content must agree",()=>{
  const f=fixture();f.events.find(row=>row.type==="observation").normalized.content="Replacement answer.";
  assert.throws(()=>anonymousResponses(f.events,{expectedIds:f.expectedIds}));
});

test("packet raw response and normalized tool arguments must agree",()=>{
  const f=fixture(),response=f.events.find(row=>row.type==="response").response;
  const normalized=f.events.find(row=>row.type==="observation").normalized;
  response.choices[0]={finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"call-1",type:"function",
    function:{name:"workspace_inspect",arguments:'{"path":"safe.txt"}'}}]}};
  Object.assign(normalized,{content:null,finishReason:"tool_calls",toolCalls:structuredClone(response.choices[0].message.tool_calls)});
  normalized.toolCalls[0].function.arguments='{"path":"other.txt"}';
  assert.throws(()=>anonymousResponses(f.events,{expectedIds:f.expectedIds}));
});

test("packet tool metadata is allowlisted without rewriting semantic arguments or answer prose",()=>{
  const f=fixture(),response=f.events.find(row=>row.type==="response").response;
  const normalized=f.events.find(row=>row.type==="observation").normalized;
  const tool={id:"call-1",type:"function",model:"provider-secret",timing:123,
    function:{name:"workspace_inspect",arguments:'{"path":"safe.txt"}',hardware:"gpu-secret"}};
  response.choices[0]={finish_reason:"tool_calls",message:{content:"My answer may identify my model.",tool_calls:[tool]}};
  Object.assign(normalized,{content:response.choices[0].message.content,finishReason:"tool_calls",toolCalls:[tool],
    hardware:"metadata-secret"});
  const [row]=anonymousResponses(f.events,{expectedIds:f.expectedIds});
  assert.equal(row.content,response.choices[0].message.content);
  assert.deepEqual(row.toolCalls,[{id:"call-1",type:"function",function:{name:"workspace_inspect",arguments:'{"path":"safe.txt"}'}}]);
  assert.equal(JSON.stringify(row).includes("secret"),false);
});

test("duplicate or missing raw rows cannot be concealed by 117 observations",()=>{
  const f=fixture();f.events.splice(f.events.findIndex(row=>row.type==="response"),1);
  assert.throws(()=>anonymousResponses(f.events,{expectedIds:f.expectedIds}));
  const duplicate=fixture();duplicate.events.push(structuredClone(duplicate.events[1]));
  assert.throws(()=>anonymousResponses(duplicate.events,{expectedIds:duplicate.expectedIds}));
});
