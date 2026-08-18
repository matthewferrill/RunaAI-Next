// Install check: a two-step workflow with a suspend in the middle, resumed with data.
// This is the primitive everything later hangs on — the approval probes in PROVING.md all start here.
import { Mastra } from "@mastra/core";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { LibSQLStore } from "@mastra/libsql";
import { z } from "zod";

const gather = createStep({
  id: "gather",
  inputSchema: z.object({ subject: z.string() }),
  outputSchema: z.object({ finding: z.string() }),
  execute: async ({ inputData }) => ({ finding: `observed ${inputData.subject}` }),
});

const approveThenAct = createStep({
  id: "approve-then-act",
  inputSchema: z.object({ finding: z.string() }),
  outputSchema: z.object({ done: z.string() }),
  suspendSchema: z.object({ awaiting: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      await suspend({ awaiting: "steward approval" });
      return { done: "unreachable" };
    }
    return { done: resumeData.approved ? `acted on: ${inputData.finding}` : "declined" };
  },
});

const flow = createWorkflow({
  id: "reference-flow",
  inputSchema: z.object({ subject: z.string() }),
  outputSchema: z.object({ done: z.string() }),
}).then(gather).then(approveThenAct).commit();

// The documented full pattern: a Mastra instance with storage, so the suspension snapshot persists and
// resume can find it. Without storage, suspend works and resume throws "No snapshot found".
const mastra = new Mastra({
  workflows: { flow },
  storage: new LibSQLStore({ id: "reference-workflows", url: "file:storage/workflows.db" }),
});
const run = await mastra.getWorkflow("flow").createRun();
const first = await run.start({ inputData: { subject: "the sandbox" } });
console.log("after start:", first.status, "| suspended at:", JSON.stringify(first.suspended ?? []));
const second = await run.resume({ step: "approve-then-act", resumeData: { approved: true } });
console.log("after resume:", second.status, "| result:", JSON.stringify(second.result ?? second.status));
