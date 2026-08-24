import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const publicFile = name => new URL(`../gate6b/public/${name}`, import.meta.url);

function startTag(html, id) {
  const match = html.match(new RegExp(`<(?:button|aside|div)[^>]*id="${id}"[^>]*>`));
  assert.ok(match, `${id} start tag must exist`);
  return match[0];
}

test("the authenticated page reserves an unlabeled left rail, central chat, and unlabeled right rail", async () => {
  const html = await readFile(publicFile("index.html"), "utf8");
  assert.match(html, /id="chat" class="workspace-shell"/);
  assert.match(html,
    /<section id="chat" class="workspace-shell"[^>]*>\s*<aside id="left-rail"[\s\S]*?<\/aside>\s*<section class="chat-panel"[\s\S]*?<\/section>\s*<aside id="right-rail"[\s\S]*?<\/aside>\s*<\/section>/,
    "the two rails and central chat must be direct workspace-shell children in that order");

  for (const [side, bodyId] of [["left", "left-rail-body"], ["right", "right-rail-body"]]) {
    const toggle = startTag(html, `${side}-rail-toggle`);
    assert.match(toggle, /type="button"/);
    assert.match(toggle, new RegExp(`aria-label="Expand ${side} panel"`));
    assert.match(toggle, new RegExp(`aria-controls="${bodyId}"`));
    assert.match(toggle, /aria-expanded="false"/);
  }
  assert.match(html, /id="left-rail-body"[^>]+aria-hidden="true"[^>]*><\/div>/);
  assert.match(html, /id="right-rail-body"[^>]+aria-hidden="true"[^>]*><\/div>/);

  const left = html.indexOf('id="left-rail"');
  const center = html.indexOf('class="chat-panel"');
  const right = html.indexOf('id="right-rail"');
  const railMarkup = `${html.slice(left, center)}\n${html.slice(right, html.indexOf("</section>", right))}`;
  assert.doesNotMatch(railMarkup, /Projects|Research|Sources|Settings|Memory|Actions|History/i);
});

test("the presentation keeps a fixed workspace, sibling desktop columns, transcript scroll, and visible focus", async () => {
  const styles = await readFile(publicFile("styles.css"), "utf8");
  assert.match(styles, /\.workspace-shell\s*\{[^}]*grid-template-columns:\s*var\(--left-rail-width\) minmax\(0, 1fr\) var\(--right-rail-width\)/s);
  assert.match(styles, /--left-rail-width:\s*4rem/);
  assert.match(styles, /--right-rail-width:\s*4rem/);
  assert.match(styles, /\.workspace-shell\.left-expanded\s*\{[^}]*--left-rail-width:/s);
  assert.match(styles, /\.workspace-shell\.right-expanded\s*\{[^}]*--right-rail-width:/s);
  assert.match(styles, /\.workspace-shell\s*\{[^}]*height:\s*calc\(100dvh - 4\.5rem\)/s);
  assert.match(styles, /\.transcript\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.rail-toggle:focus-visible/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)/);
  assert.match(styles, /body\.workspace-active/);
});

test("the ordinary-session controller initializes the shell only when active chat is shown", async () => {
  const status = await readFile(publicFile("status.js"), "utf8");
  assert.match(status, /import\s*\{\s*initializeWorkspaceShell\s*\}\s*from\s*"\.\/workspace-shell\.mjs"/);
  assert.match(status, /initializeWorkspaceShell\(document\)/);
  assert.match(status,
    /if \(session\.authenticated && session\.sessionType === "ordinary" && active\) \{[\s\S]*?document\.body\.classList\.add\("workspace-active"\)/);
});

class FakeClassList {
  values = new Set();
  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
    return force;
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.listeners = new Map();
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  dispatch(type, event = {}) { this.listeners.get(type)?.(event); }
}

test("rail controls synchronize accessible state independently and Escape collapses both", () => {
  const shell = { classList: new FakeClassList() };
  const leftButton = new FakeElement({ "aria-expanded": "false" });
  const leftBody = new FakeElement({ "aria-hidden": "true" });
  const rightButton = new FakeElement({ "aria-expanded": "false" });
  const rightBody = new FakeElement({ "aria-hidden": "true" });
  const elements = new Map([
    ["chat", shell],
    ["left-rail-toggle", leftButton],
    ["left-rail-body", leftBody],
    ["right-rail-toggle", rightButton],
    ["right-rail-body", rightBody],
  ]);
  const listeners = new Map();
  const root = {
    getElementById: id => elements.get(id) ?? null,
    addEventListener: (type, listener) => listeners.set(type, listener),
  };

  return import("../gate6b/public/workspace-shell.mjs").then(({ initializeWorkspaceShell }) => {
  const controller = initializeWorkspaceShell(root);
  leftButton.dispatch("click");
  assert.equal(shell.classList.contains("left-expanded"), true);
  assert.equal(shell.classList.contains("right-expanded"), false);
  assert.equal(leftButton.getAttribute("aria-expanded"), "true");
  assert.equal(leftBody.getAttribute("aria-hidden"), "false");

  rightButton.dispatch("click");
  assert.equal(shell.classList.contains("left-expanded"), true);
  assert.equal(shell.classList.contains("right-expanded"), true);
  assert.equal(rightButton.getAttribute("aria-expanded"), "true");
  assert.equal(rightBody.getAttribute("aria-hidden"), "false");

  listeners.get("keydown")({ key: "Escape" });
  assert.equal(shell.classList.contains("left-expanded"), false);
  assert.equal(shell.classList.contains("right-expanded"), false);
  assert.equal(leftButton.getAttribute("aria-expanded"), "false");
  assert.equal(rightButton.getAttribute("aria-expanded"), "false");
  assert.equal(leftBody.getAttribute("aria-hidden"), "true");
  assert.equal(rightBody.getAttribute("aria-hidden"), "true");
  controller.destroy();
  });
});

test("the shell controller has no network or browser-persistence behavior", async () => {
  const source = await readFile(publicFile("workspace-shell.mjs"), "utf8");
  assert.doesNotMatch(source, /fetch\s*\(|localStorage|sessionStorage|document\.cookie/);
});
