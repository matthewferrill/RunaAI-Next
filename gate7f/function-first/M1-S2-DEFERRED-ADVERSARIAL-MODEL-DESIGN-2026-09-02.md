# Deferred adversarial model design — 2026-09-02

Status: documented and tabled until the Gemma-primary application passes actual-system acceptance.

## Purpose

Gemma is the only generation/reasoning model in the current application slice. The additional models are
not backups for ordinary Chat or Agent work. They are future read-only challengers for cases where the
user deliberately requests an adversarial comparison of Research, Code or Review output.

| Function | Primary | Second opinion | Third opinion |
|---|---|---|---|
| Chat | Gemma | none | none |
| Agent | Gemma | none | none |
| Research | Gemma | Qwen3 Coder 30B-A3B | Qwen3.6 27B MTP |
| Code | Gemma | Qwen3 Coder 30B-A3B | Qwen3.6 27B MTP |
| Review | Gemma | Qwen3.6 27B MTP | Qwen3 Coder 30B-A3B |

## Future composition rules

- Home leases the models sequentially because the actual hardware supports one large generation model
  at a time alongside Nomic. The application must unload and verify each lease before the next.
- Challengers receive the same frozen user request and selected evidence, cannot execute actions, cannot
  expand source scope and cannot grant authority.
- Results remain attributed. The application must not hide disagreement behind majority voting, silently
  replace Gemma, or call a failure a consensus.
- The user explicitly requests comparison and chooses whether a challenger materially changes the answer.
- Any future implementation needs its own exact-current-system acceptance. Earlier comparative results
  may guide model order but do not qualify a changed prompt, checker or application contract.

## Resume condition

Resume this design only after the Gemma-primary UI, five function routes, shadow deployment, real browser
smoke journey, lifecycle cleanup and customer-facing behavior are accepted. Until then, additional model
work is out of scope and must not consume the current implementation path.
