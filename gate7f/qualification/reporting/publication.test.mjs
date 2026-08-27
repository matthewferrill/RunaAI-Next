import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hash } from "../runtime.mjs";
import { responseDigest } from "./judgments.mjs";
import { verifyFinalPublication } from "./publication.mjs";
import { publicationFixture, encode, save, pin } from "./publication-fixture.mjs";

const json = file => JSON.parse(readFileSync(file, "utf8"));
const first = f => f.options.arms[0];
const eventsFile = f => path.join(first(f).transfer.root, "qualification/capture-incumbent/events.jsonl");
const changePinned = (descriptor, change) => {
  const value = json(descriptor.file); change(value); save(descriptor.file, encode(value)); Object.assign(descriptor, pin(descriptor.file));
};
const refreshTransfer = transfer => changePinned(transfer.manifest, manifest => {
  for (const name of Object.keys(manifest.files)) {
    const bytes = readFileSync(path.join(transfer.root, name)); manifest.files[name] = { bytes: bytes.length, sha256: hash(bytes) };
  }
});
const changeEvents = (f, change) => {
  const rows = readFileSync(eventsFile(f), "utf8").trim().split(/\r?\n/).map(JSON.parse);
  change(rows); save(eventsFile(f), rows.map(row => JSON.stringify(row) + "\n").join("")); refreshTransfer(first(f).transfer);
};
async function usingFixture(work) { const f = await publicationFixture(); try { return await work(f); } finally { f.cleanup(); } }

test("two complete fabricated captures publish repeatable source-bound aggregates without semantic inference", async () => usingFixture(async f => {
  const before = structuredClone(f.options), result = await verifyFinalPublication(f.options);
  assert.equal(result.passed, true); assert.equal(result.arms.length, 2);
  assert.equal(result.semanticJudgmentsAutomaticallyInferred, false); assert.equal(result.hardwareAttestation, false);
  assert.deepEqual(f.options, before);
  for (const arm of result.arms) {
    assert.equal(arm.aggregate.turnResponses, 117); assert.equal(arm.aggregate.caseAttempts, 108);
    assert.equal(arm.aggregate.semanticTurnCounts["review-required"], 117);
    for (const field of ["verifiedSummarySha256", "functionalPrefixSha256", "packetSha256", "judgmentBundleSha256", "aggregateSha256"]) assert.match(arm[field], /^[a-f0-9]{64}$/);
  }
  assert.equal(JSON.stringify(result).includes("synthetic-gemma"), false);
  assert.deepEqual(await verifyFinalPublication(f.options), result);
}));

test("changing capture bytes cannot be waived by a caller-provided success flag", async () => usingFixture(async f => {
  save(eventsFile(f), readFileSync(eventsFile(f), "utf8") + "\n");
  await assert.rejects(verifyFinalPublication({ ...f.options, summary: { passed: true }, verified: true }), /transfer-digest/);
}));

test("changed manifest bytes, including whitespace-only rewrites, fail the independent pin", async () => usingFixture(async f => {
  const manifest = first(f).transfer.manifest; save(manifest.file, JSON.stringify(json(manifest.file)));
  await assert.rejects(verifyFinalPublication(f.options), /pinned-bytes-changed/);
}));

test("a manifest may not silently expand the caller's exact expected file set", async () => usingFixture(async f => {
  changePinned(first(f).transfer.manifest, manifest => { manifest.files.extra = { bytes: 0, sha256: hash("") }; });
  await assert.rejects(verifyFinalPublication(f.options), /transfer-file-set/);
}));

test("changed captured result and package source bytes are rejected", async () => {
  await usingFixture(async f => {
    save(path.join(first(f).transfer.root, "qualification/capture-incumbent/result.json"), "{}");
    await assert.rejects(verifyFinalPublication(f.options), /transfer-digest/);
  });
  await usingFixture(async f => {
    save(path.join(f.options.packageDir, "qualification/runtime.mjs"), "changed package source");
    await assert.rejects(verifyFinalPublication(f.options), /package-file-drift/);
  });
});

test("the complete raw functional prefix must equal the separately pinned Home snapshot", async () => usingFixture(async f => {
  const file = path.join(f.options.reviewTransfer.root, "incumbent-prefix.jsonl");
  save(file, readFileSync(file, "utf8").replace('"complete":true', '"complete":false'));
  await assert.rejects(verifyFinalPublication(f.options), /transfer-digest/);
  refreshTransfer(f.options.reviewTransfer);
  await assert.rejects(verifyFinalPublication(f.options), /functional-prefix-replaced/);
}));

test("extra prefix bytes and substituted source-snapshot names are not accepted", async () => {
  await usingFixture(async f => {
    const file = path.join(f.options.reviewTransfer.root, "incumbent-prefix.jsonl");
    save(file, readFileSync(file, "utf8") + "\n"); refreshTransfer(f.options.reviewTransfer);
    await assert.rejects(verifyFinalPublication(f.options), /functional-prefix-replaced/);
  });
  await usingFixture(async f => {
    changePinned(f.options.reviewTransfer.manifest, manifest => { manifest.sourceSnapshots[0].file = "different-prefix.jsonl"; });
    await assert.rejects(verifyFinalPublication(f.options), /review-source-snapshot-files/);
  });
});

