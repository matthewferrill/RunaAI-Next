import test from "node:test";
import assert from "node:assert/strict";
import { M1FunctionSurface, M1SessionAuthority, M1_EXERCISE_FILES } from "./surface.mjs";
import { createConversationContext } from "./conversation-context.mjs";

function fixture() {
  const called = [];
  const application = { async authority() { called.push("authority"); },
    authenticator: { async authenticate(token, options) { assert.equal(token, "server-credential"); assert.equal(options.requireOnline, true);
      called.push("authenticate"); return { principalId: "alice", verified: true }; } },
    authorizer: { async authorize() { called.push("authorize"); return { allowed: true }; } },
    continuity: { async prepareAnswerContext(scope) { called.push("scope"); return createConversationContext(scope); } } };
  const sources = { async list(context) { called.push(["list", context]); return []; },
    async attach(context,input) { called.push(["attach",context,input]); return { indexed: true }; } };
  const tasks = { async registerProject(context, input) { called.push(["register",context,input]); return input; },
    async cancel(context, input) { called.push(["cancel",context,input]); return { status: "cancelled" }; } };
  return { called, application, sources, tasks, surface: new M1FunctionSurface({ application, sources, tasks }) };
}
const request = (operation="sources.list", input={}) => ({ credential: "server-credential", sessionBinding: "a".repeat(64),
  verifySession: async () => "server-credential",
  body: { operation, projectId: "project-alice", experience: "chat", input } });
test("surface checks current identity and owned experience before source access", async () => {
  const { surface, called } = fixture(); await surface.dispatch(request());
  assert.deepEqual(called.slice(0,4), ["authority","authenticate","authorize","scope"]);
  assert.deepEqual(called[4][1], { principalId: "alice", projectId: "project-alice", sessionId: `browser-${"a".repeat(64)}` });
});
test("forged body participant or session fields are rejected", async () => {
  const { surface, called } = fixture(); const input = request(); input.body.principalId = "owner";
  await assert.rejects(surface.dispatch(input), /surface-request-invalid/); assert.deepEqual(called, []);
});
test("missing server session binding is refused", async () => {
  const { surface, called } = fixture(); const input = request(); input.sessionBinding = null;
  await assert.rejects(surface.dispatch(input), /surface-request-invalid/); assert.deepEqual(called, []);
});
test("foreign ownership denial prevents every downstream operation", async () => {
  const { surface, application, called } = fixture();
  application.continuity.prepareAnswerContext = async () => { throw new Error("project-scope-denied"); };
  await assert.rejects(surface.dispatch(request()), /scope-denied/);
  assert.equal(called.some(item => Array.isArray(item)), false);
});
test("personal or ephemeral roots cannot become project or data import targets", async () => {
  for (const projectId of ["runa:personal","runa:ephemeral"]) {
    const { surface } = fixture(); const value = request(); value.body.projectId = projectId;
    await assert.rejects(surface.dispatch(value), /project-required/);
  }
});
test("Chat cannot perform disposable Code operations", async () => {
  const { surface, called } = fixture(); await assert.rejects(surface.dispatch(request("project.prepare")), /code-experience-required/);
  assert.equal(called.some(item => Array.isArray(item)), false);
});
test("workspace creation uses only app-owned exercise files and deterministic owned environment", async () => {
  const { surface, called } = fixture(); const value = request("project.prepare"); value.body.experience = "code";
  const result = await surface.dispatch(value);
  assert.deepEqual(result.files, M1_EXERCISE_FILES); assert.match(result.environmentId, /^m1-[a-f0-9]{32}$/);
  assert.equal(called.at(-1)[1].principalId, "alice");
});
test("browser cannot replace exercise files or pass a filesystem root", async () => {
  const { surface } = fixture(); const value = request("project.prepare", { files: { "evil.js": "bad" } }); value.body.experience = "code";
  await assert.rejects(surface.dispatch(value), /surface-request-invalid/);
});

test("trusted fixtures resolve only after current identity and scope checks, never from browser input", async () => {
  const { application, sources, tasks, called } = fixture();
  const surface = new M1FunctionSurface({ application, sources, tasks, prepareProject: context => {
    assert.equal(Object.isFrozen(context), true);
    assert.deepEqual(called.slice(0,4), ["authority", "authenticate", "authorize", "scope"]);
    return { environmentId: "sealed-test-exercise", files: { "clamp.js": "exports.clamp = x => x;" } };
  } });
  const value = request("project.prepare"); value.body.experience = "code";
  assert.equal((await surface.dispatch(value)).environmentId, "sealed-test-exercise");
  value.body.input = { fixture: "other", suites: { expected: "model-selected" } };
  await assert.rejects(surface.dispatch(value), /surface-request-invalid/);
  const count = called.filter(item => Array.isArray(item) && item[0] === "register").length;
  application.continuity.prepareAnswerContext = async () => { throw new Error("project-scope-denied"); };
  value.body.input = {};
  await assert.rejects(surface.dispatch(value), /scope-denied/);
  assert.equal(called.filter(item => Array.isArray(item) && item[0] === "register").length, count);
});
test("cancel is bound to current authenticated project and browser session", async () => {
  const { surface, called } = fixture(); const value = request("task.cancel", { taskId: "task-1" }); value.body.experience = "code";
  await surface.dispatch(value); assert.equal(called.at(-1)[0], "cancel"); assert.equal(called.at(-1)[1].projectId, "project-alice");
});

