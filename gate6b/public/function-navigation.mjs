import { functionModeAllowed } from "../function-contract.mjs";

export const FUNCTION_CATALOG = Object.freeze({
  chat: Object.freeze({ name: "chat", label: "Chat", experience: "chat", mode: "conversation",
    eyebrow: "Private chat", title: "Chat with Runa",
    description: "Ask questions, brainstorm, and draft with Gemma. This chat cannot access your files, network, settings, or systems.",
    placeholder: "Type your message…", greeting: "Hi. What would you like to talk about?" }),
  research: Object.freeze({ name: "research", label: "Research", experience: "chat", mode: "research",
    eyebrow: "Research selected text", title: "Research with Runa",
    description: "Ask questions about source sections you attach and select. This is not live web research and cannot perform actions.",
    placeholder: "Ask about the selected sources…", greeting: "Attach and select source sections, then ask what you want to learn." }),
  review: Object.freeze({ name: "review", label: "Review", experience: "chat", mode: "review",
    eyebrow: "Review selected text", title: "Review with Runa",
    description: "Have Gemma check selected source sections for defects, contradictions, unsupported claims, and missing evidence. Review does not edit or execute anything.",
    placeholder: "Ask Runa to review the selected sources…", greeting: "Attach and select the material you want reviewed." }),
  code: Object.freeze({ name: "code", label: "Code", experience: "code", mode: "conversation",
    eyebrow: "Private code chat", title: "Code with Runa",
    description: "Discuss, explain, and draft code. JavaScript runs only when you choose the isolated sandbox; it cannot access your files, network, or systems.",
    placeholder: "Ask about or draft code…", greeting: "Hi. What would you like to design, understand, or draft in code?" }),
  agent: Object.freeze({ name: "agent", label: "Agent", experience: "code", mode: "work",
    eyebrow: "Governed disposable work", title: "Work with Runa",
    description: "Ask Gemma to plan bounded work in Runa's disposable JavaScript project. The application—not the model—controls approvals, execution, receipts, cancellation, and undo.",
    placeholder: "Describe the bounded task…", greeting: "Prepare the disposable project, choose its limits, then describe the task." }),
});
export const FUNCTION_NAMES = Object.freeze(Object.keys(FUNCTION_CATALOG));
export const PRIMARY_FUNCTION_NAMES = Object.freeze(["chat", "code", "research"]);

export function functionNameForContext(experience, mode) {
  if (!functionModeAllowed(experience, mode)) throw new Error("invalid-function-context");
  if (experience === "code") return mode === "work" ? "agent" : "code";
  if (mode === "research" || mode === "review") return mode;
  return "chat";
}

export function functionTarget(name) {
  const value = FUNCTION_CATALOG[name];
  if (!value) throw new Error("unknown-function");
  return value;
}
