const element = (root, tag, text, className) => {
  const value = root.createElement(tag); if (text) value.textContent = text;
  if (className) value.className = className; return value;
};
const terminalRuns = new Set(["completed", "cancelled", "failed", "budget-exhausted"]);
const profiles = new Set(["ask-every-time", "safe-autopilot", "read-only"]);
const workIntents = new Set(["analysis-only", "preview-only", "effect-requested"]);
export function approvalIsAvailable(result, proposal) {
  return result?.task?.status === "active" && proposal?.status === "pending-approval"
    && Array.isArray(result.approvableProposalIds) && result.approvableProposalIds.includes(proposal.proposalId)
    && Array.isArray(result.pendingReconciliation) && result.pendingReconciliation.length === 0
    && (result.grants ?? []).some(grant => grant.status === "active"
      && grant.grantId === proposal.grantId && grant.revision === proposal.grantRevision);
}
export function restoredWorkspaceNotice(result) {
  const current = new Set(result?.currentReceiptIds ?? []);
  return (result?.receipts ?? []).some(receipt => current.has(receipt.receiptId)
    && receipt.capabilityId === "project.restore" && receipt.effectKind === "revision-published")
    ? "Current workspace: restored to the earlier recorded files. Prior successful runs remain in history; they do not describe the current restored files."
    : null;
}
export function taskPresentation(result) {
  if (result?.task?.status !== "cancelled") {
    const unsettled = (result?.pendingReconciliation ?? []).length > 0
      || (result?.proposals ?? []).some(proposal => ["dispatching", "unknown"].includes(proposal.status));
    if (unsettled) return {
      status: "unknown",
      notice: "Outcome unknown. Reconcile the recorded action before any successor work; refreshing or continuing must not repeat it."
    };
    const status = result?.run?.status ?? result?.task?.status ?? "unknown";
    const code = result?.run?.errorCode;
    const notice = status === "failed" && code === "m1-stale-project"
      ? "Stopped: the project changed after this action was proposed. The newer files were preserved; this old action was not applied. Start a new task to work from the current files."
      : status === "failed" && ["m1-grant-revoked", "m1-grant-expired", "m1-stale-grant"].includes(code)
        ? "Stopped: this task's permission is no longer valid. No pending action was authorized by this failure."
        : null;
    return { status, notice };
  }
  const unsettled = (result.pendingReconciliation ?? []).length > 0
    || (result.proposals ?? []).some(proposal => ["dispatching", "unknown"].includes(proposal.status));
  return { status: "cancelled", notice: unsettled
    ? "Cancellation requested. No new steps will start. An already-dispatched step may still be finishing or awaiting reconciliation; its actual result will be retained when observed."
    : "Task cancelled. No new steps will start. Already-recorded receipts remain historical results." };
}
export function runEvidenceNotice(value) {
  if (value?.schemaVersion !== "runaai-m1-run-evidence/v1") return null;
  const change = value.changeStatus === "applied" ? "this run recorded an applied file change"
    : value.changeStatus === "none-recorded" ? "this run recorded no applied file change"
    : value.changeStatus === "unknown" ? "this run has an unresolved file-change outcome"
    : "this run has no terminal file-change result yet";
  const tests = value.testStatus === "ran" ? "this run executed a selected test suite"
    : value.testStatus === "none-recorded" ? "this run did not execute tests"
    : value.testStatus === "attempted-not-run" ? "this run recorded a test attempt that did not execute"
    : value.testStatus === "unknown" ? "this run has an unresolved test outcome"
    : "this run has no terminal test result yet";
  return `Application-verified status: ${change}; ${tests}.`;
}
const publicErrors = new Set(["m1-grant-session-mismatch", "m1-grant-expired", "m1-stale-project",
  "m1-restore-stale", "m1-operation-in-progress", "m1-source-index-unavailable",
  "m1-source-content-mismatch", "m1-authentication-required", "identity-token-invalid"]);

