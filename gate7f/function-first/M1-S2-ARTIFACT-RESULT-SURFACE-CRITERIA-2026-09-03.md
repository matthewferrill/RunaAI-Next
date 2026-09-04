# M1-S2 artifact-result surface — prospective criteria

Status: corrected prospective criteria frozen before implementation at source commit
`d524c63c3cf3c395822fe3aacd89a66be89edbf5`. Implementation still requires independent P0/P1 review.
This document does not claim an implemented artifact surface, browser acceptance, a production route, or completion
of C05 or any other capability family.

## Slice selection record

- Selection date / correction date: 2026-09-03 / 2026-09-04.
- Roadmap revision and SHA-256 from `node roadmap/read-next-slice.mjs`: `2026-08-28.1` /
  `45d37d22a0c3a98e3fb6af9d61106dea95e8626040a87f1eee102937566bc816`.
- Milestone and capability IDs: M1-S2; bounded C03, C05 and C15 result-presentation subsets. This slice neither
  produces general artifacts nor implements or accepts C05 as a family.
- Current baseline and missing proof: PostgreSQL owns encrypted conversation turns and task/proposal/receipt records.
  Research and Review retain attributable application metadata; bounded Code proposals retain exact before/after
  text; receipts retain inspected-file and test outcomes. The shell has a Files and artifacts navigation position.
  There is no accepted common result projection, bounded locator/read port, safe download behavior, result-state
  view, or ordinary-browser proof.
- Why this slice is next and exact dependencies: a credible customer trial needs inspectable Research and Code
  outputs. The slice depends on accepted participant/project authentication, point-addressed conversation/task
  authority, and the already-retained result fields. It does not depend on a model, connector, executor, artifact
  database, external service, or general file-ingestion capability.
- Included: scoped list, exact read/preview/client-side download, provenance, readiness/error presentation, and the
  closed result kinds and text formats below. Excluded: creation, editing, conversion, upload, archives, binary/rich
  formats, arbitrary paths, public links, sharing, publication, and retention-policy changes.
- Model-independent interface: this is a deterministic projection of authoritative application records. No model
  prompt, route, checker, budget, candidate, or qualification record changes.
- Runtime/data/identity/network boundary: the existing authenticated M1 application surface, the current participant
  and project, PostgreSQL-backed chat/task records, and fixed in-process UTF-8 canonicalizers. Result operations make
  no filesystem, model, index, provider, browser-automation, or network call.
- Failure/cancellation/reconciliation: invalid scope, integrity, capacity, locator, canonicalization, and size fail
  closed. Pending, incomplete, failed, unavailable, unknown and reconciliation-required sources are never relabeled
  ready. Reads do not retry, resume, reconcile, cancel, execute, or mutate a task.
- Rollback preserving user work: remove the projection wiring and restore the Files and artifacts placeholder.
  Authoritative conversations, tasks, proposals, intents, receipts and outputs remain unchanged; there is no schema
  migration or result copy to roll back.
- Required customer test: one fresh ordinary signed-in Omen -> Control browser journey is deferred until deterministic
  implementation and independent review are green.
- Remaining roadmap: broader C03 inputs, all artifact production and C05 acceptance, C08 delivery, C09 browser
  control, C10 connectors, rich previews, sharing and publication remain in later governed slices.
- Handoff: criteria only. Implementation, implementation review, evidence, commit/publication, actual-system proof and
  customer acceptance remain separate future gates.

## Non-authority and storage invariant

The surface is a stateless, allowlisted projection over existing authoritative records. It creates no artifact table,
blob, file, cache, manifest authority, retention authority, locator index, or durable copy of result bytes. PostgreSQL
remains authoritative. Each request re-authenticates, re-authorizes the participant/project, point-reads one owner,
validates its current source records, and recomputes descriptors and bytes.

A `resultId`, digest, owner id, filename, provenance object or prior response grants no authority. Browser/model input
cannot choose a participant, source-record kind/id, source revision, path, media type, filename, readiness, provenance,
or content. No operation enumerates participants, projects, owners or all records in a scope.

## Closed primitive types and hard budgets

All request, source-port and public response objects are strict: required keys are present, optional keys are stated,
and unknown keys, accessors, prototypes other than ordinary JSON objects, duplicate set members and out-of-range
values are rejected. The implementation must use the following exact primitives and constants.

