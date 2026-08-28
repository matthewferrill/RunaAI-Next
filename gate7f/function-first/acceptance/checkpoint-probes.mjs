import { digest } from "../tasks/contracts.mjs";
import { fail } from "./runner-contract.mjs";

// Read every bounded proposal's existing checkpoint. An approval-pending tail
// may have no graph invocation; it must not hide earlier executed checkpoints.
// This never invokes a graph, creates a checkpoint or makes an effect happen.
export async function captureTaskCheckpoints({ workflow, context, status }) {
  const task = status?.task, proposals = status?.proposals;
  if (!task || task.participantId !== context.principalId || task.projectId !== context.projectId
      || !Array.isArray(proposals) || proposals.length > 30
      || new Set(proposals.map(value => value.proposalId)).size !== proposals.length) throw fail("m1-proof-checkpoint-scope-invalid");
  const checkpoints = [];
  for (const proposal of proposals) {
    if (proposal.taskId !== task.taskId || proposal.participantId !== context.principalId
        || proposal.projectId !== context.projectId) throw fail("m1-proof-checkpoint-scope-invalid");
    const threadId = workflow.threadKey(context, proposal.proposalId);
    if (threadId !== digest({ participantId: context.principalId, projectId: context.projectId,
      proposalId: proposal.proposalId, workflow: "m1-task/v1" })) throw fail("m1-proof-checkpoint-thread-invalid");
    const state = await workflow.graph.getState({ configurable: { thread_id: threadId, authorityContext: context } });
    const checkpointId = state.config?.configurable?.checkpoint_id ?? null;
    const values = state.values ?? {};
    if (checkpointId && (state.config?.configurable?.thread_id !== threadId
        || values.proposalId !== proposal.proposalId)) throw fail("m1-proof-checkpoint-binding-invalid");
    if (!values || typeof values !== "object" || Array.isArray(values)
        || Object.keys(values).some(key => !["proposalId", "status", "receiptId"].includes(key))) throw fail("m1-proof-checkpoint-payload-invalid");
    checkpoints.push({ proposalId: proposal.proposalId, threadId, checkpointId, channel_values: structuredClone(values) });
  }
  return { checkpoints, checkpoint: checkpoints.findLast(value => value.checkpointId !== null) ?? null };
}
