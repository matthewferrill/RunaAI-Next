import { Agent } from '@mastra/core/agent';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import pg from 'pg';
import { createEnvelope } from '../fray4-capability/provenance.mjs';
import { createActionRequest } from '../fray4-capability/action-request.mjs';
import { CapabilityStore, initializeCapabilitySchema } from '../fray4-capability/capability.mjs';
import { executeGovernedTransfer } from '../fray4-capability/governed-tool.mjs';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
};
const phase = required('INTEGRATION_PHASE');
const attempt = Number(required('INTEGRATION_ATTEMPT'));
const runId = required('INTEGRATION_RUN_ID');
const threadId = required('INTEGRATION_THREAD_ID');
const pgUrl = required('INTEGRATION_PG_URL');
const qdrantUrl = required('INTEGRATION_QDRANT_URL');
const providerUrl = required('INTEGRATION_PROVIDER_URL');
const otelUrl = required('INTEGRATION_OTEL_URL');
const modelId = 'stub-deterministic-v1';
const deadlineMs = 5000;

const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: otelUrl }) });
sdk.start();
const tracer = trace.getTracer('runalab-vertical');
const pool = new pg.Pool({ connectionString: pgUrl, connectionTimeoutMillis: 2000, query_timeout: 5000 });
const checkpointer = PostgresSaver.fromConnString(pgUrl, { schema: 'public' });
await checkpointer.setup();
await initializeCapabilitySchema(pool, { reset: phase === 'initial' });
const capabilityStore = new CapabilityStore(pool);
const provider = createOpenAICompatible({ name: 'vertical-stub', baseURL: providerUrl });
const agent = new Agent({ name: 'vertical-agent', instructions: 'Return only the requested typed JSON.', model: provider(modelId) });

const State = Annotation.Root({
  requestId: Annotation(),
  agentText: Annotation(),
  retrievedId: Annotation(),
  retrievedDigest: Annotation(),
  terminal: Annotation(),
  deedRef: Annotation(),
});

const withSpan = (name, component, fn) => tracer.startActiveSpan(name, {
  attributes: { 'run.id': runId, 'run.attempt': attempt, component, 'deadline.ms': deadlineMs,
    'terminal.state': 'running', 'deed.reference': 'none' },
}, async span => {
  try {
    const value = await fn(span);
    span.setAttribute('terminal.state', value?.terminal ?? 'complete');
    span.setAttribute('deed.reference', value?.deedRef ?? 'none');
    return value;
  } catch (error) {
    span.recordException(error);
    span.setAttribute('terminal.state', 'failed');
    throw error;
  } finally { span.end(); }
});