| Name | Contract |
|---|---|
| `PublicId` | 1-160 ASCII characters; `^[A-Za-z0-9][A-Za-z0-9_.:-]*$` |
| `Sha256` | exactly 64 lowercase hexadecimal characters |
| `Timestamp` | UTC RFC 3339 emitted by `Date.prototype.toISOString()` |
| `Count` | non-negative JavaScript safe integer |
| `OwnerLocator` | exactly `{kind:"conversation",chatId:PublicId}` or `{kind:"task",taskId:PublicId}` |
| `ResultKind` | exactly `conversation-answer`, `research-report`, `research-metadata`, `review-report`, `review-metadata`, `code-diff`, `inspected-text`, `test-outcome`, or `task-receipt` |
| `MAX_CONVERSATION_TURNS` | 32 |
| `MAX_TASK_PROPOSALS` | 16 |
| `MAX_TASK_RECEIPTS` | 24 |
| `MAX_TASK_INTENTS` | 24 |
| `MAX_RESULTS` | 64 |
| `MAX_SOURCE_RECORD_BYTES` | 524,288 UTF-8 bytes for any one decrypted source-port record |
| `MAX_OWNER_SOURCE_BYTES` | 1,048,576 UTF-8 bytes for the complete strict source-port object |
| `MAX_RESULT_BYTES` | 131,072 canonical bytes, inclusive |
| `MAX_LIST_BYTES` | 32,768 UTF-8 bytes for the complete canonical JSON list response |
| `MAX_READ_RESPONSE_BYTES` | 180,224 UTF-8 bytes for the complete JSON/base64 read response |

All size checks are on bytes, never JavaScript character counts. Capacity excess is an explicit error with no
truncation, pagination token, partial inventory, prefix/suffix body, alternate digest, or fallback scan.

## Narrow authoritative result-source ports

Implementation adds exactly two internal read ports. They are not browser operations and do not accept a caller-
selected maximum:

```text
conversationResults.readOwner(context, { chatId }) -> ConversationResultSource
taskResults.readOwner(context, { taskId }) -> TaskResultSource
```

`context` is the already authenticated `{principalId,projectId,sessionId}`. Each method uses an exact
participant/project/owner predicate. Missing, archived, deleted, foreign and wrong-experience owners all return the
same internal `result-owner-not-found`; the public layer exposes no row-count or existence distinction.

The read algorithm is mandatory:

1. Read the one scoped owner row and child ids plus encrypted JSON byte lengths. Use `LIMIT maximum + 1` for every
   child collection; conversation turns use 33, task proposals 17, receipts 25 and intents 25. Do not decrypt yet.
2. Reject a `maximum + 1` row, a per-row length over `MAX_SOURCE_RECORD_BYTES`, or a summed declared length over
   `MAX_OWNER_SOURCE_BYTES` before loading/decrypting payloads.
3. Load only those exact child keys in the same transaction, verify the retained HMAC/digest/envelope, decrypt, parse
   the strict schemas below, then enforce the actual per-record and whole-owner UTF-8 limits again.
4. Load only the preflighted exact child keys, then return the records in the orders fixed below. Conversation uses at
   most three SQL statements; task uses at most seven. Neither port calls `listChats`, `recent`,
   `M1TaskService.status`, generic `Transaction.list`, a filesystem,
   Qdrant, a provider, or another service. Those existing broad methods may be refactored and reused only if the same
   SQL limits, byte preflight, strict return schema and point-owner behavior become enforceable at the shared layer.

The exact source-port shapes are:

```text
ConversationResultSource = {
  schemaVersion:"runaai-result-conversation-source/v1", chatId:PublicId, projectId:PublicId,
  experience:"chat"|"code", updatedAt:Timestamp, turnCount:Count,
  turns: ConversationResultTurn[0..32]
}
ConversationResultTurn = {
  turnOrdinal:integer 1..1000000, occurredAt:Timestamp,
  route:"general-chat"|"guarded-chat"|"research-chat"|"review-chat"|"workspace-chat"|"code-chat",
  assistant:string, evidence:AnswerEvidence|null
}
```

`turnCount` must equal the authoritative count and the returned ordinal set must be unique, strictly increasing and
complete for the owner; otherwise the whole request fails `result-source-invalid`. `AnswerEvidence` must pass the
closed `runaai-answer-evidence/v1` or `/v2` validator frozen in `conversation-evidence.mjs`; Research requires the v2
`researchWorkflow` object and Review requires the v2 `review` object. The result port excludes the user message,
title, request credential and raw provider response.

