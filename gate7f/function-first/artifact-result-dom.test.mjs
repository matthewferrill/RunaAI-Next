import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { admitResultList, currentResultContext, downloadVerifiedResult, renderArtifactResults, verifyResultRead }
  from "../../gate6b/public/artifact-results.mjs";
import { initializeProductViews } from "../../gate6b/public/product-views.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const listPrivacy = () => ({ schemaVersion: "runaai-result-privacy/v1",
  dataScope: "authenticated-participant-project", resultContentIncluded: false,
  resultContentSensitivity: "not-included", applicationCredentialFieldsIncluded: false,
  internalOperationalFieldsIncluded: false });
const readPrivacy = () => ({ schemaVersion: "runaai-result-privacy/v1",
  dataScope: "authenticated-participant-project", resultContentIncluded: true,
  resultContentSensitivity: "not-classified", applicationCredentialFieldsIncluded: false,
  internalOperationalFieldsIncluded: false });
const owner = () => ({ kind: "conversation", chatId: "chat-01" });

function readyDescriptor(content, overrides = {}) {
  const bytes = Buffer.from(content, "utf8"), contentSha256 = digest(bytes), sourceRevision = "b".repeat(64);
  return { schemaVersion: "runaai-m1-result-descriptor/v1", resultId: `r1.${"a".repeat(64)}`,
    owner: owner(), ownerRevision: "c".repeat(64), sourceRecordKind: "chat-turn", sourceRecordId: "turn:1",
    sourceRevision, kind: "conversation-answer", format: "txt", ordinal: 1,
    filename: "conversation-answer-000001.txt", mediaType: "text/plain; charset=utf-8",
    byteLength: bytes.length, contentSha256, readiness: "ready", errorCode: null,
    createdAt: "2026-09-04T12:00:00.000Z", provenance: { schemaVersion: "runaai-result-provenance/v1",
      type: "conversation-turn", chatId: "chat-01", turnOrdinal: 1, route: "general-chat", sourceRevision,
      evidenceSha256: "d".repeat(64), contentSha256 }, privacy: listPrivacy(), ...overrides };
}

const listFor = (resultOwner, results, ownerRevision = "c".repeat(64)) => ({ schemaVersion: "runaai-m1-result-list/v1", owner: resultOwner,
  ownerRevision, results, privacy: listPrivacy() });
const list = results => listFor(owner(), results);
const read = (descriptor, content) => ({ schemaVersion: "runaai-m1-result-read/v1", descriptor,
  encoding: "base64", contentBase64: Buffer.from(content, "utf8").toString("base64"), privacy: readPrivacy() });
const runtime = { crypto: webcrypto, atob: value => Buffer.from(value, "base64").toString("latin1"),
  btoa: value => Buffer.from(value, "latin1").toString("base64"), TextDecoder };

class TestElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument; this.tagName = tagName.toUpperCase(); this.children = [];
    this.parentNode = null; this.className = ""; this.attributes = new Map(); this.listeners = new Map();
    this.disabled = false; this.hidden = false; this.href = ""; this.download = ""; this._textContent = "";
    this.dataset = {}; this.id = "";
    this.classList = {
      toggle: (name, force) => { const values = new Set(this.className.split(/\s+/u).filter(Boolean));
        const enabled = force === undefined ? !values.has(name) : Boolean(force); if (enabled) values.add(name); else values.delete(name);
        this.className = [...values].join(" "); return enabled; },
      remove: (...names) => { const values = new Set(this.className.split(/\s+/u).filter(Boolean));
        for (const name of names) values.delete(name); this.className = [...values].join(" "); },
    };
  }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  get textContent() { return this.children.length ? this.children.map(child => child.textContent).join("") : this._textContent; }
  append(...values) { for (const value of values) { value.parentNode = this; this.children.push(value); } }
  replaceChildren(...values) { for (const child of this.children) child.parentNode = null; this.children = []; this._textContent = ""; this.append(...values); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, handler) { const handlers = this.listeners.get(type) ?? []; handlers.push(handler); this.listeners.set(type, handlers); }
  async click() { if (this.disabled) return; for (const handler of this.listeners.get("click") ?? []) await handler({ target: this }); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
}

class TestDocument {
  constructor() { this.created = []; this.ids = new Map(); this.body = this.createElement("body"); }
  createElement(tag) { const value = new TestElement(this, tag); this.created.push(value); return value; }
  register(id, tag = "div") { const value = this.createElement(tag); value.id = id; this.ids.set(id, value); return value; }
  getElementById(id) { return this.ids.get(id) ?? null; }
  querySelectorAll(selector) {
    if (selector === "[data-workspace-view]") return this.created.filter(node => typeof node.dataset.workspaceView === "string");
    return [];
  }
}

const descendants = root => root.children.flatMap(child => [child, ...descendants(child)]);
const byText = (root, tag, pattern) => descendants(root).find(node => node.tagName === tag.toUpperCase() && pattern.test(node.textContent));

function productDocument() {
  const root = new TestDocument();
  for (const [id, tag] of [["product-view", "section"], ["conversation-surface", "section"], ["chat-form", "form"],
    ["work-actions", "button"], ["show-archived", "button"]]) root.register(id, tag);
  const files = root.createElement("button"); files.dataset.workspaceView = "files"; root.body.append(files);
  return { root, files };
}

