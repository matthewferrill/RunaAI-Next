import {readFileSync,lstatSync,realpathSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {hash,requireValue} from "./runtime.mjs";
const check=(ok,code)=>requireValue(ok,"transfer-"+code);
export function verifyTransfer(root,manifest,expectedFiles){
  root=realpathSync(root);
  check(manifest.schemaVersion==="runa2-qualification-home-export/v1"&&manifest.host==="RUNA-HOME","source");
  check(Array.isArray(expectedFiles)&&expectedFiles.length>0&&new Set(expectedFiles).size===expectedFiles.length,"expected-files");
  check(JSON.stringify(Object.keys(manifest.files).sort())===JSON.stringify([...expectedFiles].sort()),"file-set");
  for(const relative of expectedFiles){
    check(typeof relative==="string"&&!path.isAbsolute(relative)&&!relative.split(/[\\/]/).includes(".."),"path");
    const file=path.resolve(root,relative),expected=manifest.files[relative];
    check(file.startsWith(root+path.sep)&&!lstatSync(file).isSymbolicLink()&&realpathSync(file)===file,"path");
    check(Number.isSafeInteger(expected.bytes)&&expected.bytes>=0&&/^[a-f0-9]{64}$/.test(expected.sha256),"digest-shape");
    const bytes=readFileSync(file);check(bytes.length===expected.bytes&&hash(bytes)===expected.sha256,"digest");
  }
  return {schemaVersion:"runa2-qualification-transfer-verification/v1",passed:true,files:expectedFiles.length,
    source:"Home-computed SHA-256 and size compared with local bytes",hardwareAttestation:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [root,manifestFile,...expected]=process.argv.slice(2);check(root&&manifestFile,"arguments");
  console.log(JSON.stringify(verifyTransfer(root,JSON.parse(readFileSync(manifestFile,"utf8")),expected)));
}
