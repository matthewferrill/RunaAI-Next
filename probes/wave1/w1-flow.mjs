// Wave 1 W1-B — a workflow whose effect is deliberately NON-ATOMIC, so a crash can land inside it.
// The effect writes BEGIN, optionally waits, then writes COMMIT. Counting COMMIT lines gives effect
// multiplicity directly; a BEGIN without a COMMIT is the observable signature of a mid-effect death,
// which is what separates "crashed before the effect" from "crashed inside it" AFTER the fact rather
// than by trusting the sleep timings to have landed where intended.
import { Mastra } from "@mastra/core";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { LibSQLStore } from "@mastra/libsql";
import { appendFileSync } from "node:fs";
import { z } from "zod";

const LEDGER = process.env.W1_LEDGER ?? "probes/results/w1b-ledger.txt";
const nap = (ms) => (ms ? new Promise((r) => setTimeout(r, Number(ms))) : null);

const effect = createStep({
  id: "effect",
  inputSchema: z.object({ subject: z.string() }),
  outputSchema: z.object({ finding: z.string() }),
  execute: async ({ inputData }) => {
    await nap(process.env.W1_SLEEP_BEFORE_EFFECT);
    appendFileSync(LEDGER, `BEGIN:${inputData.subject}\n`);
    await nap(process.env.W1_SLEEP_IN_EFFECT);
    appendFileSync(LEDGER, `COMMIT:${inputData.subject}\n`);
    await nap(process.env.W1_SLEEP_AFTER_EFFECT);
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
    await nap(process.env.W1_SLEEP_IN_RESUME);
    return { done: resumeData.approved ? `acted on: ${inputData.finding}` : "declined" };
  },
});

export const flow = createWorkflow({
  id: "w1-flow",
  inputSchema: z.object({ subject: z.string() }),
  outputSchema: z.object({ done: z.string() }),
}).then(effect).then(approveThenAct).commit();

export const mastra = new Mastra({
  workflows: { flow },
  storage: new LibSQLStore({ id: "w1-workflows", url: process.env.W1_DB ?? "file:storage/w1-workflows.db" }),
});
