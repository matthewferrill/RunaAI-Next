# M1 qualified Home runtime guard — prospective operator slice

Prepared before implementation, 2026-08-28. Parent operator authorized this bounded work under the
standing non-destructive M1 permission. This does not choose a model, alter the frozen application
source/campaign, or activate a persistent service. All current campaign leases remain immutable.

## Current evidence and options

Read-only Home observations at17:40–41Z show that LM Studio1234 is the existing Matthew desktop
process, launched through his Windows user Run entry. `enableLocalService` and `autoStartOnLaunch`
are true, but no LM Studio boot task was found. BGE8412 has its existing SYSTEM boot task. Server JIT
is true, JIT idle TTL is3600seconds, auto-evict is false; sensitive logging and verbose logging are
currently true. These settings were inspected without reading logs or secret values and were not changed.

1. Reuse the exact tested runtime and add explicit model ownership plus transparent request admission.
   A boot-start guard waits closed if the existing desktop service is unavailable. This is the smallest
   compatible change, but it does **not** itself remove the Matthew-login dependency.
2. After campaigns, test the installed exact desktop service launch under an explicit Windows startup
   task/profile. Only a real unattended startup/recovery proof can establish that it works without login.
3. A standalone llmster daemon is the documented headless alternative. It is a distinct binary/runtime
   qualification and must not silently replace the tested desktop runtime.

Implement option1's reusable guard/core and tests now. Do not change a live service, JIT/logging setting,
firewall, port, task or model until campaigns finish and the separately pinned operational package is
ready. Parent coordinates the later option2 feasibility/proof or a separately qualified option3.

Primary references: [LM Studio headless operation](https://lmstudio.ai/docs/developer/core/headless),
[JIT/TTL semantics](https://lmstudio.ai/docs/developer/core/ttl-and-auto-evict), and
[server settings](https://lmstudio.ai/docs/developer/core/server/settings).

## Entry criteria and fixed contract

- Exactly one selected primary profile plus the pinned Nomic auxiliary and existing BGE; no winner is
  selected in source. Mixed primary-role deployments require a separately proved queue/swap design.
- Reuse campaign artifact/runtime/template pins and explicit32768/flash/KV/MTP settings. Nomic stays
  at2048context. Request reasoning controls remain the tested `none` or omitted field, never text suffixes.
- JIT must be off and sensitive inference logging off before production admission. The guard does not
  mutate those existing settings during its normal startup or requests. An operational transition must
  retain exact old bytes and rollback separately. TTL/default JIT must never recover a missing instance.
- Owner-controlled code/profile/state, exact model-instance ownership and generation. Unknown residency,
  ambiguous load, altered profile, stale observations or missing dependencies close admission.
- Keep160W,85C cutoff,5second telemetry,8GiB host headroom and1GiB per GPU. No shell/eval or arbitrary
  command/path supplied by an HTTP client. Hardware lifecycle remains the sole operator's authority.

## Work and acceptance

1. Pure contract: validate exact selected artifact/profile and live instance configuration. A familiar
   model ID or successful HTTP status is not enough. Reject extra instances, mismatched fingerprints,
   missing/old generation, changed settings, stale hardware and wrong UUIDs.
2. Lifecycle controller: serialized start → validate pins/settings/zero residency → bounded cooldown →
   set power/load explicit primary and Nomic → verify → ready. Hold each request as an active admission.
   Draining prevents new admissions and waits boundedly; cancellation/fault aborts in-flight requests
   before owned cleanup. Never unload an unowned instance or restore260W while ownership is ambiguous.
3. Transparent proxy: permit only configured internal clients and fixed `/v1/models`,
   `/v1/chat/completions`, `/v1/embeddings`, and a minimal health route. Require fresh profile/resource
   proof immediately before forwarding, with generation recheck after async validation. Reject lifecycle,
   native agent/MCP, arbitrary endpoints, TTL/load overrides and unselected models. Preserve successful
   inference request body and response body bytes; do not rewrite messages, reasoning, tools or results.
4. Deterministic tests with local disposable HTTP fixtures and explicit runtime/hardware doubles:
   startup/unavailable/settings drift, exact load settings, missing/extra/changed residency, concurrent
   admission vs drain, request cancellation, no blind replay/reload, thermal/memory failure, bounded
   body/reply/time, correct HTTP forwarding, byte identity and owned rollback. These are not live Home proof.
5. Separate native adapter/operator package and actual post-campaign validation: exact startup identity,
   profile/source/config pins, idle persistence past the previous TTL, process restart, dependency loss,
   safe drain, fault closure, rollback and original settings restoration. Do not claim production-ready
   or unattended reboot support until the relevant actual tests pass. No new model download is needed.

## Non-goals and rollback

No broad codework, public model API, automatic model selection, direct raw model access, runtime upgrade,
new Cloudflare component, credential copy, private log export, production chat storage change or frozen
campaign amendment. The private proxy is not a substitute for network authentication: exact deployment
binding/client enforcement and removal of bypass routes must be proved in the operational transition.
OS least privilege and any owner-elevated hardware helper must be explicit rather than implied.

The initial core/proxy has no installation side effect. Operational rollback first closes admission and
drains/aborts its own requests, then unloads only exact owned instances, verifies zero residency, restores
the original260W limits and prior server/routing settings, and stops only new owned tasks. Retain all
profile/evidence/state bytes. No recursive deletion or unrelated service stop is permitted.
