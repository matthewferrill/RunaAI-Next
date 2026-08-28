import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { inventory, newObservation, ObservationLedger, assertOwnedStage, validateRuntimeSeal, QDRANT_PIN } from "./runner-contract.mjs";
import { CASE_BUNDLE_SHA256, ACCEPTANCE_POLICY, MODEL_CASES } from "./cases.mjs";
import { startCaptureTransport, startOwnedIndexProxy } from "./capture-transport.mjs";
import { parseArguments, runControlFunctional, bindControlRuntimeSeal } from "./control-functional.mjs";
import { withSyntheticBootstrap } from "./browser-bootstrap.mjs";
import { acceptancePublicStatus } from "./functional-host.mjs";

async function endpoint(handler) { const server = createServer(handler); server.listen(0,"127.0.0.1"); await once(server,"listening");
  return { url:`http://127.0.0.1:${server.address().port}`, async close(){await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});} }; }
const ledger = () => new ObservationLedger(newObservation(MODEL_CASES[0]));
const post = (url, body) => fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),redirect:"manual"});
function seal() { const hex="a".repeat(64); return {schemaVersion:"runaai-m1-functional-runtime-seal/v1",sourceCommit:"b".repeat(40),caseBundleSha256:CASE_BUNDLE_SHA256,
  runtime:{nodeSha256:hex,sourceArchiveSha256:hex,packageLockSha256:hex,qdrantSha256:QDRANT_PIN.sha256,modelRuntimeSha256:hex,modelRuntimeVersion:"synthetic-seal-test"},
  candidates:ACCEPTANCE_POLICY.roster.map(item=>({candidateId:item.candidateId,modelId:item.candidateId,artifactSha256:hex,artifactBytes:1,
    requestControls:Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role=>[role,{reasoningEffort:null}]))})),
  roles:Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role=>[role,{maximumOutputTokens:["code","agent"].includes(role)?1536:512,
    maximumContextTokens:8192,deadlineMs:["code","agent"].includes(role)?30000:60000}])),
  providerBaseUrl:"http://127.0.0.1:9770/v1",embedding:{baseUrl:"http://127.0.0.1:9770/v1",modelId:"text-embedding-nomic-embed-text-v1.5",artifactSha256:hex},
  reranker:{baseUrl:"http://127.0.0.1:9876",artifactSha256:hex,windowCharacters:2000,overlapCharacters:300,batchSize:32},
  residency:{oneLargeModelAtATime:true,readinessEvidenceSha256:hex,effectiveReasoningEvidenceSha256:hex,telemetryPolicySha256:hex},suites:{},evaluatorId:"independent",maximumBatchMs:300000,productionRoutingChanged:false}; }

test("inventory retains all40cases/360attempts and clearly incomplete driver coverage",async()=>{
  const result=await runControlFunctional(parseArguments([]));assert.equal(result.modelCases,40);assert.equal(result.plannedAttempts,360);
  assert.equal(result.readyCases,33);assert.equal(result.scoredCliEnabled,false);assert.equal(result.productQualificationPassed,false);
});
test("scored CLI is closed until runtime and remaining drivers are sealed",()=>{assert.throws(()=>parseArguments(["--mode","scored"]),/not-yet-sealed/);
  assert.throws(()=>parseArguments(["--mode","controls","--mode","inventory"]),/duplicate/);assert.throws(()=>parseArguments(["--legacy-store","anything"]),/argument-invalid/);});
test("ownedstage rejects broad/production/sibling targets",()=>{
  assertOwnedStage(`C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-${"a".repeat(32)}`);
  for(const target of ["C:\\AI","C:\\AI\\RunaAI-Next-Candidate\\releases\\m1-task-native-"+"a".repeat(32),"C:\\AI\\RunaAI-Next-Candidate\\staging"])
    assert.throws(()=>assertOwnedStage(target),/invalid/);
});
test("runtime seal requiresall3candidates and onlyenforcedrolebudgets",()=>{validateRuntimeSeal(seal());const value=seal();value.roles.chat.maximumOutputTokens=2048;
  assert.throws(()=>validateRuntimeSeal(value),/unenforced-budget/);const repeated=seal();repeated.candidates[1]=repeated.candidates[0];assert.throws(()=>validateRuntimeSeal(repeated),/seal-mismatch/);});
test("runtime seal rejects publicauxiliary or embeddedcredentials",()=>{for(const url of ["https://external.example","http://user@127.0.0.1:5555"]){const value=seal();value.embedding.baseUrl=url;assert.throws(()=>validateRuntimeSeal(value));}});
test("candidate reasoningcontrols remain separate whilefunction budgets stayidentical",()=>{const value=seal();value.candidates[0].requestControls.chat.reasoningEffort="none";
  const checked=validateRuntimeSeal(value);assert.equal(checked.candidates[0].requestControls.chat.reasoningEffort,"none");assert.equal(checked.candidates[1].requestControls.chat.reasoningEffort,null);});

