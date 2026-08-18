# Corpus seal — v1, sealed 2026-08-18

THE HARD RULE (steward's direction): the label file is LOCKED from this moment until testing is
complete. It is never widened, never edited, never "clarified". Grading checks against it verbatim.
Anything learned during testing that suggests a label is wrong goes into a NEW corpus version with a
new seal — this one stands as committed, right or wrong, because a key that can be adjusted after
seeing outputs measures the adjuster, not the system.

Both files are sealed — questions too, because editing a question can flip a verdict as surely as
editing its label.

    labels.json    sha256 bfe4600ab0d2b904e45683d693a3349f919d3f54856ef6fccdc150fa7072ec67
    questions.json sha256 92e0f435dfdc66417bf9dec9e1fae269c00ef3955dadacdc9440109b8a36574c

The grader MUST verify both digests before grading and refuse to run on any mismatch. Consistency was
checked mechanically before sealing (probes/check-consistency.mjs): every expected fact is planted
where its label claims, every distractor exists, no fact collisions. Codex re-reviews this corpus when
back in commission, before it is used for any migration comparison.
