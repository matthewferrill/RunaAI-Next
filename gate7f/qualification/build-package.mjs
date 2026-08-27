import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, constants } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifySeal } from "../evaluation/v2/seal.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const kind=process.argv[2]??"diagnostics-v1";
if(!/^[a-z0-9-]+$/.test(kind))throw Error("invalid package name");
const target=path.join(root,"artifacts/runs/gate7f1/qualification-"+kind);
if(existsSync(target))throw Error("package already exists");
verifySeal();
const previous=JSON.parse(readFileSync(path.join(root,"artifacts/runs/gate7f1/home-capture-20260827-v2/bundle.json"),"utf8"));
const files=["qualification/runtime.mjs","qualification/diagnostics.mjs",
  "evaluation/v2/capture-contract.mjs","evaluation/v2/capture-policy.mjs","evaluation/v2/gguf-metadata.mjs"];
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const sourceHashes=Object.fromEntries(files.map(file=>[file,sha(readFileSync(path.join(root,"gate7f",file)))]));
const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",windowsHide:true}).trim();
const bundle={schemaVersion:"runa2-qualification-package/v1",source:{commit,kind,files:sourceHashes},
  runtime:previous.runtime,candidates:previous.candidates};
mkdirSync(target,{recursive:true});
for(const file of files){const to=path.join(target,file);mkdirSync(path.dirname(to),{recursive:true});
  copyFileSync(path.join(root,"gate7f",file),to,constants.COPYFILE_EXCL);}
const body=JSON.stringify(bundle,null,2)+"\n";
writeFileSync(path.join(target,"qualification/bundle.json"),body,{flag:"wx"});
const manifest={schemaVersion:"runa2-qualification-package-manifest/v1",commit,kind,
  files:{...sourceHashes,"qualification/bundle.json":sha(body)}};
writeFileSync(path.join(target,"package-manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({target,manifestSha256:sha(readFileSync(path.join(target,"package-manifest.json"))),manifest}));
