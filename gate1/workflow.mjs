import { createHash } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { parseAnswerRequest } from "./contracts.mjs";

const threadKey = request => createHash("sha256").update([
  request.participant.principalId, request.project.projectId, request.thread.threadId, request.requestId,
].join("\u0000")).digest("hex");

const WorkflowState = Annotation.Root({ request: Annotation(), response: Annotation() });

export function createGate1Workflow({ slice, checkpointer }) {
  const builder = new StateGraph(WorkflowState);
  builder.addNode("read_only_answer", async state => ({ request: state.request, response: await slice.answer(state.request) }));
  builder.addEdge(START, "read_only_answer");
  builder.addEdge("read_only_answer", END);
  const graph = builder.compile({ checkpointer });

  return {
    async answer(rawRequest, { interruptAfterCheckpoint = false, resume = false } = {}) {
      const request = parseAnswerRequest(rawRequest);
      if (!resume) {
        const committed = await slice.records.getCommitted(request);
        if (committed) return committed;
      }
      const config = { configurable: { thread_id: threadKey(request) } };
      const state = await graph.invoke(resume ? null : { request }, config);
      if (interruptAfterCheckpoint) {
        const error = new Error("synthetic response delivery interrupted after checkpoint");
        error.code = "response-delivery-interrupted";
        throw error;
      }
      return state.response;
    },
    graph,
    threadKey,
  };
}
