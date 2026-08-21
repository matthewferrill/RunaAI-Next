import { createHash } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { parseGate2AnswerRequest } from "./contracts.mjs";

const WorkflowState = Annotation.Root({ request: Annotation(), response: Annotation() });
const threadKey = request => createHash("sha256").update([
  request.participant.principalId, request.project.projectId, request.thread.threadId,
  request.lane, request.requestId,
].join("\u0000")).digest("hex");

export function createGate2Workflow({ service, checkpointer }) {
  const builder = new StateGraph(WorkflowState);
  builder.addNode("gate2_read_only_answer", async state => ({ request: state.request,
    response: await service.answer(state.request) }));
  builder.addEdge(START, "gate2_read_only_answer");
  builder.addEdge("gate2_read_only_answer", END);
  const graph = builder.compile({ checkpointer });
  return {
    async answer(rawRequest, { interruptAfterCheckpoint = false, resume = false } = {}) {
      const request = parseGate2AnswerRequest(rawRequest);
      const config = { configurable: { thread_id: threadKey(request) } };
      const state = await graph.invoke(resume ? null : { request }, config);
      if (interruptAfterCheckpoint) {
        const error = new Error("synthetic Gate 2 response delivery interrupted after checkpoint");
        error.code = "response-delivery-interrupted";
        throw error;
      }
      return state.response;
    },
    graph,
    threadKey,
  };
}
