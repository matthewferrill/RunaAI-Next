# M1-S2 contextual Review workflow

Date: 2026-09-03  
State: deterministic implementation and independent review green; actual application acceptance open

The application now treats Review as contextual work against one to six exact selected source, artifact, or diff
revisions rather than a permanent global mode. The server resolves the requested locator sequence, requires the
resolved count and order to match exactly, loads the complete canonical selected bytes within a server-owned bound,
verifies every content digest, and only then permits provider access. Review bypasses Research reranking so selected
revisions cannot be silently dropped or reordered. The simplified non-null `accept`/`revise` checker remains isolated
to Review, retains its one-revision limit, and cannot replace the application-owned answer or citations.

The first bounded implementation passed its focused checks but independent review stopped it at P0=0/P1=3. A
context-free Review request could reach the provider; missing or inactive requested items could be silently omitted;
and a full-content hash could describe bytes truncated before provider/checker access. The correction requires one to
six locators at schema admission, rejects any count/order/identity mismatch before provider use, and fails incomplete
as `review-context-not-fully-supplied` when any selected revision cannot be supplied completely and hash-verified.

Independent re-review returned PASS at P0=0/P1=0 and reproduced 89/89 bounded tests. Research retains its existing
selected-index/reranker path. No model invocation, browser runtime, external network, production route, server
workspace operation, protected-data access, or customer acceptance occurred. This checkpoint proves deterministic
application wiring only; actual Omen/Control/Home Review acceptance remains required with the combined release.
