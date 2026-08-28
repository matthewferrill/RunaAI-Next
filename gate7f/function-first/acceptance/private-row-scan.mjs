import { digest } from "../tasks/contracts.mjs";
import { fail } from "./runner-contract.mjs";

// Only a caller-created synthetic pool is supplied. The schema list is fixed;
// identifiers from PostgreSQL metadata must still pass a strict lexical check.
export async function scanRawOwnedRows(pool, canaries) {
  const tables = (await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_type='BASE TABLE' AND table_schema IN
    ('runa_core','runa_runtime','runa_workspace','runa_m1_sources','runa_m1','runa_m1_checkpoints') ORDER BY table_schema,table_name`)).rows;
  const result = [];
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table.table_schema) || !/^[a-z_][a-z0-9_]*$/.test(table.table_name)) throw fail("m1-control-table-invalid");
    const rows = (await pool.query(`SELECT to_jsonb(t) AS raw FROM "${table.table_schema}"."${table.table_name}" t`)).rows;
    const serialized = JSON.stringify(rows);
    result.push({ schema: table.table_schema, table: table.table_name, rowCount: rows.length,
      privateCanaryMatches: canaries.reduce((count, value) => count + (serialized.split(value).length - 1), 0),
      rawSha256: digest(rows) });
  }
  return result;
}
