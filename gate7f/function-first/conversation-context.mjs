import { z } from "zod";

export const CONVERSATION_CONTEXT_LIMITS = Object.freeze({ maximumTurns: 12,
  maximumCharacters: 24_000, maximumMessageCharacters: 8_000 });
const id = z.string().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/u);
const scopeSchema = z.object({ participantId: id, projectId: id, threadId: id,
  experience: z.enum(["chat", "code"]) }).strict();
const coded = code => Object.assign(new Error("The requested conversation context is unavailable."), { code });

export function parseConversationScope(value) {
  const checked = scopeSchema.safeParse(value);
  if (!checked.success) throw coded("conversation-context-invalid");
  return checked.data;
}

// Call only after the store has checked ownership, project scope and experience.
// Source text and browser history can never construct this authoritative record.
export function createConversationContext(scope, { turns = [], turnCount = turns.length } = {}) {
  const checked = parseConversationScope(scope);
  if (!Array.isArray(turns) || !Number.isSafeInteger(turnCount) || turnCount < turns.length) {
    throw coded("conversation-context-invalid");
  }
  const { maximumTurns, maximumCharacters, maximumMessageCharacters } = CONVERSATION_CONTEXT_LIMITS;
  let characters = 0;
  let truncated = turnCount > Math.min(turns.length, maximumTurns);
  const pairs = [];
  for (const turn of turns.slice(-maximumTurns).reverse()) {
    if (typeof turn?.user !== "string" || typeof turn?.assistant !== "string") {
      throw coded("conversation-context-invalid");
    }
    const user = turn.user.slice(0, maximumMessageCharacters);
    const assistant = turn.assistant.slice(0, maximumMessageCharacters);
    truncated ||= user.length !== turn.user.length || assistant.length !== turn.assistant.length;
    if (characters + user.length + assistant.length > maximumCharacters) { truncated = true; break; }
    characters += user.length + assistant.length;
    pairs.push([Object.freeze({ role: "user", content: user }), Object.freeze({ role: "assistant", content: assistant })]);
  }
  return Object.freeze({ schemaVersion: "runaai-conversation-context/v1", ...checked,
    turnCount, history: Object.freeze(pairs.reverse().flat()), truncated,
    omittedTurns: turnCount - pairs.length, source: "authoritative-conversation-store" });
}

export function assertConversationContext(value, expected) {
  const scope = parseConversationScope(expected);
  if (value?.schemaVersion !== "runaai-conversation-context/v1"
      || value.source !== "authoritative-conversation-store"
      || Object.keys(scope).some(key => value[key] !== scope[key])
      || !Array.isArray(value.history) || value.history.length > 24
      || !Number.isSafeInteger(value.turnCount) || value.turnCount < 0
      || value.history.some(turn => !["user", "assistant"].includes(turn?.role)
        || typeof turn.content !== "string" || turn.content.length > 8000)
      || value.history.reduce((count, turn) => count + turn.content.length, 0) > 24_000) {
    throw coded("conversation-context-invalid");
  }
  return value;
}
