import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

// Explicit isolated browser test, not a live site/session test. No API reaches a server:
// every navigation, module and request is intercepted below; unknown URLs fail closed.
// Set RUNA_M1_PLAYWRIGHT_MODULE to an installed playwright index.mjs and
// RUNA_M1_BROWSER_EXECUTABLE to a local Chromium/Edge executable. No install/download.
if (!process.env.RUNA_M1_PLAYWRIGHT_MODULE || !process.env.RUNA_M1_BROWSER_EXECUTABLE) {
  throw new Error("m1-browser-test-existing-runtime-paths-required");
}
const { chromium } = await import(pathToFileURL(resolve(process.env.RUNA_M1_PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath: process.env.RUNA_M1_BROWSER_EXECUTABLE, headless: true });
after(() => browser.close());
const assets = resolve(import.meta.dirname, "../../gate6b/public");
const origin = "https://synthetic-runa.invalid";
const digest = "a".repeat(64);
const source = { sourceId: "source-one", sectionId: "provided", label: "Synthetic selected text", characters: 30, indexed: true, contentSha256: digest };
const proposal = (suffix = "a") => ({ proposalId: `proposal-${suffix}`, proposalDigest: digest, status: "pending-approval",
  grantId: 'grant-new', grantRevision: 4,
  capabilityId: "project.apply-change", arguments: { path: "calculator.js", content: "exports.add=(a,b)=>a+b;" }, prepared: { preview: { before: "minus", after: "plus" } } });
const task = (suffix = "a") => ({ taskId: `task-${suffix}`, objective: `Repair exercise ${suffix}`, status: "active" });
const run = (suffix = "a") => ({ runId: `run-${suffix}`, taskId: `task-${suffix}`, objective: `Repair exercise ${suffix}`,
  status: "waiting-approval", plans: [{ summary: "Inspect and repair the exercise." }] });
const receipt = { receiptId: "receipt-a", capabilityId: "project.apply-change", executionStatus: "published", effectKind: "revision-published",
  beforeRevision: 1, afterRevision: 2, beforeSha256: "b".repeat(64), afterSha256: digest, output: { changed: true } };

async function panelPage(t, overrides = {}) {
  const context = await browser.newContext(); t.after(() => context.close());
  const page = await context.newPage(), calls = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let sources = [structuredClone(source)];
  const responseFor = async payload => {
    calls.push(structuredClone(payload));
    const custom = await overrides.handle?.(payload, calls);
    if (custom !== undefined) return custom;
    const suffix = payload.input?.taskId?.endsWith("b") || payload.input?.runId?.endsWith("b") ? "b" : "a";
    if (payload.operation === "sources.list") return { sources };
    if (payload.operation === "sources.attach") { sources = [{ ...source, indexed: false }]; return { ...sources[0] }; }
    if (payload.operation === "sources.retry") { sources[0].indexed = true; return sources[0]; }
    if (payload.operation === "task.list") return { tasks: [task(), task("b")] };
    if (payload.operation === "run.list") return { runs: [run(), run("b")] };
    if (payload.operation === "task.status") return { task: task(suffix), project: { revision: 2 }, grants: [{ grantId: 'grant-new', revision: 4, status: 'active' }],
      proposals: [proposal(suffix)], receipts: [], currentReceiptIds: [], pendingReconciliation: [],
      approvableProposalIds: calls.some(call => call.operation === "run.resume" && call.input?.runId === `run-${suffix}`)
        ? [proposal(suffix).proposalId] : [] };
    if (payload.operation === "run.status" || payload.operation === "run.resume") return { run: run(suffix), task: task(suffix),
      proposals: [proposal(suffix)], receipts: [], pendingReconciliation: [] };
    if (payload.operation === "grant.create") return { grantId: "grant-new", revision: 4 };
    if (payload.operation === "task.create") return task();
    if (payload.operation === "proposal.create") return proposal();
    return { passed: true };
  };
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><div class="chat-heading"></div><aside id="right-rail-body"></aside>' });
    if (url.pathname === "/api/m1/capabilities") return route.fulfill({ json: { enabled: true } });
    if (url.pathname === "/api/m1/workspace") {
      try { return route.fulfill({ json: await responseFor(route.request().postDataJSON()) }); }
      catch (error) { return route.fulfill({ status: 503, json: { errorCode: error.code ?? "synthetic-unavailable" } }); }
    }
    if (url.pathname === "/function-panel.mjs") return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(assets, "function-panel.mjs"), "utf8") });
    if (url.pathname === "/agent-governance.mjs") return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(assets, "agent-governance.mjs"), "utf8") });
    return route.abort();
  });
  await page.goto(origin);
  await page.evaluate(async () => {
    window.syntheticContext = { projectId: "synthetic-alpha", experience: "code" };
    const { initializeFunctionPanel } = await import("/function-panel.mjs");
    window.syntheticPanel = await initializeFunctionPanel({ getContext: () => window.syntheticContext,
      request: async (path, body) => { const response = await fetch(path, { method: "POST", body: JSON.stringify(body) });
        const result = await response.json(); if (!response.ok) throw Object.assign(new Error("private diagnostic not displayed"), { code: result.errorCode }); return result; } });
  });
  t.after(() => assert.deepEqual(errors, []));
  return { page, calls };
}
async function open(page, suffix = "a") {
  await page.getByRole("button", { name: `Repair exercise ${suffix} — waiting-approval`, exact: true }).click();
  await page.locator("#m1-task h3").filter({ hasText: `Repair exercise ${suffix}` }).waitFor();
}
async function continueTask(page) {
  await page.locator("#m1-profile").selectOption("ask-every-time");
  await page.getByRole("button", { name: "Continue with selected profile", exact: true }).click();
  await page.getByRole("button", { name: "Approve this exact action", exact: true }).waitFor();
}
test("actual DOM: saved runs reopen read-only; explicit profile replaces grant before continuation; approval IDs are exact", async t => {
  const { page, calls } = await panelPage(t);
  await open(page);
  assert.equal(calls.some(call => call.operation === "grant.create" || call.operation === "run.resume"), false);
  await page.getByRole("button", { name: "Continue with selected profile", exact: true }).click();
  assert.equal(calls.some(call => call.operation === "grant.create"), false);
  await continueTask(page);
  const grant = calls.find(call => call.operation === "grant.create");
  assert.equal(grant.input.profile, "ask-every-time"); assert.equal(grant.input.taskId, "task-a");
  assert.deepEqual(calls.find(call => call.operation === "run.resume").input, { runId: "run-a", grantId: "grant-new", grantRevision: 4 });
  await page.getByRole("button", { name: "Approve this exact action", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("#m1-task button:disabled"));
  assert.deepEqual(calls.find(call => call.operation === "proposal.approve").input, { proposalId: "proposal-a", proposalDigest: digest });
  const resumes = calls.filter(call => call.operation === "run.resume").length;
  await page.getByRole("button", { name: "Refresh task status", exact: true }).click();
  assert.equal(calls.filter(call => call.operation === "run.resume").length, resumes);
  await page.reload();
  await page.evaluate(async () => { const { initializeFunctionPanel } = await import('/function-panel.mjs');
    window.syntheticPanel = await initializeFunctionPanel({ getContext: () => ({ experience: 'code', projectId: 'synthetic-alpha' }),
      request: async (path, body) => (await fetch(path, { method: 'POST', body: JSON.stringify(body) })).json() }); });
  await open(page); assert.equal(await page.locator("#m1-profile").inputValue(), "");
});
test("actual DOM: a same-session repair is visible and continues exactly once without a new grant", async t => {
  let resumed = false;
  const repairRun = () => ({ ...run(), status: resumed ? "completed" : "repair-required",
    outcome: resumed ? "plan-completed" : null, pendingProposalId: null, grantId: "grant-new", grantRevision: 4 });
  const { page, calls } = await panelPage(t, { handle: async payload => {
    if (payload.operation === "run.list") return { runs: [repairRun()] };
    if (payload.operation === "task.list") return { tasks: [] };
    if (payload.operation === "task.status") return { task: task(), project: { revision: 2 },
      grants: [{ grantId: "grant-new", revision: 4, status: "active" }], proposals: [], receipts: [],
      currentReceiptIds: [], pendingReconciliation: [], approvableProposalIds: [] };
    if (payload.operation === "run.status") return { run: repairRun(), task: task(), proposals: [], receipts: [],
      pendingReconciliation: [], sessionRebindRequired: false };
    if (payload.operation === "run.resume") { resumed = true; return { run: repairRun(), task: task(), proposals: [], receipts: [],
      pendingReconciliation: [], sessionRebindRequired: false }; }
  } });
  await page.getByRole("button", { name: "Repair exercise a — repair-required", exact: true }).click();
  await page.getByRole("button", { name: "Continue bounded repair", exact: true }).waitFor();
  assert.match(await page.locator("#m1-task").textContent(), /No repair has started/);
  await page.getByRole("button", { name: "Continue bounded repair", exact: true }).click();
  await page.getByText(/recorded plan completed/i).waitFor();
  assert.equal(calls.filter(call => call.operation === "run.resume").length, 1);
  assert.equal(calls.some(call => call.operation === "grant.create"), false);
});
test("actual DOM: a saved standalone task exposes unknown outcome before it is opened", async t => {
  const { page, calls } = await panelPage(t, { handle: async payload => {
    if (payload.operation === "run.list") return { runs: [] };
    if (payload.operation === "task.list") return { tasks: [task()] };
    if (payload.operation === "task.status") return { task: task(), project: { revision: 1 }, grants: [], receipts: [],
      proposals: [{ ...proposal(), status: "unknown" }], pendingReconciliation: [{ proposalId: "proposal-a" }], currentReceiptIds: [] };
  } });
  const entry = page.getByRole("button", { name: "Repair exercise a — unknown", exact: true });
  await entry.waitFor();
  assert.equal(calls.filter(call => call.operation === "task.status").length, 1);
  await entry.click();
  await page.locator("#m1-task h3").waitFor();
  assert.match(await page.locator("#m1-task").textContent(), /Outcome unknown/);
  assert.match(await page.locator("#m1-task").textContent(), /Reconcile the recorded action/);
});
test("actual DOM: navigating to another task during approval cannot resume the new or previous run", async t => {
  let release, started; const waiting = new Promise(resolve => { started = resolve; });
  const { page, calls } = await panelPage(t, { handle: async payload => {
    if (payload.operation === "proposal.approve") { started(); await new Promise(resolve => { release = resolve; }); return { passed: true }; }
  } });
  await open(page); await continueTask(page);
  const before = calls.filter(call => call.operation === "run.resume").length;
  await page.getByRole("button", { name: "Approve this exact action", exact: true }).click(); await waiting;
  await open(page, "b"); release();
  await page.waitForFunction(() => document.querySelector("#m1-task h3").textContent === "Repair exercise b");
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 30)));
  assert.equal(calls.filter(call => call.operation === "run.resume").length, before);
  assert.equal(await page.locator("#m1-task h3").textContent(), "Repair exercise b");
});
test("actual DOM: late project preparation does not change a newly selected scope", async t => {
  let release, started; const waiting = new Promise(resolve => { started = resolve; });
  const { page } = await panelPage(t, { handle: async payload => {
    if (payload.operation === "project.prepare") { started(); await new Promise(resolve => { release = resolve; }); return { passed: true }; }
  } });
  await page.getByRole("button", { name: "Prepare exercise", exact: true }).click(); await waiting;
  await page.evaluate(async () => { window.syntheticContext = { experience: "chat", projectId: "synthetic-beta" }; await window.syntheticPanel.refresh(); });
  release(); await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 30)));
  assert.equal(await page.locator("#m1-mode").inputValue(), "conversation");
  assert.doesNotMatch(await page.locator('[role="status"]').textContent(), /exercise ready/);
});
test("actual DOM: a visible saved task uses the current scope while the outer shell awaits panel refresh", async t => {
  const { page, calls } = await panelPage(t, { handle: async payload => {
    if (payload.operation === "task.status" && payload.projectId === "synthetic-beta") {
      throw Object.assign(new Error("current scope correctly denied the old task"), { code: "m1-task-project-scope" });
    }
  } });
  const entry = page.getByRole("button", { name: "Repair exercise a — waiting-approval", exact: true });
  await entry.waitFor();
  const before = calls.length;
  await page.evaluate(() => { window.syntheticContext = { experience: "code", projectId: "synthetic-beta" }; });
  await entry.click();
  await page.getByText("Task could not be loaded. No actions were started.", { exact: true }).waitFor();
  const after = calls.slice(before);
  const reads = after.filter(call => call.operation === "task.status");
  assert.equal(reads.length, 1);
  assert.equal(reads[0].experience, "code"); assert.equal(reads[0].projectId, "synthetic-beta");
  assert.equal(after.some(call => ["grant.create", "run.resume", "proposal.create", "proposal.approve", "proposal.execute"].includes(call.operation)), false);
});
test("actual DOM: revocation targets the exact grant and requires a fresh profile before continuing", async t => {
  let revoked = false;
  const { page, calls } = await panelPage(t, { handle: async payload => {
    if (payload.operation === 'grant.revoke') { revoked = true; return { passed: true }; }
    if (payload.operation === 'task.status' && revoked) return { task: task(), project: { revision: 2 },
      grants: [{ grantId: 'grant-new', revision: 5, status: 'revoked' }], proposals: [proposal()], receipts: [], pendingReconciliation: [] };
  } });
  await open(page); await continueTask(page);
  await page.getByRole('button', { name: 'Revoke task permission', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#m1-profile').value === '');
  assert.deepEqual(calls.find(call => call.operation === 'grant.revoke').input, { grantId: 'grant-new' });
  assert.equal(await page.getByRole('button', { name: 'Approve this exact action', exact: true }).count(), 0);
});
test("actual DOM: a standalone saved undo task can rebind and preview again without inheriting its old approval", async t => {
  const { page, calls } = await panelPage(t, { handle: async (payload, recordedCalls) => {
    if (payload.operation === 'run.list') return { runs: [] };
    if (payload.operation === 'task.status') return { task: task(), project: { revision: 2 },
      grants: [{ grantId: 'grant-new', revision: 4, status: 'active' }], proposals: [{ ...proposal(), capabilityId: 'project.restore', arguments: { receiptId: 'receipt-a' } }],
      receipts: [], pendingReconciliation: [], approvableProposalIds: recordedCalls.some(call => call.operation === 'proposal.create') ? ['proposal-a'] : [] };
  } });
  await page.getByRole('button', { name: 'Repair exercise a — active', exact: true }).click();
  await page.locator('#m1-task h3').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Approve this exact action', exact: true }).count(), 0);
  await continueTask(page);
  const recreated = calls.find(call => call.operation === 'proposal.create');
  assert.equal(recreated.input.capabilityId, 'project.restore'); assert.deepEqual(recreated.input.arguments, { receiptId: 'receipt-a' });
  assert.equal(calls.some(call => call.operation === 'run.resume' || call.operation === 'proposal.execute'), false);
});
test("actual DOM: Agent is contextual task coordination inside Code without widening the grant", async t => {
  let authorityDigest = "8".repeat(64);
  const authority = () => ({ schemaVersion: "runaai-agent-action-authority/v1", atomic: true,
    taskId: "task-a", taskStatus: "active", state: "settled", authorityDigest,
    pendingReconciliationCount: 0, unsettledProposalCount: 0, unsettledRunCount: 0,
    approvableProposals: [], revocableGrants: [] });
  const { page, calls } = await panelPage(t, { handle: async payload => {
    if (payload.operation === "task.agent-fence") return authority();
    if (payload.operation === "task.agent-action") {
      assert.equal(payload.input.authorityDigest, authorityDigest);
      if (payload.input.operation === "grant.create") {
        authorityDigest = "7".repeat(64);
        return { value: { grantId: "grant-new", revision: 4 }, agentActionAuthority: authority() };
      }
      if (payload.input.operation === "run.start") {
        authorityDigest = "6".repeat(64);
        return { value: { run: run(), task: task() }, agentActionAuthority: authority() };
      }
    }
  } });
  await page.locator('#m1-profile').selectOption('safe-autopilot');
  await page.locator('#m1-agent-guidance').check();
  await page.locator('#m1-work-intent').selectOption('effect-requested');
  assert.equal(await page.evaluate(() => window.syntheticPanel.startWork('Repair this synthetic exercise')), true);
  const actions = calls.filter(call => call.operation === "task.agent-action");
  assert.deepEqual(actions.map(call => call.input.operation), ["grant.create", "run.start"]);
  assert.equal(actions[1].input.input.workflow, 'agent');
  assert.deepEqual(actions[0].input.input.allowedPaths, ['calculator.js']);
  assert.deepEqual(actions[0].input.input.allowedSuites, ['calculator-add-v1']);
});
test("actual DOM: an interrupted source attach retries the same request id and never prints a private diagnostic", async t => {
  let attempts = 0;
  const { page, calls } = await panelPage(t, { handle: async payload => {
    if (payload.operation === 'sources.attach' && ++attempts === 1) throw Object.assign(new Error('PRIVATE_CANARY'), { code: 'PRIVATE_CANARY' });
  } });
  await page.getByLabel('Source section label', { exact: true }).fill('Synthetic');
  await page.getByLabel('Source section content', { exact: true }).fill('Retained draft');
  await page.getByRole('button', { name: 'Attach section', exact: true }).click();
  await page.getByRole('button', { name: 'Attach section', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('form button').disabled);
  assert.equal(await page.getByLabel('Source section content', { exact: true }).inputValue(), 'Retained draft');
  assert.doesNotMatch(await page.locator('[role="status"]').textContent(), /PRIVATE_CANARY/);
  await page.getByRole('button', { name: 'Attach section', exact: true }).click();
  await page.getByRole('button', { name: 'Retry indexing', exact: true }).waitFor();
  const attaches = calls.filter(call => call.operation === 'sources.attach');
  assert.equal(attaches.length, 2); assert.equal(attaches[0].input.requestId, attaches[1].input.requestId);
});
test("actual DOM: retained source retries exact index identity, preserves selection and never attaches a second copy", async t => {
  const { page, calls } = await panelPage(t);
  await page.getByLabel("Source section label", { exact: true }).fill("Draft source");
  await page.getByLabel("Source section content", { exact: true }).fill("Synthetic content.");
  await page.getByRole("button", { name: "Attach section", exact: true }).click();
  await page.getByRole("button", { name: "Retry indexing", exact: true }).click();
  await page.locator('#m1-sources input[type="checkbox"]:not(:disabled)').waitFor();
  assert.equal(calls.filter(call => call.operation === "sources.attach").length, 1);
  assert.deepEqual(calls.find(call => call.operation === "sources.retry").input, { sourceId: source.sourceId, contentSha256: digest });
  await page.locator('#m1-sources input[type="checkbox"]').check();
  await page.locator("#m1-mode").selectOption("research");
  assert.deepEqual(await page.evaluate(() => window.syntheticPanel.answerSelection()), { lane: "research", workspace: { sources: [{ sourceId: "source-one", sectionId: "provided" }] } });
});
test("actual DOM: cancellation and reconciliation target recorded IDs without new execution; undo proposes an exact receipt", async t => {
  let uncertain = true;
  const { page, calls } = await panelPage(t, { handle: async payload => {
    if (payload.operation === "proposal.reconcile") { uncertain = false; return { passed: true }; }
    if (["task.status", "run.status"].includes(payload.operation)) return { task: task(), ...(payload.operation === "run.status" ? { run: run() } : {}),
      project: { revision: 2 }, proposals: [proposal()], receipts: [receipt], currentReceiptIds: [receipt.receiptId], pendingReconciliation: uncertain ? [{ proposalId: "uncertain-a" }] : [] };
  } });
  await open(page);
  assert.match(await page.locator(".task-receipt").textContent(), /Actual receipt: project.apply-change — published/);
  await page.getByRole("button", { name: "Reconcile uncertain action", exact: true }).click();
  assert.deepEqual(calls.find(call => call.operation === "proposal.reconcile").input, { proposalId: "uncertain-a" });
  assert.equal(calls.some(call => call.operation === "proposal.execute" || call.operation === "run.resume"), false);
  await page.getByRole("button", { name: "Cancel task", exact: true }).click();
  assert.deepEqual(calls.find(call => call.operation === "task.cancel").input, { taskId: "task-a" });
  await page.locator("#m1-profile").selectOption("ask-every-time");
  await Promise.all([page.waitForResponse(response => response.request().postDataJSON()?.operation === 'proposal.create'),
    page.getByRole("button", { name: "Propose undo of this change", exact: true }).click()]);
  const undo = calls.find(call => call.operation === "proposal.create");
  assert.equal(undo.input.capabilityId, "project.restore"); assert.deepEqual(undo.input.arguments, { receiptId: "receipt-a" });
  assert.equal(calls.some(call => call.operation === "proposal.execute"), false);
});
test("actual DOM: answer evidence uses server metadata, shows missing history, and treats source markup as plain text", async t => {
  const { page } = await panelPage(t);
  await page.evaluate(async digest => { const { appendAnswerEvidence } = await import('/function-panel.mjs');
    const host = document.createElement('div'); host.id = 'evidence-proof'; document.body.append(host);
    appendAnswerEvidence(document, host, { retrieval: { attempted: true, empty: false, degraded: true, omissions: ['bounded'] },
      workspace: { citationStatus: 'contains-unknown' }, citations: [{ ordinal: 1, sourceId: '<img src=x onerror=alert(1)>', sectionId: 'provided', contentSha256: digest }] });
    appendAnswerEvidence(document, host, null); }, digest);
  const text = await page.locator('#evidence-proof').textContent();
  assert.match(text, /retrieval was incomplete/); assert.match(text, /Historical evidence unavailable/);
  assert.match(text, /did not fully match/); assert.match(text, /SHA-256 a{64}/);
  assert.equal(await page.locator('#evidence-proof img').count(), 0);
});

async function chatPage(t, answerHandler, readHandler = () => ({ status: 503, body: { errorCode: "synthetic-unavailable" } })) {
  const context = await browser.newContext(); t.after(() => context.close());
  const page = await context.newPage(), answers = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
    const reply = value => route.fulfill({ json: value });
    if (url.pathname === '/api/runtime/status') return reply({ cutover: { phase: 'closed' }, running: { releaseId: 'synthetic', commit: 'a'.repeat(40) }, selectedScopeVersion: 'synthetic' });
    if (url.pathname === '/api/readiness/status') return reply({ authority: 'active' });
    if (url.pathname === '/api/session/status') return reply({ authenticated: true, sessionType: 'ordinary', profile: { initials: 'ST', displayName: 'Synthetic Tester' } });
    if (url.pathname === '/api/m1/capabilities') return reply({ enabled: false });
    if (url.pathname === '/api/selected/navigation/query') return reply({ projects: [], chats: [{ chatId: 'saved-chat', title: 'Saved synthetic', projectId: null }] });
    if (url.pathname === '/api/selected/answer') { const body = route.request().postDataJSON(); answers.push(body); const result = answerHandler(body, answers); return route.fulfill({ status: result.status ?? 200, json: result.body }); }
    if (url.pathname === '/api/selected/chat/read') { const result = readHandler(); return route.fulfill({ status: result.status ?? 200, json: result.body }); }
    const file = url.pathname === '/' ? 'index.html' : basename(url.pathname);
    if (['index.html', 'status.js', 'styles.css', 'workspace-shell.mjs', 'chat-client.mjs', 'code-execution.mjs', 'function-panel.mjs'].includes(file)) {
      return route.fulfill({ contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript', body: await readFile(resolve(assets, file), 'utf8') });
    }
    return route.abort();
  });
  await page.goto(origin); await page.locator('#chat:not([hidden])').waitFor();
  t.after(() => assert.deepEqual(errors, []));
  return { page, answers };
}
const answer = (extra = {}) => ({ answer: 'Synthetic answer', completion: { reason: 'complete' }, continuity: { durableChatEligible: true, turnRecorded: true },
  contextRevision: 1, execution: { status: 'not-executed' }, citations: [source], retrieval: { attempted: true, empty: false, degraded: false }, ...extra });
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#send').click(); await page.locator('#send:not(:disabled)').waitFor(); }
test("actual customer DOM: dependency-unavailable offers retry, does not pollute history or advance revision", async t => {
  const { page, answers } = await chatPage(t, (_body, calls) => ({ body: calls.length === 1
    ? answer({ answer: 'Selected information unavailable.', completion: { reason: 'dependency-unavailable' }, continuity: { durableChatEligible: true, turnRecorded: false }, contextRevision: 0 }) : answer() }));
  await send(page, 'First question'); await page.getByRole('button', { name: 'Retry message', exact: true }).waitFor();
  await send(page, 'Second question'); assert.equal(answers[1].contextRevision, 0); assert.deepEqual(answers[1].history, []);
});
test("actual customer DOM: failed conflict reload preserves draft and never says latest record loaded", async t => {
  const { page } = await chatPage(t, () => ({ status: 409, body: { errorCode: 'conversation-revision-conflict' } }));
  await send(page, 'Keep my draft'); assert.equal(await page.locator('#message').inputValue(), 'Keep my draft');
  assert.match(await page.locator('#chat-status').textContent(), /latest record could not be loaded/);
  assert.doesNotMatch(await page.locator('#chat-status').textContent(), /latest record is loaded/);
});
test("actual customer DOM: successful conflict reload uses current revision and saved server evidence without automatic replay", async t => {
  const { page, answers } = await chatPage(t, () => ({ status: 409, body: { errorCode: 'conversation-revision-conflict' } }), () => ({ body: {
    chatId: 'saved-chat', projectId: null, turnCount: 2, turns: [{ user: 'Saved question', assistant: 'Saved answer', evidence: {
      citations: [{ sourceId: 'source-one', sectionId: 'provided', ordinal: 1, contentSha256: digest }], retrieval: { attempted: true, empty: false, degraded: false } } },
    { user: 'Old question', assistant: 'Old answer' }] } }));
  await send(page, 'Review this draft'); assert.equal(answers.length, 1);
  assert.equal(await page.locator('#message').inputValue(), 'Review this draft');
  assert.match(await page.locator('#transcript').textContent(), /SHA-256 a{64}/);
  assert.match(await page.locator('#transcript').textContent(), /Historical evidence unavailable/);
  assert.match(await page.locator('#chat-status').textContent(), /latest record is loaded/);
  await send(page, 'Now resend'); assert.equal(answers[1].contextRevision, 2);
});
