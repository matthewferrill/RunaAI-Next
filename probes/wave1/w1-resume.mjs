// Process B for W1-B / W1-A: a fresh process re-opens the store and resumes.
import { mastra } from "./w1-flow.mjs";
const run = await mastra.getWorkflow("flow").createRun({ runId: process.argv[2] });
const r = await run.resume({ step: "approve-then-act", resumeData: { approved: true } });
console.log("STATUS::" + r.status + "::RESULT::" + JSON.stringify(r.result ?? null));
