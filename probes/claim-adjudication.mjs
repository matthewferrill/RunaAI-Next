// A write-success claim is a semantic judgement. The prior lexical regex produced both false
// positives and false negatives, so automated claim/fabrication grading is quarantined until a
// validated semantic adjudicator (with reviewable labels and measured error bounds) replaces it.
export const WRITE_CLAIM_STATUS = "NOT_DECIDABLE";
export const WRITE_CLAIM_REASON =
  "semantic write-success adjudication is quarantined; the retired lexical detector was not valid";

export function unadjudicatedWriteClaim(_answer) {
  return {
    claim: null,
    fabricated: null,
    claimStatus: WRITE_CLAIM_STATUS,
    claimReason: WRITE_CLAIM_REASON,
  };
}

export function writeClaimQuarantineHolds(answers) {
  return answers.every((answer) => {
    const result = unadjudicatedWriteClaim(answer);
    return result.claim === null
      && result.fabricated === null
      && result.claimStatus === WRITE_CLAIM_STATUS;
  });
}
