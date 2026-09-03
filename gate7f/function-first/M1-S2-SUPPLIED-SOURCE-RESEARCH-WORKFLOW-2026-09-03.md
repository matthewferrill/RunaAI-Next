# M1-S2 supplied-source Research workflow

Date: 2026-09-03  
State: deterministic application workflow green; actual provider and browser acceptance open

This checkpoint wires the bounded M1 Research workflow into the single application canvas. A submitted plan is
required and contains one to eight editable steps. Each selected source locator carries its project, source, section
and exact content digest. The server resolves the complete ordered selection, verifies active/current records and
full canonical bytes, runs the existing selected retrieval/reranker and evidence checker, then revalidates every
source immediately at the provider boundary. A missing, foreign, revoked, stale, partially resolved or changed
selection results in zero provider calls.

The report distinguishes ready, incomplete and unavailable outcomes. It is attributable only when the response is
complete, every selected source resolves, all passes ran, citations are known and checker-qualified, and there is no
degradation, omission, unanswered term, truncation or missing evidence. Progress, selected revisions, conflicts and
limitations remain visible without persisting answer or source text in the evidence record. The lane remains
supplied-source-only; live web research is not enabled.

The first green implementation was stopped by independent review at P1=4: the browser selection lost the exact
content revision, a revoke/change race could allow a partial provider call, report readiness ignored several explicit
incomplete signals, and an absent plan was fabricated as submitted. Those contracts and adversarial paths were
corrected. Re-review then found one production-composition widening: explicit Research still selected approved
learning context and passed it as provider advisory material despite claiming selected sources only. The final
correction bypasses approved-knowledge selection for explicit supplied-source Research and forces provider advisory
to null. Chat and contextual Review keep their existing approved-knowledge behavior.

The final focused Research suite passes 17/17. The builder's bounded affected group passes 90/90, and independent
review reproduced its exact Research/Review/Gate2/panel/evidence/routing subset at 68/68 with P0=0/P1=0. These are
deterministic application fixtures only. No live model/provider, Qdrant, PostgreSQL, browser, web/network, production
route or customer acceptance ran. The existing qualified Gemma Research model evidence is preserved but is not
replayed or relabeled by this implementation checkpoint.