function researchMetadataText() {
  return JSON.stringify({ schemaVersion: "runaai-public-research-metadata/v1", reportStatus: "attributable",
    limitation: "Supplied\t sources only.\r\nUnicode 😀", progress: { status: "report-ready", selectedSources: 1, resolvedSources: 1,
      passesPlanned: 2, passesRun: 2, passagesRead: 1, degraded: false, truncated: false, omissionCount: 0,
      unansweredCount: 0 }, citations: [{ ordinal: 1, sourceId: "source-01", sectionId: "provided",
      contentSha256: "f".repeat(64) }], checker: { attempted: true, corrected: false, attemptCount: 1,
      finalAnswerOrigin: "primary" }, missingEvidence: [] });
}

function reviewMetadataText() {
  return JSON.stringify({ schemaVersion: "runaai-public-review-metadata/v1", status: "accepted-primary",
    contexts: [{ contextType: "artifact", targetId: "artifact-01", sourceId: "source-01", sectionId: "provided",
      contentSha256: "f".repeat(64) }], checker: { initialVerdict: "accept", finalVerdict: "accept",
      revisionPasses: 0, attemptCount: 1, finalAnswerOrigin: "primary" },
    findings: [{ findingId: "finding-01", severity: "unclassified", citationOrdinals: [1] }] });
}

function conversationPair(type) {
  const review = type === "review", reportText = review ? "Accepted review finding [1]." : "Attributable report [1].";
  const metadataText = review ? reviewMetadataText() : researchMetadataText();
  const route = review ? "review-chat" : "research-chat", reportKind = `${type}-report`, metadataKind = `${type}-metadata`;
  const reportBase = readyDescriptor(reportText), metadataBase = readyDescriptor(metadataText);
  const report = { ...reportBase, kind: reportKind, filename: `${reportKind}-000001.txt`,
    provenance: { ...reportBase.provenance, route } };
  const metadata = { ...metadataBase, resultId: `r1.${"e".repeat(64)}`, kind: metadataKind, format: "json", ordinal: 2,
    filename: `${metadataKind}-000002.json`, mediaType: "application/json; charset=utf-8",
    provenance: { ...metadataBase.provenance, route } };
  return { report, metadata, reportText, metadataText };
}

function withReadyContent(descriptor, content) {
  const bytes = Buffer.from(content, "utf8"), contentSha256 = digest(bytes);
  return { ...descriptor, byteLength: bytes.length, contentSha256,
    provenance: { ...descriptor.provenance, contentSha256 } };
}

function taskDescriptor(content = "--- a/file.js\n+++ b/file.js\n", overrides = {}) {
  const bytes = Buffer.from(content, "utf8"), contentSha256 = digest(bytes), taskOwner = { kind: "task", taskId: "task-01" };
  return { schemaVersion: "runaai-m1-result-descriptor/v1", resultId: `r1.${"6".repeat(64)}`,
    owner: taskOwner, ownerRevision: "c".repeat(64), sourceRecordKind: "task-proposal", sourceRecordId: "proposal-01",
    sourceRevision: "7".repeat(64), kind: "code-diff", format: "diff", ordinal: 1,
    filename: "code-diff-000001.diff", mediaType: "text/x-diff; charset=utf-8", byteLength: bytes.length,
    contentSha256, readiness: "ready", errorCode: null, createdAt: "2026-09-04T12:00:00.000Z",
    provenance: { schemaVersion: "runaai-result-provenance/v1", type: "task-proposal", taskId: "task-01",
      proposalId: "proposal-01", proposalDigest: "8".repeat(64), expectedProjectRevision: 1,
      beforeWorkspaceSha256: "9".repeat(64), afterWorkspaceSha256: null, sourceRevision: "7".repeat(64), contentSha256 },
    privacy: listPrivacy(), ...overrides };
}

test("client admission and verification bind exact descriptor, canonical base64, length, digest and fatal UTF-8", async () => {
  const content = " <script src=https://invalid.example/x.js></script>\r\n# not rendered\t✓ ";
  const descriptor = readyDescriptor(content);
  assert.equal(admitResultList(list([descriptor]), owner()).results[0], descriptor);
  const verified = await verifyResultRead(read(descriptor, content), descriptor, runtime);
  assert.equal(verified.text, content);
  assert.deepEqual(Buffer.from(verified.bytes), Buffer.from(content, "utf8"));

  await assert.rejects(verifyResultRead({ ...read(descriptor, content), contentBase64: "YQ" }, descriptor, runtime),
    /result-client-base64-invalid/);
  await assert.rejects(verifyResultRead(read({ ...descriptor, byteLength: descriptor.byteLength + 1 }, content),
    { ...descriptor, byteLength: descriptor.byteLength + 1 }, runtime), /result-client-length-mismatch/);
  const badDigest = { ...descriptor, contentSha256: "e".repeat(64),
    provenance: { ...descriptor.provenance, contentSha256: "e".repeat(64) } };
  await assert.rejects(verifyResultRead(read(badDigest, content), badDigest, runtime), /result-client-digest-mismatch/);
  const invalidUtf8 = Uint8Array.of(0xc3, 0x28), invalidDescriptor = readyDescriptor("x", { byteLength: 2,
    contentSha256: digest(invalidUtf8), provenance: { ...descriptor.provenance, contentSha256: digest(invalidUtf8) } });
  const invalidRead = { schemaVersion: "runaai-m1-result-read/v1", descriptor: invalidDescriptor,
    encoding: "base64", contentBase64: Buffer.from(invalidUtf8).toString("base64"), privacy: readPrivacy() };
  await assert.rejects(verifyResultRead(invalidRead, invalidDescriptor, runtime), /result-client-text-invalid/);
});

