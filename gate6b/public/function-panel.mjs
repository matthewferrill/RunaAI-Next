const element = (root, tag, text, className) => {
  const value = root.createElement(tag); if (text) value.textContent = text;
  if (className) value.className = className; return value;
};

export function functionAnswerSelection(mode, sources, experience) {
  if (!["research", "review"].includes(mode)) return { lane: experience === "code" ? "code" : "general" };
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 6) throw new Error("Select one through six source sections first.");
  return { lane: mode, workspace: { sources: sources.map(({ sourceId, sectionId }) => ({ sourceId, sectionId })) } };
}

export async function initializeFunctionPanel({ root = document, request, getContext, onStatus = () => {} }) {
  const unavailable = { refresh() {}, answerSelection: () => ({}), workSelected: () => false, async startWork() {} };
  const capability = await fetch("/api/m1/capabilities", { cache: "no-store" }).then(response => response.ok ? response.json() : null).catch(() => null);
  if (!capability?.enabled) return unavailable;
  const host = root.getElementById("right-rail-body"), heading = root.querySelector(".chat-heading");
  if (!host || !heading) return unavailable;
  const select = element(root, "select"); select.id = "m1-mode"; select.setAttribute("aria-label", "Conversation function");
  for (const [value, label] of [["conversation","Chat / code draft"],["research","Research selected text"],
    ["review","Review selected text"],["work","Work in disposable Code project"]]) {
    const option = element(root, "option", label); option.value = value; select.append(option);
  }
  heading.append(select);
  host.classList.add("function-panel");
  host.append(element(root, "h2", "Selected sources"), element(root, "p", "Only text you attach and select is supplied. Up to six sections per answer; 8,000 characters each.", "navigation-empty"));
  const list = element(root, "div"), sourceForm = element(root, "form"), label = element(root, "input"), content = element(root, "textarea");
  label.placeholder = "Section label"; label.maxLength = 120; label.required = true; label.setAttribute("aria-label", "Source section label");
  content.placeholder = "Paste a source section…"; content.maxLength = 8000; content.rows = 5; content.required = true; content.setAttribute("aria-label", "Source section content");
  const attach = element(root, "button", "Attach section"); attach.type = "submit";
  sourceForm.append(label, content, attach); host.append(list, sourceForm);
  const codePanel = element(root, "section");
  codePanel.append(element(root, "h2", "Disposable Code workspace"), element(root, "p", "This first workspace is a small JavaScript exercise, separate from your files and repositories. It starts with an addition defect. Runa can inspect, repair, run its fixed tests, and undo her changes.", "navigation-empty"));
  const prepare = element(root, "button", "Prepare exercise"); prepare.type = "button";
  const profile = element(root, "select"); profile.setAttribute("aria-label", "Code action approval profile");
  for (const [value, text] of [["ask-every-time","Ask before each action"],["safe-autopilot","Auto-approve this harmless workspace"],["read-only","Read-only — no effects"]]) {
    const option = element(root, "option", text); option.value = value; profile.append(option);
  }
  const taskView = element(root, "div"); taskView.setAttribute("aria-live", "polite");
  codePanel.append(prepare, profile, taskView); host.append(codePanel);
  const status = element(root, "p"); status.setAttribute("role", "status"); host.append(status);
  let selected = [], epoch = 0, currentTask = null, currentRun = null;
  const scopeKey = context => `${context.experience}:${context.projectId}`;
  const call = (operation, input = {}, context = getContext()) => request("/api/m1/workspace", { ...context, operation, input });
  const setStatus = value => { status.textContent = value; onStatus(value); };
  const reportError = error => setStatus(error?.message?.startsWith("Select ") ? error.message
    : `The operation did not complete (${error?.code ?? "service-unavailable"}). No success is inferred.`);
  async function refresh() {
    const serial = ++epoch, context = getContext(); selected = []; currentTask = null; currentRun = null; taskView.replaceChildren();
    codePanel.hidden = context.experience !== "code";
    select.querySelector('option[value="work"]').disabled = context.experience !== "code";
    if (context.experience !== "code" && select.value === "work") select.value = "conversation";
    const managed = context.projectId !== "runa:personal"; sourceForm.hidden = !managed; prepare.disabled = !managed;
    list.replaceChildren(element(root, "p", managed ? "Loading sources…" : "Create or select a project on the left to attach sources.", "navigation-empty"));
    if (!managed) return;
    try {
      const result = await call("sources.list", {}, context); if (serial !== epoch) return;
      list.replaceChildren();
      for (const source of result.sources) {
        const row = element(root, "label"), checkbox = element(root, "input"); checkbox.type = "checkbox"; checkbox.disabled = !source.indexed;
        checkbox.addEventListener("change", () => {
          if (checkbox.checked && selected.length >= 6) { checkbox.checked = false; setStatus("Select up to six sections."); return; }
          selected = checkbox.checked ? [...selected, source] : selected.filter(item => item.sourceId !== source.sourceId);
        });
        row.append(checkbox, root.createTextNode(`${source.label} (${source.characters} characters)${source.indexed ? "" : " — index unavailable"}`)); list.append(row);
      }
      if (!result.sources.length) list.append(element(root, "p", "No supplied sections yet.", "navigation-empty"));
    } catch (error) { if (serial === epoch) reportError(error); }
  }
  sourceForm.addEventListener("submit", async event => {
    event.preventDefault(); attach.disabled = true; const context = getContext();
    try {
      const result = await call("sources.attach", { requestId: `source-${crypto.randomUUID()}`, label: label.value, content: content.value }, context);
      if (scopeKey(context) !== scopeKey(getContext())) return;
      if (result.indexed) { label.value = ""; content.value = ""; }
      await refresh(); setStatus(result.indexed ? "Source attached. Select it before asking a research or review question."
        : "Source retained, but indexing failed. It cannot be used for retrieval yet.");
    } catch (error) { reportError(error); } finally { attach.disabled = false; }
  });
  prepare.addEventListener("click", async () => {
    prepare.disabled = true;
    try { await call("project.prepare"); select.value = "work"; setStatus("Disposable exercise ready. Describe the change in the message box."); }
    catch (error) { reportError(error); } finally { prepare.disabled = false; }
  });
  function renderTask(result, context) {
    if (scopeKey(context) !== scopeKey(getContext())) return;
    taskView.replaceChildren();
    const run = result.run ?? result; currentRun = run.runId ?? currentRun;
    const heading = element(root, "p", `Task: ${run.status ?? "in progress"}`); taskView.append(heading);
    if (run.plan?.summary) taskView.append(element(root, "p", run.plan.summary));
    const details = element(root, "details"), summary = element(root, "summary", "Plan, proposals and actual receipts");
    const output = element(root, "pre", JSON.stringify(result, null, 2)); output.className = "execution-output"; details.append(summary, output); taskView.append(details);
    const proposal = result.pendingProposal ?? run.pendingProposal;
    if (proposal?.proposalId && proposal.proposalDigest) {
      const approve = element(root, "button", "Approve this exact action"); approve.type = "button";
      approve.addEventListener("click", async () => {
        approve.disabled = true;
        try { await call("proposal.approve", { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest }, context);
          renderTask(await call("run.resume", { runId: currentRun }, context), context); }
        catch (error) { reportError(error); } finally { approve.disabled = false; }
      }); taskView.append(approve);
    }
    const resume = element(root, "button", "Refresh / continue task"); resume.type = "button";
    resume.addEventListener("click", async () => { resume.disabled = true;
      try { renderTask(await call("run.resume", { runId: currentRun }, context), context); }
      catch (error) { reportError(error); } finally { resume.disabled = false; } }); taskView.append(resume);
    const cancel = element(root, "button", "Cancel task"); cancel.type = "button";
    cancel.addEventListener("click", async () => { cancel.disabled = true;
      try { await call("task.cancel", { taskId: currentTask }, context);
        setStatus("Cancellation requested. No new steps will start; an already-running sandbox step may take up to two seconds to finish.");
        renderTask(await call("run.status", { runId: currentRun }, context), context); }
      catch (error) { reportError(error); } }); taskView.append(cancel);
  }
  async function startWork(objective) {
    const context = getContext();
    try {
      const task = await call("task.create", { requestId: `task-${crypto.randomUUID()}`, objective }, context); currentTask = task.taskId;
      const grant = await call("grant.create", { taskId: task.taskId, profile: profile.value,
        allowedPaths: ["calculator.js"], allowedSuites: ["calculator-add-v1"], expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, context);
      setStatus("Planning bounded workspace work…");
      const result = await call("run.start", { taskId: task.taskId, grantId: grant.grantId, grantRevision: grant.revision,
        requestId: `run-${crypto.randomUUID()}` }, context);
      renderTask(result, context); setStatus("Task state updated. Actual results are shown in its receipts.");
    } catch (error) { reportError(error); }
  }
  await refresh();
  return { refresh, workSelected: () => select.value === "work", startWork,
    answerSelection: () => functionAnswerSelection(select.value, selected, getContext().experience) };
}
