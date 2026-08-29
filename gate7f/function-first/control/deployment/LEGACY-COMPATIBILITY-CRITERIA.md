# Prospective legacy compatibility adapter criteria

Roadmap revision `2026-08-29.1`. This is a prerequisite for a native Home1234
rebind. It is not part of the selected M1 model guard or its qualification and
does not change the frozen M1 application, runtime seal, model grades or guard
allowlist.

## Purpose and topology

Legacy RunaAI currently calls Home1234 directly for OpenAI-compatible chat,
tool calling, model discovery and embeddings and calls reranker8412 separately.
Those request shapes are intentionally broader than the selected M1 guard. A
transparent move to Next9770 would reject valid legacy traffic; widening the
M1 guard would invalidate the boundary that was qualified.

Add a separate compatibility boundary with two exact interfaces:

- Control exposes one loopback-only legacy endpoint. Only the pinned legacy
  RunaAI process/config may call it. Caddy forwards it with a separate pinned
  client certificate and route; it is never a LAN/public listener.
- Home exposes one separately pinned mTLS legacy endpoint. Only the Control
  compatibility certificate and source address are accepted. Its upstream is
  the fixed native loopback runtime, never a caller-supplied URL.

The endpoint may map a versioned legacy model alias to the currently installed
primary model. That mapping must be explicit in the binding, status projection
and retained receipt. It must never be described as the selected M1 model's
qualified behavior. Reranker8412 remains outside this endpoint and unchanged.

## Exact protocol preservation

1. Accept only `GET /v1/models`, `GET /api/v1/models`,
   `POST /v1/chat/completions` and `POST /v1/embeddings`.
2. Chat accepts the bounded legacy fields `model`, `messages`, `temperature`,
   `max_tokens` and optional `tools`. It preserves system/user/assistant/tool
   messages, assistant `tool_calls`, tool call IDs, function schemas and
   temperature. It changes only the exact configured model alias.
3. Responses preserve status, content, finish reason, tool calls, embeddings
   and ordering. Model identifiers in discovery/chat responses are projected
   back to the configured legacy alias; no answer/tool content is rewritten.
4. Embeddings accept the existing legacy batching contract (1-32 strings,
   each at most 6,000 Unicode characters) and the exact Nomic model. Inputs are
   not prefixed, truncated, normalized, reordered or otherwise changed.
5. Native load/unload/settings/plugin/MCP routes, streaming, caller-supplied
   upstreams, unknown fields, malformed JSON, non-finite numbers, oversized
   requests/responses and unpinned clients fail before upstream dispatch.
6. Model management remains with the Home owner runtime. The compatibility
   status projection can report the alias only after a fresh exact upstream
   observation proves the mapped primary and Nomic identities/configuration.

## Durable admission and caller closure

1. Use a create-only, hash-linked compatibility journal bound to an exact
   compatibility binding digest. Close and restore have durable intent and
   terminal result records. A missing/lost/foreign result is unknown and cannot
   be retried, restored or presented as drained.
2. Close prevents new dispatch, waits only for already admitted requests under
   the unchanged finite request ceiling, and then records three increasing zero
   active-request samples. An active, stale or one-sample result does not close.
3. The managed-caller adapter combines an independently terminal Next9770
   receipt with this exact terminal legacy receipt, a fresh Home native1234
   zero-connection observation and an unchanged/available reranker8412
   observation. It cannot construct the five-scope receipt from either side
   alone.
4. Restore consumes the exact forward legacy receipt, records an independently
   terminal inverse effect and reopens only after the exact route/runtime
   binding is fresh. Unknown close/restore remains fail-closed across restart.

## Deterministic acceptance

Use disposable local files, synthetic certificates and loopback-only HTTP/TLS
fixtures. Prove ordinary chat, multi-round tool calls, second opinion, workspace
and patch prompts, embeddings, both model lists, exact alias projection,
response bytes and ordering. Prove denials for every route/shape/identity/size
boundary, load/unload, response overflow, stale runtime, concurrent close,
close during a slow admitted request, post-close request, lost close/restore
receipt, restart recovery, foreign journal/binding, and rollback.

Actual wire evidence must show zero upstream calls for all denied requests,
bounded process/listener cleanup and no Home/Control/production endpoint use.
No live legacy route is changed by this slice. Live activation remains blocked
on separate model/transport qualification, exact certificates, installed Home
readiness and an approved deployment descriptor with current source/seal pins.
