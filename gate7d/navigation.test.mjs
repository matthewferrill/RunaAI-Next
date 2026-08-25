import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseGate2AnswerRequest, GATE2_MODEL_ROLES } from "../gate2/contracts.mjs";
import { OrdinaryBrowserSessionService, MemoryOrdinarySessionStore } from "../gate7a/ordinary-session.mjs";
import { SelectedCoreApplication } from "../gate6b/application.mjs";
import { createCandidateHttpServer } from "../gate6b/http-server.mjs";
import { PostgresSelectedContinuityStore, classifyExperience } from "../gate6b/adapters/postgres-continuity.mjs";
import { publicProfileFromClaims } from "../gate6b/clients.mjs";
import { createEnvelopeCipher } from "../gate4/envelope.mjs";

const publicFile = name => new URL(`../gate6b/public/${name}`, import.meta.url);
const target = "runaai-next:gate7d-test";
const participant = Object.freeze({ verified: true, principalId: "matthew-personal",
  role: "adult-member", ageClass: "adult", authenticatedAt: "2026-08-24T12:00:00.000Z",
  expiresAt: "2026-08-24T20:00:00.000Z", methods: ["password"] });

function applicationHarness() {
  const calls = { authorize: [], answer: [], navigation: [], create: [], read: [] };
  const continuity = {
    async navigation(...input) { calls.navigation.push(input); return { experience: input[1], projects: [], chats: [] }; },
    async createProject(input) { calls.create.push(input); return { projectId: "project-chat-1", ...input }; },
    async readChat(...input) { calls.read.push(input); return { chatId: input[1], experience: input[2], turns: [] }; },
  };
  const app = new SelectedCoreApplication({ mode: "active", targetGeneration: target,
    cutoverStatus: async () => ({ phase: "promoted", authorityGeneration: target }),
    answerService: { async answer(request) { calls.answer.push(request); return { answer: "ok" }; } },
    actionService: {}, continuity,
    authenticator: { async authenticate() { return participant; } },
    authorizer: { async authorize(input) { calls.authorize.push(input); return { allowed: true }; } },
  });
  return { app, calls };
}

test("public session profiles prefer bounded identity names and expose initials only", () => {
  assert.deepEqual(publicProfileFromClaims({ name: "Matthew Ferrill", preferred_username: "mferrill",
    email: "not-returned@example.test" }), { displayName: "Matthew Ferrill", initials: "MF" });
  assert.deepEqual(publicProfileFromClaims({}, "matthew-personal"),
    { displayName: "Matthew Personal", initials: "MP" });
  assert.deepEqual(Object.keys(publicProfileFromClaims({ name: "Matthew Ferrill" })).sort(),
    ["displayName", "initials"]);
});

test("ordinary browser sessions obtain the current public profile from online identity", async () => {
  const store = new MemoryOrdinarySessionStore();
  const bindingDigest = "a".repeat(64);
  await store.initialize({ bindingDigest });
  await store.saveSession({ bindingDigest, sessionId: "ordinary-session", principalId: "matthew-personal",
    accessToken: "opaque-access", refreshToken: "opaque-refresh", clientId: "ordinary-client",
    expiresAt: "2026-08-24T20:00:00.000Z" });
  const passwordOidc = { async inspect(token) {
    assert.equal(token, "opaque-access");
    return { active: true, publicProfile: { displayName: "Matthew Ferrill", initials: "MF" } };
  } };
  const service = new OrdinaryBrowserSessionService({ store, passwordOidc, passkeyOidc: passwordOidc,
    principalStore: {}, bindingDigest, publicBaseUrl: "https://runa.example.test",
    passwordClientId: "ordinary-client", passkeyClientId: "owner-client",
    now: () => new Date("2026-08-24T13:00:00.000Z") });
  assert.deepEqual(await service.profileForSession("ordinary-session"),
    { displayName: "Matthew Ferrill", initials: "MF" });
});

test("experience classification is explicit, route-evidenced, and otherwise fails toward Chat", () => {
  assert.equal(classifyExperience({ explicit: "code" }), "code");
  assert.equal(classifyExperience({ explicit: "chat", routes: ["workspace-chat"] }), "chat");
  assert.equal(classifyExperience({ routes: ["workspace-chat"] }), "code");
  assert.equal(classifyExperience({ routes: ["code-chat"] }), "code");
  assert.equal(classifyExperience({ projectExperience: "code" }), "code");
  assert.equal(classifyExperience({}), "chat");
});

