import test from "node:test";
import assert from "node:assert/strict";
import {runModelIntegration,integrationScenarios} from "./model-integration.mjs";
import {buildRequest} from "./adapter.mjs";
import {checkHardwarePolicy,checkIntegration} from "./summarize-capture.mjs";
async function fixture(){
  const events=[];
  await runModelIntegration({buildRequest,record:(type,payload)=>events.push({type,...payload}),invoke:async({id,endpoint,request})=>{
    const [_,name,phase]=id.split(":"),scenario=integrationScenarios().find(s=>s.id===name);
    const proposal=phase==="proposal"&&scenario.expectProposal?scenario.allowedProposal:null;
    const content=JSON.stringify({kind:proposal?"propose":"respond",message:"Synthetic test",plan:[],proposal});
    const response={model:"synthetic-provider",choices:[{finish_reason:"stop",message:{content}}],
      usage:{prompt_tokens:10,completion_tokens:3}};
    const normalized={content,toolCalls:[],finishReason:"stop",promptTokens:10,completionTokens:3,tokensPerSecond:null,firstTokenMs:null};
    events.push({type:"request",id,endpoint,request},{type:"response",id,endpoint,response,elapsedMs:100},
      {type:"observation",id,endpoint,normalized,elapsedMs:100});
    return {response,normalized};
  }});
  return events;
}
test("post-capture integration verifier checks actual synthetic receipts and delivered content",async()=>{
  const result=checkIntegration(await fixture());assert.equal(result.containmentPassed,true);assert.equal(result.outcomes.length,4);
  assert.equal(result.outcomes.filter(o=>o.receiptPresent).length,3);
});
test("claimed containment cannot hide an out-of-scope effect or altered receipt",async()=>{
  const events=await fixture();events.find(e=>e.type==="integration-state").afterWorkspace.files["PRIVATE.md"]="changed";
  assert.throws(()=>checkIntegration(events));
  const receiptEvents=await fixture();receiptEvents.find(e=>e.type==="integration-state").actualReceipt.receiptSha256="0".repeat(64);
  assert.throws(()=>checkIntegration(receiptEvents));
});

test("reported proposal and parsed/conformance claims are bound to the actual response",async()=>{
  for(const mutate of [
    row=>{row.rawProposalContent="{}";},
    row=>{row.emittedAgentOutput={kind:"stop",message:"forged",plan:[],proposal:null};},
    row=>{row.proposalConformance=false;},
    row=>{row.actualReceipt=null;},
    row=>{row.actualDelivery=null;},
  ]){const events=await fixture();mutate(events.find(row=>row.type==="integration-state"));assert.throws(()=>checkIntegration(events));}
});

test("reporting rejects context substitutions and fabricated initial workspace content",async()=>{
  const events=await fixture(),trace=events.find(row=>row.type==="integration-state");
  trace.context.sessionId="other-session";
  assert.throws(()=>checkIntegration(events));
  const initial=await fixture();initial.find(row=>row.type==="integration-state").beforeWorkspace.files["PRIVATE.md"]="forged baseline";
  assert.throws(()=>checkIntegration(initial));
});

test("hardware reporting calls the current validator on every row and requires one cool-start sample",()=>{
  const policy={gpuUuids:["fake-a","fake-b"],gpuPowerLimitWatts:160,maximumStartTemperatureC:50};
  const events=[{type:"telemetry",label:"before-load",temperature:40},{type:"telemetry",label:"after-load",temperature:60}];
  const seen=[];
  const result=checkHardwarePolicy(events,policy,(row,received)=>{assert.equal(received,policy);seen.push(row.label);});
  assert.deepEqual(seen,["before-load","after-load"]);assert.equal(result.validatedSamples,2);
  assert.throws(()=>checkHardwarePolicy(events,policy,()=>{throw Error("hardware-policy-drift");}),/hardware-policy-drift/);
  assert.throws(()=>checkHardwarePolicy(events.slice(1),policy,()=>{}));
  assert.throws(()=>checkHardwarePolicy(events,policy,null));
  assert.equal(checkHardwarePolicy(events,null).policyPresent,false);
});
