import { mastra } from "./w2e-flow.mjs";
if (process.env.W2_DELAY_MS) await new Promise((r) => setTimeout(r, Number(process.env.W2_DELAY_MS)));
const run = await mastra.getWorkflow("flow").createRun({ runId: process.argv[2] });
const r = await run.resume({ step: "approve-then-effect", resumeData: { approved: true } });
console.log("STATUS::" + r.status + "::RESULT::" + JSON.stringify(r.result ?? null));
