import { z } from "zod";
import { CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION } from "./tasks/contracts.mjs";

const privateService = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "http:" && ["127.0.0.1", "192.168.50.165", "192.168.50.169"].includes(url.hostname)
    && !url.username && !url.password && !url.search && !url.hash;
}, "M1 dependencies must be explicitly bound private services.");

// Opt-in v2 release configuration only. An old release never gains a tool from a code upgrade.
export const m1FunctionConfigSchema = z.object({
  schemaVersion: z.literal("runaai-m1-functions/v1"), enabled: z.literal(true),
  scope: z.literal("supplied-text-and-disposable-javascript"),
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION), capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST),
  requestControls: z.object(Object.fromEntries(["chat", "research", "code", "review", "agent"].map(role =>
    [role, z.object({ reasoningEffort: z.literal("none").nullable() }).strict()]))).strict(),
  qdrant: z.object({ endpoint: privateService, collection: z.string().regex(/^m1_[a-z0-9_]{1,70}$/) }).strict(),
  embedding: z.object({ baseUrl: privateService, modelId: z.literal("text-embedding-nomic-embed-text-v1.5"), dimension: z.literal(768) }).strict(),
  reranker: z.object({ baseUrl: privateService, windowCharacters: z.literal(2000), overlapCharacters: z.literal(300), batchSize: z.literal(32) }).strict(),
}).strict();

export function assertM1Roles(provider) {
  if (provider?.schemaVersion !== "runaai-model-roles/v1" ||
      ["chat", "code", "research", "review", "agent"].some(role => !provider.models?.[role])) {
    throw Object.assign(new Error("M1 functions require all five explicit model roles."), { code: "m1-model-roles-required" });
  }
}
