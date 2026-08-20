# PHASE B — findings (the components with zero coverage)

Graded against `PHASE-B-PREREGISTRATION.md` as sealed at `b56e208`, before the harness existed.
28 runs, 0 environment errors, 4/4 instrument checks including the control.

## Verdicts

| Invariant | Verdict |
|---|---|
| I-PB1 — retrieval finds the planted answer | **13/13**, correct document 12/13 |
| I-PB2 — reranking improves retrieval | **NO EFFECT** — but see the ceiling below |
| I-PB3 — the 512-token limit truncates silently | **DEGRADES SEVERELY, UNSIGNALLED** |
| I-PB4 — `@mastra/core/auth` supplies identity | **PRESENT AND CONSTRUCTS** |

## I-PB1 — retrieval works, on every axis

**13 of 13**, and 12 of 13 returned the exact planted document. Every axis passed: verbatim,
paraphrase, conceptual, multi-hop, hard-negative, corpus scaling at 60 / 300 / **1000**, topk at
k=1/3/10, and index staleness.

Retrieval is not a fray. It was never measured before, and it holds.

## I-PB2 — NO EFFECT, on a benchmark retrieval already saturates

Paired over all 13 cases, same corpus, same query, same embedder, only the reranker differing:

```
rerank OFF: 13/13 found (12 correct doc)
rerank ON:  13/13 found (12 correct doc)
paired difference: 0
```

**This does not mean reranking does not help.** Baseline retrieval found every planted answer, so
there was no headroom for a reranker to improve anything. The result is **NO EFFECT on a benchmark
with no room for an effect** — a ceiling, and a weakness of the corpus for this question rather than
a property of the reranker.

Answering "does reranking help" properly needs cases where plain vector search **fails**: larger
corpora, more competitive distractors, or queries whose lexical overlap misleads embeddings. The
sealed corpus was built to test retrieval, not to test a reranker, and it shows.

**What can be said:** on this corpus, reranking neither helped nor hurt, and it costs a network round
trip per query. Nothing here justifies the production config's dependency on it, and nothing here
condemns it.

## I-PB3 — the reranker degrades severely past 512 tokens, and says nothing

Same answer, same words, differing only in position:

```
short document (44 chars):     answer +5.14    decoy -11.02
long document (12,145 chars):  answer -7.75    decoy -11.02
```

**A 12.9-point score collapse** for identical text, caused only by sitting beyond the documented
`max_length: 512` window. Nothing in the response signals that the document was cut.

**My scenario was too weak to show the consequence, and that is a defect in the scenario.** The decoy
scored −11.02, so the truncated answer at −7.75 still ranked first and the binary check recorded
"answer not lost". Against a **competitive** distractor — anything scoring above −7.75 — the answer
would have been ranked below it. The magnitude is the finding; my pass/fail test did not capture it.

A corrected scenario uses a distractor tuned to sit between the two scores. That is a new sealed
version, not a reinterpretation.

**This is Fray 3 in the retrieval layer**: silent truncation, no completeness signal, and a caller who
cannot tell a scored document from a scored fragment.

## I-PB4 — identity exists, and was simply never configured

`@mastra/core/auth` exports **48** symbols. `StaticRBACProvider` constructs successfully and carries
real methods:

```
getRoles, hasRole, getPermissions, hasPermission,
hasAllPermissions, hasAnyPermission, getRoleDefinitions,
getAvailableRoles, getPermissionsForRole, roleMapping, clearCache
```

FGA permissions, `PERMISSIONS`, `RESOURCES`, `ACTIONS` and session providers are all present.

Every identity question in Waves 2, 3 and 6 was recorded **NO-MECHANISM**. That verdict was true of
**the configuration** and was never checked against the capability. **Fray 6 is not an absence in the
stack.** It is an absence in how the stack was configured — the same error Phase A found for
injection.

Whether the mechanism *holds under attack* is unmeasured. Constructing a provider is not the same as
resisting a forged actor claim, and Phase A is the standing reminder that present, working, and
usable are three different things.

## What Phase A and B together decide

**Two of the six frays are configuration, not capability.**

- **Fray 4, injection** — closed by the stack, 0/10 planted with 10/10 detector discrimination, though
  unusable at default settings because it blocks legitimate tool use
- **Fray 6, identity** — the mechanism is present and constructs; the NO-MECHANISM verdicts described
  a bare configuration

**One is confirmed architectural.** Fray 3, provider truncation: 5/5 bare, 5/5 configured, 5/5 on all
four model arms, and now the same shape again in the reranker at 512 tokens. Nothing in the stack or
the model roster closes it. **It must be built.**

**Retrieval is sound** and needs nothing.

**Reranking is unproven either way** on this corpus, and the corpus cannot settle it.
