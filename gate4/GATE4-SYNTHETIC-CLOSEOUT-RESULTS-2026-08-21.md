# Gate 4 synthetic closeout results

Status: implementation and local review complete; branch ready for steward review

## Plain-language result

The remaining selected Gate 4 work is smaller than a blanket migration suggested:

- Approved knowledge can now be supplied to general, guarded, research, and workspace answers in the
  synthetic slice. Exact participant/project/capability scope is applied first. The lessons are a
  separate advisory channel, never citations or permissions, and the response reports whether
  context was selected versus actually delivered to a provider.
- Gate 4D has only one selected persisted product value: `defaultIntelligenceLevel`. Gate 2/3 already
  own its target behavior. The new compatibility rehearsal proves exact mapping, safe default,
  participant binding, retry, changed-input refusal, failure recovery, and isolated rollback. The
  legacy provider catalog, endpoints, model choices, and credentials are not migrated.
- Gate 4E does not build another approved-knowledge index at 53 lessons. The direct selector is safe
  and fast on the sealed synthetic corpus, but it has zero recall on deliberately zero-token-overlap
  paraphrases. A vector/BGE arm was not authorized or run, so the result is a current **skip**, not a
  claim that semantic retrieval can never help. Remeasure at 530/5,300 lessons or sooner against a
  sealed semantic need.

## Gate 4C-3A evidence

- The adapter accepts only a projection whose authenticated events prove they are synthetic fixtures.
  A protected-like or fabricated delivery object fails closed.
- Unverified personal, wrong participant/project, and undeclared capability knowledge is excluded
  before relevance selection.
- General, guarded, research, and workspace provider payloads receive a distinct, bounded advisory
  envelope. Keyed provenance stays outside the model payload; raw lesson text stays outside response
  metadata and telemetry.
- Deterministic protected/effect/workspace denials execute first. Project evidence remains the only
  citation source. Dependency loss distinguishes selected context from actual provider delivery.
- Duplicate requests invoke the provider once. Adapter removal restores the previously accepted
  honest-empty behavior without data conversion.
- Focused Gate 4C suite: 34/34 passed, including six Gate 4C-3A test groups and the prior 28 projection
  cases.

This is structural synthetic proof. It does not claim semantic improvement from a live production
model and does not activate a protected projection or production route.

## Gate 4D evidence and disposition

- Focused compatibility suite: 6/6 passed.
- Low, Medium, and High map exactly. Missing, wrong-version, unknown-key, and invalid inputs use the
  safe Medium default and emit only the allowlisted key.
- Import requires an explicit target participant, retains only a keyed participant reference, and is
  idempotent only for the exact canonical source input. Changed input under the same run id is denied.
- Injected post-write failure restores the prior target value. Rollback restores only the imported
  Gate 4D row and leaves another participant unchanged.
- Retained receipts contain no credential, endpoint, provider/model selection, raw path, or participant
  identifier.

The optional protected one-value import remains deferred until the target primary-steward identity is
bound. It can share a later bounded owner campaign. Gemini credentials/settings, household identity,
DPAPI, Windows Hello, E4, and the device vault were not opened.

## Gate 4E measurement

- Synthetic active-library shape: 53 lessons — 1 personal, 5 project, 16 capability, and 31 global.
- Sealed queries: 24 across lexical positives, zero-token-overlap paraphrases, honest misses,
  cross-scope attacks, and forbidden-condition attacks; three repetitions each.
- Direct-selector lexical Recall@6: 6/6.
- Direct-selector paraphrase Recall@6: 0/6. This is the explicit future semantic-retrieval opportunity.
- Safety: zero false selections across 4 honest misses, 4 cross-scope attacks, and 4 forbidden attacks.
- Ordering was identical across repetitions, six-lesson/1,200-token bounds held, and p95 remained
  below the frozen 250 ms direct-selector threshold.
- No Nomic, Qdrant, or BGE arm ran; no model or collection was downloaded, created, or activated.

## Combined regression and cleanup

- Full Node suite: 167/167 passed.
- Gate 0: all 10 seals and all 12 pinned legacy focused suites passed under Node 22.22.0.
- Disposable selected-stack integrations passed and stopped every component:
  - Gate 1: 25/25 checks;
  - Gate 2: 21/21 checks;
  - Gate 3: 16/16 checks; and
  - Gate 4A: 16/16 checks.
- Test-generated timing/trace refreshes were not retained; the accepted evidence files were restored
  byte-for-byte from the branch head after their pass status and cleanup were confirmed.
- `git diff --check` passed.
- Legacy RunaAI stayed at `71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2`; its pre-existing untracked
  `.claude/settings.local.json` was not touched.
- RunaLab, protected data, production services, provider configuration, and production routes were
  unchanged.

## Review boundary

Review and merge may accept only this synthetic answer-lane wiring, one-setting compatibility mapper,
provider/settings disposition, and approved-knowledge index skip decision. It does not authorize a
protected setting read/import, retained protected projection, production provider/model use, Gate 5,
E3/E4/device-vault handling, or cutover.
