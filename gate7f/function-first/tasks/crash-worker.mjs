import pg from "pg";
import { PostgresTaskStore } from "./postgres.mjs";
import { M1TaskService } from "./service.mjs";

let text = "";
for await (const part of process.stdin) text += part;
const input = JSON.parse(text);
const { DisposableJavascriptProjectAdapter } = await import(input.adapterPath);
const pool = new pg.Pool({ connectionString: process.env.M1_TASK_PG_URL });
const store = new PostgresTaskStore({ pool, schema: input.schema, allowPlaintextForSynthetic: true });
const adapter = new DisposableJavascriptProjectAdapter({ baseDirectory: input.baseDirectory });
const service = new M1TaskService({ store, adapter, allowSyntheticAuthority: true, hooks: { afterMaterialize: () => process.exit(88) } });
try { await service.execute(input.context, { proposalId: input.proposalId }); }
finally { await pool.end(); }
