import { cp, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export async function stageSandboxRuntime({ sourceRoot, nodeModulesRoot, destinationRoot,
  directoryName = "sandbox-runtime" }) {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(directoryName)) {
    throw Object.assign(new Error("The sandbox runtime directory name is invalid."),
      { code: "sandbox-runtime-directory-invalid" });
  }
  const sandboxRoot = resolve(destinationRoot, directoryName);
  await mkdir(resolve(sandboxRoot, "node_modules"), { recursive: true });
  await copyFile(resolve(sourceRoot, "gate7e", "quickjs-child.mjs"),
    resolve(sandboxRoot, "quickjs-child.mjs"));
  for (const name of ["quickjs-emscripten", "quickjs-emscripten-core", "@jitl"]) {
    await cp(resolve(nodeModulesRoot, name), resolve(sandboxRoot, "node_modules", name),
      { recursive: true, dereference: true, errorOnExist: true, force: false });
  }
  return sandboxRoot;
}
