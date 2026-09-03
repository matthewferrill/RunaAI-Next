import { z } from "zod";
import { publicGitSourceDefinitionSchema } from "./postgres.mjs";

const fail = code => Object.assign(new Error(code), { code });
const empty = z.object({}).strict();
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);

/** Candidate-only application service. Effects remain unavailable until their real Control ports exist. */
export class ServerWorkspaceService {
  constructor({ store, sourceDefinition, authorizeContext }) {
    if (!store || typeof store.connectPublicGit !== "function" || typeof authorizeContext !== "function") {
      throw fail("server-workspace-service-configuration-invalid");
    }
    this.store = store;
    this.authorizeContext = authorizeContext;
    this.sourceDefinition = Object.freeze({ ...publicGitSourceDefinitionSchema.parse(sourceDefinition) });
  }

  async authorize(context, operation) {
    if (await this.authorizeContext(Object.freeze({ ...context }), operation) !== true) {
      throw fail("server-workspace-authorization-denied");
    }
  }

  async connectPublicGit(context, input) {
    empty.parse(input);
    await this.authorize(context, "source.connect-public-git");
    return this.store.connectPublicGit(context, this.sourceDefinition);
  }

  async connectFolderSnapshot(context, input) {
    empty.parse(input);
    await this.authorize(context, "source.connect-folder-snapshot");
    throw fail("server-workspace-folder-snapshot-unavailable");
  }

  async materialize(context, input) {
    z.object({ sourceId: id }).strict().parse(input);
    await this.authorize(context, "workspace.materialize");
    // This check is intentionally before beginMaterialization. The application
    // cannot create an intent until the real worker/publication port is present.
    throw fail("server-workspace-materializer-unavailable");
  }

  async listFiles(context, input) {
    z.object({ workspaceId: id }).strict().parse(input);
    await this.authorize(context, "workspace.list-files");
    throw fail("server-workspace-reader-unavailable");
  }

  async readText(context, input) {
    z.object({ workspaceId: id, path: z.string().min(1).max(1024) }).strict().parse(input);
    await this.authorize(context, "workspace.read-text");
    throw fail("server-workspace-reader-unavailable");
  }

  async cancel(context, input) {
    z.object({ workspaceId: id }).strict().parse(input);
    await this.authorize(context, "workspace.cancel");
    throw fail("server-workspace-cancel-unavailable");
  }

  async disconnect(context, input) {
    z.object({ sourceId: id }).strict().parse(input);
    await this.authorize(context, "source.disconnect");
    throw fail("server-workspace-cleanup-unavailable");
  }
}
