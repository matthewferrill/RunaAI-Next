import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { digest, parseContext, parseProposalId } from "./contracts.mjs";

// Product payloads, approvals and receipts stay in PostgreSQL authority records. Checkpoints carry
// identifiers/progress only. The fresh authenticated context comes from this invocation, never a checkpoint.
const State = Annotation.Root({ proposalId: Annotation(), status: Annotation(), receiptId: Annotation() });

export function createM1TaskWorkflow({ service, checkpointer }) {
  const threadKey = (context, proposalId) => digest({ participantId: context.principalId,
    projectId: context.projectId, proposalId, workflow: "m1-task/v1" });
  const graph = new StateGraph(State)
    .addNode("read_authority", async (state, config) => {
      const context = parseContext(config.configurable.authorityContext);
      const result = await service.proposalState(context, state.proposalId);
      return { proposalId: state.proposalId, status: result.proposal.status, receiptId: result.receipt?.receiptId ?? null };
    })
    .addNode("execute_or_reconcile", async (state, config) => {
      const context = parseContext(config.configurable.authorityContext);
      const result = await service.execute(context, { proposalId: state.proposalId },
        { agentRunAuthority: config.configurable.agentRunAuthority ?? null });
      return { proposalId: state.proposalId, status: result.proposal.status, receiptId: result.receipt?.receiptId ?? null };
    })
    .addEdge(START, "read_authority")
    .addEdge("read_authority", "execute_or_reconcile")
    .addEdge("execute_or_reconcile", END)
    .compile({ checkpointer });
  return {
    async run(rawContext, rawInput, { resume = false, agentRunAuthority = null } = {}) {
      const context = parseContext(rawContext), { proposalId } = parseProposalId(rawInput);
      // Scope-check even an already-completed checkpoint before using its identifiers.
      await service.proposalState(context, proposalId);
      const config = { configurable: { thread_id: threadKey(context, proposalId), authorityContext: context,
        agentRunAuthority } };
      const prior = resume ? await graph.getState(config) : null;
      await graph.invoke(resume && prior?.values?.proposalId ? null : { proposalId }, config);
      // A checkpoint is not an authority receipt or a freshness claim. Re-read the durable record.
      return service.proposalState(context, proposalId, { resumed: resume });
    },
    graph, threadKey,
  };
}
