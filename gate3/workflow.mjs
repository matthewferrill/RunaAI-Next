import { createHash } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { parseGate3ApprovalRequest } from "./contracts.mjs";

const WorkflowState = Annotation.Root({ request: Annotation(), receipt: Annotation() });
const threadKey = request => createHash("sha256").update([
  request.participant.principalId, request.proposalId, request.proposalDigest,
].join("\u0000")).digest("hex");

export function createGate3Workflow({ service, checkpointer }) {
  const builder = new StateGraph(WorkflowState);
  builder.addNode("gate3_approve_execute_record", async state => ({ request: state.request,
    receipt: await service.approveAndExecute(state.request) }));
  builder.addEdge(START, "gate3_approve_execute_record");
  builder.addEdge("gate3_approve_execute_record", END);
  const graph = builder.compile({ checkpointer });
  return {
    async approveAndExecute(rawRequest, { interruptAfterCheckpoint = false, resume = false } = {}) {
      const request = parseGate3ApprovalRequest(rawRequest);
      const config = { configurable: { thread_id: threadKey(request) } };
      const state = await graph.invoke(resume ? null : { request }, config);
      if (interruptAfterCheckpoint) {
        const error = new Error("synthetic Gate 3 receipt delivery interrupted after commit");
        error.code = "receipt-delivery-interrupted";
        throw error;
      }
      return state.receipt;
    },
    graph,
    threadKey,
  };
}
