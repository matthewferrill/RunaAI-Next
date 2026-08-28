// UNIT LIFECYCLE FIXTURE ONLY. This is not the functional application and proves
// no PostgreSQL reconciliation, model behavior or actual filesystem publication.
// The scored worker defaults to worker-host.mjs; this fixture is opt-in in tests.
import { createServer } from "node:http";
import { once } from "node:events";

export async function createAcceptanceWorkerHost(init, getLedger, { taskHooks }) {
  if (init?.lifecycleFixture !== true) throw new Error("fixture-only");
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/materialize-hook") {
        await taskHooks.afterMaterialize({ proposal: { participantId: "m1-test-fixture", projectId: "fixture-project",
          proposalId: "fixture-proposal", taskId: "fixture-task", capabilityId: "project.apply-change" },
        intent: { effectId: "fixture-effect" }, observed: { status: "unit-hook-only-not-materialized" } });
      }
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ pid: process.pid }));
    } catch { response.writeHead(503); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { baseUrl: `http://127.0.0.1:${server.address().port}`,
    identities: { issue: async principalId => ({ principalId, sessionId: init.sessionId, argv: process.argv }) },
    bindFixture: async () => null, snapshot: async () => ({ files: [] }),
    m1: { sources: { selected: async () => [] } },
    continuity: { prepareAnswerContext: async () => ({ turnCount: 0, history: [] }) },
    async close() { await new Promise(done => { server.close(done); server.closeAllConnections(); }); },
  };
}
