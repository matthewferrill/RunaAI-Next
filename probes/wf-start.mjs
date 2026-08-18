// Process A: start, reach the suspension, then die without cleanup — the induced crash.
import { mastra } from "./wf-flow.mjs";
const run = await mastra.getWorkflow("flow").createRun({ runId: process.argv[2] });
const first = await run.start({ inputData: { subject: process.argv[3] } });
console.log("STATUS::" + first.status);
process.exit(first.status === "suspended" ? 0 : 2);
