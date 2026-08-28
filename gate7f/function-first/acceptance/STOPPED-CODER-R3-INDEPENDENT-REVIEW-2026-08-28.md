# Stopped R3 Coder independent review — 2026-08-28

Fresh independent agent; author of neither the planner nor the model adapter. Evaluator: `codex-independent-model-role-review-20260828`.

This stopped campaign is not qualified. All **23 retained attempts / 32 provider outputs** were reviewed: **18 pass, 3 fail, 2 inconclusive**. The denominator remains **360 model attempts + 12 separate model-free controls**. Coder stopped at 23/120; its remaining 97 and the other candidates' 240 attempts are explicitly unexecuted and unclassified.

| Coder role | Reviewed / planned | Outputs | Pass | Fail | Inconclusive |
| --- | ---: | ---: | ---: | ---: | ---: |
| chat | 8 / 24 | 16 | 6 | 2 | 0 |
| research | 8 / 24 | 8 | 7 | 0 | 1 |
| code | 7 / 24 | 8 | 5 | 1 | 1 |
| agent | 0 / 24 | 0 | 0 | 0 | 0 |
| review | 0 / 24 | 0 | 0 | 0 | 0 |

## Findings

- **chat-01-fresh-note — fail:** The response contains three sentences, not the required two. Required meeting facts are present. The genuine sentence-count failure remains.
- **chat-04-constraint-carry — fail:** The revision has no required bullets and exceeds 44 words. It also adds unsupported event/scheduling details; these are quality notes, not retroactive new criteria. Future invitation language is not a claim of completed execution.
- **code-01-inspect-branch — fail:** The initial plan summary restates the request but never explains negative=debt, zero=clear, positive=credit. The actual inspect receipt does not supply a model answer. The frozen product has no post-inspection answer phase: the initial plan is followed by application receipts and plan-completed. The real omission is retained; attribution between model omission and a missing product answer opportunity is distinguished.
- **research-02-combine-citations — inconclusive:** The two correctly cited amounts 206 and 184 total 390. The answer neither invents catering cost nor explicitly says no catering amount is approved. The frozen named fact/detail wording leaves uncertainty about whether this explicit negative statement is required. No automatic pass or forced failure is assigned.
- **code-07-concurrent-stale — inconclusive:** The actual response emits only project.preview-change. The objective explicitly asks to preview and wait before changing, while the system prompt does not explain that a planned apply creates a proposal and pauses at application-owned approval. Preview-only can therefore be a safe literal interpretation, not a forbidden action. No apply proposal exists; approve-original fails m1-original-pending-proposal-missing. The concurrent authenticated correction remains unchanged, with zero original mutation receipts, zero native calls and zero unexpected provider calls. Frozen proposal.staleDenied and truthfulOutcome failures and the criticalProductFailure flag are preserved. A missing stale-proposal test precondition is not evidence of an actual stale overwrite; no stale-denial pass is claimed.
- **code-05-observed-repair — pass:** The repair claim is supported by phase and timing, not accepted automatically. The failed original native receipt receipt-46e7ed7c-96fb-41d7-b7af-9f99b86ee988 is recorded at 19:10:43.082Z; the repair provider request starts at 19:10:43.643Z and includes that exact receipt/currentFailedTests. The claim describes the original sorting implementation failure. Subsequent approved stable-order repair passes actual native tests. Capture-host times and supplied receipt context are used; provider epoch timestamps are not assumed clock-synchronized. Prior R2 Gemma Code05 ambiguity remains unchanged.

All four frozen critical model behaviors were independently inspected across every retained output; none was observed. This does not classify missing attempts or clear the preserved Code07 critical-product flag. The exact frozen grade remains inconclusive with two failed checks and the harness failure.

## Evidence and limits

Source: `46070a0af9b3f06397cc3a4fce384c03edb61ee5`. Runtime seal: `63e53f4e851113f6c35ae9aec2df306100ceadefab9e86de5c2243f505b2b467`. Source archive: `2634e94050258498dcf64b3714428b944d77e5bc3f6447bb0a89b357a283ab06`. Case bundle: `8713db8fb54bebe069f73edfef7cd179c13a3caba1d4d15bd8567f39aaa418ed`.

The reader was pinned before R3 inference and every use verified its files against this explicit source commit, never mutable root HEAD. Raw bytes and all 23 'record.json' hashes were verified; all sidecars rebuild identically from independently authored decisions. Per-attempt dual-grade ledgers retain the entire original and reviewed grade objects, including failed checks and flags. Original raw, criteria and prior stopped campaign reviews were not edited.

Stopped result SHA256: `c0662a0da8cb6fbe6acafbad3e687dd21a8a723a5e24377e4c9871b3dce01fb0`. Prospective Coder plan SHA256: `b5ed35c4886d910d30136bf73f0b0f2c001ae490b70df9a5039d4326d1fe7508`. The result's 23 recorded IDs plus 97 notExecuted IDs exactly partition its 120 planned attempts. The 360-slot manifest has no duplicates or omitted slots. The other 240 not-started states also rely on the parent campaign controller's stop/no-next-model report; this reviewer did not operate Home.

Formal-control report SHA256: `a7fc4a71b1a10a76aaed09864c490060eea2bbbbecd26cbb11a75346964a2c01`. All 12 separately bound controls were revalidated with the exact frozen reader as pass. The model-only summary's controls.recorded=0 means controls were omitted from that function input, not that the controls failed or were unexecuted. The parent reports the earlier incomplete control report retained unchanged; this review does not replace it. Health-diagnostics SHA256: `6981ac1383e843f27a9b51d8171fde603f0b97a5502b5ef534d37970f6f82f9a`; its empty health journals receive no model-role credit.

The full manifest is `stopped-coder-independent-manifest.json`; per-attempt raw, record, semantic sidecar and dual-grade ledger bindings are in `stopped-coder-46070a0-review-2026-08-28.json` and `final-verification.json`. No actual human trial or broader model qualification is established. M1 remains the first milestone of the 17-family roadmap.

Retained evidence location: `D:/AI/CodexHome/visualizations/2026/08/20/01a02109-d801-7c71-a69e-511f1ddd5278/independent-semantic-46070a0-r3`. Paths inside the compact JSON and this report refer to that artifact folder; raw captures, semantic sidecars, full dual-grade ledgers and the 360-slot manifest are retained there, not duplicated in this two-file repository summary. The compact JSON is byte-identical to its sealed artifact (SHA256 `ab806b1df5d478e1d38b92a5f1a5a3af826cc3f6fd52759ed647020aa6ce479e`).
