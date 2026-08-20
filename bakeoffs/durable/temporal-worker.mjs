import { Worker } from "@temporalio/worker";
import { NativeConnection } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import * as activities from "./temporal-activities.mjs";

const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
const worker = await Worker.create({
  connection,
  namespace: process.env.TEMPORAL_NAMESPACE,
  taskQueue: process.env.TEMPORAL_TASK_QUEUE,
  workflowsPath: fileURLToPath(new URL("./temporal-workflows.mjs", import.meta.url)),
  activities
});
process.stdout.write(`${JSON.stringify({ kind: "worker-ready", pid: process.pid })}\n`);
try {
  await worker.run();
} finally {
  await connection.close();
}
