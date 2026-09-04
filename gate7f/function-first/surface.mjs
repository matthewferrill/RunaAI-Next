import { createHash } from "node:crypto";
import { z } from "zod";
import { assertConversationContext } from "./conversation-context.mjs";

const fail = code => Object.assign(new Error(code), { code });
const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const agentMutation = z.enum(["grant.create", "grant.revoke", "proposal.create", "proposal.approve",
  "proposal.execute", "run.start", "run.resume"]);
const agentActionSchema = z.object({ schemaVersion: z.literal("runaai-agent-action-request/v1"),
  taskId: id, authorityDigest: sha, operation: agentMutation, input: z.unknown() }).strict();
const schema = z.object({ projectId: id, experience: z.enum(["chat", "code"]),
  operation: z.enum(["sources.list", "sources.attach", "sources.retry", "sources.select", "project.prepare", "project.current",
    "task.create", "task.status", "task.agent-fence", "task.agent-action", "task.cancel", "task.list", "grant.create", "grant.revoke", "proposal.create",
    "proposal.approve", "proposal.execute", "proposal.reconcile", "run.start", "run.resume", "run.status", "run.list",
    "source.connect-public-git", "source.connect-folder-snapshot", "workspace.materialize", "workspace.list-files",
    "workspace.read-text", "workspace.cancel", "source.disconnect"]),
  input: z.unknown() }).strict();
const METHODS = Object.freeze({ "task.create": "createTask", "task.status": "status", "task.cancel": "cancel",
  "task.agent-fence": "agentActionFence",
  "grant.create": "createGrant", "grant.revoke": "revokeGrant", "proposal.create": "propose",
  "proposal.approve": "approve", "proposal.execute": "execute", "proposal.reconcile": "reconcile", "task.list": "listTasks" });
const SERVER_WORKSPACE_METHODS = Object.freeze({ "source.connect-public-git": "connectPublicGit",
  "source.connect-folder-snapshot": "connectFolderSnapshot", "workspace.materialize": "materialize",
  "workspace.list-files": "listFiles", "workspace.read-text": "readText", "workspace.cancel": "cancel",
  "source.disconnect": "disconnect" });
export const M1_EXERCISE_FILES = Object.freeze({ "calculator.js": "// Disposable M1 exercise. This deliberately starts with a defect.\nexports.add = (a, b) => a - b;\n" });
export const M1_EXERCISE_SUITE = Object.freeze({ suiteId: "calculator-add-v1", cases: [
  { testId: "positive", exportName: "add", args: [19, 8], expected: 27 },
  { testId: "zero", exportName: "add", args: [0, 0], expected: 0 },
  { testId: "negative", exportName: "add", args: [-7, 2], expected: -5 },
  { testId: "fraction", exportName: "add", args: [1.25, 2.5], expected: 3.75 },
] });

// Handles are ephemeral, not authority. Every use rechecks the browser session,
// online identity and owned project. A restart or expired handle fails closed.
export class M1SessionAuthority {
  constructor({ now = Date.now, maximumEntries = 1000, ttlMs = 3_600_000 } = {}) {
    Object.assign(this, { now, maximumEntries, ttlMs }); this.entries = new Map();
  }
  key(context) { return JSON.stringify([context.principalId, context.projectId, context.sessionId]); }
  register(context, verify) {
    if (typeof verify !== "function") throw fail("m1-session-verifier-required");
    const key = this.key(context);
    for (const [id, entry] of this.entries) if (entry.expiresAt <= this.now()) this.entries.delete(id);
    if (!this.entries.has(key) && this.entries.size >= this.maximumEntries) throw fail("m1-session-capacity-reached");
    this.entries.set(key, { verify, expiresAt: this.now() + this.ttlMs });
  }
  async authorize(context) {
    const key = this.key(context), entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= this.now()) { this.entries.delete(key); return false; }
    try { return await entry.verify() === true; }
    catch { this.entries.delete(key); return false; }
  }
}

