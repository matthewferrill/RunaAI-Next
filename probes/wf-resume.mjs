// Process B: a fresh process re-opens the store and resumes the crashed run.
import { mastra } from "./wf-flow.mjs";
const run = await mastra.getWorkflow("flow").createRun({ runId: process.argv[2] });
const second = await run.resume({ step: "approve-then-act", resumeData: { approved: true } });
console.log("STATUS::" + second.status + "::RESULT::" + JSON.stringify(second.result ?? null));
