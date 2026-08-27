import { z } from "zod";
import { BurninObservationSchema } from "../contracts.mjs";
export const ObservationSchema = BurninObservationSchema.extend({
  schemaVersion: z.literal("runa2-gate7f1-observation/v2"),
  evaluationSealSha256: z.string().regex(/^[a-f0-9]{64}$/),
  finishReason: z.enum(["stop", "length"]),
}).strict();
export const parseObservation = value => ObservationSchema.parse(value);
