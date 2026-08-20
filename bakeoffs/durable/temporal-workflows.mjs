import { proxyActivities } from "@temporalio/workflow";

const { durableStep } = proxyActivities({
  startToCloseTimeout: "2 seconds",
  retry: { maximumAttempts: 4, initialInterval: "100 milliseconds" }
});

export async function durableWorkflow(input) {
  const completed = [];
  for (let step = 0; step < 5; step++) {
    completed.push(await durableStep({ ...input, step }));
  }
  return { status: "committed", completed };
}