export class M1FunctionSurface {
  constructor({ application, sources, tasks, orchestrator = null, sessions = new M1SessionAuthority(),
    serverWorkspaces = null,
    prepareProject = context => ({ environmentId: `m1-${createHash("sha256").update(`${context.principalId}:${context.projectId}`).digest("hex").slice(0,32)}`,
      files: M1_EXERCISE_FILES }) }) {
    if (typeof prepareProject !== "function") throw fail("m1-trusted-project-fixtures-invalid");
    Object.assign(this, { application, sources, tasks, orchestrator, sessions, serverWorkspaces, prepareProject });
  }
  async checkedParticipant(credential, projectId, experience) {
    await this.application.authority();
    const participant = await this.application.authenticator.authenticate(credential, { requireOnline: true });
    if (!participant?.verified) throw fail("m1-authentication-required");
    const decision = await this.application.authorizer.authorize({ participant, action: "chat-ephemeral", resource: "project:runa:personal" });
    if (!decision?.allowed) throw fail("m1-authorization-denied");
    if (["runa:personal", "runa:ephemeral"].includes(projectId)) throw fail("m1-project-required");
    const scope = { participantId: participant.principalId, projectId, experience,
      threadId: `m1-scope-${createHash("sha256").update(`${participant.principalId}:${projectId}`).digest("hex")}` };
    if (typeof this.application.continuity?.prepareAnswerContext !== "function") throw fail("m1-context-unavailable");
    assertConversationContext(await this.application.continuity.prepareAnswerContext(scope), scope);
    return participant;
  }
  async dispatch({ credential, sessionBinding, body, verifySession }) {
    const checked = schema.safeParse(body);
    if (!checked.success || !/^[a-f0-9]{64}$/.test(sessionBinding ?? "")) throw fail("m1-surface-request-invalid");
    const { projectId, experience, operation, input } = checked.data;
    // Only server-resolved browser sessions reach this port. Claims in body cannot supply identity.
    const participant = await this.checkedParticipant(credential, projectId, experience);
    const context = { principalId: participant.principalId, projectId, sessionId: `browser-${sessionBinding}` };
    if (operation === "sources.list") return { sources: await this.sources.list(context) };
    if (operation === "sources.attach") return this.sources.attach(context, input);
    if (operation === "sources.retry") return this.sources.retry(context, input);
    if (operation === "sources.select") {
      const selection = z.object({ sourceIds: z.array(id).min(1).max(6) }).strict().parse(input);
      const selected = await this.sources.selected(context, selection.sourceIds);
      return { sources: selected.map(({ sourceId, sectionId, contentSha256, contextType = "source", label }) =>
        ({ sourceId, sectionId, contentSha256, contextType, label })) };
    }
    if (experience !== "code") throw fail("m1-code-experience-required");
    if (typeof verifySession !== "function") throw fail("m1-session-verifier-required");
    this.sessions.register(context, async () => {
      const current = await this.checkedParticipant(await verifySession(), projectId, experience);
      return current.principalId === context.principalId;
    });
    if (SERVER_WORKSPACE_METHODS[operation]) {
      if (!this.serverWorkspaces) throw fail("server-workspace-unavailable");
      const decision = await this.application.authorizer.authorize({ participant,
        action: "propose-workspace-action", resource: `project:${projectId}` });
      if (!decision?.allowed) throw fail("server-workspace-authorization-denied");
      return this.serverWorkspaces[SERVER_WORKSPACE_METHODS[operation]](context, input);
    }
    if (operation === "project.prepare") {
      if (input && Object.keys(input).length) throw fail("m1-surface-request-invalid");
      const fixture = await this.prepareProject(Object.freeze({ ...context }));
      return this.tasks.registerProject(context, fixture);
    }
    if (operation === "project.current") return this.tasks.currentProject(context);
    if (operation === "task.agent-action") {
      const action = agentActionSchema.parse(input);
      const agentActionAuthority = { schemaVersion: "runaai-agent-action-authority/v1",
        taskId: action.taskId, authorityDigest: action.authorityDigest };
      const options = { agentActionAuthority };
      let value;
      if (action.operation === "grant.create") value = await this.tasks.createGrant(context, action.input, options);
      else if (action.operation === "grant.revoke") value = await this.tasks.revokeGrant(context, action.input, options);
      else if (action.operation === "proposal.create") value = await this.tasks.propose(context, action.input, options);
      else if (action.operation === "proposal.approve") value = await this.tasks.approve(context, action.input, options);
      else if (action.operation === "proposal.execute") value = await this.tasks.execute(context, action.input, options);
      else {
        if (!this.orchestrator) throw fail("m1-orchestrator-unavailable");
        value = await this.orchestrator[action.operation.slice(4)](context, action.input, options);
      }
      return { value, agentActionAuthority: await this.tasks.agentActionFence(context, { taskId: action.taskId }) };
    }
    if (METHODS[operation]) return this.tasks[METHODS[operation]](context, input);
    if (!this.orchestrator) throw fail("m1-orchestrator-unavailable");
    return this.orchestrator[operation.slice(4)](context, input);
  }
}
