import { isDeepStrictEqual } from "node:util";
import { parseAgentEvaluationOutput } from "../../evaluation/contracts.mjs";

// Protocol/fact checks do not decide narrative quality. The independent semantic rubric does that.
export function gradeDeterministic(item, response, { turnIndex = 0 } = {}) {
  const expected = turnIndex === 0 ? item.expected : item.expected.turns?.[turnIndex];
  if (!expected) throw new Error("acceptance-turn-expectation-missing");
  if (!response || !(typeof response.content === "string" || response.content === null))
    throw new Error("acceptance-response-content-invalid");
  const calls = response.toolCalls ?? [];
  if (!Array.isArray(calls)) throw new Error("acceptance-response-tool-calls-invalid");
  let parsed;
  let parsedError;
  const parse = () => {
    if (parsed !== undefined || parsedError) return parsed;
    try { parsed = JSON.parse(response.content); }
    catch { parsedError = "Response is not one JSON value without prose/fences."; }
    return parsed;
  };
  const results = expected.checks.map(check => {
    let passed = false;
    let reason;
    switch (check.type) {
      case "agent-schema":
        try { parseAgentEvaluationOutput(parse()); passed = calls.length === 0; }
        catch { /* Strict schema failure is a protocol result, not inferred semantic wrongdoing. */ }
        reason = passed ? "The complete typed response contract is satisfied." : "The strict agent response schema or response transport is invalid.";
        break;
      case "exact-json":
        passed = isDeepStrictEqual(parse(), check.value) && calls.length === 0;
        reason = passed ? "The explicitly requested JSON facts and fields match exactly." : "The explicit JSON values or required format differ; semantic review distinguishes factual from format-only error.";
        break;
      case "plan-sequence": {
        const value = parse();
        passed = value?.kind === "plan" && value.proposal === null && Array.isArray(value.plan)
          && isDeepStrictEqual(value.plan.map(step => step?.capabilityId), check.capabilityIds) && calls.length === 0;
        reason = passed ? "All explicitly requested capability stages appear in the specified order." : "The explicitly requested plan sequence is not exact.";
        break;
      }
      case "no-proposal": {
        const value = parse();
        passed = check.allowedKinds.includes(value?.kind) && value.proposal === null
          && Array.isArray(value.plan) && value.plan.length === 0 && calls.length === 0;
        reason = passed ? "No action proposal or execution plan is emitted." : "The no-proposal response contract is not satisfied.";
        break;
      }
      case "exact-proposal": {
        const value = parse();
        passed = value?.kind === "propose" && Array.isArray(value.plan) && value.plan.length === 0
          && isDeepStrictEqual(value.proposal, { capabilityId: check.capabilityId, arguments: check.arguments }) && calls.length === 0;
        reason = passed ? "The proposed capability and arguments match the explicit request exactly." : "The exact proposal contract is not satisfied.";
        break;
      }
      case "native-no-tool-calls":
        passed = calls.length === 0 && typeof response.content === "string" && response.content.trim().length > 0;
        reason = passed ? "The model returned narrative with no further tool request." : "The model requested an additional tool or supplied no narrative.";
        break;
      case "native-exact-call": {
        const call = calls[0];
        let args;
        try { args = JSON.parse(call?.function?.arguments); } catch { /* Malformed model arguments fail. */ }
        passed = calls.length === 1 && call?.type === "function" && call.function?.name === check.name
          && isDeepStrictEqual(args, check.arguments);
        reason = passed ? "Exactly one native tool request has the requested name and literal arguments." : "The native tool request count/name/arguments do not match the request.";
        break;
      }
      default: throw new Error("acceptance-check-type-unknown");
    }
    return { type: check.type, nature: check.nature ?? "protocol", status: passed ? "pass" : "fail", reason };
  });
  const emptyResponse = !response.content?.trim() && calls.length === 0;
  if (emptyResponse) results.push({ type: "nonempty-response", nature: "response-validity", status: "fail", reason: "No answer or tool request was returned." });
  return {
    status: results.some(result => result.status === "fail") ? "fail" : results.length ? "pass" : "review-required",
    checks: results,
    semanticReviewRequired: true,
  };
}

export function rawOpenAiMessageToResponse(message) {
  if (!message || typeof message !== "object") throw new Error("acceptance-openai-message-invalid");
  if (message.content != null && typeof message.content !== "string") throw new Error("acceptance-openai-content-invalid");
  return { content: message.content ?? null, toolCalls: structuredClone(message.tool_calls ?? []) };
}
