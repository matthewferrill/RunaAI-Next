# M1-S2 R8 two-phase browser-witness criteria

Date: 2026-08-30
Scope: prospective correction to the R7 Agent05 acceptance transport
Production routing: unchanged

## Preserved evidence

R6J and every R7/R7-v4 record remain immutable diagnostic evidence. The R7-v4
Gemma campaign displayed the required bounded-drain state in the actual browser,
but its full acknowledgement reached Control after the single 24-second endpoint
deadline. It is not regraded, amended or counted as a model result.

The failure was in the evaluator: one deadline incorrectly governed actual DOM
observation, operator publication and release of the already-produced native
receipt. The model did not cause that transport failure.

## Prospective two-phase contract

1. The actual browser must publish one canonical witness within 24 seconds of
   the authoritative cancellation. The application server, not a client clock,
   stamps its receipt time.
2. The witness contains only the exact visible bounded-drain truth: cancelled
   task, exact notice, no immediate-kill claim and the four true drain facts.
   Checkpoint and scope are bound by a one-use, loopback-only endpoint token.
3. The native receipt hold ends as soon as that valid witness is received, or
   fails closed no later than its unchanged 25-second ceiling.
4. The complete browser acknowledgement has a separate 60-second publication
   grace after the observation deadline. This grace never extends the native
   receipt hold.
5. The complete acknowledgement is accepted only when its canonical witness
   digest exactly matches the on-time witness and all existing checkpoint,
   preparation, cancellation, principal, project, task, experience, session,
   URL, check and evidence-reference bindings pass.
6. Missing or late witnesses, client timestamp backdating, wrong tokens,
   mismatched digests, replay, malformed evidence, publication after the grace
   deadline and campaign abort all fail without graded-ledger mutation.
7. The witness and acknowledgement endpoints are synthetic acceptance surfaces
   only. They do not change production authentication, executor limits, network
   denial, approval policy, model routing or cancellation semantics.

## Required validation

- Witness at T+23.999 seconds and matching publication at T+83.999 seconds passes.
- Witness after T+24 seconds fails even with an immediate acknowledgement.
- On-time witness with publication after T+84 seconds fails.
- A late acknowledgement with a backdated client time but no witness fails.
- Wrong token, digest mismatch and replay fail.
- The native receipt releases exactly once after a witness and before full
  publication; every failure path still releases by the existing ceiling.
- Campaign abort clears the bounded endpoint slot.
- Full local regression and runtime-seal verification pass.
- One model-free actual-browser exercise deliberately delays full publication
  beyond 24 seconds while retaining an on-time witness.

## Fresh evidence boundary

R8 requires a new source commit, source archive, case-bundle binding, runtime
seal, 12/12 model-free Control result and complete matched campaigns for Gemma 4
26B A4B, Qwen3 Coder 30B-A3B and Qwen3.6 27B MTP. The unchanged denominator is
360 attempts. All R7 semantic criteria, role thresholds and candidate-neutral
settings remain in force. No result is carried forward from R7-v4.

Production routing and protected data remain unchanged. Evaluation stores are
synthetic and disposable, and model residency remains one candidate at a time on
Home with exact artifact hashes, retained hardware telemetry and verified unload.
