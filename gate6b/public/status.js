const text = (id, value) => { document.getElementById(id).textContent = value; };
try {
  const response = await fetch("/api/runtime/status", { cache: "no-store" });
  if (!response.ok) throw new Error("status unavailable");
  const status = await response.json();
  text("authority", `${status.authorityGeneration} (${status.cutover.phase})`);
  text("release", `${status.running.releaseId} · ${status.running.commit.slice(0, 12)}`);
  text("scope", status.selectedScopeVersion);
  text("summary", status.cutover.phase === "closed" ? "The reviewed selected core is active."
    : "The reviewed release is isolated and production remains on legacy RunaAI.");
} catch {
  text("summary", "The candidate status endpoint is unavailable. No authority is inferred.");
}

