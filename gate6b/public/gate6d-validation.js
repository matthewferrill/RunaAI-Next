const title = document.querySelector("#status-title");
const detail = document.querySelector("#status-detail");
const signIn = document.querySelector("#sign-in");

async function status() {
  try {
    const response = await fetch("/api/gate6d/session/status", { cache: "no-store" });
    if (!response.ok) throw new Error("inactive");
    const value = await response.json();
    if (value.active !== true) throw new Error("inactive");
    title.textContent = "Passkey session verified";
    detail.textContent = "You may leave this page open. The bounded migration operator can now run the short-lived final checks; no further click is required.";
  } catch {
    title.textContent = "A fresh passkey session is required";
    detail.textContent = "Continue once. This verifies the target owner for the final live checks; it does not promote the candidate by itself.";
    signIn.hidden = false;
  }
}

status();
