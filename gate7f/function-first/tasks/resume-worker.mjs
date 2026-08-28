import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresTaskStore } from "./postgres.mjs";
import { M1TaskService } from "./service.mjs";
import { createM1TaskWorkflow } from "./workflow.mjs";
import { testCipher } from "../../../gate4/fixtures.mjs";

let text = "";
for await (const part of process.stdin) text += part;
const input = JSON.parse(text);
const pool = new pg.Pool({ connectionString: process.env.M1_TASK_PG_URL });
try {
  const store = new PostgresTaskStore({ pool, schema: input.schema,
    ...(input.encrypted ? { cipher: testCipher() } : { allowPlaintextForSynthetic: true }) });
  const adapter = new Proxy({}, { get() { return () => { throw new Error("restarted-worker-must-not-execute"); }; } });
  const service = new M1TaskService({ store, adapter, allowSyntheticAuthority: true });
  const checkpointer = new PostgresSaver(pool, undefined, { schema: input.checkpointSchema });
  const workflow = createM1TaskWorkflow({ service, checkpointer });
  const result = await workflow.run(input.context, { proposalId: input.proposalId }, { resume: true });
  process.stdout.write(JSON.stringify({ receiptId: result.receipt.receiptId, resumed: result.resumed }));
} finally { await pool.end(); }