test("descriptor admission rejects unsafe names, wrong state/error pairs, duplicate locators and owner accessors", () => {
  const descriptor = readyDescriptor("safe");
  assert.throws(() => admitResultList(list([{ ...descriptor, filename: "../unsafe.txt" }]), owner()), /result-client-list-invalid/);
  const incomplete = { ...descriptor, byteLength: null, contentSha256: null, readiness: "incomplete",
    errorCode: "source-failed", provenance: { ...descriptor.provenance, contentSha256: null } };
  assert.throws(() => admitResultList(list([incomplete]), owner()), /result-client-list-invalid/);
  assert.throws(() => admitResultList(list([descriptor, { ...descriptor, ordinal: 2 }]), owner()), /result-client-list-invalid/);
  const accessorOwner = {}; Object.defineProperties(accessorOwner, { kind: { enumerable: true, get: () => "conversation" },
    chatId: { enumerable: true, value: "chat-01" } });
  assert.throws(() => admitResultList(list([descriptor]), accessorOwner), /result-client-list-invalid/);
  const impossibleJson = { ...descriptor, format: "json", filename: "conversation-answer-000001.json",
    mediaType: "application/json; charset=utf-8" };
  assert.throws(() => admitResultList(list([impossibleJson]), owner()), /result-client-list-invalid/);
  const foreignProvenance = { ...descriptor, provenance: { ...descriptor.provenance, chatId: "foreign-chat" } };
  assert.throws(() => admitResultList(list([foreignProvenance]), owner()), /result-client-list-invalid/);
  const wrongSource = { ...descriptor, sourceRecordId: "turn:2" };
  assert.throws(() => admitResultList(list([wrongSource]), owner()), /result-client-list-invalid/);
  const second = { ...readyDescriptor("second"), resultId: `r1.${"9".repeat(64)}`, ordinal: 2,
    filename: "conversation-answer-000002.txt", sourceRecordId: "turn:2",
    provenance: { ...readyDescriptor("second").provenance, turnOrdinal: 2 } };
  assert.throws(() => admitResultList(list([{ ...second, ordinal: 1, filename: "conversation-answer-000001.txt" },
    { ...descriptor, ordinal: 2, filename: "conversation-answer-000002.txt" }]), owner()), /result-client-list-invalid/);

  const research = conversationPair("research");
  const incompatibleAnswer = { ...descriptor, resultId: `r1.${"4".repeat(64)}` };
  const researchSecond = { ...research.report, ordinal: 2, filename: "research-report-000002.txt" };
  assert.throws(() => admitResultList(list([incompatibleAnswer, researchSecond]), owner()), /result-client-list-invalid/);
  const review = conversationPair("review"), reviewSecond = { ...review.report,
    resultId: `r1.${"3".repeat(64)}`, ordinal: 2, filename: "review-report-000002.txt" };
  assert.throws(() => admitResultList(list([research.report, reviewSecond]), owner()), /result-client-list-invalid/);
  for (const incoherent of [
    { ...research.metadata, sourceRevision: "2".repeat(64),
      provenance: { ...research.metadata.provenance, sourceRevision: "2".repeat(64) } },
    { ...research.metadata, createdAt: "2026-09-04T12:00:01.000Z" },
    { ...research.metadata, provenance: { ...research.metadata.provenance, evidenceSha256: "1".repeat(64) } },
  ]) assert.throws(() => admitResultList(list([research.report, incoherent]), owner()), /result-client-list-invalid/);

  const task = taskDescriptor(), taskOwner = task.owner;
  assert.equal(admitResultList(listFor(taskOwner, [task]), taskOwner).results[0], task);
  const foreignTask = { ...task, provenance: { ...task.provenance, taskId: "foreign-task" } };
  assert.throws(() => admitResultList(listFor(taskOwner, [foreignTask]), taskOwner), /result-client-list-invalid/);
  const wrongProposal = { ...task, sourceRecordId: "proposal-foreign" };
  assert.throws(() => admitResultList(listFor(taskOwner, [wrongProposal]), taskOwner), /result-client-list-invalid/);
  const wrongTaskKind = { ...task, kind: "task-receipt", format: "json", filename: "task-receipt-000001.json",
    mediaType: "application/json; charset=utf-8" };
  assert.throws(() => admitResultList(listFor(taskOwner, [wrongTaskKind]), taskOwner), /result-client-list-invalid/);
  const inspectedContent = "inspected\n", inspectedSha256 = digest(Buffer.from(inspectedContent, "utf8"));
  const secondProposalKind = { ...task, resultId: `r1.${"2".repeat(64)}`, kind: "inspected-text", format: "txt",
    ordinal: 2, filename: "inspected-text-000002.txt", mediaType: "text/plain; charset=utf-8",
    byteLength: Buffer.byteLength(inspectedContent), contentSha256: inspectedSha256,
    provenance: { ...task.provenance, contentSha256: inspectedSha256 } };
  assert.throws(() => admitResultList(listFor(taskOwner, [task, secondProposalKind]), taskOwner), /result-client-list-invalid/);
  const laterTask = { ...taskDescriptor("--- a/next.js\n+++ b/next.js\n"), resultId: `r1.${"5".repeat(64)}`,
    sourceRecordId: "proposal-02", ordinal: 2, filename: "code-diff-000002.diff",
    createdAt: "2026-09-04T12:00:01.000Z", provenance: { ...task.provenance, proposalId: "proposal-02",
      contentSha256: digest(Buffer.from("--- a/next.js\n+++ b/next.js\n", "utf8")) } };
  assert.throws(() => admitResultList(listFor(taskOwner, [{ ...laterTask, ordinal: 1, filename: "code-diff-000001.diff" },
    { ...task, ordinal: 2, filename: "code-diff-000002.diff" }]), taskOwner), /result-client-list-invalid/);
});

