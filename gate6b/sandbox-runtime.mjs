import { cp, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export async function stageSandboxRuntime({ sourceRoot, nodeModulesRoot, destinationRoot }) {
  const sandboxRoot = resolve(destinationRoot, "sandbox-runtime");
  await mkdir(resolve(sandboxRoot, "node_modules"), { recursive: true });
  await copyFile(resolve(sourceRoot, "gate7e", "quickjs-child.mjs"),
    resolve(sandboxRoot, "quickjs-child.mjs"));
  for (const name of ["quickjs-emscripten", "quickjs-emscripten-core", "@jitl"]) {
    await cp(resolve(nodeModulesRoot, name), resolve(sandboxRoot, "node_modules", name),
      { recursive: true, dereference: true, errorOnExist: true, force: false });
  }
  return sandboxRoot;
}
