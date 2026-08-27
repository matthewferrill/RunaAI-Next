import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {hash} from "./runtime.mjs";
import {verifyTransfer} from "./verify-transfer.mjs";
test("source-created transfer digest rejects changed bytes sizes and file sets",()=>{
  const root=mkdtempSync(path.join(tmpdir(),"runa-transfer-"));
  try{
    const bytes=Buffer.from("synthetic evidence\n");writeFileSync(path.join(root,"events.jsonl"),bytes);
    const manifest={schemaVersion:"runa2-qualification-home-export/v1",host:"RUNA-HOME",files:{"events.jsonl":{bytes:bytes.length,sha256:hash(bytes)}}};
    assert.equal(verifyTransfer(root,manifest,["events.jsonl"]).passed,true);
    for(const edit of [m=>m.host="other",m=>m.files["events.jsonl"].bytes++,m=>m.files["events.jsonl"].sha256="0".repeat(64),m=>m.files.extra=m.files["events.jsonl"]]){
      const wrong=structuredClone(manifest);edit(wrong);assert.throws(()=>verifyTransfer(root,wrong,["events.jsonl"]));
    }
    writeFileSync(path.join(root,"events.jsonl"),"changed");assert.throws(()=>verifyTransfer(root,manifest,["events.jsonl"]));
  }finally{rmSync(root,{recursive:true,force:true});}
});
