const retrievedAuthorityInstructionPattern = /(?:\b(?:change|switch|override|ignore|bypass)\b.{0,100}\b(?:project|participant|thread|lane|policy|approval|authority)\b|\b(?:call|run|execute|claim)\b.{0,100}\b(?:tool|write|effect)\b)/i;

export function containsRetrievedAuthorityInstruction(content) {
  return retrievedAuthorityInstructionPattern.test(String(content));
}

export function modelSafeIndexText(source) {
  return containsRetrievedAuthorityInstruction(source.content)
    ? "[withheld source: authority-changing or tool-invocation instructions]"
    : source.content;
}
