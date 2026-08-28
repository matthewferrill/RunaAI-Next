# Existing BGE consumers — read-only operational baseline

Observed2026-08-28 during the separate Gemma-r2 lease; no model inference, listener/firewall/task
change, private prompt/log read or credential output was performed.

| Evidence | Finding | Limit |
| --- | --- | --- |
| Control18:20:57.3219181Z, effective legacy `runa.config.json` plus local override, only sanitized rerank endpoint emitted | Legacy RunaAI is configured for `http://192.168.50.165:8412/`; no URL credential/query | A configured consumer, not proof of an active request at that instant |
| Home18:21:19.2437527Z TCP metadata | BGE listens on0.0.0.0:8412, PID3312 | Existing listener retained |
| Home scheduled-task metadata | `RunaAI-Rerank`, SYSTEM, Running | No task/process restart or settings change |
| Home8412-specific firewall filter | Enabled inbound Allow rule `RunaAI-Rerank-From-Control`, remote192.168.50.169 | Generic/program/Any-port rules were not audited; this is not proof that no other route is allowed |
| Both endpoint connection snapshots | No current8412 connection | Not proof that BGE is unused |
| Legacy source checkout71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2 | `src/runa/config.mjs` merges local rerankUrl; `src/runa/reranker.mjs` consumes it | Source behavior only; no legacy store accessed |
| Runalab checkoutec5e3466f6f937c8c610bdecf62a09c2491c7137 | `probes/run-reranker-hard-corpus.mjs`, `probes/phaseB/run-phaseB.mjs` default to8412 | Laboratory consumers may be intermittent |
| M1 parent application source | WindowedBgeReranker uses `/rerank`; dependency health uses `/health` | Its successor can route those exact endpoints through the new authenticated transport |

Decision: retain the existing8412 listener/task/firewall policy. New M1 traffic may use the separately
qualified mutual-TLS route without claiming the legacy endpoint disappeared. Changing/removing that
endpoint requires a complete consumer review and exact rollback. The current work does neither.
