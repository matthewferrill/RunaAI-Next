const vendorLine = /^Q3 vendors:\s*(.+)$/imu;
const vendorName = /^[\p{L}\p{N}][\p{L}\p{N} .&'-]{0,40}$/u;

export class OutputDisclosureScanner {
  scan({ answer, allowedFacts, forbiddenDigests, digest }) {
    if (typeof answer !== "string" || !answer) return { allowed: false, reason: "empty-answer" };
    const normalized = answer.normalize("NFKC");
    if (forbiddenDigests.some(forbidden => digest(normalized).includes(forbidden))) {
      return { allowed: false, reason: "forbidden-digest" };
    }
    if (!allowedFacts.every(fact => normalized.includes(fact))) return { allowed: false, reason: "ungrounded-answer" };
    const expected = `The listed vendors are ${allowedFacts.join(", ")}.`;
    if (normalized !== expected) return { allowed: false, reason: "answer-contract-mismatch" };
    return { allowed: true, reason: "grounded-contract" };
  }
}

export function compileVendorFacts(documentEnvelope) {
  if (documentEnvelope?.provenance !== "retrieved_document" || !Object.isFrozen(documentEnvelope)) {
    return { outcome: "denied", reason: "untyped-retrieval" };
  }
  const match = documentEnvelope.content.match(vendorLine);
  if (!match) return { outcome: "denied", reason: "schema-field-missing" };
  const vendors = match[1].split(",").map(value => value.trim());
  if (vendors.length < 1 || vendors.length > 10 || vendors.some(value => !vendorName.test(value))) {
    return { outcome: "denied", reason: "schema-field-invalid" };
  }
  return { outcome: "compiled", facts: Object.freeze(vendors), sourceDigest: documentEnvelope.contentSha256 };
}

export function answerVendorQuestion({ questionEnvelope, documentEnvelope, outputScanner, digest }) {
  if (questionEnvelope?.provenance !== "authenticated_user_request" || !Object.isFrozen(questionEnvelope)) {
    return { outcome: "denied", reason: "untrusted-question", answer: null };
  }
  const compiled = compileVendorFacts(documentEnvelope);
  if (compiled.outcome !== "compiled") return { ...compiled, answer: null };
  const answer = `The listed vendors are ${compiled.facts.join(", ")}.`;
  try {
    const scan = outputScanner.scan({ answer, allowedFacts: compiled.facts, forbiddenDigests: [], digest });
    if (!scan.allowed) return { outcome: "denied", reason: scan.reason, answer: null };
    return { outcome: "answered", reason: scan.reason, answer, sourceDigest: compiled.sourceDigest };
  } catch (error) {
    return { outcome: "denied", reason: "output-scanner-unavailable", answer: null, errorClass: error.name };
  }
}
