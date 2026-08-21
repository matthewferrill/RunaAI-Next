import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryGate4aStore } from "./adapters/memory.mjs";
import { createEnvelopeCipher } from "./envelope.mjs";
import { Gate4aMigrationService, Gate4aProjectChatRepository, buildGate4aPlan } from "./migration.mjs";
import { inventoryFromSnapshot, safeInventoryOutput } from "./inventory.mjs";
import { CHAT_A, CHAT_B, CHAT_C, PARTICIPANT, PROJECT_ALPHA, makeSnapshot, testCipher } from "./fixtures.mjs";

const covered = new Set();
const caseTest = (id, name, fn) => test(`[${id}] ${name}`, async () => { covered.add(id); await fn(); });
const expectCode = async (operation, code) => {
  try { await operation(); assert.fail(`expected ${code}`); }
  catch (error) { assert.equal(error.code, code); }
};
const setup = async (snapshot = makeSnapshot(), cipher = testCipher()) => {
  const store = new MemoryGate4aStore();
  const service = new Gate4aMigrationService({ store, cipher });
  const result = await service.migrate(snapshot, { runId: "run-1" });
  return { store, service, result, repository: new Gate4aProjectChatRepository({ store, cipher }), cipher, snapshot };
};

caseTest("G4A-01", "encrypted round trip preserves projects, chats, turns and memory", async () => {
  const { repository, result, store } = await setup();
  assert.deepEqual(result.counts, { projects: 2, chats: 3, turns: 4, projectMemory: 1 });
  const chat = await repository.readChat(PARTICIPANT, PROJECT_ALPHA, CHAT_A);
  assert.equal(chat.title, "Plan PRIVATE_CHAT_CANARY_4A");
  assert.equal(chat.turns[1].route, "workspace-chat");
  assert.equal((await repository.readProject(PARTICIPANT, PROJECT_ALPHA)).displayName, "Project Alpha");
  const raw = await store.getRaw("chat", CHAT_A);
  assert.equal(JSON.stringify(raw).includes("PRIVATE_CHAT_CANARY_4A"), false);
});

caseTest("G4A-02", "archived projects cannot arrive with memory enabled", async () => {
  const snapshot = makeSnapshot({ mutate: value => { value.projects[1].memoryPolicy.enabled = true; return value; } });
  await expectCode(() => new Gate4aMigrationService({ store: new MemoryGate4aStore(), cipher: testCipher() })
    .migrate(snapshot, { runId: "bad-archive" }), "migration-project-memory-invalid");
});

caseTest("G4A-03", "a self-contained branch survives an absent parent", async () => {
  const { repository } = await setup(makeSnapshot({ includeParent: false }));
  const branch = await repository.readChat(PARTICIPANT, PROJECT_ALPHA, CHAT_B);
  assert.equal(branch.parentChatId, CHAT_A);
  assert.equal(branch.turns.length, 1);
});

caseTest("G4A-04", "wrong participant is denied before private decryption", async () => {
  let decrypts = 0;
  const cipher = testCipher({ onDecrypt: () => { decrypts += 1; } });
  const { repository } = await setup(makeSnapshot(), cipher);
  await expectCode(() => repository.readChat("other-participant", PROJECT_ALPHA, CHAT_A), "project-chat-scope-denied");
  assert.equal(decrypts, 0);
});

caseTest("G4A-05", "wrong project is denied before private decryption", async () => {
  let decrypts = 0;
  const cipher = testCipher({ onDecrypt: () => { decrypts += 1; } });
  const { repository } = await setup(makeSnapshot(), cipher);
  await expectCode(() => repository.readChat(PARTICIPANT, "project-beta", CHAT_A), "project-chat-scope-denied");
  assert.equal(decrypts, 0);
});

caseTest("G4A-06", "source references remain metadata and carry no access grant", async () => {
  const { repository } = await setup();
  const project = await repository.readProject(PARTICIPANT, PROJECT_ALPHA);
  assert.deepEqual(project.sources, [{ referenceId: "source-alpha" }]);
  assert.equal("readApproved" in project.sources[0], false);
  assert.equal(typeof repository.readWorkspaceSource, "undefined");
});