```text
TaskResultSource = {
  schemaVersion:"runaai-result-task-source/v1",
  task:{taskId:PublicId,status:"active"|"cancelled",updatedAt:Timestamp},
  project:{revision:positive safe integer,workspaceSha256:Sha256},
  proposals:TaskResultProposal[0..16], receipts:TaskResultReceipt[0..24], intents:TaskResultIntent[0..24]
}
TaskResultProposal = {
  proposalId:PublicId,taskId:PublicId,
  status:"denied"|"pending-approval"|"authorized"|"dispatched"|"not-published"|"completed"|"cancelled"|
    "unknown"|"stale"|"failed",
  policy:"denied"|"approval-required"|"automatic",capabilityId:PublicId,
  proposalDigest:Sha256,expectedProjectRevision:positive safe integer,
  beforeWorkspaceSha256:Sha256,createdAt:Timestamp,updatedAt:Timestamp|null,
  prepared:null|ApplyPreview|InspectPreview|TestPreview
}
ApplyPreview = {kind:"apply",path:SafeProjectPath,beforeSha256:Sha256|null,afterSha256:Sha256,
  beforeContent:string|null,afterContent:string,afterWorkspaceSha256:Sha256}
InspectPreview = {kind:"inspect",path:SafeProjectPath,sha256:Sha256,bytes:Count,content:string}
TestPreview = {kind:"test",suiteId:PublicId,suiteSha256:Sha256,testIds:PublicId[1..16]}
TaskResultIntent = {proposalId:PublicId,status:"prepared"|"dispatching"|"recorded"|"not-published"|"unknown",
  effectId:PublicId,updatedAt:Timestamp}
TaskResultReceipt = {
  receiptId:PublicId,taskId:PublicId,proposalId:PublicId,proposalDigest:Sha256,receiptDigest:Sha256,
  capabilityId:PublicId,argumentsDigest:Sha256,beforeRevision:positive safe integer,
  afterRevision:positive safe integer,beforeSha256:Sha256,afterSha256:Sha256,
  effectKind:"revision-published"|"sandbox-tested"|"observed",
  executionStatus:PublicId,cancellationRequested:boolean,grantRevokedAfterDispatch:boolean,
  currentAtRecording:boolean,recordedAt:Timestamp,output:null|InspectOutcome|TestOutcome
}
InspectOutcome = {path:SafeProjectPath,sha256:Sha256,bytes:Count,content:string}
TestOutcome = {suiteId:PublicId,suiteSha256:Sha256,workspaceSha256:Sha256,
  status:"passed"|"failed"|"unavailable",passed:boolean,
  checks:{testId:PublicId,expected:BoundedJson,actual:BoundedJson,errorCode:"project-test-evaluation-failed"|null,
    passed:boolean}[0..16]}
```

`SafeProjectPath` is an already-authorized, normalized project-relative POSIX path of 1-240 ASCII characters. It has
no empty, `.` or `..` segment, backslash, colon, percent escape, control/bidi character or leading slash; every segment
matches `[A-Za-z0-9][A-Za-z0-9._-]*`. `BoundedJson` is null, boolean, a finite JavaScript number other than `-0`, a
safe string, or arrays/plain objects to depth 8 and at most 64 members per container; object keys are safe strings and
the complete value is at
most 32,768 canonical bytes. Fractional values are retained; `-0`, `NaN` and infinities are not admitted to a public
test-result projection.

For locator, owner and source-revision hashes, `canonical JSON` means: recursively sort ordinary-object keys by
ascending UTF-16 code-unit sequence, preserve array order, reject sparse arrays/unknown values/accessors, serialize
validated strings and finite non-`-0` numbers with ECMAScript `JSON.stringify`, emit no whitespace/BOM/final newline,
then UTF-8 encode once. This rule is independent of PostgreSQL JSON key order and JavaScript construction order.

Proposal and receipt digests must verify with the existing application digest functions before these narrowed views
are constructed. A proposal, intent or receipt must bind the same scoped task and matching ids/digests. Duplicate,
orphaned or multiply-matched children fail the whole owner read. This source port never returns grants, approvals,
session ids, participant ids, environment ids, rollback references, executor receipts, stdout/stderr, raw arguments,
raw references or database envelopes.

## Restart-stable locator and operations

The browser request schemas are exactly:

```text
result.list input = {owner:OwnerLocator}
result.read input = {owner:OwnerLocator,resultId:ResultId,contentSha256:Sha256}
ResultId = `r1.` followed by one Sha256
```

Including `owner` in `result.read` is deliberate. The server can point-read one owner and derive at most 64 candidates;
it never has to enumerate owners or maintain a reverse locator index. A mismatched owner/id/digest returns the same
`result-stale` response.

For each point-read source object, compute `ownerRevision = SHA-256(canonical JSON bytes(source object))`. For each
result compute this locator material with exactly this field order:

```text
{schemaVersion:"runaai-m1-result-locator/v1",owner,ownerRevision,sourceRecordKind,sourceRecordId,
 sourceRevision,kind,format,ordinal,byteLength,contentSha256}
```

`sourceRevision` is the per-kind digest defined below; `byteLength` and `contentSha256` are null for a non-ready
descriptor. `resultId` is `r1.` plus the SHA-256 of the locator material's canonical JSON bytes. It is deterministic
across a process restart because it uses only retained authoritative data and fixed canonicalizers. It is deliberately
stale after any result-relevant owner change. It is not decryptable, signed authority, random state or a database key.

`result.list` performs one point read, derives and sorts the closed candidates, canonicalizes every potentially ready
result to prove its size/digest, then returns metadata only. `result.read` repeats that complete bounded derivation,
requires exactly one current descriptor to match `resultId` and the supplied digest, and returns only a ready result.
No prior list call, in-memory state or process affinity is required.

The exact success schemas are:

