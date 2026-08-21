import { createHmac } from "node:crypto";
import { trace } from "@opentelemetry/api";

const allowed = new Set([
  "route", "lane", "component", "operation", "model.role", "provider.adapter", "model.id",
  "completion.reason", "completion.timed_out", "completion.output_limited", "evidence.count",
  "citation.count", "verdict.code", "request.id", "participant.id", "project.id", "thread.id",
  "schema.version", "adapter.chat", "adapter.project", "adapter.settings",
]);

export function gate2Pseudonymize(value, key) {
  if (!key || key.length < 16) throw new Error("Gate 2 telemetry HMAC key must contain at least 16 characters.");
  return createHmac("sha256", key).update(String(value)).digest("hex");
}

export function gate2AllowlistedAttributes(attributes) {
  return Object.fromEntries(Object.entries(attributes).filter(([name, value]) =>
    allowed.has(name) && ["string", "number", "boolean"].includes(typeof value)));
}

export function createGate2Telemetry({ hmacKey, tracer = trace.getTracer("runaai-gate2") }) {
  return {
    async span(name, request, attributes, operation) {
      const identifiers = {
        "request.id": gate2Pseudonymize(request.requestId, hmacKey),
        "participant.id": gate2Pseudonymize(request.participant.principalId, hmacKey),
        "project.id": gate2Pseudonymize(request.project.projectId, hmacKey),
        "thread.id": gate2Pseudonymize(request.thread.threadId, hmacKey),
      };
      return tracer.startActiveSpan(name, { attributes: gate2AllowlistedAttributes({ ...attributes, ...identifiers }) }, async span => {
        try {
          const result = await operation(span);
          const outcome = gate2AllowlistedAttributes({
            "completion.reason": result.completion.reason,
            "completion.timed_out": result.completion.timedOut,
            "completion.output_limited": result.completion.outputLimited,
            "evidence.count": result.retrieval.evidenceCount,
            "citation.count": result.citations.length,
            "adapter.chat": result.status.chatAdapter,
            "adapter.project": result.status.projectAdapter,
            "adapter.settings": result.status.settingsAdapter,
          });
          for (const [key, value] of Object.entries(outcome)) span.setAttribute(key, value);
          return result;
        } catch (error) {
          span.setAttribute("verdict.code", String(error?.code ?? "gate2-failed"));
          throw error;
        } finally { span.end(); }
      });
    },
  };
}
