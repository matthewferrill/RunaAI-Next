// The probed workflow: step one has a visible side effect (a line appended to a counter file), step two
// suspends for approval. The counter is how "executed exactly once" is observed rather than believed.
import { Mastra } from "@mastra/core";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { LibSQLStore } from "@mastra/libsql";
import { appendFileSync } from "node:fs";
import { z } from "zod";

const gather = createStep({
  id: "gather",
  inputSchema: z.object({ subject: z.string() }),
  outputSchema: z.object({ finding: z.string() }),
  execute: async ({ inputData }) => {
    appendFileSync("probes/results/wf-exec-count.txt", `executed:${inputData.subject}\n`);
    if (process.env.WF_SLOW) await new Promise((r) => setTimeout(r, Number(process.env.WF_SLOW)));
    return { finding: `observed ${inputData.subject}` };
  },
});
const approveThenAct = createStep({
  id: "approve-then-act",
  inputSchema: z.object({ finding: z.string() }),
  outputSchema: z.object({ done: z.string() }),
  suspendSchema: z.object({ awaiting: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) { await suspend({ awaiting: "steward approval" }); return { done: "unreachable" }; }
    return { done: resumeData.approved ? `acted on: ${inputData.finding}` : "declined" };
  },
});
export const flow = createWorkflow({
  id: "probe-flow",
  inputSchema: z.object({ subject: z.string() }),
  outputSchema: z.object({ done: z.string() }),
}).then(gather).then(approveThenAct).commit();

export const mastra = new Mastra({
  workflows: { flow },
  storage: new LibSQLStore({ id: "probe-workflows", url: "file:storage/probe-workflows.db" }),
});