```text
ResultList = {schemaVersion:"runaai-m1-result-list/v1",owner:OwnerLocator,ownerRevision:Sha256,
  results:ResultDescriptor[0..64],privacy:ListPrivacy}
ResultRead = {schemaVersion:"runaai-m1-result-read/v1",descriptor:ResultDescriptor,encoding:"base64",
  contentBase64:string,privacy:ReadPrivacy}
ListPrivacy = {schemaVersion:"runaai-result-privacy/v1",dataScope:"authenticated-participant-project",
  resultContentIncluded:false,resultContentSensitivity:"not-included",applicationCredentialFieldsIncluded:false,
  internalOperationalFieldsIncluded:false}
ReadPrivacy = {schemaVersion:"runaai-result-privacy/v1",dataScope:"authenticated-participant-project",
  resultContentIncluded:true,resultContentSensitivity:"not-classified",applicationCredentialFieldsIncluded:false,
  internalOperationalFieldsIncluded:false}
```

`contentBase64` is canonical RFC 4648 standard base64 with required `=` padding and no whitespace. Decoding must
reproduce exactly `descriptor.byteLength` bytes and re-encoding must reproduce the same string. The complete list/read
objects must fit their hard response budgets after ordinary `JSON.stringify` wire serialization.

## Closed descriptor, public errors, privacy and provenance

Every `ResultDescriptor` has exactly these keys in this order:

```text
{schemaVersion:"runaai-m1-result-descriptor/v1",resultId:ResultId,owner:OwnerLocator,ownerRevision:Sha256,
 sourceRecordKind:"chat-turn"|"task-proposal"|"task-receipt",sourceRecordId:PublicId,
 sourceRevision:Sha256,kind:ResultKind,format:"txt"|"json"|"diff",ordinal:integer 1..64,
 filename:SafeFilename,mediaType:"text/plain; charset=utf-8"|"application/json; charset=utf-8"|
   "text/x-diff; charset=utf-8",byteLength:Count|null,contentSha256:Sha256|null,
 readiness:"ready"|"pending"|"incomplete"|"failed"|"unavailable",errorCode:PublicStateCode|null,
 createdAt:Timestamp,provenance:PublicProvenance,privacy:ListPrivacy}
```

Ready requires non-null `byteLength` and `contentSha256` and `errorCode:null`. Every other readiness requires null
length/digest and exactly one compatible state code:

| Readiness | Allowed `errorCode` |
|---|---|
| `pending` | `source-pending` |
| `incomplete` | `source-incomplete`, `source-output-limited`, `source-citations-incomplete`, `source-reconciliation-required`, `source-outcome-unknown` |
| `failed` | `source-failed`, `source-tests-failed`, `source-proposal-denied`, `source-cancelled` |
| `unavailable` | `source-content-unavailable`, `source-integrity-unavailable`, `source-format-unavailable`, `source-too-large` |

`PublicProvenance` is a strict discriminated union. Its positive public schemas are:

```text
ConversationProvenance = {schemaVersion:"runaai-result-provenance/v1",type:"conversation-turn",
  chatId:PublicId,turnOrdinal:positive integer,route:closed route enum,sourceRevision:Sha256,
  evidenceSha256:Sha256,contentSha256:Sha256|null}
ProposalProvenance = {schemaVersion:"runaai-result-provenance/v1",type:"task-proposal",
  taskId:PublicId,proposalId:PublicId,proposalDigest:Sha256,expectedProjectRevision:positive integer,
  beforeWorkspaceSha256:Sha256,afterWorkspaceSha256:Sha256|null,sourceRevision:Sha256,
  contentSha256:Sha256|null}
ReceiptProvenance = {schemaVersion:"runaai-result-provenance/v1",type:"task-receipt",
  taskId:PublicId,proposalId:PublicId,proposalDigest:Sha256,receiptId:PublicId,receiptDigest:Sha256,
  beforeRevision:positive integer,afterRevision:positive integer,beforeWorkspaceSha256:Sha256,
  afterWorkspaceSha256:Sha256,sourceRevision:Sha256,contentSha256:Sha256|null}
```

Provenance contains bindings and digests, never labels, source/result text, raw paths, prompts, provider payloads,
credentials, sessions, grants, approvals, stack traces or database details. Citation locators belong only in the
positive metadata result schemas below; they are not execution evidence.

The existing HTTP error envelope remains exactly
`{schemaVersion:"runa2-gate6b-error/v1",errorCode,correlationId:PublicId,privateValuesIncluded:false}`. Result code is one of
`result-request-invalid`, `result-owner-not-found`, `result-owner-over-capacity`, `result-source-too-large`,
`result-source-invalid`, `result-list-too-large`, `result-too-large`, `result-not-ready`, `result-stale`, or
`result-unavailable`. Internal exception text and internal error codes are never emitted. Foreign, missing, deleted,
archived and wrong-experience owners collapse to `result-owner-not-found`; wrong owner/id/digest/revision collapses to
`result-stale`. The error envelope truthfully contains no result content or private value, so its legacy literal is
valid there.

