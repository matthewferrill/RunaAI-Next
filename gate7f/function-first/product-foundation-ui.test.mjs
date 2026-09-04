import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const load = name => readFile(resolve("gate6b/public", name), "utf8");

test("the single canvas exposes product navigation without pretending connections are active", async () => {
  const [html, views, status, artifacts] = await Promise.all([load("index.html"), load("product-views.mjs"),
    load("status.js"), load("artifact-results.mjs")]);
  for (const view of ["search", "files", "tasks", "connections", "settings"]) {
    assert.match(html, new RegExp(`data-workspace-view="${view}"`, "u"));
  }
  assert.match(html, /id="product-view"/u);
  for (const action of ["rename", "branch", "archive", "export", "delete"]) {
    assert.match(html, new RegExp(`data-conversation-action="${action}"`, "u"));
  }
  assert.match(views, /Local folders[\s\S]*Known · not enabled/u);
  assert.match(views, /Local Git[\s\S]*Known · not enabled/u);
  assert.match(views, /GitHub[\s\S]*Not configured/u);
  assert.match(views, /Web research[\s\S]*Not configured/u);
  assert.doesNotMatch(views, /Local folders[\s\S]{0,80}(?:Connect|Enable|Browse)/u);
  assert.match(status, /Stopped displaying progress[\s\S]*Successor work stays blocked/u);
  assert.match(status, /outcomeUnconfirmed = true/u);
  assert.match(status, /send\.disabled = outcomeUnconfirmed/u);
  assert.match(status, /setNavigationDisabled\(outcomeUnconfirmed\)/u);
  assert.match(status, /#right-rail-body button/u);
  assert.match(status, /function stopDisplayingActiveAnswer\(\)/u);
  assert.doesNotMatch(status, /function stopDisplayingActiveAnswer\(\)[\s\S]{0,400}activeAnswerController\.abort\(\)/u);
  assert.match(views, /renderArtifactResults\(\{ root, container: content, request, context: resultContext\(\)/u);
  assert.match(status, /resultContext: currentResultContext/u);
  assert.match(artifacts, /operation: "result\.list"/u);
  assert.match(artifacts, /operation: "result\.read"/u);
  assert.match(artifacts, /content\.textContent = verified\.text/u);
  assert.doesNotMatch(artifacts, /innerHTML|insertAdjacentHTML|DOMParser/u);
});

test("Settings contains the accepted information architecture and bounded editable preferences", async () => {
  const views = await load("product-views.mjs");
  for (const label of ["General", "Appearance & accessibility", "Account & privacy", "Memory & personalization",
    "Models & routing", "Systems", "Connections", "Approvals", "Advanced diagnostics"]) assert.match(views, new RegExp(label, "u"));
  for (const key of ["theme", "textSize", "density", "reducedMotion"]) assert.match(views, new RegExp(key, "u"));
  assert.match(views, /\["textSize", "textSize"\]/u);
  assert.match(views, /\["reducedMotion", "reducedMotion"\]/u);
  assert.doesNotMatch(views, /document\.body\.dataset\[(?:"text-size"|"reduced-motion")\]/u);
  assert.match(views, /select\.value = settings\[key\]/u);
  assert.match(views, /Gemma is fixed as the primary for Chat, Research, Code, Agent and Review/u);
  assert.doesNotMatch(views, /<option[^>]*>.*(?:Qwen|Coder)/u);
});

test("actual-system presentation preserves unknown lease and residency instead of inferring health", async () => {
  const views = await load("product-views.mjs");
  assert.match(views, /\["Lease", status\.home\.lease\]/u);
  assert.match(views, /\["Residency", status\.home\.residency\]/u);
  assert.match(views, /No authority or model readiness is inferred/u);
});

test("async product views cannot overwrite a newer destination", async () => {
  const views = await load("product-views.mjs");
  assert.match(views, /let viewGeneration = 0/u);
  assert.match(views, /const generation = \+\+viewGeneration/u);
  assert.match(views, /const isCurrent = generation => generation === viewGeneration/u);
  assert.match(views, /if \(!isCurrent\(generation\)\) return/u);
  assert.match(views, /action: "unarchive"[\s\S]{0,240}if \(!isCurrent\(generation\)\) return/u);
});

test("the owned PostgreSQL proof starts from the exact predecessor settings constraint", async () => {
  const proof = await readFile(resolve("gate7f/function-first/conversation-postgres-integration.mjs"), "utf8");
  assert.match(proof, /setting_value text NOT NULL CHECK\(setting_value IN \('Low','Medium','High'\)\)/u);
  assert.match(proof, /predecessorSettingsConstraintMigratesWithoutDataLoss/u);
});
