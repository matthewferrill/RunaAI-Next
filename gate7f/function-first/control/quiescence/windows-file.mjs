import {randomUUID} from 'node:crypto';
import {readFile,writeFile,lstat,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {digest,fail} from './coordinator.mjs';
import {runFileHelper} from './file-helper.mjs';

export class WindowsCaddyFile {
  constructor({directory,allowSyntheticFixture=false,assertOwnerPrivate=null,operationMs=5000}){
    if(process.platform!=='win32'||operationMs<1||operationMs>10000||(!allowSyntheticFixture&&typeof assertOwnerPrivate!=='function'))throw fail('quiescence-file-authority-required');
    this.directory=path.resolve(directory);this.filename=path.join(this.directory,'Caddyfile');
    this.assertOwnerPrivate=assertOwnerPrivate;this.operationMs=operationMs;
  }
  async assertTarget(){
    if(await realpath(this.directory)!==this.directory||(await lstat(this.directory)).isSymbolicLink()
      ||(await lstat(this.filename)).isSymbolicLink()||await realpath(this.filename)!==this.filename)throw fail('quiescence-file-reparse');
    await this.assertOwnerPrivate?.(this.directory,this.filename);
  }
  async read(){await this.assertTarget();const info=await lstat(this.filename);if(!info.isFile()||info.size>1_048_576)throw fail('quiescence-file-cap');return readFile(this.filename);}
  async compareAndSwap(expectedSha256,next){
    await this.assertTarget();if(!/^[a-f0-9]{64}$/u.test(expectedSha256)||!Buffer.isBuffer(next)||next.length>1_048_576)throw fail('quiescence-file-input-invalid');
    const requestPath=path.join(this.directory,'quiescence-cas-'+randomUUID()+'.json');
    await writeFile(requestPath,JSON.stringify({allowedRoot:this.directory,target:this.filename,expectedSha256,nextBase64:next.toString('base64')}),{flag:'wx',mode:0o600});
    let retainRequest=false;
    try{
      const result=await runFileHelper({requestPath,operationMs:this.operationMs});
      let parsed;try{parsed=JSON.parse(result);}catch{throw fail('quiescence-file-result-invalid');}
      if(parsed.beforeSha256!==expectedSha256||parsed.afterSha256!==digest(next)||parsed.exclusiveWriteLease!==true
        ||digest(await this.read())!==digest(next))throw fail('quiescence-file-postcondition');
      return parsed;
    }catch(error){retainRequest=error.retainRequest===true;throw error;}
    finally{if(!retainRequest)await unlink(requestPath).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
}
