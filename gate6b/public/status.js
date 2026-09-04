import { CHAT_DEADLINE_MS, answerNeedsRetry, boundedHistory, customerMessageFor,
  readJsonResponse } from "./chat-client.mjs";
import { initializeWorkspaceShell } from "./workspace-shell.mjs";
import { executionOutput, javascriptSource } from "./code-execution.mjs";
import { initializeFunctionPanel, appendAnswerEvidence } from "./function-panel.mjs";
import { FUNCTION_CATALOG, functionNameForContext, functionTarget } from "./function-navigation.mjs";
import { initializeProductViews } from "./product-views.mjs";
import { currentResultContext as resolveCurrentResultContext } from "./artifact-results.mjs";

const byId = id => document.getElementById(id);
const text = (id, value) => { byId(id).textContent = value; };
const welcome = byId("welcome");
const chat = byId("chat");
const logout = byId("logout");
const sessionLabel = byId("session-label");
const form = byId("chat-form");
const message = byId("message");
const send = byId("send");
const transcript = byId("transcript");
const projectForm = byId("project-form");
const projectName = byId("project-name");
const experiences = Object.freeze(["chat", "code"]);
const states = Object.fromEntries(experiences.map(experience => [experience, {
  threadId: `web-${experience}-${crypto.randomUUID()}`,
  projectId: "runa:personal", projectName: null, activeChatId: null, history: [], contextRevision: 0,
}]));
const catalogs = Object.fromEntries(experiences.map(experience => [experience, { projects: [], chats: [] }]));
let activeExperience = "chat";
let activeFunction = "chat";
let functionPanel = null;
let productViews = null;
let activeAnswerController = null;
let answerStoppedByUser = false;

const menuControls = Object.freeze([
  ["new-chat", "new-work-menu"],
  ["composer-add", "composer-add-menu"],
  ["function-picker", "function-menu"],
  ["work-actions", "work-actions-menu"],
]);

function setMenu(buttonId, menuId, open) {
  byId(buttonId).setAttribute("aria-expanded", String(open));
  byId(menuId).hidden = !open;
}

function closeMenus(exceptMenuId = null) {
  for (const [buttonId, menuId] of menuControls) {
    if (menuId !== exceptMenuId) setMenu(buttonId, menuId, false);
  }
}

function toggleMenu(buttonId, menuId) {
  const open = byId(menuId).hidden;
  closeMenus(open ? menuId : null);
  setMenu(buttonId, menuId, open);
}

function expandRail(side) {
  const button = byId(`${side}-rail-toggle`);
  if (button.getAttribute("aria-expanded") !== "true") button.click();
}

const workspaceHeaders = Object.freeze({ "content-type": "application/json", "x-runa-workspace": "1" });
const activeState = () => states[activeExperience];
const greeting = () => FUNCTION_CATALOG[activeFunction].greeting;

function currentResultContext() {
  return resolveCurrentResultContext({ experience: activeExperience, state: activeState(), taskView: byId("m1-task") });
}

function resetTranscript() {
  transcript.replaceChildren();
  appendMessage("assistant", greeting());
}

async function runJavascript({ item, source, state }) {
  const button = item.querySelector(".run-button");
  const badge = item.querySelector(".execution-badge");
  item.querySelector(".execution-output")?.remove();
  button.disabled = true;
  badge.textContent = "Running in sandbox…";
  text("chat-status", "Running harmless JavaScript in the isolated sandbox…");
  try {
    const receipt = await workspaceJson("/api/selected/code/execute", {
      requestId: `web-exec-${crypto.randomUUID()}`,
      experience: "code", language: "javascript", source,
      threadId: state.threadId, projectId: state.projectId,
    });
    badge.textContent = receipt.status === "executed" ? "Ran in sandbox" : "Not executed";
    badge.dataset.status = receipt.status;
    const output = document.createElement("pre");
    output.className = "execution-output";
    output.textContent = executionOutput(receipt);
    item.append(output);
    button.textContent = "Run again";
    button.disabled = false;
    text("chat-status", receipt.status === "executed" ? "Sandbox run complete" : "Sandbox stopped safely");
  } catch {
    badge.textContent = "Not executed";
    badge.dataset.status = "unavailable";
    button.disabled = false;
    text("chat-status", "Sandbox is temporarily unavailable");
  }
}

