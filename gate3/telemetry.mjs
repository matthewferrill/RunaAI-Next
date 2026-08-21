import { createHmac } from "node:crypto";
import { trace } from "@opentelemetry/api";

const allowed = new Set(["component", "operation", "action.kind", "verdict.code",
  "request.id", "approval.id", "participant.id", "project.id", "proposal.id", "result.status", "result.replayed"]);

export function gate3Pseudonymize(value, key) {
  if (!key || key.length < 16) throw new Error("Gate 3 telemetry HMAC key must contain at least 16 characters.");
  return createHmac("sha256", key).update(String(value)).digest("hex");
}
export function gate3AllowlistedAttributes(attributes) {
  return Object.fromEntries(Object.entries(attributes).filter(([name, value]) =>
    allowed.has(name) && ["string", "number", "boolean"].includes(typeof value)));
}

export function createGate3Telemetry({ hmacKey, tracer = trace.getTracer("runaai-gate3") }) {
  const protectedId = value => value == null ? undefined : gate3Pseudonymize(value, hmacKey);
  return {
    async span(name, request, attributes, operation) {
      const identifiers = {
        "request.id": protectedId(request.requestId),
        "approval.id": protectedId(request.approvalId),
        "participant.id": protectedId(request.participant?.principalId),
        "project.id": protectedId(request.project?.projectId),
        "proposal.id": protectedId(request.proposalId),
      };
      return tracer.startActiveSpan(name, { attributes: gate3AllowlistedAttributes({ ...attributes, ...identifiers }) }, async span => {
        try {
          const result = await operation(span);
          if (result.status) span.setAttribute("result.status", result.status);
          if (typeof result.replayed === "boolean") span.setAttribute("result.replayed", result.replayed);
          return result;
        } catch (error) {
          span.setAttribute("verdict.code", String(error?.code ?? "gate3-failed"));
          throw error;
        } finally { span.end(); }
      });
    },
  };
}
