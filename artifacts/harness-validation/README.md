# Harness validation — NOT Wave 1 evidence

These outputs were produced in the cloud agent clone (Node v22.22.2), **not** on the frozen base
(RUNA-CONTROL, Node v22.22.1, BASE-MANIFEST.json). Per WAVE1-PREREGISTRATION.md, "results measured on
any other base are not Wave 1 results", so nothing here may be cited as a Wave 1 verdict, entered in
the fray map, or used in a migration decision.

Their purpose is the one the v2 sweep paid for: proving the harness measures what it claims before it
runs for record. Three v2 workflow probes first returned disk-I/O and parse errors that were harness
bugs, not framework findings, and reporting one as the other is the dishonesty the method forbids.

What this validation established about the harness:

- W1-A applies all six tamper variants successfully (`tamperApplied: true` on every one), so no
  variant is silently a no-op — an unapplied tamper that reads as a pass is the trap here.
- W1-A's dual grading works: the sealed I-A rule and the `detectionQuality` field disagree exactly
  where they should, on the variants where resume merely crashed on a broken container.
- W1-B's derived `achievedBoundary` disagreed with the intended one on `during-checkpoint-write`
  across two runs of the same configuration — the kill landed before the effect once and after it
  once. The harness therefore reports where the process actually died rather than where the sleep
  was aimed, which is the difference between a timing harness and a timing assumption.

The observations themselves are consistent with the v2 findings and are deliberately not summarised
here as results. The measurement is Control's to make.
