const statusNode = document.querySelector("#ceremony-status");
const actionNode = document.querySelector("#ceremony-action");
const revokeNode = document.querySelector("#ceremony-revoke");
const browserSteps = new Set(["enroll-primary-credential", "verify-sign-in", "verify-fresh-step-up",
  "enroll-recovery-credential", "verify-recovery"]);

async function refresh() {
  const response = await fetch("/api/owner-ceremony/status", { credentials: "same-origin" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.errorCode ?? "ceremony-status-unavailable");
  if (value.complete) {
    statusNode.textContent = "The target owner ceremony is complete. This does not promote the candidate.";
    return;
  }
  statusNode.textContent = `Waiting for: ${value.nextStep}.`;
  if (browserSteps.has(value.nextStep)) {
    actionNode.href = `/owner-ceremony/start?step=${encodeURIComponent(value.nextStep)}`;
    actionNode.hidden = false;
    actionNode.textContent = "Continue with a user-verified passkey";
  } else if (value.nextStep === "verify-revocation") revokeNode.hidden = false;
}

revokeNode.addEventListener("click", async () => {
  revokeNode.disabled = true;
  try {
    const response = await fetch("/api/owner-ceremony/revoke", { method: "POST",
      credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.errorCode ?? "ceremony-revocation-failed");
    location.reload();
  } catch (error) {
    statusNode.textContent = `Stopped safely: ${error.message}`;
    revokeNode.disabled = false;
  }
});

refresh().catch(error => { statusNode.textContent = `Stopped safely: ${error.message}`; });
