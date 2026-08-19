import { mastra } from "./w2e-flow.mjs";
const run = await mastra.getWorkflow("flow").createRun({ runId: process.argv[2] });
const r = await run.start({ inputData: { subject: process.argv[3] } });
console.log("STATUS::" + r.status);
process.exit(r.status === "suspended" ? 0 : 2);
