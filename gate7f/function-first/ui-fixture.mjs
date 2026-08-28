import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Browser-only synthetic fixture. No credential, model, database, filesystem write
// or execution adapter is reachable here. Real stack acceptance is a separate run.
export function createUiFixture() {
  const assets = resolve(import.meta.dirname, "../../gate6b/public");
  const files = new Set(["index.html", "styles.css", "status.js", "workspace-shell.mjs", "chat-client.mjs", "code-execution.mjs", "function-panel.mjs"]);
  const calls = [], sources = [], grants = [];
  const task = { taskId: "synthetic-task", objective: "Synthetic saved repair", status: "active" };
  const run = { runId: "synthetic-run", taskId: task.taskId, objective: task.objective, status: "waiting-approval",
    plans: [{ summary: "This is a synthetic UI plan, not model or execution evidence." }] };
  const proposal = { proposalId: "synthetic-proposal", proposalDigest: "a".repeat(64), status: "pending-approval",
    grantId: "synthetic-grant", grantRevision: 1, capabilityId: "project.apply-change",
    arguments: { path: "calculator.js", content: "exports.add=(a,b)=>a+b;" }, prepared: { preview: { before: "minus", after: "plus" } } };
  const state = () => ({ task, run, project: { revision: 1 }, grants, proposals: [proposal], receipts: [], pendingReconciliation: [], currentReceiptIds: [] });
  const server = createServer(async (request, response) => {
    const json = (value, status = 200) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(value)); };
    try {
      if (request.headers.host !== `127.0.0.1:${server.address().port}`) return json({ errorCode: "synthetic-host-only" }, 403);
      const url = new URL(request.url, `http://${request.headers.host}`);
      const asset = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (request.method === "GET" && files.has(asset)) {
        let body = await readFile(resolve(assets, asset), "utf8");
        if (asset === "index.html") body = body.replace("<title>RunaAI</title>", "<title>RunaAI synthetic UI test</title>")
          .replace('<span>RunaAI</span>', '<span>RunaAI · synthetic UI only</span>');
        response.writeHead(200, { "content-type": asset.endsWith(".html") ? "text/html" : asset.endsWith(".css") ? "text/css" : "text/javascript",
          "cache-control": "no-store", "content-security-policy": "default-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'" });
        return response.end(body);
      }
      const chunks = []; let length = 0;
      for await (const chunk of request) { length += chunk.length; if (length > 65_536) return json({ errorCode: "synthetic-body-limit" }, 413); chunks.push(chunk); }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      calls.push({ path: url.pathname, body });
      if (url.pathname === "/api/runtime/status") return json({ cutover: { phase: "closed" }, running: { releaseId: "synthetic-only", commit: "a".repeat(40) }, selectedScopeVersion: "synthetic" });
      if (url.pathname === "/api/readiness/status") return json({ authority: "active" });
      if (url.pathname === "/api/session/status") return json({ authenticated: true, sessionType: "ordinary", profile: { initials: "ST", displayName: "Synthetic Tester" } });
      if (url.pathname === "/api/m1/capabilities") return json({ enabled: true });
      if (url.pathname === "/api/selected/navigation/query") return json({ projects: [{ projectId: `synthetic-${body.experience}`, displayName: "Synthetic project" }],
        chats: [{ chatId: `synthetic-chat-${body.experience}`, title: "Saved synthetic conversation", projectId: `synthetic-${body.experience}` }] });
      if (url.pathname === "/api/selected/chat/read") return json({ chatId: body.chatId, projectId: `synthetic-${body.experience}`, turnCount: 1,
        turns: [{ user: "Where is the fictional meeting?", assistant: "The fictional meeting is in the east room [1].", evidence: {
          citations: [{ sourceId: "synthetic-source", sectionId: "provided", ordinal: 1, contentSha256: "b".repeat(64) }],
          retrieval: { attempted: true, empty: false, degraded: false }, execution: { status: "not-executed" } } }] });
      if (url.pathname === "/api/m1/workspace") {
        const input = body.input ?? {};
        if (body.operation === "sources.list") return json({ sources });
        if (body.operation === "sources.attach") {
          const prior = sources.find(source => source.requestId === input.requestId); if (prior) return json(prior);
          const source = { sourceId: `synthetic-source-${sources.length}`, sectionId: "provided", label: input.label,
            characters: input.content.length, contentSha256: createHash("sha256").update(input.content).digest("hex"), indexed: false, requestId: input.requestId };
          sources.push(source); return json(source);
        }
        if (body.operation === "sources.retry") { const source = sources.find(value => value.sourceId === input.sourceId);
          if (!source || source.contentSha256 !== input.contentSha256) return json({ errorCode: "synthetic-scope-denied" }, 403);
          source.indexed = true; return json(source); }
        if (body.operation === "task.list") return json({ tasks: [task] });
        if (body.operation === "run.list") return json({ runs: [run] });
        if (["task.status", "run.status", "run.resume"].includes(body.operation)) return json(state());
        if (body.operation === "grant.create") { grants.splice(0, grants.length, { grantId: "synthetic-grant", revision: 1, status: "active" }); return json(grants[0]); }
        if (body.operation === "grant.revoke") { for (const grant of grants) grant.status = "revoked"; return json({ passed: true }); }
        if (body.operation === "task.cancel") { task.status = "cancelled"; run.status = "cancelled"; return json({ passed: true }); }
        if (body.operation === "project.prepare") return json({ passed: true, syntheticOnly: true });
      }
      return json({ errorCode: "synthetic-operation-not-implemented" }, 404);
    } catch { json({ errorCode: "synthetic-request-failed" }, 400); }
  });
  return { server, calls };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server } = createUiFixture(); server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({
    schemaVersion: "runaai-m1-ui-fixture/v1", url: `http://127.0.0.1:${server.address().port}`, syntheticOnly: true, expiresAfterMs: 900_000 })));
  const stop = () => { server.close(); server.closeAllConnections(); };
  setTimeout(stop, 900_000).unref(); process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