export function functionDescription(mode, experience) {
  if (mode === "work" && experience === "code") return "Describe a change to this disposable JavaScript project. Runa can plan, inspect, edit and run its fixed tests under your selected approval profile. Your own files, repositories, network and systems remain inaccessible.";
  if (mode === "research") return "Ask questions about the source sections you attach and explicitly select. Runa retrieves only those sections and shows their references. This is not live web research and cannot perform actions.";
  if (mode === "review") return "Ask Runa to review the source sections you attach and explicitly select. Findings must distinguish supported evidence from uncertainty. Reviewing does not edit or execute anything.";
  return experience === "code"
    ? "Discuss, explain, and draft code. A draft is not execution. Choose Run in sandbox for a JavaScript block, or Work in disposable Code project for a governed multi-step task. Neither can access your own files or network."
    : "Ask questions, brainstorm, draft writing, and work with text you paste here. Ordinary chat does not browse the live web or perform actions. Select Research or Review to work with explicitly supplied project sources.";
}

export function functionAnswerSelection(mode, sources, experience) {
  if (!["research", "review"].includes(mode)) return { lane: experience === "code" ? "code" : "general" };
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 6) throw new Error("Select one through six source sections first.");
  return { lane: mode, workspace: { sources: sources.map(({ sourceId, sectionId }) => ({ sourceId, sectionId })) } };
}

/** Only server response metadata is displayed here; model prose never supplies a receipt. */
export function appendAnswerEvidence(root, host, evidence) {
  const details = element(root, "details", null, "answer-evidence");
  details.append(element(root, "summary", "Answer evidence"));
  if (!evidence) {
    details.append(element(root, "p", "Historical evidence unavailable for this saved answer."));
    host.append(details); return details;
  }
  const retrieval = evidence.retrieval;
  const message = !retrieval?.attempted ? "No source retrieval was performed for this answer."
    : retrieval.degraded || retrieval.unavailable?.length ? "Source retrieval was incomplete. Treat this answer as limited."
    : retrieval.empty ? "The selected sources did not supply answering evidence."
    : "Source references supplied by the application are listed below. A reference does not prove every claim is correct.";
  details.append(element(root, "p", message));
  if (["missing", "contains-unknown"].includes(evidence.workspace?.citationStatus)) {
    details.append(element(root, "p", "The answer's source references were missing or did not fully match the supplied sources.", "evidence-warning"));
  }
  const citations = Array.isArray(evidence.citations) ? evidence.citations : [];
  const list = element(root, "ol");
  for (const citation of citations.slice(0, 24)) {
    if (typeof citation.sourceId !== "string" || typeof citation.sectionId !== "string" || !Number.isInteger(citation.ordinal) || citation.ordinal < 1
      || !/^[a-f0-9]{64}$/.test(citation.contentSha256 ?? "")) continue;
    list.append(element(root, "li", `[${citation.ordinal}] ${citation.sourceId} / ${citation.sectionId} · SHA-256 ${citation.contentSha256}`));
  }
  if (list.childElementCount) details.append(list);
  if (retrieval?.omissions?.length) details.append(element(root, "p", "Some requested material was omitted; this answer is not a complete review."));
  details.append(element(root, "p", "This answer itself did not execute an action. Actual actions have separate application receipts."));
  host.append(details); return details;
}

