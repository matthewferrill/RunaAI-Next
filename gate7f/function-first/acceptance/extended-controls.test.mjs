import test from "node:test";
import assert from "node:assert/strict";
import { scanRawOwnedRows } from "./private-row-scan.mjs";

test("private row scan accepts actual versioned schema names but rejects SQL syntax",async()=>{
  let queries=0;
  const pool={async query(sql){queries++;return queries===1?{rows:[{table_schema:"runa_m1",table_name:"route_responses_v2"}]}:{rows:[{raw:{encrypted:"opaque"}}]};}};
  const result=await scanRawOwnedRows(pool,["synthetic-canary"]);assert.equal(result[0].privateCanaryMatches,0);assert.equal(queries,2);
  for(const table_name of ['row";DROP TABLE x;--',"1starts_with_digit"])
    await assert.rejects(scanRawOwnedRows({async query(){return{rows:[{table_schema:"runa_m1",table_name}]};}},[]),/m1-control-table-invalid/);
});
import { CONTROL_CASES } from "./cases.mjs";
import { SUPPORTED_CONTROLS, runModelFreeControl } from "./model-free-controls.mjs";
import { newObservation, ObservationLedger } from "./runner-contract.mjs";
import { evaluateControl } from "./assertions.mjs";
import { HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS } from "./browser-checkpoint.mjs";
import { CONTROL_RESOURCE_MAXIMUM_MS } from "./control-functional.mjs";

test("model-free control resources outlive the maximum browser checkpoint", () => {
  assert.equal(HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS, 900000);
  assert.equal(CONTROL_RESOURCE_MAXIMUM_MS, 1800000);
  assert.ok(CONTROL_RESOURCE_MAXIMUM_MS > HUMAN_BROWSER_CHECKPOINT_MAXIMUM_MS);
});

test("every frozen control has an actual driver; browser proof remains separate", () => {
  assert.deepEqual([...SUPPORTED_CONTROLS].sort(), CONTROL_CASES.map(item => item.id).sort());
});

test("all real outbound adapters deny307/308 before a second owned destination", async () => {
  const item = CONTROL_CASES.find(item => item.id === "control-04-outbound-redirect"), seal = "a".repeat(64);
  const ledger = new ObservationLedger(newObservation({ ...item, role: "control" }, { runtimeSealSha256: seal }));
  const observation = await runModelFreeControl({ host: null, item, ledger });
  assert.equal(observation.status, "completed", JSON.stringify(observation.failures));
  const grade = evaluateControl(item, observation, { runtimeSealSha256: seal });
  assert.equal(grade.status, "pass", JSON.stringify(grade));
  assert.equal(observation.provider.calls.length, 0);
});
