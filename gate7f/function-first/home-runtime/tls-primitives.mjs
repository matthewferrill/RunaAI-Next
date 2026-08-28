import {createHash} from 'node:crypto';
// Standalone enrollment package: it must not import model/lifecycle code or a runtime profile.
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const demand=(ok,code)=>{if(!ok)throw Object.assign(Error('runtime-'+code),{code:'runtime-'+code});};