function appendMessage(role, content, { codeDraft = false, state = null, evidence = undefined } = {}) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "Runa";
  const body = document.createElement("p");
  body.textContent = content;
  item.append(label, body);
  if (role === "assistant" && evidence !== undefined) appendAnswerEvidence(document, item, evidence);
  if (role === "assistant" && codeDraft) {
    const controls = document.createElement("div");
    controls.className = "execution-controls";
    const badge = document.createElement("span");
    badge.className = "execution-badge";
    badge.dataset.status = "not-executed";
    badge.textContent = "Draft — not run";
    controls.append(badge);
    const source = javascriptSource(content);
    if (source && state) {
      const run = document.createElement("button");
      run.type = "button";
      run.className = "run-button";
      run.textContent = "Run in sandbox";
      const scope = { threadId: state.threadId, projectId: state.projectId };
      run.addEventListener("click", () => runJavascript({ item, source, state: scope }));
      controls.append(run);
    }
    item.append(controls);
  }
  transcript.append(item);
  item.scrollIntoView({ block: "end", behavior: "smooth" });
  return item;
}

function addRetry(item, content) {
  item.classList.add("failed");
  const retry = document.createElement("button");
  retry.className = "retry-button";
  retry.type = "button";
  retry.textContent = "Retry message";
  retry.addEventListener("click", () => {
    message.value = content;
    message.focus();
    retry.remove();
  }, { once: true });
  item.append(retry);
}

async function workspaceJson(path, payload) {
  const response = await fetch(path, { method: "POST", headers: workspaceHeaders,
    body: JSON.stringify(payload) });
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) throw Object.assign(new Error("workspace request failed"), {
    code: typeof value?.errorCode === "string" ? value.errorCode : "candidate-request-failed",
  });
  return value;
}

function navigationButton(label, { selected = false, onClick }) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.classList.toggle("selected", selected);
  button.addEventListener("click", onClick);
  item.append(button);
  return item;
}

function updateExperiencePresentation() {
  const code = activeExperience === "code";
  text("records-heading", code ? "Code chat records" : "Chat records");
  byId("record-list").setAttribute("aria-label", code ? "Code chat records" : "Chat records");
  updateFunctionPresentation(functionPanel?.mode() ?? "conversation");
}

function updateFunctionPresentation(mode) {
  activeFunction = functionNameForContext(activeExperience, mode);
  const selected = FUNCTION_CATALOG[activeFunction];
  text("experience-eyebrow", selected.eyebrow);
  text("chat-title", selected.title);
  text("experience-description", selected.description);
  text("active-function-label", selected.label);
  message.placeholder = selected.placeholder;
  for (const button of document.querySelectorAll(".function-choice[data-function]")) {
    const active = button.dataset.function === activeFunction;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-current", active ? "true" : "false");
  }
  updateWorkbar();
}

function updateWorkbar() {
  const state = activeState();
  const selectedRecord = catalogs[activeExperience].chats.find(item => item.chatId === state.activeChatId);
  text("work-title", selectedRecord?.title ?? `New ${FUNCTION_CATALOG[activeFunction].label.toLowerCase()}`);
  text("work-project", state.projectName ?? "Personal");
  byId("work-actions").disabled = !state.activeChatId;
}

function renderNavigation() {
  const catalog = catalogs[activeExperience];
  const state = activeState();
  const projectList = byId("project-list");
  const recordList = byId("record-list");
  projectList.replaceChildren(...catalog.projects.map(project => navigationButton(project.displayName, {
    selected: state.projectId === project.projectId,
    onClick: () => startNew(project.projectId, project.displayName),
  })));
  const visibleChats = state.projectId === "runa:personal" ? catalog.chats
    : catalog.chats.filter(item => item.projectId === state.projectId);
  recordList.replaceChildren(...visibleChats.map(item => navigationButton(item.title, {
    selected: state.activeChatId === item.chatId,
    onClick: () => loadChat(item.chatId),
  })));
  byId("project-empty").hidden = catalog.projects.length > 0;
  byId("record-empty").hidden = visibleChats.length > 0;
  text("record-empty", state.projectId === "runa:personal"
    ? `No ${activeExperience === "code" ? "code " : ""}chat records yet`
    : "No chat records in this project yet");
  updateWorkbar();
}

