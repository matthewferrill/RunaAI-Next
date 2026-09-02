import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const publicFile = name => new URL(`../gate6b/public/${name}`, import.meta.url);

function startTag(html, id) {
  const match = html.match(new RegExp(`<(?:button|aside|div)[^>]*id="${id}"[^>]*>`));
  assert.ok(match, `${id} start tag must exist`);
  return match[0];
}

function cssHexToken(styles, name) {
  const match = styles.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `${name} must be a six-digit hex color`);
  return match[1];
}

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(channel => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + .05) / (darker + .05);
}

test("the authenticated page preserves the left rail, central chat, and empty right rail", async () => {
  const html = await readFile(publicFile("index.html"), "utf8");
  assert.match(html, /id="chat" class="workspace-frame"/);
  assert.match(html,
    /<section id="chat" class="workspace-frame"[^>]*>\s*<aside id="left-rail"[\s\S]*?<\/aside>\s*<section class="chat-panel"[\s\S]*?<\/section>\s*<aside id="right-rail"[\s\S]*?<\/aside>\s*<\/section>/,
    "the two rails and central chat must be direct workspace-frame children in that order");

  for (const [side, bodyId] of [["left", "left-rail-body"], ["right", "right-rail-body"]]) {
    const toggle = startTag(html, `${side}-rail-toggle`);
    assert.match(toggle, /type="button"/);
    assert.match(toggle, new RegExp(`aria-label="Expand ${side} panel"`));
    assert.match(toggle, new RegExp(`aria-controls="${bodyId}"`));
    assert.match(toggle, /aria-expanded="false"/);
  }
  assert.match(html, /id="left-rail-body"[^>]+aria-hidden="true"/);
  assert.match(html, /id="right-rail-body"[^>]+aria-hidden="true"[^>]*><\/div>/);
  const right = html.indexOf('id="right-rail"');
  const rightMarkup = html.slice(right, html.indexOf("</aside>", right));
  assert.doesNotMatch(rightMarkup, /Projects|Research|Sources|Settings|Memory|Actions|History/i);
});

test("the presentation keeps a fixed workspace, sibling desktop columns, transcript scroll, and visible focus", async () => {
  const styles = await readFile(publicFile("styles.css"), "utf8");
  assert.match(styles, /\.workspace-frame\s*\{[^}]*grid-template-columns:\s*var\(--left-rail-width\) minmax\(0, 1fr\) var\(--right-rail-width\)/s);
  assert.match(styles, /--left-rail-width:\s*3\.75rem/);
  assert.match(styles, /--right-rail-width:\s*0rem/);
  assert.match(styles, /\.workspace-frame\.left-expanded\s*\{[^}]*--left-rail-width:/s);
  assert.match(styles, /\.workspace-frame\.right-expanded\s*\{[^}]*--right-rail-width:/s);
  assert.match(styles, /\.workspace-frame\s*\{[^}]*height:\s*calc\(100dvh - 4\.5rem\)/s);
  assert.match(styles, /\.workspace-rail-left\s*\{[^}]*grid-column:\s*1/s);
  assert.match(styles, /\.chat-panel\s*\{[^}]*grid-column:\s*2/s);
  assert.match(styles, /\.workspace-rail-right\s*\{[^}]*grid-column:\s*3/s);
  assert.match(styles, /\.transcript\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.rail-toggle:focus-visible/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)/);
  assert.match(styles, /body\.workspace-active/);
  assert.ok(contrastRatio(cssHexToken(styles, "workspace-accent"), "#ffffff") >= 4.5,
    "white Send text must retain normal-text contrast on the accent");
  assert.ok(contrastRatio(cssHexToken(styles, "workspace-ink-faint"), "#ffffff") >= 4.5,
    "status and placeholder text must retain normal-text contrast");
  assert.ok(contrastRatio(cssHexToken(styles, "workspace-field-edge"), "#ffffff") >= 3,
    "the textarea boundary must retain non-text contrast");
  assert.match(styles, /\.composer\s*\{[^}]*border:\s*1px solid var\(--workspace-edge-low\)/s);
});

test("the ordinary-session controller initializes the shell only when active chat is shown", async () => {
  const status = await readFile(publicFile("status.js"), "utf8");
  assert.match(status, /import\s*\{\s*initializeWorkspaceShell\s*\}\s*from\s*"\.\/workspace-shell\.mjs"/);
  const activeBranch = 'if (session.authenticated && session.sessionType === "ordinary" && active) {';
  const branchStart = status.indexOf(activeBranch);
  const shellInitialization = status.indexOf("initializeWorkspaceShell(document,");
  const nextBranch = status.indexOf("} else if (session.authenticated)", branchStart);
  assert.notEqual(branchStart, -1);
  assert.ok(shellInitialization > branchStart, "the shell must not initialize before active ordinary chat is known");
  assert.ok(shellInitialization < nextBranch, "the shell must initialize inside the active ordinary branch");
  assert.match(status.slice(branchStart, nextBranch), /document\.body\.classList\.add\("workspace-active"\)/);
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
