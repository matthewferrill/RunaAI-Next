// These rules select truthful read-only replies; they do not grant permissions.
// Actual data/action authority stays in the authenticated application and executors.
const protectedTarget = /\b(device vault|dpapi|windows hello|credential store|private keys?|machine[- ]bound ciphertext)\b/i;
const explicitRead = /\b(read|show|reveal|give|extract|access|unlock|dump|export|retrieve|list)\b/i;
const protectedPossession = /\b(?:my|your|our|the actual|stored|owner(?:'s)?)\b/i;
const explanation = /^\s*(?:please\s+)?(?:explain|define|describe|teach me|how (?:does|do|can|should)|what (?:is|are))\b/i;

export function requestsProtectedRead(message) {
  const value = String(message);
  if (!protectedTarget.test(value)) return false;
  // Definitions and security guidance do not read the corresponding store.
  if (explanation.test(value) && !protectedPossession.test(value)
      && !/\b(?:show|reveal|dump|extract|retrieve)\b/i.test(value)) return false;
  return explicitRead.test(value) || protectedPossession.test(value);
}

export function requestsUnavailableEffect(message) {
  const value = String(message);
  // A discussion or draft about an action is not an action request. Executable
  // tool calls remain impossible in this answer service regardless of wording.
  if (/^\s*(?:please\s+)?(?:explain|describe|what (?:is|are)|how (?:do|does|can|should|would)|help me understand)\b/i.test(value)) {
    return false;
  }
  if (/\b(?:draft|write|create)\b.{0,40}\b(?:example|sample|fictional)\b/i.test(value)) return false;
  const command = "(?:^|[.;]\\s*|\\b(?:and|then)\\s+)(?:(?:please|can you|could you|would you)\\s+)?";
  return new RegExp(command + "(?:delete|deploy|execute|install|uninstall|publish|send|approve)\\b", "i").test(value)
    || new RegExp(command + "run\\b.{0,50}\\b(?:program|code|script|command|tests?|console\\.)", "i").test(value)
    || new RegExp(command + "write\\b.{0,50}\\b(?:to disk|to (?:a |the )?file|into (?:a |the )?database)", "i").test(value)
    || new RegExp(command + "(?:learn|remember|save)\\b.{0,60}\\b(?:permanently|for (?:next time|future chats)|long[- ]term memory)", "i").test(value);
}

export function requestsLiveInformation(message) {
  const value = String(message);
  if (/^\s*(?:please\s+)?(?:draft|write|explain|describe|define)\b/i.test(value)) return false;
  return /\b(?:weather|forecast|news|prices?|scores?|showtimes?)\b/i.test(value)
    && /\b(?:today|current|live|latest|now|near me|my area|tonight|tomorrow)\b/i.test(value);
}

export function claimsUnperformedAction(answer) {
  // Ignore code and quoted examples. This catches explicit known claims, not all
  // possible semantic deception; live qualification must test that distinction.
  const prose = String(answer).replace(/```[^\n]*\n[\s\S]*?```/g, "")
    .replace(/^\s*>.*$/gm, "");
  return /\bI\s+(?:(?:have|just|successfully|actually)\s+)*(?:ran|executed|deployed|installed|deleted|modified|changed|sent|published|saved)\b/i.test(prose)
    || /\bI\s+(?:(?:have|just|successfully|actually)\s+)+run\b/i.test(prose)
    || /\b(?:the\s+)?(?:execution|deployment|test run)\s+(?:(?:has|was)\s+)?(?:completed|succeeded|successful)\b/i.test(prose)
    || /\b(?:sandbox|runtime|tool)\s+(?:receipt|execution)\s*(?:id\s*)?[:=]\s*\S+/i.test(prose);
}