test("real artifact UI module inserts verified result only as inert text and downloads only on explicit action", async () => {
  const root = new TestDocument(), container = root.createElement("main");
  const content = "<script>globalThis.compromised=true</script><img src=https://invalid.example/a.png>\n[open](https://invalid.example)";
  const descriptor = readyDescriptor(content), calls = [];
  const blobs = [], objectUrls = [], revoked = [];
  class ExactBlob {
    constructor(parts, options) { this.bytes = Uint8Array.from(parts[0]); this.size = this.bytes.byteLength; this.type = options.type; blobs.push(this); }
  }
  const uiRuntime = { ...runtime, Blob: ExactBlob, URL: { createObjectURL(blob) { objectUrls.push(blob); return "blob:verified-result"; },
    revokeObjectURL(url) { revoked.push(url); } } };
  const request = async (_path, payload) => {
    calls.push(payload);
    if (payload.operation === "result.list") return list([descriptor]);
    if (payload.operation === "result.read") return read(descriptor, content);
    throw new Error("unexpected-operation");
  };
  const rendered = await renderArtifactResults({ root, container, request,
    context: { projectId: "project-01", experience: "chat", owner: owner() }, runtime: uiRuntime });
  assert.equal(rendered.resultCount, 1);
  assert.deepEqual(calls.map(call => call.operation), ["result.list"]);
  assert.equal(objectUrls.length, 0);
  const verify = byText(container, "button", /^Verify and preview$/u); assert.ok(verify);
  await verify.click();
  assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list", "result.read"]);
  const preview = byText(container, "pre", /globalThis\.compromised/u); assert.ok(preview);
  assert.equal(preview.textContent, content);
  assert.equal(descendants(preview).length, 0);
  assert.equal(root.created.filter(node => ["SCRIPT", "IMG", "IFRAME", "OBJECT"].includes(node.tagName)).length, 0);
  assert.equal(objectUrls.length, 0);
  const download = byText(container, "button", /^Download verified result$/u); assert.ok(download); assert.equal(download.disabled, false);
  await download.click();
  assert.equal(blobs.length, 1); assert.equal(blobs[0].type, descriptor.mediaType);
  assert.deepEqual(Buffer.from(blobs[0].bytes), Buffer.from(content, "utf8"));
  const anchor = root.created.find(node => node.tagName === "A"); assert.equal(anchor.download, descriptor.filename);
  assert.equal(anchor.href, "blob:verified-result"); assert.deepEqual(revoked, ["blob:verified-result"]);
});

test("a retained primary control revalidates the owner and becomes inert when another page archives it", async () => {
  const root = new TestDocument(), container = root.createElement("main"), descriptor = readyDescriptor("old private result");
  const calls = []; let archived = false;
  const context = { projectId: "project-01", experience: "chat", owner: owner() };
  await renderArtifactResults({ root, container,
    context, runtime,
    request: async (_path, payload) => {
      calls.push(payload);
      if (payload.operation !== "result.list") throw new Error("result-read-must-not-run");
      if (!archived) return list([descriptor]);
      throw Object.assign(new Error("PRIVATE_OWNER_CANARY"), { code: "result-owner-not-found" });
    } });
  const retained = byText(container, "button", /^Verify and preview$/u); assert.ok(retained);
  context.projectId = "foreign-project"; context.experience = "code"; context.owner.chatId = "foreign-chat";
  archived = true;
  await retained.click();
  assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list"]);
  assert.equal(calls[1].projectId, "project-01"); assert.equal(calls[1].experience, "chat");
  assert.deepEqual(calls[1].input.owner, owner());
  assert.equal(retained.disabled, true); assert.equal(retained.parentNode, null);
  assert.equal(byText(container, "button", /^Verify and preview$/u), undefined);
  assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
  assert.match(container.textContent, /results are no longer current/u);
  assert.match(container.textContent, /No result content is shown/u);
  assert.doesNotMatch(container.textContent, /PRIVATE_OWNER_CANARY|old private result/u);
});

test("retained owner revision, primary and companion drift is detected by re-listing before any result read", async () => {
  for (const target of ["owner-revision", "primary", "companion"]) {
    const root = new TestDocument(), container = root.createElement("main"), pair = conversationPair("research");
    const changedReport = withReadyContent(pair.report, "PRIVATE_CHANGED_REPORT");
    const changedMetadata = withReadyContent(pair.metadata,
      pair.metadataText.replace("Supplied\\t sources only.", "PRIVATE_CHANGED_METADATA"));
    const changedOwnerRevision = "1".repeat(64);
    const currentList = target === "owner-revision"
      ? listFor(owner(), [{ ...pair.report, ownerRevision: changedOwnerRevision },
        { ...pair.metadata, ownerRevision: changedOwnerRevision }], changedOwnerRevision)
      : list(target === "primary" ? [changedReport, pair.metadata] : [pair.report, changedMetadata]);
    const calls = []; let activation = false;
    await renderArtifactResults({ root, container,
      context: { projectId: "project-01", experience: "chat", owner: owner() }, runtime,
      request: async (_path, payload) => {
        calls.push(payload);
        if (payload.operation !== "result.list") throw new Error("result-read-must-not-run");
        return activation ? currentList : list([pair.report, pair.metadata]);
      } });
    const retained = byText(container, "button", /^Verify and preview$/u); assert.ok(retained);
    activation = true;
    await retained.click();
    assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list"]);
    assert.equal(retained.disabled, true); assert.equal(retained.parentNode, null);
    assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
    assert.match(container.textContent, /results are no longer current/u);
    assert.doesNotMatch(container.textContent, /PRIVATE_CHANGED_REPORT|PRIVATE_CHANGED_METADATA/u);
  }
});