test("model-free controls bind the common prospective seal only after every shared artifact matches",()=>{
  const value=seal(), control={sourceCommit:value.sourceCommit,...value.runtime};
  const bound=bindControlRuntimeSeal(value,control,Buffer.from(JSON.stringify(value)));assert.match(bound.runtimeSealSha256,/^[a-f0-9]{64}$/);
  for(const field of ["sourceArchiveSha256","packageLockSha256","nodeSha256","qdrantSha256"])
    assert.throws(()=>bindControlRuntimeSeal(value,{...control,[field]:"f".repeat(64)},Buffer.from("x")),/mismatch/);
  assert.throws(()=>bindControlRuntimeSeal(value,{...control,sourceCommit:"c".repeat(40)},Buffer.from("x")),/mismatch/);
});
test("native evidence doesnot mutate versionedreceipt withphase metadata",()=>{const l=ledger(),receipt={schemaVersion:"example/v1",value:7};l.evidence("host-runtime","native-receipt",receipt);
  assert.deepEqual(l.observation.evidence[0].data,receipt);assert.equal(l.observation.evidence[0].phase,"setup");});
test("controls transport deniesall model,embedding andreranker inference beforeupstream",async()=>{let reached=0;const target=await endpoint((q,s)=>{reached++;s.end("{}");});
  try{for(const kind of ["provider","embedding","reranker"]){const l=ledger(),capture=await startCaptureTransport({mode:"controls",targetBaseUrl:target.url,modelId:"pinned",kind,getLedger:()=>l});
    try{const route=kind==="provider"?"chat/completions":kind==="embedding"?"embeddings":"rerank";const result=await post(`${capture.baseUrl}/${route}`,{model:"pinned",input:["x"],documents:["x"]});
      assert.equal(result.status,503);assert.equal((await result.json()).errorCode,"m1-inference-not-enabled");}finally{await capture.close();}}assert.equal(reached,0);
  }finally{await target.close();}});
test("scoredcapture forwards exactbody without injectingexpectedanswer",async()=>{let observed;const target=await endpoint(async(q,s)=>{let raw="";for await(const part of q)raw+=part;observed=JSON.parse(raw);s.setHeader("content-type","application/json");s.end(JSON.stringify({model:"pinned",choices:[]}));});
  const l=ledger(),capture=await startCaptureTransport({mode:"scored",targetBaseUrl:target.url,modelId:"pinned",getLedger:()=>l});
  try{const input={model:"pinned",messages:[{role:"user",content:"synthetic transport fixture"}],max_tokens:512};assert.equal((await post(`${capture.baseUrl}/chat/completions`,input)).status,200);assert.deepEqual(observed,input);assert.equal(l.observation.provider.calls.length,1);}finally{await capture.close();await target.close();}});
test("capture denies mismatchedmodel andunsealedrequest beforeupstream",async()=>{let reached=0;const target=await endpoint((q,s)=>{reached++;s.end("{}");}),l=ledger();
  const capture=await startCaptureTransport({mode:"scored",targetBaseUrl:target.url,modelId:"pinned",getLedger:()=>l,validateRequest(){throw new Error("unsealed");}});
  try{await post(`${capture.baseUrl}/chat/completions`,{model:"other"});await post(`${capture.baseUrl}/chat/completions`,{model:"pinned"});assert.equal(reached,0);}finally{await capture.close();await target.close();}});
test("capture neverfollowsredirects",async()=>{let reached=0;const second=await endpoint((q,s)=>{reached++;s.end("{}");}),first=await endpoint((q,s)=>{s.writeHead(307,{location:second.url});s.end();});
  const l=ledger(),capture=await startCaptureTransport({mode:"scored",targetBaseUrl:first.url,modelId:"pinned",getLedger:()=>l});
  try{assert.equal((await post(`${capture.baseUrl}/chat/completions`,{model:"pinned"})).status,503);assert.equal(reached,0);}finally{await capture.close();await first.close();await second.close();}});
test("ownedindex fault deniesactualendpoint andrecoverswithoutreplacingadapter",async()=>{let reached=0;const target=await endpoint((q,s)=>{reached++;s.setHeader("content-type","application/json");s.end('{"status":"ok"}');}),l=ledger();
  const index=await startOwnedIndexProxy({targetBaseUrl:target.url,collection:"m1_control",getLedger:()=>l});
  try{index.setIndexUnavailable(true);assert.equal((await fetch(`${index.baseUrl}/collections/m1_control`)).status,503);assert.equal(reached,0);
    index.setIndexUnavailable(false);assert.equal((await fetch(`${index.baseUrl}/collections/m1_control`)).status,200);assert.equal(reached,1);
    assert.equal((await fetch(`${index.baseUrl}/collections/production`)).status,503);assert.equal(reached,1);
  }finally{await index.close();await target.close();}});