async function refreshNavigation(experience = activeExperience) {
  try {
    const catalog = await workspaceJson("/api/selected/navigation/query", { experience });
    catalogs[experience] = { projects: catalog.projects ?? [], chats: catalog.chats ?? [] };
    if (experience === activeExperience) {
      text("navigation-status", "");
      renderNavigation();
    }
  } catch {
    if (experience === activeExperience) text("navigation-status", "Records are temporarily unavailable");
  }
}

async function startNew(projectId = "runa:personal", selectedProjectName = null) {
  productViews?.close();
  const state = activeState();
  state.threadId = `web-${activeExperience}-${crypto.randomUUID()}`;
  state.projectId = projectId;
  state.projectName = selectedProjectName;
  state.activeChatId = null;
  state.history = [];
  state.contextRevision = 0;
  resetTranscript();
  renderNavigation();
  text("chat-status", selectedProjectName ? `New chat in ${selectedProjectName}` : "Ready");
  setNavigationDisabled(true);
  send.disabled = true;
  try { await functionPanel?.refresh(); }
  finally {
    setNavigationDisabled(false);
    send.disabled = false;
    message.focus();
  }
}

async function selectExperience(experience) {
  if (!experiences.includes(experience) || experience === activeExperience) return;
  setNavigationDisabled(true);
  send.disabled = true;
  try {
    activeExperience = experience;
    productViews?.close();
    functionPanel?.setMode("conversation");
    projectForm.hidden = true;
    projectName.value = "";
    updateExperiencePresentation();
    const state = activeState();
    resetTranscript();
    for (const turn of state.history) appendMessage(turn.role, turn.content, {
      codeDraft: activeExperience === "code" && turn.role === "assistant", state, evidence: turn.evidence,
    });
    renderNavigation();
    setNavigationDisabled(true);
    await refreshNavigation(experience);
    // refreshNavigation replaces the project buttons; keep the new controls
    // disabled until the function panel has caught up to the same experience.
    setNavigationDisabled(true);
    await functionPanel?.refresh();
    text("chat-status", state.projectName ? `Ready in ${state.projectName}` : "Ready");
  } finally {
    setNavigationDisabled(false);
    send.disabled = false;
    message.focus();
  }
}

async function loadChat(chatId) {
  productViews?.close();
  const experience = activeExperience;
  text("navigation-status", "Loading…");
  setNavigationDisabled(true);
  send.disabled = true;
  try {
    const record = await workspaceJson("/api/selected/chat/read", { experience, chatId });
    if (experience !== activeExperience) return false;
    const state = activeState();
    state.threadId = record.chatId;
    state.projectId = record.projectId ?? "runa:personal";
    state.projectName = catalogs[activeExperience].projects
      .find(project => project.projectId === record.projectId)?.displayName ?? null;
    state.activeChatId = record.chatId;
    state.contextRevision = record.turnCount;
    state.history = record.turns.flatMap(turn => [
      { role: "user", content: turn.user }, { role: "assistant", content: turn.assistant, evidence: turn.evidence ?? null },
    ]);
    transcript.replaceChildren();
    for (const turn of state.history) appendMessage(turn.role, turn.content, {
      codeDraft: activeExperience === "code" && turn.role === "assistant", state, evidence: turn.evidence,
    });
    renderNavigation();
    await functionPanel?.refresh();
    text("navigation-status", "");
    text("chat-status", state.projectName ? `Ready in ${state.projectName}` : "Ready");
    message.focus();
    return true;
  } catch {
    text("navigation-status", "That record could not be loaded");
    return false;
  } finally {
    setNavigationDisabled(false);
    send.disabled = false;
  }
}

