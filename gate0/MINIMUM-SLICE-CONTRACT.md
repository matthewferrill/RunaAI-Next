# Minimum-slice contract

Status: frozen proposal for Gate 0 review. Product name: RunaAI.

## Scope

Gate 1 is the smallest disposable read-only vertical slice:

1. accept one trusted synthetic participant/project/thread request;
2. route ordinary chat or bounded local research through the selected provider boundary;
3. retrieve only synthetic source truth, enforce project scope, and rebuild derived vectors;
4. return typed evidence, citations, model identity, completion reason, omissions, and correlation;
5. checkpoint the disposable workflow and prove restart and duplicate behavior; and
6. perform no governed external effect and touch no legacy or protected store.

General chat and research are implemented in Gate 1. Guarded/local chat and explicit workspace
comprehension are parity observers only until Gate 2. Shared components introduced in Gate 1 must
still pass their frozen hard invariants.

## Trusted request envelope

```text
AnswerRequest {
  schemaVersion: "runa2-answer-request/v1"
  requestId: non-empty opaque id supplied by the trusted application boundary
  lane: "general" | "research"
  participant: { principalId, verified: boolean }
  project: { projectId }
  thread: { threadId }
  message: non-empty text, maximum 4,000 characters
  history: ordered prior turns from the same participant/project/thread only
  budgets: { deadlineMs, maximumPasses, maximumPassages, maximumEvidenceCharacters }
}
```

Participant, project, thread, and authority are application inputs. A prompt, retrieved passage,
model output, tool result, or Mastra memory snapshot cannot create or change them.

## Typed response envelope

```text
AnswerResponse {
  schemaVersion: "runa2-answer-response/v1"
  requestId, participantId, projectId, threadId, lane
  answer
  ground: "record-answers" | "record-silent" | "not-a-question-of-fact" | "no-ground-needed"
  retrieval: {
    attempted, skipped, skipReason, empty, degraded,
    evidenceCount, unavailable[], omissions[]
  }
  research: null | {
    passesPlanned, passesRun, passesWithNothing,
    passagesRead, unanswered[], truncated
  }
  citations: [{ sourceId, sectionId, contentSha256, ordinal }]
  model: { role, provider, modelId }
  completion: { reason, timedOut, outputLimited }
  trace: { correlationId }
  effects: []
}
```

No raw filesystem path, credential, prompt-internal instruction, chain of thought, or protected value
may appear in this envelope. `effects` must be empty in Gate 1.

## Authorities and storage

- PostgreSQL owns synthetic source records, thread records, request idempotency, and postconditions.
- LangGraph owns durable workflow checkpoints backed by PostgreSQL.
- Qdrant is a disposable derived index; PostgreSQL source truth must rebuild it.
- Mastra orchestrates the application boundary but is not a second durable authority.
- OTel carries allowlisted operational telemetry only, never authoritative business records.
- No legacy H2, DPAPI, Windows Hello, encrypted journal, chat, project, settings, or credential store is
  opened by Gate 1.

## Required behavior

- Same-project evidence may be cited only when its content digest and section identity are present.
- Cross-project evidence is denied before retrieval and never reaches the model.
- Revoked or deleted source truth is excluded and its derived vector is removed or ignored.
- Empty retrieval is reported as a retrieval result, not as a fact about the subject.
- Dependency loss is distinguishable from an honest empty result.
- Research reports its planned denominator, uncovered parts, and truncation.
- A duplicate `requestId` returns the committed result and cannot add a second thread turn.
- Restart resumes a committed checkpoint without replaying a completed request.
- Timeout and output limits are explicit completion states.
- Retrieved instructions are typed untrusted data and cannot mint capability or alter routing.
- Raw answer text is checked for citation and grounding failures before delivery.

## Explicit non-goals

- no production, Control, Home, Omen, LAN, TLS, Keycloak, OpenFGA, or provider activation;
- no real conversations or protected data;
- no learning, lesson approval, profile mutation, governed action, or tool effect;
- no legacy chat/project/settings continuity;
- no UI redesign; and
- no claim of full guarded or workspace lane parity.

## Rollback

Disable the Gate 1 route, stop only its disposable processes, and discard only the new disposable
PostgreSQL/Qdrant/OTel state. The legacy runtime and every legacy store remain authoritative and
unchanged. The Gate 1 branch can be deleted after review because no production or protected state
depends on it.