test("bootstrap onlyissuescookie once fromnonce; doesnotexposesessiontoscript",async()=>{let issued=0;const identities={publicBaseUrl:null,async issue(principalId){issued++;return{principalId,sessionId:"f".repeat(64)};}};
  const original=createServer((q,s)=>{s.end("shipped-route");});const fixture=withSyntheticBootstrap(original,{identities,getLedger:()=>null});fixture.server.listen(0,"127.0.0.1");await once(fixture.server,"listening");
  identities.publicBaseUrl=`http://127.0.0.1:${fixture.server.address().port}`;const bootstrap=await fixture.createBootstrap("m1-test-"+"a".repeat(32));
  try{const call=()=>fetch(bootstrap.url,{method:"POST",headers:{origin:identities.publicBaseUrl,"content-type":"application/x-www-form-urlencoded"},body:`nonce=${bootstrap.nonce}`,redirect:"manual"});
    const response=await call();assert.equal(response.status,303);assert.match(response.headers.get("set-cookie"),/HttpOnly/);assert.equal(await response.text(),"");assert.equal((await call()).status,403);assert.equal(issued,1);
    assert.equal(await(await fetch(identities.publicBaseUrl)).text(),"shipped-route");
    const page=await fetch(bootstrap.url),html=await page.text();assert.match(html,/bootstrap\.js/);assert.match(html,/type='text'/);
    assert.match(page.headers.get("content-security-policy"),/script-src 'self'/);
    const script=await(await fetch(`${identities.publicBaseUrl}/__acceptance/bootstrap.js`)).text();
    assert.match(script,/event\.preventDefault/);assert.match(script,/credentials:'same-origin'/);assert.doesNotMatch(script,/document\.cookie/);
    const counts=await(await fetch(`${identities.publicBaseUrl}/__acceptance/bootstrap-status`)).json();
    assert.equal(counts.get,1);assert.equal(counts.post,2);assert.equal(counts.issued,1);assert.equal(counts.denied,1);
    assert.doesNotMatch(JSON.stringify(counts),new RegExp(bootstrap.nonce));
  }finally{await new Promise(resolve=>{fixture.server.close(resolve);fixture.server.closeAllConnections();});}});
test("bootstrap reattaches anexistingactivesession without mintingnewgrant authority",async()=>{
  const principalId="m1-test-"+"a".repeat(32),sessionId="b".repeat(64);let revoked=false,issued=0;
  const identities={publicBaseUrl:null,async issue(){issued++;throw new Error("notnewlogin");},async participant(value){assert.equal(value,sessionId);if(revoked)throw new Error("revoked");return{principalId};}};
  const fixture=withSyntheticBootstrap(createServer((q,s)=>s.end("ok")),{identities,getLedger:()=>null});fixture.server.listen(0,"127.0.0.1");await once(fixture.server,"listening");
  identities.publicBaseUrl=`http://127.0.0.1:${fixture.server.address().port}`;
  try{const bootstrap=await fixture.createBootstrap(principalId,{session:{principalId,sessionId}});
    const response=await fetch(bootstrap.url,{method:"POST",headers:{origin:identities.publicBaseUrl},body:`nonce=${bootstrap.nonce}`,redirect:"manual"});
    assert.equal(response.status,303);assert.match(response.headers.get("set-cookie"),new RegExp(sessionId));assert.equal(issued,0);
    const second=await fixture.createBootstrap(principalId,{session:{principalId,sessionId}});revoked=true;
    assert.equal((await fetch(second.url,{method:"POST",headers:{origin:identities.publicBaseUrl},body:`nonce=${second.nonce}`,redirect:"manual"})).status,403);
  }finally{await new Promise(resolve=>{fixture.server.close(resolve);fixture.server.closeAllConnections();});}
});

test("isolated publicstatus uses actual authority and complete shippedUI fields",async()=>{
  let allowed=true;const status=acceptancePublicStatus({sourceIdentity:{sourceCommit:"a".repeat(40),sourceArchiveSha256:"b".repeat(64)},
    application:{async cutoverStatus(){return{phase:"closed",authorityGeneration:"synthetic",revision:4};},async authority(){if(!allowed)throw new Error("closed");}},
    async dependencyHealth(){return{ready:true};}});
  const runtime=await status.runtimeStatus(),ready=await status.readinessStatus();
  assert.equal(runtime.cutover.phase,"closed");assert.equal(runtime.cutover.revision,4);assert.equal(runtime.running.commit,"a".repeat(40));
  assert.equal(ready.authority,"active");assert.equal(ready.productionTrafficChanged,false);allowed=false;
  assert.equal((await status.readinessStatus()).authority,"unavailable");
  assert.throws(()=>acceptancePublicStatus({sourceIdentity:{},application:{}}),/source-invalid/);
});
