// Wave 3 instrumented workflow. The effect writes to a ledger BEFORE its record is written, and the
// gap between them is configurable, so persistence boundaries (effect-ok-record-fails and its mirror)
// are reachable by killing the process inside the gap rather than by simulating one.
import { Mastra } from "@mastra/core";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { LibSQLStore } from "@mastra/libsql";
import { appendFileSync } from "node:fs";
import { z } from "zod";

const LEDGER = process.env.W3_LEDGER ?? "probes/results/w3-effect.ledger";
const DB = process.env.W3_DB ?? "storage/w3-workflows.db";

const effectStep = createStep({
  id: "effect",
  inputSchema: z.object({ subject: z.string(), amount: z.number().optional() }),
  outputSchema: z.object({ done: z.string() }),
  suspendSchema: z.object({ awaiting: z.string() }),
  resumeSchema: z.object({ approved: z.boolean(), amount: z.number().optional() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) { await suspend({ awaiting: "approval" }); return { done: "unreachable" }; }
    if (resumeData.approved === false) return { done: "declined" };
    // W3_FAIL_BEFORE_WRITE: die before the effect lands at all.
    if (process.env.W3_FAIL_BEFORE_WRITE) process.kill(process.pid, "SIGKILL");
    appendFileSync(LEDGER, JSON.stringify({ subject: inputData.subject, amount: resumeData.amount ?? inputData.amount ?? 1, at: Date.now() }) + "\n");
    // The gap: an effect has happened and nothing has recorded it yet. A kill here is
    // effect-ok-record-fails, the sharpest persistence case in the preregistration.
    if (process.env.W3_GAP_MS) await new Promise((r) => setTimeout(r, Number(process.env.W3_GAP_MS)));
    if (process.env.W3_KILL_IN_GAP) process.kill(process.pid, "SIGKILL");
    return { done: `executed:${inputData.subject}` };
  },
});

export const flow = createWorkflow({
  id: "w3-flow",
  inputSchema: z.object({ subject: z.string(), amount: z.number().optional() }),
  outputSchema: z.object({ done: z.string() }),
}).then(effectStep).commit();

export const mastra = new Mastra({ workflows: { flow }, storage: new LibSQLStore({ id: "w3-workflows", url: `file:${DB}` }) });
