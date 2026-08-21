import { createHmac } from "node:crypto";
import { trace } from "@opentelemetry/api";

const allowed = new Set([
  "route", "lane", "component", "operation", "model.role", "provider.adapter", "model.id",
  "completion.reason", "completion.timed_out", "completion.output_limited", "retry.count",
  "evidence.count", "research.pass_count", "citation.count", "verdict.code",
  "request.id", "participant.id", "project.id", "thread.id", "schema.version",
]);

export function pseudonymize(value, key) {
  if (!key || key.length < 16) throw new Error("telemetry HMAC key must contain at least 16 characters");
  return createHmac("sha256", key).update(String(value)).digest("hex");
}

export function allowlistedAttributes(attributes) {
  return Object.fromEntries(Object.entries(attributes).filter(([name, value]) =>
    allowed.has(name) && ["string", "number", "boolean"].includes(typeof value)));
}

export function createGate1Telemetry({ hmacKey, tracer = trace.getTracer("runaai-gate1") }) {
  return {
    async span(name, request, attributes, operation) {
      const ids = {
        "request.id": pseudonymize(request.requestId, hmacKey),
        "participant.id": pseudonymize(request.participant.principalId, hmacKey),
        "project.id": pseudonymize(request.project.projectId, hmacKey),
        "thread.id": pseudonymize(request.thread.threadId, hmacKey),
      };
      return tracer.startActiveSpan(name, { attributes: allowlistedAttributes({ ...attributes, ...ids }) }, async span => {
        try {
          const result = await operation(span);
          const outcome = allowlistedAttributes({
            "completion.reason": result?.completion?.reason,
            "completion.timed_out": result?.completion?.timedOut,
            "completion.output_limited": result?.completion?.outputLimited,
            "evidence.count": result?.retrieval?.evidenceCount,
            "research.pass_count": result?.research?.passesRun ?? 0,
            "citation.count": result?.citations?.length ?? 0,
          });
          for (const [attribute, value] of Object.entries(outcome)) span.setAttribute(attribute, value);
          return result;
        } catch (error) {
          span.setAttribute("verdict.code", String(error?.code ?? "gate1-failed"));
          throw error;
        } finally {
          span.end();
        }
      });
    },
  };
}