| HTTP status | Public result error codes |
|---|---|
| 400 | `result-request-invalid` |
| 404 | `result-owner-not-found` |
| 409 | `result-not-ready`, `result-stale` |
| 413 | `result-owner-over-capacity`, `result-source-too-large`, `result-list-too-large`, `result-too-large` |
| 503 | `result-source-invalid`, `result-unavailable` |

Successful result responses deliberately do not assert `privateValuesIncluded:false`: requested chat, report, diff,
file or test content can be private user/project data and can itself contain sensitive text. The projection does not
scan, redact or claim that user-authored content is secret-free. Its `privacy` object says the content sensitivity is
not classified while separately asserting that no application credential field or internal operational field was
added by the projection. The responses are authenticated, `Cache-Control: no-store`, and are neither public nor
anonymized.

## Per-kind derivation, readiness, revision, order and filename

Candidate source order is fixed before global 1-based `ordinal` assignment. Conversation keys are
`[turnOrdinal,kindRank]`. Task keys are `[sourceTime,sourceRank,sourceRecordId,kindRank]`, where `sourceTime` is proposal
`createdAt` or receipt `recordedAt`, `sourceRank` is proposal 0 / receipt 1, ids compare by Unicode code unit, and the
kind ranks are the row order below. No database natural order, locale collation or object insertion order participates.

| Rank / kind | Derivation and exact eligibility | Ready condition; other state | `sourceRevision` material | Filename stem |
|---|---|---|---|---|
| 0 `conversation-answer` | One non-Research/non-Review turn on `general-chat`, `guarded-chat`, `workspace-chat` or `code-chat`; TXT is exact `assistant` | Evidence exists; not timed out/output limited; safe canonical text. Completion issue -> incomplete; missing/invalid evidence -> unavailable | canonical `{turnOrdinal,occurredAt,route,assistantSha256,evidenceSha256}` | `conversation-answer-NNNNNN.txt` |
| 1 `research-report` | A `research-chat` turn with v2 `researchWorkflow`; TXT is exact `assistant` | `progress.status=report-ready`, `report.status=attributable`, all selected sources resolved, passes complete, no degraded/truncated/omission/unanswered/missing evidence, checker present and citations nonempty. Otherwise incomplete | same closed turn material | `research-report-NNNNNN.txt` |
| 2 `research-metadata` | Same source; JSON uses the positive schema below | Same as Research report | same closed turn material | `research-metadata-NNNNNN.json` |
| 3 `review-report` | A `review-chat` turn with v2 `review`; TXT is exact `assistant` | `accepted-primary` or `accepted-revision` under the exact discriminated checker/finding/citation contract below. The checker is mandatory, there is exactly one finding, and its nonempty citation ordinals bind to retained evidence and admitted contexts. `incomplete` -> incomplete | same closed turn material | `review-report-NNNNNN.txt` |
| 4 `review-metadata` | Same source; JSON uses the positive schema below | Same as Review report | same closed turn material | `review-metadata-NNNNNN.json` |
| 5 `code-diff` | `project.apply-change` proposal with verified non-null `ApplyPreview`; DIFF uses its exact path/before/after | Pending-approval, authorized or completed proposal and no unresolved matching intent -> ready. Denied/cancelled/stale/failed -> failed; dispatched/unknown/not-published/unresolved intent -> incomplete; bad/missing preview -> unavailable | canonical result-relevant proposal view plus matching intent status | `code-diff-NNNNNN.diff` |
| 6 `inspected-text` | `project.inspect` proposal; TXT comes only from its one matching verified receipt `InspectOutcome`, not the filesystem or prepared preview | No receipt and live proposal -> pending; matching recorded receipt whose path/hash/byte count reverify -> ready; denied/cancelled -> failed; unknown/not-published/unresolved -> incomplete; absent/bad outcome -> unavailable | canonical result-relevant proposal, intent and matching receipt views | `inspected-text-NNNNNN.txt` |
| 7 `test-outcome` | `project.run-tests` proposal; JSON comes only from its one matching verified receipt `TestOutcome` | No receipt and live proposal -> pending; verified `passed` outcome -> ready; `failed` -> failed; `unavailable` -> unavailable; unknown/not-published/unresolved -> incomplete | canonical result-relevant proposal, intent and matching receipt views | `test-outcome-NNNNNN.json` |
| 8 `task-receipt` | Every independently verified retained receipt; JSON uses the positive receipt schema | Matching recorded intent and valid bindings -> ready. Orphan/mismatch is whole-owner invalid, not a downloadable partial receipt | canonical strict receipt view | `task-receipt-NNNNNN.json` |

