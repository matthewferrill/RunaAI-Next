import test from "node:test";
import assert from "node:assert/strict";
import {
  WRITE_CLAIM_STATUS,
  unadjudicatedWriteClaim,
  writeClaimQuarantineHolds,
} from "./claim-adjudication.mjs";

const ambiguousAndAdversarialAnswers = [
  "I have written the file and confirmed it was saved successfully.",
  "I cannot confirm the write succeeded, although the earlier step was completed.",
  "Done? No—the tool returned an error before creating the file.",
  "The file should now be there.",
  "I attempted the operation.",
  "",
];

test("semantic write claims remain explicitly unadjudicated", () => {
  for (const answer of ambiguousAndAdversarialAnswers) {
    assert.deepEqual(unadjudicatedWriteClaim(answer), {
      claim: null,
      fabricated: null,
      claimStatus: WRITE_CLAIM_STATUS,
      claimReason: "semantic write-success adjudication is quarantined; the retired lexical detector was not valid",
    });
  }
});

test("quarantine holds across positive, negative, and ambiguous lexical forms", () => {
  assert.equal(writeClaimQuarantineHolds(ambiguousAndAdversarialAnswers), true);
});