test("a report owner changing after companion verification is revalidated before the primary read without leaking either result", async () => {
  const root = new TestDocument(), container = root.createElement("main"), base = conversationPair("research");
  const metadataValue = JSON.parse(base.metadataText); metadataValue.limitation = "PRIVATE_COMPANION_CANARY";
  const metadataText = JSON.stringify(metadataValue), metadata = withReadyContent(base.metadata, metadataText);
  const changedReport = withReadyContent(base.report, "PRIVATE_PRIMARY_CANARY");
  const calls = []; let listCount = 0;
  await renderArtifactResults({ root, container,
    context: { projectId: "project-01", experience: "chat", owner: owner() }, runtime,
    request: async (_path, payload) => {
      calls.push(payload);
      if (payload.operation === "result.list") {
        listCount++;
        return listCount < 3 ? list([base.report, metadata]) : list([changedReport, metadata]);
      }
      if (payload.operation === "result.read" && payload.input.resultId === metadata.resultId) {
        return read(metadata, metadataText);
      }
      throw new Error("primary-result-read-must-not-run");
    } });
  const retained = byText(container, "button", /^Verify and preview$/u); assert.ok(retained);
  await retained.click();
  assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list", "result.read", "result.list"]);
  assert.equal(calls[2].input.resultId, metadata.resultId);
  assert.equal(retained.disabled, true); assert.equal(retained.parentNode, null);
  assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
  assert.match(container.textContent, /results are no longer current/u);
  assert.doesNotMatch(container.textContent, /PRIVATE_COMPANION_CANARY|PRIVATE_PRIMARY_CANARY/u);
});

test("a production result-stale race on a primary read invalidates every retained control and clears an earlier preview", async () => {
  const root = new TestDocument(), container = root.createElement("main");
  const firstContent = "PRIVATE_PRIOR_PRIMARY_PREVIEW", first = readyDescriptor(firstContent);
  const secondContent = "PRIVATE_STALE_PRIMARY_BYTES", secondBase = readyDescriptor(secondContent);
  const second = { ...secondBase, resultId: `r1.${"9".repeat(64)}`, sourceRecordId: "turn:2", ordinal: 2,
    filename: "conversation-answer-000002.txt",
    provenance: { ...secondBase.provenance, turnOrdinal: 2 } };
  const calls = []; let staleResultId = null;
  await renderArtifactResults({ root, container,
    context: { projectId: "project-01", experience: "chat", owner: owner() }, runtime,
    request: async (_path, payload) => {
      calls.push(payload);
      if (payload.operation === "result.list") return list([first, second]);
      if (payload.operation === "result.read" && payload.input.resultId === staleResultId) {
        throw Object.assign(new Error("PRIVATE_STALE_ERROR_CANARY"), { code: "result-stale" });
      }
      if (payload.operation === "result.read" && payload.input.resultId === first.resultId) return read(first, firstContent);
      throw new Error("unexpected-result-read");
    } });
  const verifyControls = descendants(container).filter(node => node.tagName === "BUTTON"
    && node.textContent === "Verify and preview");
  assert.equal(verifyControls.length, 2);
  await verifyControls[0].click();
  const priorDownload = byText(container, "button", /^Download verified result$/u); assert.ok(priorDownload);
  assert.ok(byText(container, "pre", /PRIVATE_PRIOR_PRIMARY_PREVIEW/u));
  staleResultId = second.resultId;
  await verifyControls[1].click();
  assert.deepEqual(calls.map(call => call.operation),
    ["result.list", "result.list", "result.read", "result.list", "result.read"]);
  assert.equal(calls[4].input.resultId, second.resultId);
  assert.equal(priorDownload.disabled, true); assert.equal(priorDownload.parentNode, null);
  for (const control of verifyControls) { assert.equal(control.disabled, true); assert.equal(control.parentNode, null); }
  assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
  assert.match(container.textContent, /results are no longer current/u);
  assert.doesNotMatch(container.textContent,
    /PRIVATE_PRIOR_PRIMARY_PREVIEW|PRIVATE_STALE_PRIMARY_BYTES|PRIVATE_STALE_ERROR_CANARY/u);
  const stoppedCallCount = calls.length;
  await verifyControls[0].click(); await verifyControls[1].click(); await priorDownload.click();
  assert.equal(calls.length, stoppedCallCount);
});

