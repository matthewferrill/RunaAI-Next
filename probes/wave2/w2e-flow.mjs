import { Mastra } from "@mastra/core";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { LibSQLStore } from "@mastra/libsql";
import { appendFileSync } from "node:fs";
import { z } from "zod";
const approveThenEffect = createStep({
  id: "approve-then-effect",
  inputSchema: z.object({ subject: z.string() }),
  outputSchema: z.object({ done: z.string() }),
  suspendSchema: z.object({ awaiting: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) { await suspend({ awaiting: "steward approval" }); return { done: "unreachable" }; }
    if (resumeData.approved) { appendFileSync("probes/results/w2e-effect.txt", `effect:${inputData.subject}\n`); return { done: `executed on: ${inputData.subject}` }; }
    return { done: "declined" };
  },
});
export const flow = createWorkflow({ id: "w2e-flow", inputSchema: z.object({ subject: z.string() }), outputSchema: z.object({ done: z.string() }) }).then(approveThenEffect).commit();
export const mastra = new Mastra({ workflows: { flow }, storage: new LibSQLStore({ id: "w2e-workflows", url: "file:storage/w2e-workflows.db" }) });
