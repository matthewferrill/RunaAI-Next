import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresGovernedActionStore } from "./adapters/postgres.mjs";
import { Gate3GovernedActionService } from "./core.mjs";
import { createGate3Workflow } from "./workflow.mjs";

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
};
const phase = required("GATE3_PHASE");
const pgUrl = required("GATE3_PG_URL");
const request = JSON.parse(required("GATE3_APPROVAL_JSON"));
const store = new PostgresGovernedActionStore({ connectionString: pgUrl });
const service = new Gate3GovernedActionService({ store });
const checkpointer = PostgresSaver.fromConnString(pgUrl, { schema: "public" });
const graph = createGate3Workflow({ service, checkpointer });

let output;
try {
  await store.initialize();
  await checkpointer.setup();
  if (phase === "interrupt") {
    try { await graph.approveAndExecute(request, { interruptAfterCheckpoint: true }); }
    catch (error) {
      if (error?.code !== "receipt-delivery-interrupted") throw error;
      output = { phase, interrupted: true, code: error.code };
    }
  } else if (phase === "resume" || phase === "workflow-replay") {
    output = { phase, receipt: await graph.approveAndExecute(request, { resume: true }) };
  } else if (phase === "direct-replay") {
    output = { phase, receipt: await service.approveAndExecute({ ...request, approvalId: "approval-direct-replay" }) };
  } else if (phase === "concurrent-replay") {
    output = { phase, receipts: await Promise.all([
      service.approveAndExecute({ ...request, approvalId: "approval-concurrent-a" }),
      service.approveAndExecute({ ...request, approvalId: "approval-concurrent-b" }),
    ]) };
  } else if (phase === "approve") {
    output = { phase, receipt: await graph.approveAndExecute(request) };
  } else throw new Error(`unknown phase ${phase}`);
  const pool = new pg.Pool({ connectionString: pgUrl });
  output.counts = (await pool.query(`SELECT
    (SELECT count(*)::int FROM gate3.proposals) proposals,
    (SELECT count(*)::int FROM gate3.receipts) receipts,
    (SELECT count(*)::int FROM gate3.capabilities) capabilities,
    (SELECT count(*)::int FROM gate3.outbox) outbox,
    (SELECT count(*)::int FROM checkpoints) checkpoints`)).rows[0];
  await pool.end();
} finally {
  await store.close().catch(() => {});
  await checkpointer.end?.().catch(() => {});
}
process.stdout.write(`${JSON.stringify(output)}\n`);