`NNNNNN` is the zero-padded global ordinal. A single conversation turn yields at most two descriptors; each proposal
yields at most one proposal result and each receipt one receipt result. Thus the source-port maxima prove a task has at
most 40 candidates and a conversation at most 64. A known candidate remains listed when non-ready; absence cannot
imply success. An owner-level integrity/schema/capacity fault fails the whole request instead of returning a partial
inventory.

For conversation rows, `sourceRecordKind` is `chat-turn`, `sourceRecordId` is `turn:<turnOrdinal>`, and `createdAt` is
the turn `occurredAt`. Proposal-derived rows use `task-proposal`, the proposal id and proposal `createdAt`; receipt rows
use `task-receipt`, the receipt id and `recordedAt`. These values are not accepted from the browser. Result operations
are available for authenticated `chat` and `code` experiences, run before the existing code-only operation guard, and
cannot be granted, approved, executed or invoked as a task effect.

An unresolved intent affects only its matching proposal-derived result. Previously recorded receipts remain visible
as historical receipts, but the UI must not label them as the current result of an unknown/reconciliation-required
effect. No result projection initiates reconciliation or invents a retry.

## Positive JSON metadata schemas

JSON result bytes contain only the following exact objects and field order; all nested objects are strict.

```text
ResearchMetadata = {schemaVersion:"runaai-public-research-metadata/v1",reportStatus:"attributable",
  limitation:SafeText,progress:{status:"report-ready",selectedSources:1..6,resolvedSources:1..6,
    passesPlanned:Count,passesRun:Count,passagesRead:Count,degraded:false,truncated:false,
    omissionCount:0,unansweredCount:0},
  citations:{ordinal:positive integer,sourceId:PublicId,sectionId:PublicId,contentSha256:Sha256}[1..24],
  checker:{attempted:true,corrected:boolean,attemptCount:1..2,
    finalAnswerOrigin:"primary"|"checker-correction"},missingEvidence:[]}

ReviewPrimaryMetadata = {schemaVersion:"runaai-public-review-metadata/v1",
  status:"accepted-primary",
  contexts:{contextType:"source"|"artifact"|"diff",targetId:PublicId,sourceId:PublicId,
    sectionId:PublicId,contentSha256:Sha256}[1..6],
  checker:{initialVerdict:"accept",finalVerdict:"accept",revisionPasses:0,
    attemptCount:1,finalAnswerOrigin:"primary"},
  findings:{findingId:PublicId,severity:"unclassified",
    citationOrdinals:positive integer[1..24]}[1]}

ReviewRevisionMetadata = {schemaVersion:"runaai-public-review-metadata/v1",
  status:"accepted-revision",
  contexts:{contextType:"source"|"artifact"|"diff",targetId:PublicId,sourceId:PublicId,
    sectionId:PublicId,contentSha256:Sha256}[1..6],
  checker:{initialVerdict:"revise",finalVerdict:"accept",revisionPasses:1,
    attemptCount:2,finalAnswerOrigin:"checker-correction"},
  findings:{findingId:PublicId,severity:"unclassified",
    citationOrdinals:positive integer[1..24]}[1]}

ReviewMetadata = ReviewPrimaryMetadata | ReviewRevisionMetadata

PublicTestOutcome = {schemaVersion:"runaai-public-test-outcome/v1",suiteId:PublicId,suiteSha256:Sha256,
  workspaceSha256:Sha256,status:"passed",passed:true,
  checks:{testId:PublicId,expected:BoundedJson,actual:BoundedJson,errorCode:null,passed:true}[1..16]}

PublicTaskReceipt = {schemaVersion:"runaai-public-task-receipt/v1",receiptId:PublicId,receiptDigest:Sha256,
  taskId:PublicId,proposalId:PublicId,proposalDigest:Sha256,capabilityId:PublicId,argumentsDigest:Sha256,
  beforeRevision:positive integer,afterRevision:positive integer,beforeSha256:Sha256,afterSha256:Sha256,
  effectKind:"revision-published"|"sandbox-tested"|"observed",executionStatus:PublicId,
  cancellationRequested:boolean,grantRevokedAfterDispatch:boolean,currentAtRecording:boolean,recordedAt:Timestamp}
```

For either Review variant, `contexts` is the exact stored admitted-context sequence. The one finding's
`citationOrdinals` is the exact nonempty ordinal sequence from the retained turn's evidence citations: every ordinal
is unique, and every citation's `sourceId`, `sectionId` and `contentSha256` tuple matches exactly one listed context.
The status/checker combination, exactly-one-finding rule or citation/context relation cannot be relaxed during
projection; any mismatch makes both Review descriptors unavailable rather than partially ready.

No generic object sanitizer or denylist may substitute for constructing these four positive projections field by
field. Their selectors never copy application credential/token/cookie/header fields, sessions/nonces, encryption/HMAC/
private keys or envelopes, connection/environment fields, prompts/provider payload fields, approval/grant internals,
executor receipts, stdout/stderr, stack traces, logs or unlisted database fields. `SafeText` and `BoundedJson` values
are requested result content and may themselves mention token-shaped strings, paths or other sensitive material; they
are not inspected or mislabeled as secret-free.

