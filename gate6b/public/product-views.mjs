import { renderArtifactResults } from "./artifact-results.mjs";

const settingLabels = Object.freeze({
  theme: "Theme", textSize: "Text size", density: "Density", reducedMotion: "Reduced motion",
});
const settingOptions = Object.freeze({
  theme: [["system", "Use system"], ["dawn", "Dawn"], ["dark", "Dark"]],
  textSize: [["small", "Small"], ["medium", "Medium"], ["large", "Large"]],
  density: [["comfortable", "Comfortable"], ["compact", "Compact"]],
  reducedMotion: [["system", "Use system"], ["reduce", "Reduce"], ["allow", "Allow"]],
});
const connections = Object.freeze([
  ["Local folders", "Known · not enabled", "The actual Omen/Control folder bridge is the next governed connection slice."],
  ["Local Git", "Known · not enabled", "Repository status and diffs remain unavailable until a folder is explicitly authorized."],
  ["GitHub", "Not configured", "No account, token, scopes, publication or CI authority is configured."],
  ["Web research", "Not configured", "Current Research uses only supplied source sections."],
]);
const settingsTabs = Object.freeze([
  ["general", "General"], ["appearance", "Appearance & accessibility"], ["account", "Account & privacy"],
  ["memory", "Memory & personalization"], ["models", "Models & routing"], ["systems", "Systems"],
  ["connections", "Connections"], ["approvals", "Approvals"], ["diagnostics", "Advanced diagnostics"],
]);

