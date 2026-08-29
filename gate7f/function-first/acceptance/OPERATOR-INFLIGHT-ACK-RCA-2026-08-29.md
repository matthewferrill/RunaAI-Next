# In-flight browser acknowledgement RCA

Date: 2026-08-29. Scope: M1-S2 three-model qualification harness. This is a
prospective correction; it does not change production routing, protected data,
model artifacts, product authority, or the 17-family roadmap.

## Finding

The retained Gemma R10 diagnostic attempted all 120 planned slots, but its
Agent05 cancel-drain repetitions failed `m1-browser-in-flight-binding-invalid`.
The application and native execution evidence still showed the cancellation
receipt, retained eventual result, and no post-cancellation new effects. The
failure was not a Gemma answer-quality failure and not evidence that the product
claimed an immediate kill.

The operator acknowledgement serializer emitted the ordinary graded shape for
the special in-flight checkpoint. It omitted the authoritative prepared scope,
preparation checkpoint, cancellation time, project/task/experience bindings,
cancelled task status, exact bounded-drain notice and four drain facts. Its merge
order also allowed operator details to replace system-owned binding fields. A
generic `actual:false` therefore reached the strict validator and correctly
failed closed. The browser had not been refreshed after cancellation in the
failing attempt, so its last snapshot still showed the earlier active state.

R10 remains immutable diagnostic evidence. It cannot be selectively retried,
regraded, or called qualification evidence. Its candidate result was published,
Home residency was unloaded, power was restored, and its Control stage was left
intact for review.

## Correction

- `operator-browser-ack-helper.mjs` is the only acknowledgement serializer. It
  constructs system bindings from the frozen request and accepts only a bounded
  observation string for ordinary checkpoints.
- The in-flight case requires the exact preparation and cancellation bindings,
  `actual:false`, `Task: cancelled`, the exact bounded-drain notice,
  `claimedImmediateKill:false`, and the complete four-field drain object.
- Unknown or reserved detail fields fail closed. Details cannot overwrite any
  request, scope, check, URL, time or result binding.
- `Write-BrowserAck.Remote.ps1` verifies the Matthew owner context, exact owned
  stage, request, seal, URL and output location, then calls the tracked Node
  helper. The helper creates and fsyncs the acknowledgement exactly once.
- The live operator procedure refreshes the already-open task after cancellation
  and observes the exact cancelled/bounded-drain DOM before publication.

Focused tests cover exact preparation scope, reserved-field rejection, all
in-flight bindings and fail-closed variants, create-only/fsynced publication,
duplicate refusal, and Windows PowerShell 5 parsing. The original failing shape
is no longer constructible through the canonical helper.

## Qualification consequence

The correction changes frozen harness source, so it requires a new source archive,
runtime seal and same-seal model-free controls. Gemma, Qwen3 Coder and Qwen3.6
must each run a fresh complete 120-slot campaign, one model at a time on Home.
No earlier campaign, control file or acknowledgement is relabeled. Independent
grading and comparison follow the three complete runs. Production selection and
the bounded customer trial remain later decisions; M1 is still the first milestone.