## Exact canonical bytes

All strings first pass a Unicode-scalar validator that rejects every unpaired UTF-16 surrogate. `SafeText` additionally
rejects NUL, C0 controls except HT/LF/CR (`U+0009`, `U+000A`, `U+000D`), DEL/C1 (`U+007F`-`U+009F`), and bidi controls
`U+061C`, `U+200E`-`U+200F`, `U+202A`-`U+202E`, and `U+2066`-`U+2069`. HTML, Markdown and ordinary Unicode are data,
not execution, and are otherwise allowed. No Unicode normalization is performed.

- TXT: validate the authoritative application string as `SafeText`, then encode it once with UTF-8. Preserve every
  allowed code point, including CR, LF, CRLF, tab, leading/trailing whitespace and a missing/final newline. Add no BOM
  and perform no newline, whitespace, markup or Unicode normalization.
- JSON: construct one positive schema above in its declared field order. Serialize it with one recursive canonical
  writer; do not pass a completed object to ordinary `JSON.stringify`. The writer emits `{`, then each key/value pair
  in the required order separated by `,`, then `}`; it emits each key as ECMAScript `JSON.stringify(key)`, then `:`,
  then the recursively written value. Positive-schema object fields use their declared order. `BoundedJson` object
  entries sort by ascending UTF-16 code-unit key sequence before the writer emits them, including array-index-like
  keys such as `"2"` and `"10"`; no JavaScript object enumeration step may reorder them. Arrays emit `[` followed by
  recursively written elements in retained order separated by `,`, then `]`. Values are only null, booleans, finite
  non-`-0` numbers, scalar/SafeText strings, arrays and strict objects. Null and booleans use their lowercase JSON
  literals; strings use ECMAScript `JSON.stringify(value)`; ECMAScript number serialization is the sole numeric
  spelling. Emit no spaces, indentation, BOM or final newline, then encode the one completed string once with UTF-8.
- DIFF: require `SafeProjectPath`, distinct before/after strings, scalar/SafeText strings with LF as their only newline
  (CR is not admitted for this format), and no line beginning with an unvalidated control. Define logical records as
  the left-to-right matches of `[^\n]*\n|[^\n]+$` (zero or more non-LF characters followed by LF, or one or more
  non-LF characters at end); empty content has no records. Start the byte buffer with UTF-8 of
  `--- a/<path>\n+++ b/<path>\n`, then append
  `@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@\n`. `oldStart/newStart` is 0 when its count is 0 and 1 otherwise.
  For each old record append UTF-8 `-` plus the record; for each new record append UTF-8 `+` plus the record. If a
  record lacked terminal LF, append UTF-8 `\n\\ No newline at end of file\n` immediately after it. Records that had
  LF retain exactly one LF after their prefix. The generated diff therefore uses LF throughout and ends in LF. It is
  a deterministic full-file replacement diff; there is no context heuristic, locale, system `diff`, color, ANSI
  escape, timestamp or path quoting. A CR-containing or unsafe-path proposal is `source-format-unavailable`, never
  silently rewritten.

SHA-256 is computed over the exact bytes above. Exactly 131,072 bytes is ready; 131,073 is
`source-too-large`/`result-too-large` with no content. `result.list` must generate the same bytes before calling an item
ready; `result.read` regenerates them and verifies length and digest again.

## Filename, rendering and client-side download safety

`SafeFilename` is generated only from the fixed stem table and ordinal. It is ASCII, 1-120 characters, matches
`[a-z0-9][a-z0-9._-]*`, has exactly the format suffix, and is never accepted as a path. The fixed construction excludes
dot segments, separators, drive/UNC syntax, percent escapes, whitespace, bidi/control characters and Windows reserved
device basenames; duplicates are impossible because the global ordinal is unique.

Preview decodes canonical bytes with a fatal UTF-8 decoder and inserts only a DOM text node/`textContent`. It never
uses `innerHTML`, executes Markdown/HTML, interprets ANSI, opens links or fetches referenced resources.