function setNavigationDisabled(disabled) {
  for (const control of document.querySelectorAll(
    "#left-rail-body button, .composer-tools button, .workbar-actions button, " +
    "#right-rail-body button, #right-rail-body input, #right-rail-body select, #right-rail-body textarea",
  )) {
    control.disabled = disabled;
  }
}

async function selectFunction(name) {
  productViews?.close();
  const target = functionTarget(name);
  if (target.experience !== activeExperience) await selectExperience(target.experience);
  if (!functionPanel?.setMode(target.mode)) return;
  updateFunctionPresentation(target.mode);
  message.focus();
}

async function initialize() {
  try {
    const [runtimeResponse, readinessResponse, sessionResponse] = await Promise.all([
      fetch("/api/runtime/status", { cache: "no-store" }),
      fetch("/api/readiness/status", { cache: "no-store" }),
      fetch("/api/session/status", { cache: "no-store" }),
    ]);
    if (!runtimeResponse.ok || !readinessResponse.ok || !sessionResponse.ok) throw new Error("status unavailable");
    const [runtime, readiness, session] = await Promise.all([
      runtimeResponse.json(), readinessResponse.json(), sessionResponse.json(),
    ]);
    text("authority", `${readiness.authority} (${runtime.cutover.phase})`);
    text("release", `${runtime.running.releaseId} · ${runtime.running.commit.slice(0, 12)}`);
    text("scope", runtime.selectedScopeVersion);
    const active = readiness.authority === "active" && runtime.cutover.phase === "closed";
    text("summary", active ? "Runa's reviewed selected core is active and ready."
      : "Runa is not accepting authenticated chat while authority is unavailable.");
    text("boundary", active
      ? "Ordinary chat is available. Protected records and administrative actions remain restricted."
      : "Chat remains unavailable until the selected core reports active authority.");
    if (session.authenticated && session.sessionType === "ordinary" && active) {
      const wide = window.matchMedia?.("(min-width: 761px)").matches === true;
      initializeWorkspaceShell(document, { initialLeftExpanded: wide });
      document.body.classList.add("workspace-active");
      welcome.hidden = true;
      chat.hidden = false;
      sessionLabel.hidden = false;
      text("session-avatar", session.profile?.initials ?? "R");
      text("session-name", session.profile?.displayName ?? "Runa member");
      logout.hidden = false;
      updateExperiencePresentation();
      renderNavigation();
      await refreshNavigation();
      functionPanel = await initializeFunctionPanel({ request: workspaceJson,
        getContext: () => ({ experience: activeExperience, projectId: activeState().projectId }),
        onStatus: value => text("chat-status", value), onModeChange: updateFunctionPresentation });
      productViews = initializeProductViews(document, { request: workspaceJson,
        experience: () => activeExperience, openChat: loadChat, resultContext: currentResultContext });
      message.focus();
    } else if (session.authenticated) {
      sessionLabel.hidden = false;
      text("session-avatar", "R");
      text("session-name", "Protected owner session");
    }
  } catch {
    text("summary", "Runa's service status is unavailable. No authority is inferred.");
    text("boundary", "Chat is disabled until service and session status can be verified.");
  }
}

for (const button of document.querySelectorAll(".function-choice[data-function]")) {
  button.addEventListener("click", async () => {
    closeMenus();
    await selectFunction(button.dataset.function);
    if (button.dataset.startNew === "true") await startNew();
  });
}
byId("new-chat").addEventListener("click", () => toggleMenu("new-chat", "new-work-menu"));
byId("composer-add").addEventListener("click", () => toggleMenu("composer-add", "composer-add-menu"));
byId("function-picker").addEventListener("click", () => toggleMenu("function-picker", "function-menu"));
byId("work-actions").addEventListener("click", () => toggleMenu("work-actions", "work-actions-menu"));
byId("composer-create-project").addEventListener("click", () => {
  closeMenus();
  expandRail("left");
  projectForm.hidden = false;
  projectName.focus();
});
byId("composer-use-sources").addEventListener("click", async () => {
  closeMenus();
  await selectFunction("research");
  expandRail("right");
});
byId("composer-use-code").addEventListener("click", async () => {
  closeMenus();
  await selectFunction("code");
  expandRail("right");
});
byId("new-project").addEventListener("click", () => {
  projectForm.hidden = false;
  projectName.focus();
});
byId("cancel-project").addEventListener("click", () => {
  projectForm.hidden = true;
  projectName.value = "";
});

