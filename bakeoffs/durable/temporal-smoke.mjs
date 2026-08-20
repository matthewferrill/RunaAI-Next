import { TestWorkflowEnvironment } from "@temporalio/testing";

const environment = await TestWorkflowEnvironment.createLocal();
try {
  console.log(JSON.stringify({ ok: true, namespace: environment.namespace,
    connection: environment.connection.options?.address ?? null }));
} finally {
  await environment.teardown();
}