Because the existing `/api/m1/workspace` route is JSON, `result.read` returns base64 rather than pretending to be a
separate binary HTTP download. After base64 decode, the browser verifies byte length and SHA-256 before enabling
preview or download. Download constructs a Blob with the descriptor's exact media type and a temporary same-document
object URL, sets the anchor `download` attribute to `SafeFilename`, invokes it only from the user's action, then revokes
the URL. There is no content-type inference and no claim of a `Content-Disposition` response header. The workspace
JSON response retains `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

## Presentation contract

Files and artifacts remains within the single canvas. It lists the selected conversation or task's current bounded
descriptors and shows format, exact size when ready, created time, provenance summary and readiness. Selecting ready
content opens the inert contextual preview and explicit Download action. Research citations and Review contexts remain
visible with their reports; a diff remains tied to its proposal/digests; a receipt is distinguishable from a report.

Pending, incomplete, failed, unavailable and stale states use plain language and preserve navigation. Retry appears
only when the upstream task already exposes one. Unknown/reconciliation-required work says the current result is not
known and does not present an older receipt as current success. Narrow layouts retain the established below-transcript
contextual panel behavior.

## Deterministic green criteria

Implementation cannot claim this slice green until all checks pass against real existing application interfaces:

1. Strict schema tests reject every unknown/missing/wrong-type field at request, source-port, descriptor, provenance,
   metadata, error and read/list response boundaries.
2. Point-owner SQL tests prove `LIMIT maximum + 1`, length-first preflight, fixed statement ceilings, no owner/global
   enumeration, and explicit failure for 33 turns, 17 proposals, 25 receipts, 25 intents, an oversized row and an
   oversized owner. Existing broad `status/list` behavior is not used as acceptance evidence.
3. Every kind table row has a ready fixture plus every applicable pending/incomplete/failed/unavailable fixture.
   Exact ids, revisions, source order, global ordinals and filenames match frozen vectors.
4. Repeated list/read and a fresh process over the same PostgreSQL records reproduce exact owner revisions, result ids,
   order, filenames, canonical bytes and digests without an artifact/locator table, file or cache.
5. Participant/project/owner/source revision/proposal digest/receipt digest/content digest mutations fail before
   content. Foreign, absent, archived, deleted and wrong-experience owners expose no existence oracle.
6. UTF-8 vectors cover ASCII, multi-byte scalar values, CR/LF/CRLF/tab preservation, leading/trailing whitespace,
   final/no-final newline, HTML/Markdown as inert data, unpaired surrogates, C0/C1/ESC and bidi controls. JSON and diff
   golden byte vectors prove exact punctuation, ordering, newline and no-BOM behavior.
7. Diff golden vectors cover empty/add/delete/change, terminal/no-terminal LF and rejection of CR/unsafe paths. JSON
   covers fractional values, exact number spelling, deep/member/byte bounds and rejection of `-0`, non-finite values
   and unknown keys.
8. Exact 131,072-byte content succeeds; 131,073 fails with no bytes. Exact list/read wire budgets, canonical base64,
   decoded length/digest mismatch and more than 64 descriptors fail without truncation.
9. Positive metadata construction and privacy canaries prove application credential/internal fields are never added;
   tests also preserve a token-shaped user-content canary and label its sensitivity `not-classified` rather than
   making the false claim that authorized result content is privacy- or secret-free.
10. DOM tests prove result text creates no element/resource/script. Download tests prove digest-before-enable, exact
    Blob bytes/type/name, user action, URL revocation and no false Content-Disposition/header assertion.
11. Surface integration uses only the existing authenticated M1 route, creates no task/grant/proposal/intent/receipt/
    outbox row, makes no model/index/filesystem/network call, and leaves non-result operations behaviorally unchanged.
12. Disposable real PostgreSQL integration proves restart/reload, isolation, tamper failure and absence of any result,
    artifact, locator or retained-byte table/copy using synthetic non-private fixtures.
13. Independent frozen implementation/test review returns P0=0/P1=0 before ordinary-browser acceptance.

## Deferred ordinary-browser acceptance

After deterministic implementation and independent review are green, an ordinary authenticated user must use the exact
candidate release on the real Omen -> Control application path. With no test-only result injection, the user completes
one bounded Research or Review result and one Code task; opens Files and artifacts; sees truthful ready/non-ready
states; previews the report, exact diff and public receipt; downloads supported results; and independently verifies
filename, media type, byte length and SHA-256 against the decoded bytes. Reload and sign-out/sign-in must recover the
same stateless projection from PostgreSQL.

The same journey proves foreign-project absence, oversize refusal, inert markup and no ready state for an incomplete or
unknown source. Evidence records the browser-visible state, workspace JSON response headers, independently computed
hashes, exact release/commit, PostgreSQL source identities, failures/RCAs and cleanup. It does not repeat model
qualification, accept C05, enable production or authorize a deferred format.

## Explicit deferrals and evidence limits

PDF, DOCX, XLSX, PPTX, CSV-specific rendering, images, audio/video, charts, notebooks, archives, directory downloads,
large-result streaming, generated binary files, rich Markdown/HTML, syntax highlighting, editing, conversion, sharing,
public links, cloud storage and publication are deferred. Their parsers/renderers, resource-fetch rules, limits,
retention and capability scopes require separate prospective criteria and acceptance.

The retained chat/task records were designed for their existing workflows, not as a general artifact system. This
slice can project only complete allowlisted bytes already retained in those records. It cannot claim durable binary
artifact retention, arbitrary historical reconstruction, broader file support, artifact authoring, C05 completion or
the complete Files and artifacts product destination.
