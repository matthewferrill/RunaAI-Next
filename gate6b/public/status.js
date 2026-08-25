import { CHAT_DEADLINE_MS, answerNeedsRetry, boundedHistory, customerMessageFor,
  readJsonResponse } from "./chat-client.mjs";
import { initializeWorkspaceShell } from "./workspace-shell.mjs";
import { executionOutput, javascriptSource } from "./code-execution.mjs";

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
  projectId: "runa:personal", projectName: null, activeChatId: null, history: [],
}]));
const catalogs = Object.fromEntries(experiences.map(experience => [experience, { projects: [], chats: [] }]));
let activeExperience = "chat";

const workspaceHeaders = Object.freeze({ "content-type": "application/json", "x-runa-workspace": "1" });
const activeState = () => states[activeExperience];
const greeting = () => activeExperience === "code"
  ? "Hi. What would you like to design, understand, or draft in code?"
  : "Hi. What would you like to talk about?";

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

function appendMessage(role, content, { codeDraft = false, state = null } = {}) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "Runa";
  const body = document.createElement("p");
  body.textContent = content;
  item.append(label, body);
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
      run.addEventListener("click", () => runJavascript({ item, source, state }));
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
  for (const experience of experiences) {
    const selected = experience === activeExperience;
    const tab = byId(`${experience}-tab`);
    tab.classList.toggle("selected", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  text("records-heading", code ? "Code chat records" : "Chat records");
  byId("record-list").setAttribute("aria-label", code ? "Code chat records" : "Chat records");
  text("experience-eyebrow", code ? "Private code chat" : "Private chat");
  text("chat-title", code ? "Code with Runa" : "Chat with Runa");
  text("experience-description", code
    ? "Discuss, explain, and draft code in a separate private workspace. JavaScript drafts are not run until you choose Run in sandbox. The sandbox cannot access your files, network, or systems."
    : "Ask questions, brainstorm, draft writing, and work with text you paste here. Runa does not have live web access and cannot change files, settings, or systems from this chat.");
  message.placeholder = code ? "Ask about or draft code…" : "Type your message…";
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

function startNew(projectId = "runa:personal", selectedProjectName = null) {
  const state = activeState();
  state.threadId = `web-${activeExperience}-${crypto.randomUUID()}`;
  state.projectId = projectId;
  state.projectName = selectedProjectName;
  state.activeChatId = null;
  state.history = [];
  resetTranscript();
  renderNavigation();
  text("chat-status", selectedProjectName ? `New chat in ${selectedProjectName}` : "Ready");
  message.focus();
}

async function selectExperience(experience) {
  if (!experiences.includes(experience) || experience === activeExperience) return;
  activeExperience = experience;
  projectForm.hidden = true;
  projectName.value = "";
  updateExperiencePresentation();
  const state = activeState();
  resetTranscript();
  for (const turn of state.history) appendMessage(turn.role, turn.content, {
    codeDraft: activeExperience === "code" && turn.role === "assistant", state,
  });
  renderNavigation();
  await refreshNavigation(experience);
  text("chat-status", state.projectName ? `Ready in ${state.projectName}` : "Ready");
  message.focus();
}

async function loadChat(chatId) {
  text("navigation-status", "Loading…");
  setNavigationDisabled(true);
  send.disabled = true;
  try {
    const record = await workspaceJson("/api/selected/chat/read", { experience: activeExperience, chatId });
    const state = activeState();
    state.threadId = record.chatId;
    state.projectId = record.projectId ?? "runa:personal";
    state.projectName = catalogs[activeExperience].projects
      .find(project => project.projectId === record.projectId)?.displayName ?? null;
    state.activeChatId = record.chatId;
    state.history = record.turns.flatMap(turn => [
      { role: "user", content: turn.user }, { role: "assistant", content: turn.assistant },
    ]);
    transcript.replaceChildren();
    for (const turn of state.history) appendMessage(turn.role, turn.content, {
      codeDraft: activeExperience === "code" && turn.role === "assistant", state,
    });
    renderNavigation();
    text("navigation-status", "");
    text("chat-status", state.projectName ? `Ready in ${state.projectName}` : "Ready");
    message.focus();
  } catch {
    text("navigation-status", "That record could not be loaded");
  } finally {
    setNavigationDisabled(false);
    send.disabled = false;
  }
}

function setNavigationDisabled(disabled) {
  for (const button of document.querySelectorAll("#left-rail-body button")) button.disabled = disabled;
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

for (const experience of experiences) {
  const tab = byId(`${experience}-tab`);
  tab.addEventListener("click", () => selectExperience(experience));
  tab.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const next = experience === "chat" ? "code" : "chat";
    byId(`${next}-tab`).focus();
    selectExperience(next);
  });
}
byId("new-chat").addEventListener("click", () => startNew());
byId("new-project").addEventListener("click", () => {
  projectForm.hidden = false;
  projectName.focus();
});
byId("cancel-project").addEventListener("click", () => {
  projectForm.hidden = true;
  projectName.value = "";
});

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

form.addEventListener("submit", async event => {
  event.preventDefault();
  const content = message.value.trim();
  if (!content || send.disabled) return;
  const state = activeState();
  const submittedExperience = activeExperience;
  const userItem = appendMessage("user", content);
  message.value = "";
  send.disabled = true;
  setNavigationDisabled(true);
  text("chat-status", "Runa is thinking…");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAT_DEADLINE_MS);
    let result;
    try {
      const response = await fetch("/api/selected/answer", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ requestId: `web-${crypto.randomUUID()}`,
          lane: submittedExperience === "code" ? "code" : "general", experience: submittedExperience,
          threadId: state.threadId, projectId: state.projectId, message: content,
          history: boundedHistory(state.history) }),
      });
      result = await readJsonResponse(response);
    } finally { clearTimeout(timer); }
    if (answerNeedsRetry(result)) {
      appendMessage("assistant", result.answer);
      addRetry(userItem, content);
      text("chat-status", "Message not completed — retry available");
      return;
    }
    state.history.push({ role: "user", content: content.slice(0, 8_000) },
      { role: "assistant", content: result.answer.slice(0, 8_000) });
    state.activeChatId = state.threadId;
    appendMessage("assistant", result.answer, {
      codeDraft: submittedExperience === "code" && result.execution?.status === "not-executed",
      state,
    });
    text("chat-status", state.projectName ? `Ready in ${state.projectName}` : "Ready");
    await refreshNavigation(submittedExperience);
  } catch (error) {
    const code = error?.name === "AbortError" ? "chat-request-timeout" : error?.code;
    appendMessage("assistant", customerMessageFor(code));
    addRetry(userItem, content);
    text("chat-status", "Message not completed — retry available");
  } finally {
    send.disabled = false;
    setNavigationDisabled(false);
    message.focus();
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
