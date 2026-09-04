import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const startupSchema = z.object({
  schemaVersion: z.literal("runa-public-git-child-startup/v1"),
  operationId: id,
  startupResourceId: id,
}).strict();

export function admitPublicGitMaterializerStartup(value) { return startupSchema.parse(value); }
export async function runPublicGitMaterializerChild(value) {
  admitPublicGitMaterializerStartup(value);
  throw Object.assign(new Error("public-git-materializer-native-bootstrap-unavailable"),
    { code: "public-git-materializer-native-bootstrap-unavailable" });
}

export const publicGitMaterializerChildProofBoundary = Object.freeze({
  deterministicInterfaceOnly: true,
  networkAllowed: false,
  acceptsExecutablePath: false,
  acceptsReleaseHash: false,
  actualBootstrapAndMaterializationProofRequired: true,
});