function element(document, tag, className = null, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function clear(node) { node.replaceChildren(); }

export function applyUserSettings(document, values = {}) {
  for (const [key, attribute] of [["theme", "theme"], ["textSize", "textSize"],
    ["density", "density"], ["reducedMotion", "reducedMotion"]]) {
    if (typeof values[key] === "string") document.body.dataset[attribute] = values[key];
  }
}

export function initializeProductViews(root = document, { request, experience, openChat,
  resultContext = () => null }) {
  const view = root.getElementById("product-view");
  const conversation = root.getElementById("conversation-surface");
  const composer = root.getElementById("chat-form");
  const actions = root.getElementById("work-actions");
  let active = null;
  let settings = null;
  let viewGeneration = 0;

  function showShell(title, eyebrow = "RunaAI workspace", activeName = title.toLowerCase()) {
    const generation = ++viewGeneration;
    active = activeName;
    conversation.hidden = true;
    composer.hidden = true;
    actions.hidden = true;
    view.hidden = false;
    clear(view);
    const header = element(root, "div", "product-view-header");
    const copy = element(root, "div");
    copy.append(element(root, "p", "eyebrow", eyebrow), element(root, "h1", null, title));
    const back = element(root, "button", "quiet-button", "Back to conversation");
    back.type = "button";
    back.addEventListener("click", close);
    header.append(copy, back);
    view.append(header);
    for (const button of root.querySelectorAll("[data-workspace-view]")) {
      button.classList.toggle("selected", button.dataset.workspaceView === active);
    }
    return generation;
  }

  function close() {
    viewGeneration++;
    active = null;
    view.hidden = true;
    conversation.hidden = false;
    composer.hidden = false;
    actions.hidden = false;
    for (const button of root.querySelectorAll("[data-workspace-view]")) button.classList.remove("selected");
  }

  const isCurrent = generation => generation === viewGeneration;

  function card(title, body) {
    const item = element(root, "section", "product-card");
    item.append(element(root, "h2", null, title), element(root, "p", "product-muted", body));
    return item;
  }

  function renderConnections() {
    const stack = element(root, "div", "product-stack");
    for (const [label, lifecycle, description] of connections) {
      const row = element(root, "section", "connection-row");
      const copy = element(root, "div");
      copy.append(element(root, "strong", null, label), element(root, "p", "product-muted", description));
      row.append(copy, element(root, "span", "system-state", lifecycle));
      stack.append(row);
    }
    return stack;
  }

  async function renderSystems(container, generation) {
    container.append(card("Checking actual systems", "Reading a fresh authenticated Control observation…"));
    try {
      const status = await request("/api/selected/system/status", {});
      if (!isCurrent(generation)) return;
      clear(container);
      const grid = element(root, "div", "system-grid");
      const facts = [
        ["Omen", status.omen.state, [["Observation", status.omen.observation], ["Device identity", status.omen.deviceIdentity]]],
        ["Control", status.control.state, [["Release", status.control.releaseId ?? "Unavailable"],
          ["Commit", status.control.commit?.slice(0, 12) ?? "Unavailable"], ["Authority", status.control.authority]]],
        ["Home", status.home.state, [["Configured model", status.home.configuredModel ?? "Unavailable"],
          ["Lease", status.home.lease], ["Residency", status.home.residency]]],
      ];
      for (const [name, state, rows] of facts) {
        const item = element(root, "section", "system-card");
        item.append(element(root, "h2", null, name), element(root, "span", "system-state", state));
        const list = element(root, "dl");
        for (const [label, value] of rows) {
          const row = element(root, "div"); row.append(element(root, "dt", null, label), element(root, "dd", null, String(value))); list.append(row);
        }
        item.append(list); grid.append(item);
      }
      container.append(grid, element(root, "p", "product-muted", status.home.explanation));
    } catch {
      if (!isCurrent(generation)) return;
      clear(container); container.append(card("System status unavailable", "Runa could not verify Control and Home. No authority or model readiness is inferred."));
    }
  }

  async function renderSettings(tab = "appearance") {
    const generation = showShell("Settings");
    if (!settings) {
      try { settings = (await request("/api/selected/user-settings", { action: "read" })).values; applyUserSettings(root, settings); }
      catch { settings = {}; }
    }
    if (!isCurrent(generation)) return;
    const tabs = element(root, "nav", "product-tabs");
    const content = element(root, "div", "product-stack");
    for (const [id, label] of settingsTabs) {
      const button = element(root, "button", id === tab ? "selected" : null, label);
      button.type = "button"; button.addEventListener("click", () => renderSettings(id)); tabs.append(button);
    }
    view.append(tabs, content);
    if (tab === "appearance") {
      for (const [key, label] of Object.entries(settingLabels)) {
        const row = element(root, "div", "setting-row");
        const copy = element(root, "div"); copy.append(element(root, "label", null, label),
          element(root, "small", null, "Saved for this signed-in RunaAI account."));
        const select = element(root, "select"); select.setAttribute("aria-label", label);
        for (const [value, optionLabel] of settingOptions[key]) {
          const option = element(root, "option", null, optionLabel); option.value = value;
          select.append(option);
        }
        select.value = settings[key] ?? settingOptions[key][0][0];
        select.addEventListener("change", async () => {
          select.disabled = true;
          try {
            const result = await request("/api/selected/user-settings", { action: "set", key,
              value: select.value, requestId: `web-setting-${crypto.randomUUID()}` });
            settings[key] = result.value; applyUserSettings(root, settings);
          } catch { select.value = settings[key]; }
          finally { select.disabled = false; }
        });
        row.append(copy, select); content.append(row);
      }
      return;
    }
    if (tab === "systems") return renderSystems(content, generation);
    if (tab === "connections") { content.append(renderConnections()); return; }
    const copy = {
      general: ["General", "Startup, default-project and data-location controls are not widened in this release."],
      account: ["Account and privacy", "The current session can sign out from the header. Export, retention and account deletion require their governed data lifecycle."],
      memory: ["Memory and personalization", "Conversation history is active. Approved knowledge remains separate; automatic learning is off."],
      models: ["Models and routing", `Gemma is fixed as the primary for Chat, Research, Code, Agent and Review. Default intelligence: ${settings.defaultIntelligenceLevel ?? "Medium"}.`],
      approvals: ["Approvals", "Actions retain propose, preview, approve, execute and receipt boundaries. No broad always-allow profile is enabled here."],
      diagnostics: ["Advanced diagnostics", "Open Systems for current release and dependency state. Logs and protected values are not exposed to the browser."],
    }[tab];
    content.append(card(copy[0], copy[1]));
  }

  async function renderSearch({ archived = false } = {}) {
    const generation = showShell(archived ? "Archived conversations" : "Search");
    const form = element(root, "form", "search-form");
    const input = element(root, "input"); input.type = "search"; input.maxLength = 120;
    input.placeholder = archived ? "Archived conversations" : "Search conversation titles";
    const submit = element(root, "button", "primary-button", archived ? "Reload" : "Search"); submit.type = "submit";
    if (archived) input.hidden = true;
    form.append(input, submit);
    const results = element(root, "div", "product-stack"); view.append(form, results);
    const run = async () => {
      clear(results);
      try {
        const response = await request("/api/selected/conversation/manage", archived
          ? { action: "archived", experience: experience(), requestId: `web-archived-${crypto.randomUUID()}` }
          : { action: "search", experience: experience(), query: input.value,
            requestId: `web-search-${crypto.randomUUID()}` });
        if (!isCurrent(generation)) return;
        if (!response.results.length) results.append(card("No matching conversations", archived
          ? "There are no archived conversations in this workspace." : "Try another title."));
        for (const item of response.results) {
          const button = element(root, "button", "search-result", item.title); button.type = "button";
          button.addEventListener("click", async () => {
            if (archived) {
              await request("/api/selected/conversation/manage", { action: "unarchive", experience: experience(),
                chatId: item.chatId, requestId: `web-unarchive-${crypto.randomUUID()}` });
              if (!isCurrent(generation)) return;
            }
            close(); await openChat(item.chatId);
          });
          results.append(button);
        }
      } catch {
        if (isCurrent(generation)) results.append(card("Search unavailable", "Runa could not read your conversation index."));
      }
    };
    form.addEventListener("submit", event => { event.preventDefault(); void run(); });
    if (archived) await run(); else input.focus();
  }

  async function open(name) {
    if (name === "settings") return renderSettings();
    if (name === "connections") { showShell("Connections"); view.append(renderConnections()); return; }
    if (name === "search") return renderSearch();
    if (name === "archived") return renderSearch({ archived: true });
    if (name === "files") {
      const generation = showShell("Files and artifacts", "Current verified results", "files");
      const content = element(root, "div", "product-stack"); view.append(content);
      return renderArtifactResults({ root, container: content, request, context: resultContext(),
        isCurrent: () => isCurrent(generation) });
    }
    if (name === "tasks") { showShell("Tasks"); view.append(card("No active background tasks", "Agent work appears here only after a governed task has been proposed or started.")); }
  }

  for (const button of root.querySelectorAll("[data-workspace-view]")) {
    button.addEventListener("click", () => open(button.dataset.workspaceView));
  }
  root.getElementById("show-archived")?.addEventListener("click", () => open("archived"));
  return Object.freeze({ open, close, active: () => active, applySettings: values => applyUserSettings(root, values) });
}
