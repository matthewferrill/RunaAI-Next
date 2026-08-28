import { z } from "zod";

const fail = () => Object.assign(new Error("The task's configured model role is unavailable."), { code: "m1-planner-role-invalid" });
const startSchema = z.object({ taskId: z.string(), grantId: z.string(), grantRevision: z.number().int().positive(),
  requestId: z.string(), workflow: z.enum(["code", "agent"]).optional() }).strict();

// Both routes use identical application capabilities. Role selection changes the provider,
// never the caller's authority. Continuation uses the persisted selection, not browser input.
export class M1RoleOrchestrator {
  constructor({ code, agent }) { this.code = code; this.agent = agent; }
  async start(context, input) {
    const { workflow = "code", ...request } = startSchema.parse(input);
    return this[workflow].start(context, request);
  }
  async resume(context, input) {
    const state = await this.agent.status(context, { runId: input.runId });
    const role = state.run.plannerRole ?? "agent";
    if (!["code", "agent"].includes(role)) throw fail();
    return this[role].resume(context, input);
  }
  async status(context, input) { return this.agent.status(context, input); }
  async list(context) { return this.agent.list(context); }
}
