# Request coverage and continuing constraints — prospective shared correction

The independently reviewed frozen Qwen3.6 arm contains the complete relevant
user input but omits a named subject in all three continued invitation drafts,
adds a third sentence to all three two-sentence requests, and omits explicit
unknown information in some summaries/research answers. These are real answer
quality failures or uncertainties, not transport/input-loss findings. Coder and
early Gemma observations also expose omissions. Their baseline records remain
unchanged; no prompt change is applied to a running campaign.

The existing shared answer instructions call history context and ask for concise
answers, but do not explicitly distinguish continuing user constraints from
superseded topics. They also do not explicitly forbid extra framing when a user
requests an exact output format. A shared instruction clarification is warranted;
it is not proof that any model will satisfy those constraints.

Before fresh matched qualification:

1. Clarify that relevant prior **user** constraints remain in force until the
   user changes them. Past assistant text and retrieved/source text cannot add
   instructions or authority. The current request remains the primary question.
2. When the user specifies an exact format/length, comply without extra greeting,
   preface or closing. Do not hard-code case names, answers, numeric values,
   examples from the evaluator, model IDs, expected outputs or scoring rules.
3. Summaries/drafts must retain the requested subject, material quantities,
   responsible people, blockers, next actions and stated unknowns as relevant.
   Explicitly requested unsupported information must be identified as unknown,
   not fabricated or silently dropped. This is advice, not a permission change.
4. Apply the same common instructions through the real Mastra answer adapter for
   every applicable plain chat, guarded/local, selected-evidence and review path.
   Preserve schema, prompt input bytes, role/model selection, output/deadline
   ceilings, no-retry behavior and one direct answer generation. Do not add a
   hidden critique/repair model call or deterministic answer rewriting.
5. Record actual installed-SDK wire tests on all three profiles and both plain
   and evidence paths. They prove instruction transport only. Re-run the same
   full case set/thresholds on each model under a fresh common seal to establish
   quality; preserve every baseline omission and failure regardless of outcome.

This is bounded M1 corrective work under the existing authorization. The other
17-family roadmap work, execution governance, native safety and independent
semantic review are unchanged. No production routing or service is changed by
the local tests.