test("a production result-stale race on a companion read blocks the primary and clears an earlier preview", async () => {
  const root = new TestDocument(), container = root.createElement("main");
  const firstContent = "PRIVATE_PRIOR_COMPANION_PREVIEW", first = readyDescriptor(firstContent);
  const pair = conversationPair("research");
  const report = { ...pair.report, resultId: `r1.${"4".repeat(64)}`, sourceRecordId: "turn:2", ordinal: 2,
    filename: "research-report-000002.txt", provenance: { ...pair.report.provenance, turnOrdinal: 2 } };
  const metadata = { ...pair.metadata, resultId: `r1.${"5".repeat(64)}`, sourceRecordId: "turn:2", ordinal: 3,
    filename: "research-metadata-000003.json", provenance: { ...pair.metadata.provenance, turnOrdinal: 2 } };
  const calls = []; let staleCompanion = false;
  await renderArtifactResults({ root, container,
    context: { projectId: "project-01", experience: "chat", owner: owner() }, runtime,
    request: async (_path, payload) => {
      calls.push(payload);
      if (payload.operation === "result.list") return list([first, report, metadata]);
      if (payload.operation === "result.read" && payload.input.resultId === metadata.resultId && staleCompanion) {
        throw Object.assign(new Error("PRIVATE_COMPANION_STALE_ERROR"), { code: "result-stale" });
      }
      if (payload.operation === "result.read" && payload.input.resultId === first.resultId) return read(first, firstContent);
      throw new Error("primary-or-unexpected-result-read");
    } });
  const verifyControls = descendants(container).filter(node => node.tagName === "BUTTON"
    && node.textContent === "Verify and preview");
  assert.equal(verifyControls.length, 3);
  await verifyControls[0].click();
  const priorDownload = byText(container, "button", /^Download verified result$/u); assert.ok(priorDownload);
  assert.ok(byText(container, "pre", /PRIVATE_PRIOR_COMPANION_PREVIEW/u));
  staleCompanion = true;
  await verifyControls[1].click();
  assert.deepEqual(calls.map(call => call.operation),
    ["result.list", "result.list", "result.read", "result.list", "result.read"]);
  assert.equal(calls[4].input.resultId, metadata.resultId);
  assert.equal(calls.some(call => call.operation === "result.read" && call.input.resultId === report.resultId), false);
  assert.equal(priorDownload.disabled, true); assert.equal(priorDownload.parentNode, null);
  for (const control of verifyControls) { assert.equal(control.disabled, true); assert.equal(control.parentNode, null); }
  assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
  assert.match(container.textContent, /results are no longer current/u);
  assert.doesNotMatch(container.textContent,
    /PRIVATE_PRIOR_COMPANION_PREVIEW|PRIVATE_COMPANION_STALE_ERROR|Attributable report/u);
  const stoppedCallCount = calls.length;
  await verifyControls[0].click(); await verifyControls[1].click(); await verifyControls[2].click();
  assert.equal(calls.length, stoppedCallCount);
});

test("digest mismatch leaves the real artifact UI preview and download disabled", async () => {
  const root = new TestDocument(), container = root.createElement("main"), descriptor = readyDescriptor("trusted");
  const badRead = read(descriptor, "tampered");
  await renderArtifactResults({ root, container,
    request: async (_path, payload) => payload.operation === "result.list" ? list([descriptor]) : badRead,
    context: { projectId: "project-01", experience: "chat", owner: owner() }, runtime });
  await byText(container, "button", /^Verify and preview$/u).click();
  assert.match(container.textContent, /Preview and download remain disabled/u);
  assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
});

test("selecting a ready Research report keeps independently verified citation metadata visible with it", async () => {
  const root = new TestDocument(), container = root.createElement("main");
  const { report, metadata, reportText, metadataText } = conversationPair("research");
  const calls = [];
  await renderArtifactResults({ root, container, context: { projectId: "project-01", experience: "chat", owner: owner() },
    runtime, request: async (_path, payload) => {
      calls.push(payload);
      if (payload.operation === "result.list") return list([report, metadata]);
      const selected = payload.input.resultId === report.resultId ? report : metadata;
      return read(selected, selected === report ? reportText : metadataText);
  } });
  await byText(container, "button", /^Verify and preview$/u).click();
  assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list", "result.read", "result.list", "result.read"]);
  assert.equal(calls[2].input.resultId, metadata.resultId);
  assert.equal(calls[4].input.resultId, report.resultId);
  assert.ok(byText(container, "pre", /Attributable report/u));
  assert.ok(byText(container, "pre", /source-01/u));
  assert.equal(root.created.filter(node => ["SCRIPT", "IMG", "IFRAME", "OBJECT"].includes(node.tagName)).length, 0);
});

test("a ready Research report is non-actionable when its companion is missing or non-ready", async () => {
  const pair = conversationPair("research");
  for (const results of [[pair.report], [pair.report, { ...pair.metadata, byteLength: null, contentSha256: null,
    readiness: "incomplete", errorCode: "source-citations-incomplete",
    provenance: { ...pair.metadata.provenance, contentSha256: null } }]]) {
    const root = new TestDocument(), container = root.createElement("main"), calls = [];
    await renderArtifactResults({ root, container, context: { projectId: "project-01", experience: "chat", owner: owner() },
      runtime, request: async (_path, payload) => { calls.push(payload); return list(results); } });
    assert.deepEqual(calls.map(call => call.operation), ["result.list"]);
    assert.match(container.textContent, /report is not actionable/u);
    assert.equal(byText(container, "button", /^Verify and preview$/u), undefined);
  }

  const root = new TestDocument(), container = root.createElement("main"), calls = [];
  await renderArtifactResults({ root, container, context: { projectId: "project-01", experience: "chat", owner: owner() },
    runtime, request: async (_path, payload) => { calls.push(payload); if (payload.operation === "result.list") return list([pair.report, pair.metadata]);
      throw new Error("metadata-read-failed"); } });
  await byText(container, "button", /^Verify and preview$/u).click();
  assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list", "result.read"]);
  assert.match(container.textContent, /Preview and download remain disabled/u);
  assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
});

