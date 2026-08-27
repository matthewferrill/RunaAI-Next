import test from "node:test";
import assert from "node:assert/strict";
import {runAcceptance,soakSchedule,SOAK_POLICY} from "./runner.mjs";
test("fixed one-hour endurance schedule includes unique long-context and bounded concurrency requests",()=>{
  const schedule=soakSchedule(),flat=schedule.flat();assert.equal(schedule.length,120);assert.equal(flat.length,131);
  assert.equal(new Set(flat.map(x=>x.id)).size,131);assert.ok(schedule.every(batch=>batch.length<=2));
  assert.equal(SOAK_POLICY.durationMs,3600000);assert.ok(flat.some(x=>x.messages[0].content.length>50000));
});
test("acceptance follows the actual preceding reply with no repair or scripted assistant answer",async()=>{
  const inputs={attemptsPerCase:3,cases:[{id:"test",mode:"text",messages:[{role:"user",content:"first"}],turns:[{user:"next"}]}]};
  const requests=[];
  const count=await runAcceptance(inputs,{record:()=>{},invoke:async request=>{requests.push(request);return {normalized:{content:"actual wrong output",toolCalls:[]}};}});
  assert.equal(count,6);assert.equal(requests[1].request.messages.at(-2).content,"actual wrong output");
  assert.equal(requests[1].request.messages.at(-1).content,"next");assert.equal(requests[2].request.messages.length,2);
});