caseTest("G4A-07", "disabled project memory is retained but excluded from context", async () => {
  const { repository, store } = await setup(makeSnapshot({ alphaMemoryEnabled: false }));
  assert.equal((await store.listRaw("project-memory", PARTICIPANT)).length, 1);
  const context = await repository.projectContext(PARTICIPANT, PROJECT_ALPHA);
  assert.equal(context.memoryEnabled, false);
  assert.deepEqual(context.memory, []);
  assert.equal(context.typedUntrusted, true);
});

caseTest("G4A-08", "same run replay is idempotent", async () => {
  const { service, store, result, snapshot } = await setup();
  const replay = await service.migrate(snapshot, { runId: "run-1" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.manifestHmac, result.manifestHmac);
  assert.equal((await store.auditState(PARTICIPANT)).runs, 1);
});

caseTest("G4A-09", "same run id with changed source is a conflict", async () => {
  const { service } = await setup();
  const changed = makeSnapshot({ mutate: value => { value.chats[0].catalog.title = "Changed"; return value; } });
  await expectCode(() => service.migrate(changed, { runId: "run-1" }), "migration-run-conflict");
});

caseTest("G4A-10", "swapped ciphertext fails its record binding", async () => {
  const { repository, store } = await setup();
  const other = await store.getRaw("chat", CHAT_B);
  store.tamper("chat", CHAT_A, row => ({ ...row, privateEnvelope: other.privateEnvelope }));
  await expectCode(() => repository.readChat(PARTICIPANT, PROJECT_ALPHA, CHAT_A), "private-envelope-invalid");
});

caseTest("G4A-11", "wrong key, tag, field and version all fail closed", async () => {
  const cipher = testCipher();
  const context = { recordType: "chat", participantId: PARTICIPANT, recordId: CHAT_A, field: "private-payload" };
  const envelope = cipher.encrypt(context, { title: "Private" });
  const wrongKey = createEnvelopeCipher({ encryptionKey: Buffer.alloc(32, 99), hmacKey: Buffer.alloc(32, 29), keyId: "gate4a-test-key" });
  assert.throws(() => wrongKey.decrypt(context, envelope), error => error.code === "private-envelope-invalid");
  assert.throws(() => cipher.decrypt(context, { ...envelope, tag: Buffer.alloc(16).toString("base64") }), error => error.code === "private-envelope-invalid");
  assert.throws(() => cipher.decrypt({ ...context, field: "other" }, envelope), error => error.code === "private-envelope-invalid");
  assert.throws(() => cipher.decrypt(context, { ...envelope, schemaVersion: "unknown" }), error => error.code === "private-envelope-invalid");
});

caseTest("G4A-12", "approved successor removes missing content and leaves only a tombstone", async () => {
  const { service, result, store } = await setup();
  const next = makeSnapshot({ sourceSnapshotId: "snapshot-2", predecessorManifestHmac: result.manifestHmac, includeUnassigned: false });
  const updated = await service.migrate(next, { runId: "run-2" });
  assert.equal(updated.tombstones, 2, "chat and its turn are removed");
  assert.equal(await store.getRaw("chat", CHAT_C), null);
  assert.equal(store.state.tombstones.every(row => row.deletedContentRetained === false), true);
  assert.equal((await service.migrate(next, { runId: "run-2" })).replayed, true);
  assert.equal(await store.getRaw("chat", CHAT_C), null);
});

caseTest("G4A-13", "failure before commit leaves no partial domain and retry completes once", async () => {
  const store = new MemoryGate4aStore();
  const service = new Gate4aMigrationService({ store, cipher: testCipher() });
  await expectCode(() => service.migrate(makeSnapshot(), { runId: "fail-before", failBeforeCommit: true }), "migration-simulated-before-commit");
  assert.equal((await store.auditState(PARTICIPANT)).runs, 0);
  assert.equal((await service.migrate(makeSnapshot(), { runId: "fail-before" })).committed, true);
});

caseTest("G4A-14", "response loss after commit replays the existing result", async () => {
  const store = new MemoryGate4aStore();
  const service = new Gate4aMigrationService({ store, cipher: testCipher() });
  await expectCode(() => service.migrate(makeSnapshot(), { runId: "lost", failAfterCommit: true }), "migration-response-lost");
  const replay = await service.migrate(makeSnapshot(), { runId: "lost" });
  assert.equal(replay.replayed, true);
  assert.equal((await store.auditState(PARTICIPANT)).runs, 1);
});

caseTest("G4A-15", "dependency loss is visible and legacy selection remains available", async () => {
  const legacy = structuredClone(makeSnapshot());
  const store = { adapterName: "unavailable-postgres", async commitSnapshot() {
    throw Object.assign(new Error("unavailable"), { code: "dependency-unavailable" }); } };
  await expectCode(() => new Gate4aMigrationService({ store, cipher: testCipher() })
    .migrate(legacy, { runId: "dependency-loss" }), "dependency-unavailable");
  assert.equal(legacy.chats.length, 3);
});

caseTest("G4A-16", "unknown version and invalid relations are distinguishable and atomic", async () => {
  const variants = [
    ["migration-source-invalid", value => { value.schemaVersion = "unknown"; }],
    ["migration-turn-count-mismatch", value => { value.chats[0].catalog.turnCount += 1; }],
    ["migration-chat-project-missing", value => { value.chats[0].catalog.projectId = "missing-project"; }],
    ["migration-branch-invalid", value => { value.chats[1].catalog.branchFromTurn = 99; }],
  ];
  for (const [code, mutate] of variants) {
    const snapshot = makeSnapshot({ mutate: value => { mutate(value); return value; } });
    await expectCode(() => new Gate4aMigrationService({ store: new MemoryGate4aStore(), cipher: testCipher() })
      .migrate(snapshot, { runId: `invalid-${code}` }), code);
  }
});

caseTest("G4A-17", "private canaries never enter plans, ledgers or inventory output", async () => {
  const snapshot = makeSnapshot({ privateCanary: "PLANTED_PRIVATE_CANARY_X91" });
  const plan = buildGate4aPlan(snapshot, testCipher());
  assert.equal(JSON.stringify(plan).includes("PLANTED_PRIVATE_CANARY_X91"), false);
  const inventory = inventoryFromSnapshot(snapshot);
  assert.equal(JSON.stringify(inventory).includes("PLANTED_PRIVATE_CANARY_X91"), false);
  const { store } = await setup(snapshot);
  assert.equal(JSON.stringify(store.state.items).includes("PLANTED_PRIVATE_CANARY_X91"), false);
});

caseTest("G4A-18", "inventory is aggregate-only, deterministic, and distinguishes unreadable from empty", async () => {
  const snapshot = makeSnapshot();
  const first = inventoryFromSnapshot(snapshot);
  const second = inventoryFromSnapshot(snapshot);
  const output = safeInventoryOutput({ authority: { commit: "1".repeat(40) }, first, second, scriptSha256: "2".repeat(64) });
  assert.equal(output.deterministicSecondPass, true);
  assert.equal(output.passed, true);
  assert.equal("projects" in output, false);
  assert.equal(inventoryFromSnapshot(snapshot, { unreadableChats: 1 }).passed, false);
  assert.equal(inventoryFromSnapshot({ ...snapshot, chats: [] }).passed, true);
});

caseTest("G4A-19", "rollback selects legacy records without reverse conversion", async () => {
  const legacy = structuredClone(makeSnapshot());
  const { store, repository } = await setup(legacy);
  assert.equal((await repository.status()).rollbackAvailable, true);
  store.state = { records: new Map(), runs: new Map(), items: [], tombstones: [], manifests: new Map() };
  assert.equal(legacy.projects[0].displayName, "Project Alpha");
  assert.equal(legacy.chats[0].turns.length, 2);
});

after(() => {
  const corpus = JSON.parse(readFileSync(new URL("./PARITY-CORPUS.json", import.meta.url), "utf8"));
  assert.deepEqual([...covered].sort(), corpus.cases.map(item => item.id).sort(), "every frozen Gate 4A corpus case must execute");
});
