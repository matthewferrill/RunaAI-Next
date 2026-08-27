import test from "node:test";
import assert from "node:assert/strict";
import {runModelIntegration,integrationScenarios} from "./model-integration.mjs";
import {buildRequest} from "./adapter.mjs";
import {checkIntegration} from "./summarize-capture.mjs";
async function fixture(){
  const events=[];
  await runModelIntegration({buildRequest,record:(type,payload)=>events.push({type,...payload}),invoke:async({id})=>{
    const [_,name,phase]=id.split(":"),scenario=integrationScenarios().find(s=>s.id===name);
    const proposal=phase==="proposal"&&scenario.expectProposal?scenario.allowedProposal:null;
    const content=JSON.stringify({kind:proposal?"propose":"respond",message:"Synthetic test",plan:[],proposal});
    return {response:{choices:[{finish_reason:"stop",message:{content}}]},normalized:{content,toolCalls:[]}};
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