document.addEventListener("click", event => {
  if (!event.target.closest?.(".new-work-control, .composer-menu-control, .workbar-actions")) closeMenus();
});

for (const button of document.querySelectorAll("[data-conversation-action]")) {
  button.addEventListener("click", async () => {
    closeMenus();
    const state = activeState();
    const action = button.dataset.conversationAction;
    if (!state.activeChatId) { text("chat-status", "Save a conversation before using conversation actions"); return; }
    if (action === "export") {
      const record = { schemaVersion: "runaai-conversation-export/v1", title: byId("work-title").textContent,
        experience: activeExperience, project: state.projectName ?? "Personal", turns: state.history };
      const href = URL.createObjectURL(new Blob([`${JSON.stringify(record, null, 2)}\n`], { type: "application/json" }));
      const link = document.createElement("a"); link.href = href; link.download = `${state.activeChatId}.json`;
      link.click(); URL.revokeObjectURL(href); text("chat-status", "Conversation export prepared"); return;
    }
    let title;
    if (action === "rename") {
      title = window.prompt("Rename conversation", byId("work-title").textContent)?.replace(/\s+/g, " ").trim();
      if (!title) return;
    }
    if (action === "delete" && !window.confirm("Delete this conversation? It will be retained as a recoverable soft deletion.")) return;
    setNavigationDisabled(true); send.disabled = true;
    try {
      const result = await workspaceJson("/api/selected/conversation/manage", {
        action, experience: activeExperience, chatId: state.activeChatId, ...(title ? { title } : {}),
        requestId: `web-conversation-${crypto.randomUUID()}`,
      });
      if (action === "branch") {
        await refreshNavigation(); await loadChat(result.chatId);
        text("chat-status", "Conversation branch created");
      } else if (action === "rename") {
        const record = catalogs[activeExperience].chats.find(item => item.chatId === state.activeChatId);
        if (record) record.title = result.title;
        renderNavigation(); text("chat-status", "Conversation renamed");
      } else {
        await startNew(state.projectId, state.projectName); await refreshNavigation();
        text("chat-status", action === "archive" ? "Conversation archived" : "Conversation deleted recoverably");
      }
    } catch { text("chat-status", `Conversation could not be ${action}d`); }
    finally { setNavigationDisabled(false); send.disabled = false; }
  });
}

projectForm.addEventListener("submit", async event => {
  event.preventDefault();
  const displayName = projectName.value.replace(/\s+/g, " ").trim();
  if (!displayName) return;
  text("navigation-status", "Creating project…");
  setNavigationDisabled(true);
  send.disabled = true;
  try {
    const result = await workspaceJson("/api/selected/projects", {
      requestId: `web-project-${crypto.randomUUID()}`, experience: activeExperience, displayName,
    });
    projectForm.hidden = true;
    projectName.value = "";
    await refreshNavigation();
    startNew(result.projectId, result.displayName);
  } catch {
    text("navigation-status", "Project could not be created");
  } finally {
    setNavigationDisabled(false);
    send.disabled = false;
  }
});

function stopDisplayingActiveAnswer() {
  if (!activeAnswerController) return false;
  answerStoppedByUser = true;
  send.disabled = true;
  send.textContent = "Reconciling…";
  send.setAttribute("aria-label", "Waiting for the server outcome");
  text("chat-status", "Stopped displaying progress. Successor work stays blocked until the server returns the request outcome.");
  return true;
}

