import { randomBytes } from "node:crypto";
import { createEnvelopeCipher } from "../../../gate4/envelope.mjs";
import { CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION } from "../tasks/contracts.mjs";
import { startCaptureTransport, startOwnedIndexProxy } from "./capture-transport.mjs";
import { createFunctionalHost } from "./functional-host.mjs";
import { CONTROL_SUITES } from "./model-free-controls.mjs";
import { fail, validateRuntimeSeal } from "./runner-contract.mjs";

export async function createFunctionalTestbed({ resources, mode, seal = null, candidateId = null, getLedger, faults = null, taskHooks = undefined }) {
  if (!["controls", "scored"].includes(mode)) throw fail("m1-testbed-mode-invalid");
  if (mode === "scored") validateRuntimeSeal(seal, { candidateId });
  const selected = seal?.candidates.find(item => item.candidateId === candidateId);
  const modelId = selected?.modelId ?? "m1-inference-disabled";
  const encryptionKey = randomBytes(32), hmacKey = randomBytes(32);
  const owned = [], cipher = createEnvelopeCipher({ encryptionKey, hmacKey, keyId: "m1-owned-acceptance" });
  let host;
  try {
    const provider = await startCaptureTransport({ mode, targetBaseUrl: seal?.providerBaseUrl ?? "http://127.0.0.1:9770/v1",
      modelId, getLedger, kind: "provider", faults, validateRequest: (body, role) => {
        const budget = seal.roles[role];
        const reasoningEffort = selected.requestControls[role].reasoningEffort;
        if (!budget || body.max_tokens !== budget.maximumOutputTokens || body.temperature !== 0
          || (reasoningEffort === null ? Object.hasOwn(body, "reasoning_effort") : body.reasoning_effort !== reasoningEffort)) {
          throw fail("m1-sealed-wire-setting-mismatch");
        }
      } }); owned.push(provider);
    const embedding = await startCaptureTransport({ mode, targetBaseUrl: seal?.embedding.baseUrl ?? "http://127.0.0.1:9770/v1",
      modelId: "text-embedding-nomic-embed-text-v1.5", getLedger, kind: "embedding" }); owned.push(embedding);
    const reranker = await startCaptureTransport({ mode, targetBaseUrl: seal?.reranker.baseUrl ?? "http://127.0.0.1:1",
      getLedger, kind: "reranker" }); owned.push(reranker);
    const index = await startOwnedIndexProxy({ targetBaseUrl: resources.qdrantEndpoint,
      collection: `m1_${randomBytes(6).toString("hex")}`, getLedger }); owned.push(index);
    const activeFaults = Object.assign(faults ?? {}, {
      setIndexUnavailable: value => index.setIndexUnavailable(value),
      qdrant: { endpoint: resources.qdrantEndpoint, collection: index.collection, syntheticOnly: true },
    });
    const configuration = { schemaVersion: "runaai-m1-functions/v1", enabled: true,
      scope: "supplied-text-and-disposable-javascript", capabilitySetVersion: CAPABILITY_SET_VERSION,
      capabilitySetDigest: CAPABILITY_SET_DIGEST,
      requestControls: Object.fromEntries(["chat", "research", "code", "review", "agent"].map(role => [role, { reasoningEffort: selected?.requestControls[role].reasoningEffort ?? null }])),
      qdrant: { endpoint: index.baseUrl, collection: index.collection }, embedding: { baseUrl: embedding.baseUrl, modelId: "text-embedding-nomic-embed-text-v1.5", dimension: 768 },
      reranker: { baseUrl: reranker.baseUrl, windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 } };
    const providerConfiguration = { schemaVersion: "runaai-model-roles/v1", baseUrl: provider.baseUrl,
      models: Object.fromEntries(["chat", "research", "code", "review", "agent"].map(role => [role, modelId])) };
    host = await createFunctionalHost({ pool: resources.pool, cipher, configuration, provider: providerConfiguration,
      javascriptExecutor: resources.executor, dataDirectory: resources.dataDirectory, sourceRoot: resources.root, getLedger,
      extraSuites: CONTROL_SUITES, taskHooks, faults: activeFaults });
    return { host, cipher, configuration, transports: { provider, embedding, reranker, index },
      workerInit: { ...resources.workerResources, configuration, provider: providerConfiguration,
        encryptionKeyHex: encryptionKey.toString("hex"), hmacKeyHex: hmacKey.toString("hex") },
      async close() { await host.close(); for (const item of owned.reverse()) await item.close(); cipher.destroy(); encryptionKey.fill(0); hmacKey.fill(0); } };
  } catch (error) { await host?.close().catch(() => {}); for (const item of owned.reverse()) await item.close().catch(() => {}); cipher.destroy(); encryptionKey.fill(0); hmacKey.fill(0); throw error; }
}
