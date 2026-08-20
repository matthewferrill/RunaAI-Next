import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { appendFile, mkdir, open, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.env.DURABLE_EVIDENCE_ROOT;
const runId = process.env.DURABLE_RUN_ID;
const adapter = process.env.DURABLE_ADAPTER;
const targetStep = Number(process.env.DURABLE_TARGET_STEP);
const phase = process.env.DURABLE_PHASE;
const invocation = process.env.DURABLE_INVOCATION;
const dbPath = process.env.DURABLE_DB_PATH;
if (!root || !runId || !adapter || !phase || !invocation || !dbPath) throw new Error("missing durable environment");

const State = Annotation.Root({
  runId: Annotation(),
  completed: Annotation({ reducer: (left, right) => [...left, ...right], default: () => [] })
});
const exists = file => stat(file).then(() => true, () => false);
const log = value => appendFile(path.join(root, "deed.jsonl"), `${JSON.stringify(value)}\n`);
const allow = path.join(root, `${runId}.allow`);
const marker = path.join(root, `${runId}.marker`);

async function waitForAllow() {
  while (!await exists(allow)) await new Promise(resolve => setTimeout(resolve, 25));
}

async function recordEffect(step) {
  const effectId = `${runId}-step-${step}`;
  if (adapter === "idempotent") {
    const file = path.join(root, "effects", effectId);
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(JSON.stringify({ runId, step, pid: process.pid }));
      await handle.close();
      await log({ kind: "effect", effectId, runId, step, adapter, pid: process.pid });
      return "created";
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await log({ kind: "effect-deduplicated", effectId, runId, step, adapter, pid: process.pid });
      return "already-created";
    }
  }
  await log({ kind: "effect", effectId, runId, step, adapter, pid: process.pid });
  return "created";
}

await mkdir(path.join(root, "effects"), { recursive: true });
const graphBuilder = new StateGraph(State);
for (let step = 0; step < 5; step++) {
  graphBuilder.addNode(`step${step}`, async state => {
    const isTarget = step === targetStep;
    if (isTarget && phase === "before-effect" && !await exists(allow)) {
      await appendFile(marker, JSON.stringify({ runId, step, phase, pid: process.pid }));
      await waitForAllow();
    }
    const effect = await recordEffect(step);
    if (isTarget && phase === "after-effect" && !await exists(allow)) {
      await appendFile(marker, JSON.stringify({ runId, step, phase, pid: process.pid }));
      await waitForAllow();
    }
    return { completed: [{ step, effect }], runId: state.runId };
  });
}
graphBuilder.addEdge(START, "step0");
for (let step = 0; step < 4; step++) graphBuilder.addEdge(`step${step}`, `step${step + 1}`);
graphBuilder.addEdge("step4", END);
const checkpointer = SqliteSaver.fromConnString(dbPath);
const graph = graphBuilder.compile({ checkpointer });
const config = { configurable: { thread_id: runId } };
const input = invocation === "initial" ? { runId, completed: [] } : null;
const outcome = await graph.invoke(input, config);
let historyStates = 0;
for await (const _state of graph.getStateHistory(config)) historyStates++;
process.stdout.write(`${JSON.stringify({ status: "committed", completed: outcome.completed,
  historyStates, pid: process.pid })}\n`);