test("the PostgreSQL navigation projection decrypts and separates participant records by experience", async () => {
  const cipher = createEnvelopeCipher({ encryptionKey: Buffer.alloc(32, 1), hmacKey: Buffer.alloc(32, 2),
    keyId: "gate7d-navigation-test" });
  const envelope = (kind, id, value) => cipher.encrypt({ recordType: kind,
    participantId: "matthew-personal", recordId: id, field: "private-payload" }, value);
  const projectRows = [
    { project_id: "chat-project", project_type: "personal-project", status: "managed",
      updated_at: "2026-08-24T12:00:00.000Z",
      private_payload_envelope: envelope("project", "chat-project", { displayName: "Chat Project", experience: "chat" }) },
    { project_id: "code-project", project_type: "personal-project", status: "managed",
      updated_at: "2026-08-24T12:01:00.000Z",
      private_payload_envelope: envelope("project", "code-project", { displayName: "Code Project", experience: "code" }) },
    { project_id: "legacy-project", project_type: "software-project", status: "managed",
      updated_at: "2026-08-24T12:02:00.000Z",
      private_payload_envelope: envelope("project", "legacy-project", { displayName: "Legacy Project" }) },
  ];
  const chatRows = [
    { chat_id: "chat-record", project_id: "chat-project", turn_count: 1,
      updated_at: "2026-08-24T12:03:00.000Z",
      title_envelope: envelope("chat", "chat-record", { title: "Chat Record", experience: "chat" }) },
    { chat_id: "code-record", project_id: "code-project", turn_count: 1,
      updated_at: "2026-08-24T12:04:00.000Z",
      title_envelope: envelope("chat", "code-record", { title: "Code Record", experience: "code" }) },
    { chat_id: "legacy-code-record", project_id: "legacy-project", turn_count: 1,
      updated_at: "2026-08-24T12:05:00.000Z",
      title_envelope: envelope("chat", "legacy-code-record", { title: "Legacy Code Record" }) },
    { chat_id: "legacy-project-record", project_id: "legacy-project", turn_count: 1,
      updated_at: "2026-08-24T12:06:00.000Z",
      title_envelope: envelope("chat", "legacy-project-record", { title: "Legacy Project Record" }) },
  ];
  const pool = { async query(sql, values) {
    assert.deepEqual(values, ["matthew-personal"]);
    if (sql.includes("FROM runa_core.projects")) return { rows: projectRows };
    if (sql.includes("FROM runa_core.chats")) return { rows: chatRows };
    if (sql.includes("FROM runa_core.chat_turns")) return { rows: [
      { chat_id: "chat-record", project_id: "chat-project", routes: ["general-chat"] },
      { chat_id: "code-record", project_id: "code-project", routes: ["code-chat"] },
      { chat_id: "legacy-code-record", project_id: "legacy-project", routes: ["workspace-chat"] },
      { chat_id: "legacy-project-record", project_id: "legacy-project", routes: ["general-chat"] },
    ] };
    throw new Error(`unexpected query: ${sql}`);
  } };
  const store = new PostgresSelectedContinuityStore({ pool, cipher });
  const chatNavigation = await store.navigation("matthew-personal", "chat");
  assert.deepEqual(chatNavigation.projects.map(project => project.projectId), ["chat-project"]);
  assert.deepEqual(chatNavigation.chats.map(record => record.chatId), ["chat-record"]);
  const codeNavigation = await store.navigation("matthew-personal", "code");
  assert.deepEqual(codeNavigation.projects.map(project => project.projectId), ["code-project", "legacy-project"]);
  assert.deepEqual(codeNavigation.chats.map(record => record.chatId),
    ["code-record", "legacy-code-record", "legacy-project-record"]);
});

test("Code is a deterministic read-only conversational lane separate from workspace sources", () => {
  const request = parseGate2AnswerRequest({ schemaVersion: "runa2-answer-request/v2",
    requestId: "code-request", lane: "code", experience: "code",
    participant: { principalId: "matthew-personal", verified: true },
    project: { projectId: "runa:personal" }, thread: { threadId: "code-thread" },
    message: "Draft a JavaScript function", history: [], workspace: null,
    budgets: { deadlineMs: 60_000, maximumPasses: 8, maximumPassages: 12,
      maximumEvidenceCharacters: 24_000 } });
  assert.equal(request.lane, "code");
  assert.equal(request.experience, "code");
  assert.equal(request.workspace, null);
  assert.equal(GATE2_MODEL_ROLES.code, "code");
});

test("navigation, project creation, records, and Code answers use personal relationship authority", async () => {
  const { app, calls } = applicationHarness();
  assert.deepEqual(await app.navigation({ credential: "opaque", experience: "chat" }),
    { experience: "chat", projects: [], chats: [] });
  const created = await app.createProject({ credential: "opaque", body: {
    requestId: "create-project-1", experience: "code", displayName: "Runa tools",
  } });
  assert.equal(created.experience, "code");
  assert.equal(calls.create[0].participantId, "matthew-personal");
  await app.readChat({ credential: "opaque", chatId: "code-chat-1", experience: "code" });
  await app.answer({ credential: "opaque", body: { requestId: "answer-code-1", lane: "code",
    experience: "code", threadId: "code-chat-1", projectId: "project-code-1",
    message: "Draft a function", history: [], workspace: null } });
  assert.equal(calls.answer[0].lane, "code");
  assert.equal(calls.answer[0].experience, "code");
  assert.ok(calls.authorize.every(call => call.resource === "project:runa:personal"));
  await app.answer({ credential: "opaque", body: { requestId: "workspace-no-personal-bypass",
    lane: "workspace", experience: "chat", threadId: "workspace-thread", projectId: "workspace-project",
    message: "Read the selected section", history: [],
    workspace: { sources: [{ sourceId: "source", sectionId: "section" }] } } });
  assert.deepEqual(calls.authorize.at(-1), { participant, action: "use-local-workspace-evidence",
    resource: "project:workspace-project" });
  await assert.rejects(app.answer({ credential: "opaque", body: { requestId: "mismatch",
    lane: "general", experience: "code", threadId: "thread", message: "Hi", history: [] } }),
  error => error.code === "request-experience-invalid");
});

