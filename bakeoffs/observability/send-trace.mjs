import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

const runId = process.env.OTEL_RUN_ID;
if (!runId) throw new Error("OTEL_RUN_ID is required");
const forbiddenPrompt = "FORBIDDEN_RAW_PROMPT_7cfc0ca8";
const forbiddenSecret = "FORBIDDEN_SECRET_bfb9cc36";
void forbiddenPrompt;
void forbiddenSecret;

const sdk = new NodeSDK({
  serviceName: "runalab-stack-bakeoff",
  traceExporter: new OTLPTraceExporter({ url: "http://127.0.0.1:9438/v1/traces" })
});
await sdk.start();
const span = trace.getTracer("runalab").startSpan("provider.boundary", {
  attributes: {
    "run.id": runId,
    "run.attempt": 1,
    "component": "provider-boundary",
    "deadline.ms": 5000,
    "terminal.state": "committed",
    "deed.reference": `wire:${runId}`
  }
});
span.end();
await sdk.shutdown();
process.stdout.write(`${JSON.stringify({ runId, exported: true })}\n`);
