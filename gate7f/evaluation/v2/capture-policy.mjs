export const CAPTURE_POLICY = Object.freeze({
  schemaVersion: "runa2-gate7f1-capture-policy/v2",
  contextLength: 32768, temperature: 0, textOutputTokens: 1024, agentOutputTokens: 1536,
  requestTimeoutMs: 120000, armTimeoutMs: 90 * 60_000,
  cutoffDisposition: "failed-observation-continue-no-retry",
  providerFailureDisposition: "stop-arm-preserve-partial-evidence",
});