test("private navigation HTTP reads remain POST-only, exact-origin, marked, and session-scoped", async t => {
  const calls = [];
  const ordinarySessions = {
    publicBaseUrl: "https://runa.example.test",
    async credentialForSession(sessionId) { assert.equal(sessionId, "ordinary-session"); return "opaque-token"; },
    async profileForSession() { return { displayName: "Matthew Ferrill", initials: "MF" }; },
  };
  const server = createCandidateHttpServer({
    application: {
      async navigation(input) { calls.push(input); return { schemaVersion: "runa2-navigation/v1",
        experience: input.experience, projects: [], chats: [] }; },
    },
    runtimeStatus: async () => ({}), readinessStatus: async () => ({}),
    dependencyHealth: async () => ({ ready: true }), ordinarySessions,
    staticRoot: new URL("../gate6b/public", import.meta.url).pathname,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { origin: ordinarySessions.publicBaseUrl, cookie: "__Host-runa_user_session=ordinary-session",
    "content-type": "application/json", "x-runa-workspace": "1" };
  const accepted = await fetch(`${base}/api/selected/navigation/query`, { method: "POST", headers,
    body: JSON.stringify({ experience: "chat" }) });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).experience, "chat");
  assert.deepEqual(calls, [{ credential: "opaque-token", experience: "chat" }]);
  const wrongOrigin = await fetch(`${base}/api/selected/navigation/query`, { method: "POST",
    headers: { ...headers, origin: "https://other.example.test" }, body: JSON.stringify({ experience: "chat" }) });
  assert.equal(wrongOrigin.status, 400);
  assert.equal((await wrongOrigin.json()).errorCode, "gate6d-browser-origin-invalid");
  const get = await fetch(`${base}/api/selected/navigation/query`, { headers });
  assert.equal(get.status, 404);
  assert.equal(calls.length, 1);
});

test("the authenticated shell contains identity, separate Chat and Code controls, and functional record actions", async () => {
  const [html, script, styles, server, deployer] = await Promise.all([
    readFile(publicFile("index.html"), "utf8"), readFile(publicFile("status.js"), "utf8"),
    readFile(publicFile("styles.css"), "utf8"),
    readFile(new URL("../gate6b/http-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../gate7a/control/Deploy-ControlOrdinaryAccessSuccessor.ps1", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="session-avatar"/);
  assert.match(html, /id="session-name"/);
  assert.match(html, /id="chat-tab"[\s\S]*?>[\s\S]*?Chat/);
  assert.match(html, /id="code-tab"[\s\S]*?>[\s\S]*?Code/);
  assert.match(html, /id="new-chat"/);
  assert.match(html, /id="new-project"/);
  assert.match(html, /id="project-list"/);
  assert.match(html, /id="record-list"/);
  assert.match(script, /const states = Object\.fromEntries\(experiences\.map/);
  assert.match(script, /lane: submittedExperience === "code" \? "code" : "general"/);
  assert.match(script, /\/api\/selected\/navigation\/query/);
  assert.match(script, /\/api\/selected\/chat\/read/);
  assert.match(script, /\/api\/selected\/projects/);
  assert.doesNotMatch(script, /innerHTML|localStorage|sessionStorage/);
  assert.match(styles, /\.experience-tabs/);
  assert.match(styles, /\.session-avatar/);
  assert.match(server, /request\.method === "POST" && url\.pathname === "\/api\/selected\/navigation\/query"/);
  assert.match(server, /request\.headers\["x-runa-workspace"\] !== "1"/);
  assert.match(deployer, /gate7d-chat-code-navigation/);
  assert.match(deployer, /gate7a-ordinary-deploy-gate7d-presentation-invalid/);
  assert.match(deployer, /gate7a-ordinary-deploy-gate7d-controller-invalid/);
  const validation = deployer.indexOf("if($ExpectedUiContract-eq'gate7d-chat-code-navigation')");
  const success = deployer.indexOf("schemaVersion='runa2-gate7a-control-ordinary-successor/v1'");
  const rollback = deployer.lastIndexOf("}catch{");
  assert.ok(validation > 0 && validation < success && success < rollback,
    "Gate 7D live presentation validation must remain inside the automatic rollback boundary");
});
