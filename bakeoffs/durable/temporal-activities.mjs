import { activityInfo } from "@temporalio/activity";
import { appendFile, mkdir, open, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.env.DURABLE_EVIDENCE_ROOT;
if (!root) throw new Error("DURABLE_EVIDENCE_ROOT is required");

const exists = async file => stat(file).then(() => true, () => false);
const log = async value => appendFile(path.join(root, "deed.jsonl"), `${JSON.stringify(value)}\n`);

async function waitForAllow(runId) {
  const allow = path.join(root, `${runId}.allow`);
  while (!await exists(allow)) await new Promise(resolve => setTimeout(resolve, 25));
}

async function recordEffect({ runId, step, adapter, attempt }) {
  const effectId = `${runId}-step-${step}`;
  if (adapter === "idempotent") {
    const file = path.join(root, "effects", effectId);
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(JSON.stringify({ runId, step, attempt }));
      await handle.close();
      await log({ kind: "effect", effectId, runId, step, attempt, adapter });
      return "created";
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await log({ kind: "effect-deduplicated", effectId, runId, step, attempt, adapter });
      return "already-created";
    }
  }
  await log({ kind: "effect", effectId, runId, step, attempt, adapter });
  return "created";
}

export async function durableStep({ runId, step, targetStep, phase, adapter }) {
  await mkdir(path.join(root, "effects"), { recursive: true });
  const attempt = activityInfo().attempt;
  const isTarget = step === targetStep;
  const marker = path.join(root, `${runId}.marker`);

  if (isTarget && phase === "before-effect" && !await exists(path.join(root, `${runId}.allow`))) {
    await appendFile(marker, JSON.stringify({ runId, step, phase, attempt }));
    await waitForAllow(runId);
  }

  const effect = await recordEffect({ runId, step, adapter, attempt });

  if (isTarget && phase === "after-effect" && !await exists(path.join(root, `${runId}.allow`))) {
    await appendFile(marker, JSON.stringify({ runId, step, phase, attempt }));
    await waitForAllow(runId);
  }

  return { step, attempt, effect };
}
