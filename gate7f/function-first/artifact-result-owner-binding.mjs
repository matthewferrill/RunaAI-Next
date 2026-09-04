import { z } from "zod";

const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u);
const conversationOwnerBindingSchema = z.object({ participantId: id, projectId: id.nullable(), chatId: id,
  experience: z.enum(["chat", "code"]) }).strict();

// This binding deliberately excludes mutable title, turn-count and navigation state. It is created with
// the chat and remains valid across ordinary turn appends and title changes, but not project reassignment.
export function conversationResultOwnerHmac(cipher, value) {
  if (!cipher || typeof cipher.digest !== "function") throw new Error("result-owner-binding-cipher-invalid");
  const binding = conversationOwnerBindingSchema.parse(value);
  return cipher.digest({ schemaVersion: "runaai-result-owner-binding/v1", kind: "conversation", ...binding });
}
