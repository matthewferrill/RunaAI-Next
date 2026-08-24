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
const history = [];
const threadId = `web-${crypto.randomUUID()}`;

function appendMessage(role, content) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "Runa";
  const body = document.createElement("p");
  body.textContent = content;
  item.append(label, body);
  transcript.append(item);
  item.scrollIntoView({ block: "end", behavior: "smooth" });
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
      welcome.hidden = true;
      chat.hidden = false;
      sessionLabel.hidden = false;
      sessionLabel.textContent = "Ordinary member";
      logout.hidden = false;
      message.focus();
    } else if (session.authenticated) {
      sessionLabel.hidden = false;
      sessionLabel.textContent = "Protected owner session";
    }
  } catch {
    text("summary", "Runa's service status is unavailable. No authority is inferred.");
    text("boundary", "Chat is disabled until service and session status can be verified.");
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const content = message.value.trim();
  if (!content || send.disabled) return;
  appendMessage("user", content);
  message.value = "";
  send.disabled = true;
  text("chat-status", "Runa is thinking…");
  try {
    const response = await fetch("/api/selected/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: `web-${crypto.randomUUID()}`, lane: "general",
        threadId, projectId: "runa:personal", message: content, history: history.slice(-24) }),
    });
    const result = await response.json();
    if (!response.ok || typeof result.answer !== "string") {
      throw new Error(typeof result.errorCode === "string" ? result.errorCode : "chat-request-failed");
    }
    history.push({ role: "user", content: content.slice(0, 8000) },
      { role: "assistant", content: result.answer.slice(0, 8000) });
    appendMessage("assistant", result.answer);
    text("chat-status", "Ready");
  } catch (error) {
    appendMessage("assistant", `I could not complete that message (${error.message}). Please try again.`);
    text("chat-status", "Message not completed");
  } finally {
    send.disabled = false;
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