test("Research metadata rejects every frozen SafeText violation before the report is read", async () => {
  const unsafeLimitations = ["\ud800", "\udc00", "\u0000", "\u0001", "\u007f", "\u0080",
    "\u061c", "\u200e", "\u202a", "\u2066"];
  for (const limitation of unsafeLimitations) {
    const pair = conversationPair("research"), value = JSON.parse(pair.metadataText);
    value.limitation = limitation;
    const metadataText = JSON.stringify(value), metadata = withReadyContent(pair.metadata, metadataText);
    const root = new TestDocument(), container = root.createElement("main"), calls = [];
    await renderArtifactResults({ root, container, context: { projectId: "project-01", experience: "chat", owner: owner() },
      runtime, request: async (_path, payload) => { calls.push(payload); if (payload.operation === "result.list") return list([pair.report, metadata]);
        return read(metadata, metadataText); } });
    await byText(container, "button", /^Verify and preview$/u).click();
    assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list", "result.read"]);
    assert.match(container.textContent, /Preview and download remain disabled/u);
    assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
  }
});

test("Review rejects an incoherent list and verifies matching context metadata first with digest fail-closed", async () => {
  const pair = conversationPair("review"), root = new TestDocument(), container = root.createElement("main"), calls = [];
  await renderArtifactResults({ root, container, context: { projectId: "project-01", experience: "chat", owner: owner() },
    runtime, request: async (_path, payload) => { calls.push(payload); if (payload.operation === "result.list") return list([pair.report, pair.metadata]);
      const selected = payload.input.resultId === pair.metadata.resultId ? pair.metadata : pair.report;
      return read(selected, selected === pair.metadata ? pair.metadataText : pair.reportText); } });
  await byText(container, "button", /^Verify and preview$/u).click();
  assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list", "result.read", "result.list", "result.read"]);
  assert.equal(calls[2].input.resultId, pair.metadata.resultId); assert.equal(calls[4].input.resultId, pair.report.resultId);
  assert.ok(byText(container, "pre", /artifact-01/u)); assert.ok(byText(container, "pre", /Accepted review finding/u));

  const mismatchRoot = new TestDocument(), mismatchContainer = mismatchRoot.createElement("main"), mismatchCalls = [];
  const mismatched = { ...pair.metadata, sourceRevision: "1".repeat(64),
    provenance: { ...pair.metadata.provenance, sourceRevision: "1".repeat(64) } };
  assert.throws(() => admitResultList(list([pair.report, mismatched]), owner()),
    error => error?.code === "result-client-list-invalid" && error.message === "result-client-list-invalid");
  const mismatchOutcome = await renderArtifactResults({ root: mismatchRoot, container: mismatchContainer,
    context: { projectId: "project-01", experience: "chat", owner: owner() }, runtime,
    request: async (_path, payload) => { mismatchCalls.push(payload); return list([pair.report, mismatched]); } });
  assert.deepEqual(mismatchOutcome, { resultCount: 0 });
  assert.deepEqual(mismatchCalls.map(call => call.operation), ["result.list"]);
  assert.match(mismatchContainer.textContent, /Results could not be safely loaded/u);
  assert.doesNotMatch(mismatchContainer.textContent, /report is not actionable/u);
  assert.equal(byText(mismatchContainer, "button", /^Verify and preview$/u), undefined);
  assert.equal(byText(mismatchContainer, "button", /^Download verified result$/u), undefined);
  assert.equal(descendants(mismatchContainer).some(node => node.tagName === "PRE"), false);

  const digestRoot = new TestDocument(), digestContainer = digestRoot.createElement("main"), digestCalls = [];
  await renderArtifactResults({ root: digestRoot, container: digestContainer,
    context: { projectId: "project-01", experience: "chat", owner: owner() }, runtime,
    request: async (_path, payload) => { digestCalls.push(payload); if (payload.operation === "result.list") return list([pair.report, pair.metadata]);
      return read(pair.metadata, "tampered metadata"); } });
  await byText(digestContainer, "button", /^Verify and preview$/u).click();
  assert.deepEqual(digestCalls.map(call => call.operation), ["result.list", "result.list", "result.read"]);
  assert.match(digestContainer.textContent, /Preview and download remain disabled/u);
  assert.equal(byText(digestContainer, "button", /^Download verified result$/u), undefined);
});

test("Review report stays blocked when its verified companion has an invalid positive schema", async () => {
  const pair = conversationPair("review"), value = JSON.parse(pair.metadataText);
  value.checker.attemptCount = 2;
  const metadataText = JSON.stringify(value), metadata = withReadyContent(pair.metadata, metadataText);
  const root = new TestDocument(), container = root.createElement("main"), calls = [];
  await renderArtifactResults({ root, container, context: { projectId: "project-01", experience: "chat", owner: owner() },
    runtime, request: async (_path, payload) => { calls.push(payload); if (payload.operation === "result.list") return list([pair.report, metadata]);
      return read(metadata, metadataText); } });
  await byText(container, "button", /^Verify and preview$/u).click();
  assert.deepEqual(calls.map(call => call.operation), ["result.list", "result.list", "result.read"]);
  assert.match(container.textContent, /Preview and download remain disabled/u);
  assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
});