export async function initializeFunctionPanel({ root = document, request, getContext, onStatus = () => {},
  fetchCapabilities = () => fetch("/api/m1/capabilities", { cache: "no-store" }) }) {
  const unavailable = { refresh() {}, answerSelection: () => ({}), workSelected: () => false, async startWork() { return false; } };
  const capability = await fetchCapabilities().then(response => response.ok ? response.json() : null).catch(() => null);
  if (!capability?.enabled) return unavailable;
  const host = root.getElementById("right-rail-body"), heading = root.querySelector(".chat-heading");
  if (!host || !heading) return unavailable;
  const select = element(root, "select"); select.id = "m1-mode"; select.setAttribute("aria-label", "Conversation function");
  for (const [value, label] of [["conversation","Chat / code draft"],["research","Research selected text"],
    ["review","Review selected text"],["work","Work in disposable Code project"]]) {
    const option = element(root, "option", label); option.value = value; select.append(option);
  }
  heading.append(select);
  const presentMode = () => {
    const description = root.getElementById("experience-description");
    if (description) description.textContent = functionDescription(select.value, getContext().experience);
  };
  select.addEventListener("change", presentMode);
  host.classList.add("function-panel");
  host.append(element(root, "h2", "Selected sources"), element(root, "p", "Only text you attach and select is supplied. Up to six sections per answer; 8,000 characters each.", "navigation-empty"));
  const list = element(root, "div"), sourceForm = element(root, "form"), label = element(root, "input"), content = element(root, "textarea");
  list.id = "m1-sources";
  label.placeholder = "Section label"; label.maxLength = 120; label.required = true; label.setAttribute("aria-label", "Source section label");
  content.placeholder = "Paste a source section…"; content.maxLength = 8000; content.rows = 5; content.required = true; content.setAttribute("aria-label", "Source section content");
  const attach = element(root, "button", "Attach section"); attach.type = "submit";
  sourceForm.append(label, content, attach); host.append(list, sourceForm);
  const codePanel = element(root, "section"); codePanel.id = "m1-code-panel";
  codePanel.append(element(root, "h2", "Disposable Code workspace"), element(root, "p", "A small JavaScript exercise, separate from your files and repositories. Runa can inspect, repair, run fixed tests, and propose undoing her recorded changes.", "navigation-empty"));
  const prepare = element(root, "button", "Prepare exercise"); prepare.type = "button";
  const workflow = element(root, "select"); workflow.id = "m1-workflow"; workflow.setAttribute("aria-label", "Task workflow");
  for (const [value, text] of [["code", "Code task"], ["agent", "Guided task"]]) {
    const option = element(root, "option", text); option.value = value; workflow.append(option);
  }
  const workIntent = element(root, "select"); workIntent.id = "m1-work-intent"; workIntent.setAttribute("aria-label", "Task effect intent");
  for (const [value, text] of [["", "Choose what this task may propose"], ["analysis-only", "Analyze only"],
    ["preview-only", "Prepare a preview only"], ["effect-requested", "Complete requested bounded work"]]) {
    const option = element(root, "option", text); option.value = value; workIntent.append(option);
  }
  const profile = element(root, "select"); profile.id = "m1-profile"; profile.setAttribute("aria-label", "Code action approval profile");
  for (const [value, text] of [["","Choose an approval profile"],["ask-every-time","Ask before each action"],
    ["safe-autopilot","Auto-approve this harmless workspace"],["read-only","Read-only — no effects"]]) {
    const option = element(root, "option", text); option.value = value; profile.append(option);
  }
  const catalog = element(root, "div"); catalog.id = "m1-task-list";
  const taskView = element(root, "div"); taskView.id = "m1-task"; taskView.setAttribute("aria-live", "polite");
  const reload = element(root, "button", "Reload saved tasks"); reload.type = "button";
  codePanel.append(prepare, workflow, workIntent, element(root, "p", "Code and guided tasks use their configured model roles. Task intent limits what can be proposed; the approval profile separately controls each permitted effect.", "navigation-empty"),
    profile, element(root, "h3", "Saved tasks"), reload, catalog, taskView); host.append(codePanel);
  const status = element(root, "p"); status.setAttribute("role", "status"); host.append(status);
  let selected = [], epoch = 0, viewEpoch = 0, sourceAttempt = null, startAttempt = null;
  const scopeKey = context => `${context.experience}:${context.projectId}`;
  const ticket = () => ({ epoch, key: scopeKey(getContext()), context: { ...getContext() } });
  const alive = token => token.epoch === epoch && token.key === scopeKey(getContext());
  const visible = token => alive(token) && token.view === viewEpoch;
  const call = (operation, input, token) => request("/api/m1/workspace", { ...token.context, operation, input: input ?? {} });
  const setStatus = (value, token) => { if (token && !alive(token)) return; status.textContent = value; onStatus(value); };
  const reportError = (error, token) => setStatus(publicErrors.has(error?.code)
    ? `The operation did not complete (${error.code}). No success is inferred.`
    : "The operation could not be completed. Your saved records are unchanged unless an actual receipt says otherwise.", token);
  const button = (text, handler, parent) => {
    const value = element(root, "button", text); value.type = "button";
    value.addEventListener("click", handler); parent.append(value); return value;
  };
  async function sources(token) {
    const result = await call("sources.list", {}, token); if (!alive(token)) return;
    const prior = new Set(selected.map(value => value.sourceId));
    selected = result.sources.filter(source => source.indexed && prior.has(source.sourceId)).slice(0, 6);
    list.replaceChildren();
    for (const source of result.sources) {
      const row = element(root, "div", null, "source-entry"), checkLabel = element(root, "label"), checkbox = element(root, "input");
      checkbox.type = "checkbox"; checkbox.disabled = !source.indexed; checkbox.checked = selected.some(item => item.sourceId === source.sourceId);
      checkbox.addEventListener("change", () => {
        if (!alive(token)) return;
        if (checkbox.checked && selected.length >= 6) { checkbox.checked = false; setStatus("Select up to six sections.", token); return; }
        selected = checkbox.checked ? [...selected, source] : selected.filter(item => item.sourceId !== source.sourceId);
      });
      checkLabel.append(checkbox, root.createTextNode(`${source.label} (${source.characters} characters)${source.indexed ? "" : " — index unavailable"}`));
      row.append(checkLabel);
      if (!source.indexed) {
        const retry = button("Retry indexing", async () => {
          if (!alive(token)) return; retry.disabled = true;
          try {
            const result = await call("sources.retry", { sourceId: source.sourceId, contentSha256: source.contentSha256 }, token);
            await sources(token);
            setStatus(result.indexed ? "Source index ready. Select this section to use it."
              : "The source is retained, but indexing is still unavailable.", token);
          } catch (error) { reportError(error, token); } finally { retry.disabled = false; }
        }, row);
      }
      list.append(row);
    }
    if (!result.sources.length) list.append(element(root, "p", "No supplied sections yet.", "navigation-empty"));
  }
  async function savedTasks(token) {
    if (token.context.experience !== "code") return;
    const [taskList, runList] = await Promise.all([call("task.list", {}, token), call("run.list", {}, token)]);
    if (!alive(token)) return;
    catalog.replaceChildren();
    const runs = runList.runs ?? [], tasks = taskList.tasks ?? [];
    // The outer shell can change experience/project scope before its awaited panel
    // refresh clears this catalog. Bind the click to the current scope so the
    // server can deny a stale visible entry explicitly instead of an old ticket
    // making the control silently inert.
    for (const run of runs) button(`${run.objective} — ${run.status}`, () => openTask(ticket(), run.taskId, run.runId, true), catalog);
    const runTasks = new Set(runs.map(run => run.taskId));
    for (const task of tasks.filter(task => !runTasks.has(task.taskId))) {
      let displayStatus = task.status;
      try {
        const detail = await call("task.status", { taskId: task.taskId }, token);
        if (!alive(token)) return;
        displayStatus = taskPresentation(detail).status;
      } catch {
        // A list entry remains useful when its detail is temporarily unavailable.
        // It must never infer success or authorize work from that failure.
      }
      button(`${task.objective} — ${displayStatus}`, () => openTask(ticket(), task.taskId, null, true), catalog);
    }
    if (!catalog.childElementCount) catalog.append(element(root, "p", "No saved tasks in this project.", "navigation-empty"));
  }
  async function refresh() {
    ++epoch; ++viewEpoch; selected = []; sourceAttempt = null; startAttempt = null;
    profile.value = ""; taskView.replaceChildren(); catalog.replaceChildren(); status.textContent = "";
    const token = ticket(), context = token.context;
    codePanel.hidden = context.experience !== "code";
    select.querySelector('option[value="work"]').disabled = context.experience !== "code";
    if (context.experience !== "code" && select.value === "work") select.value = "conversation";
    presentMode();
    const managed = !["runa:personal", "runa:ephemeral"].includes(context.projectId);
    sourceForm.hidden = !managed; prepare.disabled = !managed; reload.disabled = !managed;
    list.replaceChildren(element(root, "p", managed ? "Loading sources…" : "Create or select a project on the left to attach sources.", "navigation-empty"));
    if (!managed) return;
    await Promise.all([sources(token).catch(error => reportError(error, token)),
      savedTasks(token).catch(error => { if (alive(token)) catalog.textContent = "Saved tasks are temporarily unavailable."; reportError(error, token); })]);
  }
  reload.addEventListener("click", async () => {
    const token = ticket(); reload.disabled = true;
    try { await savedTasks(token); } catch (error) { reportError(error, token); } finally { if (alive(token)) reload.disabled = false; }
  });
  sourceForm.addEventListener("submit", async event => {
    event.preventDefault(); if (attach.disabled) return;
    const token = ticket(), draft = { label: label.value, content: content.value };
    if (sourceAttempt?.key !== token.key || sourceAttempt?.label !== draft.label || sourceAttempt?.content !== draft.content) {
      sourceAttempt = { ...draft, key: token.key, requestId: `source-${crypto.randomUUID()}` };
    }
    const requestId = sourceAttempt.requestId; attach.disabled = true;
    try {
      const result = await call("sources.attach", { requestId, ...draft }, token);
      if (!alive(token)) return;
      sourceAttempt = null;
      if (label.value === draft.label && content.value === draft.content) { label.value = ""; content.value = ""; }
      await sources(token);
      setStatus(result.indexed ? "Source attached. Select it before asking a research or review question."
        : "Source retained, but indexing failed. Use Retry indexing beside that saved section.", token);
    } catch (error) { reportError(error, token); } finally { attach.disabled = false; }
  });
  prepare.addEventListener("click", async () => {
    const token = ticket(); prepare.disabled = true;
    try {
      await call("project.prepare", {}, token); if (!alive(token)) return;
      select.value = "work"; presentMode(); setStatus("Disposable exercise ready. Choose a profile and describe the change in the message box.", token);
    } catch (error) { reportError(error, token); } finally { if (alive(token)) prepare.disabled = false; }
  });
  async function readTask(token, taskId, runId) {
    const task = await call("task.status", { taskId }, token);
    if (!runId) return task;
    const run = await call("run.status", { runId }, token);
    return { ...task, ...run, currentReceiptIds: task.currentReceiptIds, grants: task.grants,
      approvableProposalIds: task.approvableProposalIds };
  }
  async function openTask(token, taskId, runId, restored = false) {
    if (!alive(token)) return;
    const target = { ...token, view: ++viewEpoch };
    if (restored) profile.value = "";
    taskView.replaceChildren(element(root, "p", "Loading saved task…"));
    try { renderTask(await readTask(target, taskId, runId), target, { taskId, runId, restored }); }
    catch (error) { if (visible(target)) { taskView.textContent = "Task could not be loaded. No actions were started."; reportError(error, target); } }
  }
  function capabilitiesFor(workIntentValue) {
    if (workIntentValue === "analysis-only") return ["project.inspect"];
    if (workIntentValue === "preview-only") return ["project.inspect", "project.preview-change"];
    return ["project.inspect", "project.preview-change", "project.apply-change", "project.run-tests", "project.restore"];
  }
  function makeGrant(token, taskId, selectedProfile, workIntentValue = "effect-requested", exactCapabilities = null) {
    return call("grant.create", { taskId, profile: selectedProfile, allowedPaths: ["calculator.js"],
      allowedSuites: ["calculator-add-v1"], capabilityIds: exactCapabilities ?? capabilitiesFor(workIntentValue),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, token);
  }
  function renderTask(result, token, ids) {
    if (!visible(token)) return;
    const { taskId, runId, restored } = ids, run = result.run;
    const presentation = taskPresentation(result);
    taskView.replaceChildren(element(root, "h3", result.task?.objective ?? run?.objective ?? "Saved task"),
      element(root, "p", `Task: ${presentation.status}`));
    if (presentation.notice) taskView.append(element(root, "p", presentation.notice));
    const restoredNotice = restoredWorkspaceNotice(result);
    if (restoredNotice) taskView.append(element(root, "p", restoredNotice));
    if (run?.outcome === "plan-completed" && result.task?.status !== "cancelled") taskView.append(element(root, "p", "The recorded plan completed. This does not prove every part of a broader goal is finished."));
    for (const plan of run?.plans ?? []) {
      const planBox = element(root, "details"), planTitle = element(root, "summary", "Proposed plan — not execution evidence");
      planBox.append(planTitle, element(root, "p", plan.summary)); taskView.append(planBox);
    }
    const evidenceNotice = runEvidenceNotice(result.runEvidence);
    if (evidenceNotice) taskView.append(element(root, "p", evidenceNotice));
    const showData = (title, data, parent = taskView) => {
      const details = element(root, "details"); details.append(element(root, "summary", title),
        element(root, "pre", JSON.stringify(data, null, 2), "execution-output")); parent.append(details);
    };
    const reloadTask = async (restoredValue = restored) => {
      const updated = await readTask(token, taskId, runId);
      renderTask(updated, token, { ...ids, restored: restoredValue }); await savedTasks(token);
    };
    const action = (label, work, parent = taskView) => {
      const control = button(label, async () => {
        if (!visible(token)) return; control.disabled = true;
        try { await work(); } catch (error) { if (visible(token)) reportError(error, token); }
        finally { if (visible(token)) control.disabled = false; }
      }, parent); return control;
    };
    const pendingIds = new Set((result.pendingReconciliation ?? []).map(value => value.proposalId));
    for (const proposal of result.proposals ?? []) {
      const section = element(root, "section", null, "task-proposal");
      section.append(element(root, "p", `${proposal.capabilityId} — ${proposal.status}`));
      showData("Exact proposed action and preview", { arguments: proposal.arguments, preview: proposal.prepared?.preview,
        proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest }, section);
      if (approvalIsAvailable(result, proposal)) action("Approve this exact action", async () => {
        await call("proposal.approve", { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest }, token);
        if (!visible(token)) return;
        if (runId) await call("run.resume", { runId }, token);
        else await call("proposal.execute", { proposalId: proposal.proposalId }, token);
        await reloadTask(false);
      }, section);
      taskView.append(section);
    }
    for (const intent of result.pendingReconciliation ?? []) {
      action("Reconcile uncertain action", async () => {
        await call("proposal.reconcile", { proposalId: intent.proposalId }, token);
        await reloadTask();
        setStatus("Reconciliation checked recorded effects; it did not repeat the action.", token);
      });
    }
    for (const receipt of result.receipts ?? []) {
      const section = element(root, "section", null, "task-receipt"); section.dataset.receiptId = receipt.receiptId;
      section.append(element(root, "p", `Actual receipt: ${receipt.capabilityId} — ${receipt.executionStatus}`));
      if (receipt.cancellationRequested) section.append(element(root, "p", "This bounded action finished after cancellation was requested."));
      showData("Application receipt and actual output", receipt, section);
      if (result.task?.status === "active" && !pendingIds.size && receipt.effectKind === "revision-published" && (result.currentReceiptIds ?? []).includes(receipt.receiptId)) {
        action("Propose undo of this change", async () => {
          const choice = profile.value;
          if (!profiles.has(choice)) { setStatus("Choose an approval profile before proposing undo.", token); return; }
          // Restore is deliberately receipt-bound to its originating task. A new
          // task would not own that receipt and must not be used to evade scope.
          const grant = await makeGrant(token, taskId, choice, result.task?.workIntent, ["project.restore"]);
          if (!visible(token)) return;
          const proposal = await call("proposal.create", { taskId, grantId: grant.grantId, grantRevision: grant.revision,
            requestId: `restore-${crypto.randomUUID()}`, capabilityId: "project.restore", arguments: { receiptId: receipt.receiptId } }, token);
          if (!visible(token)) return;
          if (proposal.status === "authorized") await call("proposal.execute", { proposalId: proposal.proposalId }, token);
          await openTask(token, taskId, null, false); await savedTasks(token);
        }, section);
      }
      taskView.append(section);
    }
    if (!(result.receipts ?? []).length) taskView.append(element(root, "p", "No execution receipts have been recorded for this task."));
    action("Refresh task status", () => reloadTask());
    for (const grant of result.grants ?? []) if (grant.status === "active") {
      action("Revoke task permission", async () => {
        await call("grant.revoke", { grantId: grant.grantId }, token);
        await reloadTask(true);
        setStatus("Task permission revoked. Continue requires an explicit new profile selection.", token);
        if (visible(token)) profile.value = "";
      });
    }
    const standaloneProposal = !runId ? [...(result.proposals ?? [])].reverse()
      .find(proposal => ["pending-approval", "authorized"].includes(proposal.status)) : null;
    if (result.task?.status === "active" && ((runId && !terminalRuns.has(run?.status)) || standaloneProposal)) {
      taskView.append(element(root, "p", restored
        ? (result.approvableProposalIds?.length
          ? "Your current session can approve the exact pending action. Reopening this task has not started any work."
          : "No pending action is authorized for this session. Choose a profile, then explicitly continue.")
        : "Continue with the selected profile creates a new grant and retires earlier approvals."));
      action("Continue with selected profile", async () => {
        const choice = profile.value;
        if (!profiles.has(choice)) { setStatus("Choose an approval profile before continuing this task.", token); return; }
        if (!runId && pendingIds.size) { setStatus("Reconcile the uncertain action before continuing.", token); return; }
        const grant = await makeGrant(token, taskId, choice, result.task?.workIntent,
          !runId && standaloneProposal ? [standaloneProposal.capabilityId] : null); if (!visible(token)) return;
        if (runId) await call("run.resume", { runId, grantId: grant.grantId, grantRevision: grant.revision }, token);
        else {
          const proposal = await call("proposal.create", { taskId, grantId: grant.grantId, grantRevision: grant.revision,
            requestId: `resume-${crypto.randomUUID()}`, capabilityId: standaloneProposal.capabilityId,
            arguments: standaloneProposal.arguments }, token);
          if (!visible(token)) return;
          if (proposal.status === "authorized") await call("proposal.execute", { proposalId: proposal.proposalId }, token);
        }
        await reloadTask(false);
      });
    }
    if (result.task?.status === "active") action("Cancel task", async () => {
      await call("task.cancel", { taskId }, token);
      setStatus("Cancellation requested. No new steps will start; an already-running sandbox step may take up to two seconds to finish.", token);
      await reloadTask();
    });
  }
  async function startWork(objective) {
    const token = { ...ticket(), view: ++viewEpoch, selectedWorkIntent: workIntent.value },
      choice = profile.value, selectedWorkflow = workflow.value;
    if (!profiles.has(choice)) { setStatus("Choose an approval profile before starting work.", token); return false; }
    if (!workIntents.has(token.selectedWorkIntent)) { setStatus("Choose what this task may propose before starting work.", token); return false; }
    if (token.context.experience !== "code" || ["runa:personal", "runa:ephemeral"].includes(token.context.projectId)) {
      setStatus("Select a Code project and prepare its disposable exercise first.", token); return false;
    }
    if (startAttempt?.objective !== objective || startAttempt?.choice !== choice || startAttempt?.key !== token.key
      || startAttempt?.workflow !== selectedWorkflow || startAttempt?.workIntent !== token.selectedWorkIntent) {
      startAttempt = { objective, choice, key: token.key, workflow: selectedWorkflow, workIntent: token.selectedWorkIntent,
        taskRequestId: `task-${crypto.randomUUID()}`, runRequestId: `run-${crypto.randomUUID()}` };
    }
    const attempt = startAttempt;
    try {
      const task = await call("task.create", { requestId: attempt.taskRequestId, objective, workIntent: attempt.workIntent }, token);
      if (!visible(token)) return false;
      const grant = attempt.grant ?? await makeGrant(token, task.taskId, choice, attempt.workIntent); attempt.grant = grant;
      if (!visible(token)) return false;
      setStatus("Planning bounded workspace work…", token);
      const started = await call("run.start", { taskId: task.taskId, grantId: grant.grantId, grantRevision: grant.revision,
        requestId: attempt.runRequestId, workflow: selectedWorkflow }, token);
      if (!visible(token)) return false;
      const run = started.run;
      if (!run?.runId || run.taskId !== task.taskId) throw new Error("run-not-returned");
      renderTask(await readTask(token, task.taskId, run.runId), token, { taskId: task.taskId, runId: run.runId, restored: false });
      startAttempt = null; await savedTasks(token);
      setStatus("Task state updated. Actual results are shown in its receipts.", token); return true;
    } catch (error) { if (visible(token)) reportError(error, token); await savedTasks(token).catch(() => {}); return false; }
  }
  await refresh();
  return { refresh, workSelected: () => select.value === "work", startWork,
    answerSelection: () => functionAnswerSelection(select.value, selected, getContext().experience) };
}
