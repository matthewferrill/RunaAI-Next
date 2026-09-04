import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const startupSchema = z.object({
  schemaVersion: z.literal("runa-public-git-child-startup/v1"),
  operationId: id,
  startupResourceId: id,
}).strict();

export function admitControlCoordinatorStartup(value) { return startupSchema.parse(value); }
export async function runControlCoordinatorChild(value) {
  admitControlCoordinatorStartup(value);
  throw Object.assign(new Error("control-coordinator-native-bootstrap-unavailable"),
    { code: "control-coordinator-native-bootstrap-unavailable" });
}

export const controlCoordinatorChildProofBoundary = Object.freeze({
  deterministicInterfaceOnly: true,
  acceptsExecutablePath: false,
  acceptsReleaseHash: false,
  acceptsEndpoint: false,
  actualBootstrapAndControlFrameProofRequired: true,
});