const graphBuilder = new StateGraph(State);
graphBuilder.addNode('mastra_agent', state => withSpan('vertical.mastra-agent', 'mastra-agent', async () => {
  const result = await agent.generate('Prepare the approved transfer. Return only JSON with intent, amount, and destination.', {
    maxRetries: 0, timeout: { totalMs: deadlineMs }, maxOutputTokens: 128,
  });
  const actualModel = result.response?.modelId ?? null;
  if (result.finishReason !== 'stop') throw new Error(`provider incomplete: ${result.finishReason}`);
  if (actualModel !== modelId) throw new Error(`provider identity mismatch: ${actualModel}`);
  const parsed = JSON.parse(result.text);
  if (parsed.intent !== 'transfer' || parsed.amount !== 11 || parsed.destination !== 'vault') throw new Error('typed provider intent mismatch');
  return { requestId: state.requestId, agentText: result.text, terminal: 'agent-complete' };
}));
graphBuilder.addNode('typed_retrieval', state => withSpan('vertical.typed-retrieval', 'qdrant', async () => {
  const response = await fetch(`${qdrantUrl}/collections/vertical_policy/points/query`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: [1, 0, 0, 0], limit: 1, with_payload: true }),
    signal: AbortSignal.timeout(deadlineMs),
  });
  if (!response.ok) throw new Error(`qdrant query ${response.status}`);
  const body = await response.json();
  const point = body.result?.points?.[0];
  if (point?.id !== 1 || point.payload?.policy !== 'approved-transfer' || typeof point.payload?.sha256 !== 'string') throw new Error('typed retrieval postcondition failed');
  return { requestId: state.requestId, agentText: state.agentText, retrievedId: point.id,
    retrievedDigest: point.payload.sha256, terminal: 'retrieval-complete' };
}));
graphBuilder.addNode('governed_effect', state => withSpan('vertical.governed-effect', 'postgres-capability', async () => {
  if (state.retrievedId !== 1 || !state.retrievedDigest) throw new Error('missing typed retrieval evidence');
  const args = JSON.parse(state.agentText);
  const issuedAt = '2026-08-20T20:00:00.000Z';
  const actorId = 'user:integration-user';
  const intent = createEnvelope({ provenance: 'authenticated_user_request', sourceId: 'vertical-user-request',
    content: 'approved transfer amount 11 to vault', createdAt: issuedAt });
  const actionRequest = createActionRequest({ intent, actorId, action: 'transfer', resourceId: 'account:household',
    arguments: { amount: args.amount, destination: args.destination }, issuedAt,
    expiresAt: '2026-08-20T21:00:00.000Z', requestId: 'vertical-request', idempotencyKey: 'vertical-effect' });
  const identity = { decided: true, active: true, subject: 'integration-user' };
  const authorization = { decisionId: 'vertical-decision-issue', decided: true, allowed: true, actorId,
    action: 'transfer', resourceId: 'account:household', source: 'development-profile', decidedAt: issuedAt };
  const issued = await capabilityStore.issue(actionRequest, { identity, authorization, now: issuedAt, capabilityId: 'vertical-capability' });
  if (issued.outcome !== 'pending') throw new Error(`capability issue failed: ${issued.reason}`);
  const executionAuthorization = { ...authorization, decisionId: 'vertical-decision-execute' };
  const outcome = await executeGovernedTransfer({ store: capabilityStore, capabilityId: issued.capabilityId,
    actorId, resourceId: 'account:household', arguments: actionRequest.arguments, identity,
    authorization: executionAuthorization, now: issuedAt });
  if (outcome.outcome !== 'committed') throw new Error(`effect failed: ${outcome.outcome}/${outcome.reason}`);
  return { ...state, terminal: 'committed', deedRef: outcome.deed.idempotency_key };
}));
graphBuilder.addEdge(START, 'mastra_agent');
graphBuilder.addEdge('mastra_agent', 'typed_retrieval');
graphBuilder.addEdge('typed_retrieval', 'governed_effect');
graphBuilder.addEdge('governed_effect', END);
const compileOptions = { checkpointer };
if (phase === 'initial') compileOptions.interruptBefore = ['governed_effect'];
const graph = graphBuilder.compile(compileOptions);
const config = { configurable: { thread_id: threadId } };

let output;
try {
  output = await withSpan('vertical.graph', 'langgraph', async span => {
    const result = await graph.invoke(phase === 'initial' ? { requestId: 'vertical-request' } : null, config);
    const snapshot = await graph.getState(config);
    const terminal = phase === 'initial' ? 'paused-before-governed-effect' : result.terminal;
    span.setAttribute('terminal.state', terminal);
    span.setAttribute('deed.reference', result.deedRef ?? 'none');
    let historyStates = 0;
    for await (const _ of graph.getStateHistory(config)) historyStates += 1;
    const counts = await capabilityStore.counts();
    return { phase, attempt, terminal, result, next: snapshot.next, historyStates, counts,
      deedRef: result.deedRef ?? 'none' };
  });
  process.stdout.write(`${JSON.stringify(output)}\n`);
} finally {
  await checkpointer.end().catch(() => {});
  await pool.end().catch(() => {});
  await sdk.shutdown().catch(() => {});
}