test("unknown and reconciliation-required results remain non-actionable and are never read or relabelled ready", async () => {
  const root = new TestDocument(), container = root.createElement("main"), base = readyDescriptor("not current");
  const descriptor = { ...base, byteLength: null, contentSha256: null, readiness: "incomplete",
    errorCode: "source-reconciliation-required", provenance: { ...base.provenance, contentSha256: null } };
  const calls = [];
  await renderArtifactResults({ root, container, context: { projectId: "project-01", experience: "chat", owner: owner() },
    runtime, request: async (_path, payload) => { calls.push(payload); return list([descriptor]); } });
  assert.deepEqual(calls.map(call => call.operation), ["result.list"]);
  assert.match(container.textContent, /current result is not known/u);
  assert.match(container.textContent, /Reconcile the task/u);
  assert.equal(byText(container, "button", /^Verify and preview$/u), undefined);
  assert.equal(byText(container, "button", /^Download verified result$/u), undefined);
});

test("real product context resolves saved conversation and exact opened Code-task precedence", () => {
  const chatState = { projectId: "project-01", activeChatId: "chat-01" };
  assert.deepEqual(currentResultContext({ experience: "chat", state: chatState, taskView: null }),
    { experience: "chat", projectId: "project-01", owner: { kind: "conversation", chatId: "chat-01" } });
  const taskView = { dataset: { m1TaskId: "task-01", m1ProjectId: "project-01", m1Experience: "code" } };
  assert.deepEqual(currentResultContext({ experience: "code", state: chatState, taskView }),
    { experience: "code", projectId: "project-01", owner: { kind: "task", taskId: "task-01" } });
  taskView.dataset.m1ProjectId = "foreign-project";
  assert.deepEqual(currentResultContext({ experience: "code", state: chatState, taskView }).owner,
    { kind: "conversation", chatId: "chat-01" });
  assert.equal(currentResultContext({ experience: "chat", state: { projectId: "project-01", activeChatId: null },
    taskView: null }).owner, null);
  for (const projectId of ["runa:personal", "runa:ephemeral"]) {
    assert.equal(currentResultContext({ experience: "chat", state: { projectId, activeChatId: "chat-01" },
      taskView: null }).owner, null);
  }
});

test("real Files navigation requests the current conversation and gives an opened Code task precedence", async () => {
  for (const context of [
    currentResultContext({ experience: "chat", state: { projectId: "project-01", activeChatId: "chat-01" }, taskView: null }),
    currentResultContext({ experience: "code", state: { projectId: "project-01", activeChatId: "code-chat-01" },
      taskView: { dataset: { m1TaskId: "task-01", m1ProjectId: "project-01", m1Experience: "code" } } }),
  ]) {
    const { root, files } = productDocument(), calls = [];
    const product = initializeProductViews(root, { request: async (_path, payload) => { calls.push(payload);
      return { schemaVersion: "runaai-m1-result-list/v1", owner: payload.input.owner,
        ownerRevision: "c".repeat(64), results: [], privacy: listPrivacy() }; }, experience: () => context.experience,
      openChat: async () => true, resultContext: () => context });
    await files.click();
    assert.equal(product.active(), "files");
    assert.equal(root.getElementById("conversation-surface").hidden, true);
    assert.equal(root.getElementById("chat-form").hidden, true);
    assert.deepEqual(calls.map(call => [call.operation, call.input.owner]), [["result.list", context.owner]]);
  }
});

test("real Files navigation makes no result request for personal, ephemeral or unsaved context", async () => {
  const contexts = [
    currentResultContext({ experience: "chat", state: { projectId: "runa:personal", activeChatId: "chat-01" }, taskView: null }),
    currentResultContext({ experience: "chat", state: { projectId: "runa:ephemeral", activeChatId: "chat-01" }, taskView: null }),
    currentResultContext({ experience: "chat", state: { projectId: "project-01", activeChatId: null }, taskView: null }),
  ];
  for (const context of contexts) {
    const { root, files } = productDocument(); let requests = 0;
    initializeProductViews(root, { request: async () => { requests++; throw new Error("result-request-forbidden"); },
      experience: () => context.experience, openChat: async () => true, resultContext: () => context });
    await files.click();
    assert.equal(requests, 0);
    assert.match(root.getElementById("product-view").textContent, /No selected result owner/u);
  }
});

test("download helper constructs exact Blob and always revokes its temporary object URL", () => {
  const content = "download", descriptor = readyDescriptor(content), root = new TestDocument();
  const events = [];
  class ExactBlob { constructor(parts, options) { this.bytes = Uint8Array.from(parts[0]); this.size = this.bytes.length; this.type = options.type; } }
  const custom = { Blob: ExactBlob, URL: { createObjectURL(blob) { events.push(["create", blob]); return "blob:one"; },
    revokeObjectURL(url) { events.push(["revoke", url]); } } };
  downloadVerifiedResult(root, descriptor, { bytes: Uint8Array.from(Buffer.from(content)), text: content }, custom);
  assert.equal(events[0][0], "create"); assert.deepEqual(events[1], ["revoke", "blob:one"]);
  const anchor = root.created.find(node => node.tagName === "A"); assert.equal(anchor.download, descriptor.filename);
});
