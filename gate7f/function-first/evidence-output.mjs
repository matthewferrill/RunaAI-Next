// One static application-owned wire contract. It does not contain expected
// answers or authorize evidence, model tools, actions, or source membership.
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const CITATION_SCHEMA={type:'object',additionalProperties:false,
  properties:{sourceId:{type:'string'},sectionId:{type:'string'}},required:['sourceId','sectionId']};
export const EVIDENCE_OUTPUT_SCHEMA=freeze({$schema:'http://json-schema.org/draft-07/schema#',type:'object',additionalProperties:false,properties:{
  answer:{type:'string'},citations:{type:'array',items:CITATION_SCHEMA}},required:['answer','citations']});
export const EVIDENCE_STRUCTURED_OUTPUT=freeze({schema:EVIDENCE_OUTPUT_SCHEMA,errorStrategy:'error',jsonPromptInjection:false});
export const EVIDENCE_RESPONSE_FORMAT=freeze({type:'json_schema',json_schema:{schema:EVIDENCE_OUTPUT_SCHEMA,strict:true,name:'response'}});
export const EVIDENCE_VERIFICATION_SCHEMA=freeze({$schema:'http://json-schema.org/draft-07/schema#',type:'object',
  additionalProperties:false,properties:{accepted:{type:'boolean'},reason:{type:'string',minLength:1},
    correctedAnswer:{type:['string','null']},citations:{anyOf:[{type:'null'},
      {type:'array',items:CITATION_SCHEMA}] }},required:['accepted','reason','correctedAnswer','citations'],allOf:[
    {if:{properties:{accepted:{const:true}},required:['accepted']},then:{properties:{correctedAnswer:{type:'null'}}}},
    {if:{properties:{accepted:{const:false}},required:['accepted']},then:{properties:{correctedAnswer:{type:'string',minLength:1},
      citations:{type:'array',minItems:1,items:CITATION_SCHEMA}}}},
  ]});
export const EVIDENCE_VERIFICATION_STRUCTURED_OUTPUT=freeze({schema:EVIDENCE_VERIFICATION_SCHEMA,
  errorStrategy:'error',jsonPromptInjection:false});
export const EVIDENCE_VERIFICATION_RESPONSE_FORMAT=freeze({type:'json_schema',
  json_schema:{schema:EVIDENCE_VERIFICATION_SCHEMA,strict:true,name:'response'}});
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']'
  :'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
export function isEvidenceResponseFormat(value){return canonical(value)===canonical(EVIDENCE_RESPONSE_FORMAT);}
export function isEvidenceVerificationResponseFormat(value){return canonical(value)===canonical(EVIDENCE_VERIFICATION_RESPONSE_FORMAT);}
export function isQualifiedEvidenceResponseFormat(value){return isEvidenceResponseFormat(value)
  ||isEvidenceVerificationResponseFormat(value);}
const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
export function isEvidenceOutput(value){return exact(value,'answer,citations')&&typeof value.answer==='string'
  &&Array.isArray(value.citations)&&value.citations.every(c=>exact(c,'sectionId,sourceId')
    &&typeof c.sourceId==='string'&&c.sourceId.length>0&&typeof c.sectionId==='string'&&c.sectionId.length>0);}
