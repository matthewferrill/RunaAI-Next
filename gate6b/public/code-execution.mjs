export function javascriptSource(content) {
  const matches = [...String(content).matchAll(/(?:^|\n)```(?:javascript|js)\s*\r?\n([\s\S]*?)\r?\n```(?=\s|$)/gi)];
  if (matches.length !== 1) return null;
  const source = matches[0][1];
  return source.trim() && new TextEncoder().encode(source).length <= 8_000 ? source : null;
}

export function executionOutput(receipt) {
  if (receipt.status !== "executed") return "The program did not run. No partial output was returned.";
  const parts = [];
  if (receipt.output.stdout) parts.push(receipt.output.stdout.replace(/\n$/, ""));
  if (receipt.output.stderr) parts.push(`Error output:\n${receipt.output.stderr.replace(/\n$/, "")}`);
  return parts.join("\n") || "Completed with no console output.";
}