send.addEventListener("click", event => {
  if (activeAnswerController) {
    event.preventDefault();
    stopDisplayingActiveAnswer();
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (activeAnswerController) {
    stopDisplayingActiveAnswer();
    return;
  }
  const content = message.value.trim();
  if (!content || send.disabled) return;
  if (functionPanel?.workSelected()) {
    send.disabled = true;
    setNavigationDisabled(true);
    try { if (await functionPanel.startWork(content)) message.value = ""; }
    finally { send.disabled = false; setNavigationDisabled(false); }
    return;
  }
  let functionSelection;
  try { functionSelection = functionPanel?.answerSelection() ?? {}; }
  catch { text("chat-status", "Select one through six source sections before asking for research or review."); return; }
  const state = activeState();
  const submittedExperience = activeExperience;
  const userItem = appendMessage("user", content);
  message.value = "";
  send.textContent = "Stop display";
  send.setAttribute("aria-label", "Stop displaying progress for this response");
  setNavigationDisabled(true);
  text("chat-status", functionSelection.lane === "research"
    ? "Research: reading the selected supplied sources and checking the cited report…"
    : "Runa is thinking…");
  let outcomeUnconfirmed = false;
  try {
    activeAnswerController = new AbortController();
    answerStoppedByUser = false;
    const timer = setTimeout(() => activeAnswerController?.abort(), CHAT_DEADLINE_MS);
    let result;
    try {
      const response = await fetch("/api/selected/answer", {
        method: "POST", headers: { "content-type": "application/json" }, signal: activeAnswerController.signal,
        body: JSON.stringify({ requestId: `web-${crypto.randomUUID()}`,
          lane: submittedExperience === "code" ? "code" : "general", experience: submittedExperience,
          ...functionSelection,
          threadId: state.threadId, projectId: state.projectId, message: content,
          contextRevision: state.contextRevision,
          history: boundedHistory(state.history) }),
      });
      result = await readJsonResponse(response);
    } finally { clearTimeout(timer); }
    if (answerNeedsRetry(result)) {
      appendMessage("assistant", result.answer, { evidence: result });
      addRetry(userItem, content);
      text("chat-status", answerStoppedByUser
        ? "Stopped request reconciled — no completed answer was retained; retry is available"
        : "Message not completed — retry available");
      return;
    }
    state.history.push({ role: "user", content: content.slice(0, 8_000) },
      { role: "assistant", content: result.answer.slice(0, 8_000), evidence: result });
    state.activeChatId = state.threadId;
    state.contextRevision = result.contextRevision ?? state.contextRevision + (result.continuity?.turnRecorded ? 1 : 0);
    appendMessage("assistant", result.answer, {
      codeDraft: submittedExperience === "code" && result.execution?.status === "not-executed",
      state, evidence: result,
    });
    text("chat-status", answerStoppedByUser ? "Stopped request reconciled — the server completed and saved the answer"
      : state.projectName ? `Ready in ${state.projectName}` : "Ready");
    await refreshNavigation(submittedExperience);
  } catch (error) {
    if (error?.name === "AbortError" || !error?.code) {
      outcomeUnconfirmed = true;
      appendMessage("assistant", "This browser did not receive the server outcome. This conversation remains blocked; reload its saved record after service connectivity is restored before starting successor work.");
      text("chat-status", "Server outcome unconfirmed — successor work is blocked");
      return;
    }
    const code = error?.name === "AbortError" ? "chat-request-timeout" : error?.code;
    if (code === "conversation-revision-conflict") {
      const loaded = await loadChat(state.threadId);
      message.value = content;
      text("chat-status", loaded
        ? "This chat changed in another view. The latest record is loaded; your draft is ready to review and resend."
        : "This chat changed in another view, but the latest record could not be loaded. Your draft is preserved. Reload the saved chat before resending.");
      return;
    }
    appendMessage("assistant", customerMessageFor(code));
    addRetry(userItem, content);
    text("chat-status", "Message not completed — retry available");
  } finally {
    activeAnswerController = null;
    answerStoppedByUser = false;
    send.textContent = "Send";
    send.setAttribute("aria-label", "Send message");
    send.disabled = outcomeUnconfirmed;
    setNavigationDisabled(outcomeUnconfirmed);
    if (!outcomeUnconfirmed) message.focus();
  }
});

message.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

logout.addEventListener("click", async () => {
  logout.disabled = true;
  try {
    const response = await fetch("/session/user/logout", { method: "POST" });
    if (!response.ok) throw new Error("logout failed");
    location.assign("/");
  } catch {
    logout.disabled = false;
    text("chat-status", "Sign out could not be completed");
  }
});

await initialize();
