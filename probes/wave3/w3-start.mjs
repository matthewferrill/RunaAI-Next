import { mastra } from "./w3-flow.mjs";
const run = await mastra.getWorkflow("flow").createRun({ runId: process.argv[2] });
const r = await run.start({ inputData: { subject: process.argv[3] ?? "s", amount: Number(process.argv[4] ?? 1) } });
console.log("STATUS::" + r.status);