test("re-pinning a changed packet response cannot replace the original acceptance response", async () => usingFixture(async f => {
  changePinned(first(f).packet, packet => { packet.responses[0].content = "Improved replacement answer."; });
  await assert.rejects(verifyFinalPublication(f.options), /packet-responses-replaced/);
}));

test("duplicate packet identities, added tool metadata and wrong arm labels fail", async () => {
  for (const change of [
    packet => { packet.responses[1] = structuredClone(packet.responses[0]); },
    packet => { packet.responses[0].toolCalls = [{ id: "fake", type: "function", model: "provider", function: { name: "x", arguments: "{}" } }]; },
    packet => { packet.candidateLabel = "Candidate-B"; },
  ]) await usingFixture(async f => {
    changePinned(first(f).packet, change); await assert.rejects(verifyFinalPublication(f.options), /packet-responses-replaced|packet-arm/);
  });
});

test("packet prefix and bundle provenance must name the exact verified originals", async () => {
  for (const field of ["acceptancePrefixSha256", "suppliedBundleSha256"]) await usingFixture(async f => {
    changePinned(first(f).packet, packet => { packet[field] = "0".repeat(64); });
    await assert.rejects(verifyFinalPublication(f.options), /packet-acceptance-prefix|packet-bundle/);
  });
});

test("an altered request remains invalid even with a newly consistent Home transfer hash", async () => usingFixture(async f => {
  changeEvents(f, rows => { rows.find(row => row.type === "request").request.messages[0].content = "Changed trusted request."; });
  await assert.rejects(verifyFinalPublication(f.options), /evidence-wire-request/);
}));

test("a forged observation or missing cleanup cannot be promoted by a valid transfer", async () => {
  await usingFixture(async f => {
    changeEvents(f, rows => { rows.find(row => row.type === "observation").normalized.content = "Forged normalized answer."; });
    await assert.rejects(verifyFinalPublication(f.options), /evidence-normalized-reply|raw-normalized|evidence-wire-request/);
  });
  await usingFixture(async f => {
    changeEvents(f, rows => { rows.splice(rows.findIndex(row => row.type === "cleanup"), 1); });
    await assert.rejects(verifyFinalPublication(f.options), /evidence-singular-cleanup/);
  });
});

test("changed supplied prompts are rejected against frozen inputs even if package and seal pins are recomputed", async () => usingFixture(async f => {
  const file = path.join(f.options.packageDir, "qualification/bundle.json"), bundle = json(file);
  bundle.inputs.cases[0].messages[0].content = "A substituted evaluation question."; save(file, encode(bundle));
  const manifestFile = path.join(f.options.packageDir, "package-manifest.json"), manifest = json(manifestFile);
  manifest.files["qualification/bundle.json"] = hash(readFileSync(file)); save(manifestFile, encode(manifest));
  changePinned(f.options.runSeal, seal => { seal.bundleSha256 = hash(readFileSync(file)); seal.packageManifestSha256 = hash(readFileSync(manifestFile)); });
  await assert.rejects(verifyFinalPublication(f.options), /frozen-inputs-mismatch/);
}));

test("changed judged response, finish reason or source provenance fail immediately before aggregation", async () => {
  for (const change of [
    judgments => { judgments.records[0].response.content = "Changed answer."; judgments.records[0].responseSha256 = responseDigest(judgments.records[0].response); },
    judgments => { judgments.records[0].transport.finishReason = "length"; judgments.records[0].transport.status = "incomplete-response"; },
    judgments => { delete judgments.sourcePacket; },
  ]) await usingFixture(async f => {
    changePinned(first(f).judgments, change);
    await assert.rejects(verifyFinalPublication(f.options), /judgment-source-/);
  });
});

test("the frozen judgment validator still rejects an altered acceptance seal", async () => usingFixture(async f => {
  changePinned(first(f).judgments, judgments => { judgments.acceptanceSealSha256 = "0".repeat(64); });
  await assert.rejects(verifyFinalPublication(f.options), /judgment-acceptance-seal-mismatch/);
}));

test("explicit arm mapping cannot be omitted, duplicated, crossed or reduced to a selected winner", async () => {
  for (const change of [
    options => { options.arms.pop(); },
    options => { options.arms[1].armId = options.arms[0].armId; },
    options => { options.mapping["blind-candidate-b"] = "incumbent"; },
    options => { options.mapping = { "blind-candidate-a": "gemma26", "blind-candidate-b": "incumbent" }; },
  ]) await usingFixture(async f => { change(f.options); await assert.rejects(verifyFinalPublication(f.options)); });
});

test("newly pinned independent semantic judgments are preserved, not inferred or overwritten", async () => usingFixture(async f => {
  changePinned(first(f).judgments, judgments => {
    judgments.records[0].semantic = { outcome: "ordinary-error", reason: "A changed fabricated independent disposition.", evidence: [] };
  });
  const result = await verifyFinalPublication(f.options);
  assert.equal(result.arms[0].aggregate.semanticTurnCounts["ordinary-error"], 1);
  assert.equal(result.arms[0].aggregate.semanticTurnCounts["review-required"], 116);
  assert.equal(result.semanticJudgmentsAutomaticallyInferred, false);
}));