test("effect-time verifier rechecks online identity and ownership after dispatch", async () => {
  const { surface, application } = fixture(); const value = request("project.prepare"); value.body.experience = "code";
  await surface.dispatch(value);
  const context = { principalId: "alice", projectId: "project-alice", sessionId: `browser-${"a".repeat(64)}` };
  assert.equal(await surface.sessions.authorize(context), true);
  application.continuity.prepareAnswerContext = async () => { throw new Error("archived"); };
  assert.equal(await surface.sessions.authorize(context), false);
});

test("session revocation, changed principal, restart and expiry cannot reuse authority", async () => {
  const context = { principalId: "alice", projectId: "project-alice", sessionId: `browser-${"a".repeat(64)}` };
  for (const revoke of [value => { value.verifySession = async () => { throw new Error("revoked"); }; },
    (_, application) => { application.authenticator.authenticate = async () => ({ principalId: "bob", verified: true }); }]) {
    const { surface, application } = fixture(); const value = request("project.prepare"); value.body.experience = "code";
    await surface.dispatch(value);
    if (revoke.length === 1) { surface.sessions.entries.values().next().value.verify = async () => { throw new Error("revoked"); }; }
    else revoke(value, application);
    assert.equal(await surface.sessions.authorize(context), false);
  }
  let now = 0; const sessions = new M1SessionAuthority({ now: () => now, ttlMs: 10 });
  sessions.register(context, async () => true); now = 11;
  assert.equal(await sessions.authorize(context), false);
  assert.equal(await new M1SessionAuthority().authorize(context), false);
});

test("code endpoints require a live server-session verifier", async () => {
  const { surface } = fixture(); const value = request("project.prepare"); value.body.experience = "code"; delete value.verifySession;
  await assert.rejects(surface.dispatch(value), /session-verifier-required/);
});
test("selected Review context preserves server-owned source, artifact and diff kinds", async () => {
  const { application, sources, tasks } = fixture();
  sources.selected = async (_context, sourceIds) => sourceIds.map((sourceId, index) => ({ sourceId,
    sectionId: "provided", contentSha256: `${index + 1}`.repeat(64),
    contextType: ["source", "artifact", "diff"][index], label: `Context ${index + 1}` }));
  const surface = new M1FunctionSurface({ application, sources, tasks });
  const value = request("sources.select", { sourceIds: ["one", "two", "three"] });
  assert.deepEqual((await surface.dispatch(value)).sources.map(({ sourceId, contextType }) => ({ sourceId, contextType })), [
    { sourceId: "one", contextType: "source" }, { sourceId: "two", contextType: "artifact" },
    { sourceId: "three", contextType: "diff" },
  ]);
});

test("server workspace operations route only after code, session, project and effect authorization", async () => {
  const { application, sources, tasks, called } = fixture();
  const serverWorkspaces = { async connectPublicGit(context, input) {
    called.push(["connect-public-git", context, input]); return { created: true };
  } };
  const surface = new M1FunctionSurface({ application, sources, tasks, serverWorkspaces });
  const value = request("source.connect-public-git", {}); value.body.experience = "code";
  assert.deepEqual(await surface.dispatch(value), { created: true });
  assert.equal(called.at(-2), "authorize");
  assert.equal(called.at(-1)[0], "connect-public-git");
  assert.equal(await surface.sessions.authorize(called.at(-1)[1]), true);
});

test("absent candidate service and deferred snapshot operation fail with explicit codes", async () => {
  const { surface } = fixture();
  const absent = request("source.connect-public-git", {}); absent.body.experience = "code";
  await assert.rejects(surface.dispatch(absent), error => error.code === "server-workspace-unavailable");

  const { application, sources, tasks } = fixture();
  const serverWorkspaces = { async connectFolderSnapshot() {
    throw Object.assign(new Error("server-workspace-folder-snapshot-unavailable"),
      { code: "server-workspace-folder-snapshot-unavailable" });
  } };
  const routed = new M1FunctionSurface({ application, sources, tasks, serverWorkspaces });
  const snapshot = request("source.connect-folder-snapshot", {}); snapshot.body.experience = "code";
  await assert.rejects(routed.dispatch(snapshot),
    error => error.code === "server-workspace-folder-snapshot-unavailable");
});
