import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../../../..');
const evidenceDirectory=path.join(directory,'evidence','20260829-independent-two-host-closure-r1');
const relative=value=>path.relative(root,value).replaceAll('\\','/');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const run=(command,args,options={})=>spawnSync(command,args,{cwd:root,maxBuffer:32*1024*1024,windowsHide:true,...options});
const need=(value,message)=>{if(!value)throw Error(message);};
const writeExclusive=(name,value)=>writeFileSync(path.join(evidenceDirectory,name),value,{flag:'wx'});
const numberFrom=(text,label)=>Number(text.match(new RegExp(`^# ${label} (\\d+)$`,'mu'))?.[1]);

const git=run('git',['rev-parse','HEAD'],{encoding:'utf8'});
need(git.status===0,'git-revision');
const sourceCommit=git.stdout.trim();
need(/^[a-f0-9]{40}$/u.test(sourceCommit),'git-revision-format');

const pinnedPaths=[
  'gate7f/function-first/control/deployment/OWNER-TRANSACTION-CRITERIA.md',
  'gate7f/function-first/control/deployment/closed-adapter.mjs',
  'gate7f/function-first/control/deployment/managed-callers.mjs',
  'gate7f/function-first/control/deployment/managed-callers.test.mjs',
  'gate7f/function-first/control/deployment/owner-authority.mjs',
  'gate7f/function-first/control/deployment/owner-authority.test.mjs',
  'gate7f/function-first/control/deployment/owner-journal.mjs',
  'gate7f/function-first/control/deployment/owner-journal.test.mjs',
  'gate7f/function-first/control/deployment/two-host.mjs',
  'gate7f/function-first/control/deployment/two-host.test.mjs',
  'gate7f/function-first/control/deployment/run-independent-two-host-closure-proof.mjs',
  'gate7f/function-first/control/deployment/evidence/20260829-independent-two-host-closure-r1/.gitattributes'
];
const sourcePins=pinnedPaths.map(file=>{
  const workingBytes=readFileSync(path.join(root,file));
  const object=run('git',['show',`${sourceCommit}:${file}`],{encoding:null});
  need(object.status===0,`git-object-${file}`);
  const workingSha256=sha256(workingBytes),gitObjectSha256=sha256(object.stdout);
  need(workingSha256===gitObjectSha256,`working-git-byte-drift-${file}`);
  return {path:file,sha256:workingSha256,bytes:workingBytes.length,gitObjectSha256,workingTreeMatchesGit:true};
});

const testFiles=readdirSync(directory).filter(name=>name.endsWith('.test.mjs')).sort()
  .map(name=>relative(path.join(directory,name)));
const command=[process.execPath,'--test','--test-concurrency=1',...testFiles];
const startedAt=new Date().toISOString();
const tests=run(process.execPath,command.slice(1),{encoding:null});
const finishedAt=new Date().toISOString();
const tap=tests.stdout??Buffer.alloc(0),stderr=tests.stderr??Buffer.alloc(0),tapText=tap.toString('utf8');
const counts={tests:numberFrom(tapText,'tests'),suites:numberFrom(tapText,'suites'),pass:numberFrom(tapText,'pass'),
  fail:numberFrom(tapText,'fail'),cancelled:numberFrom(tapText,'cancelled'),skipped:numberFrom(tapText,'skipped'),todo:numberFrom(tapText,'todo')};
const passed=tests.status===0&&counts.tests===136&&counts.pass===136&&counts.fail===0&&counts.cancelled===0&&counts.skipped===0&&counts.todo===0;

const result={schemaVersion:'runaai-independent-two-host-closure-result/v1',evaluatorId:'codex-independent-model-role-review-20260828',
  reviewerRole:'fresh independent reviewer; author of neither the original owner-transaction criteria nor the original two-host implementation',
  sourceCommit,reviewedCriteriaCommits:['88ebe41','394c011'],reviewedImplementationCommit:'8052d32',reviewBranchBase:'477060497ab486cf4c9d79833a9bd9f2910c82b6',
  command,startedAt,finishedAt,exitCode:tests.status,testFileCount:testFiles.length,counts,passed,sourcePins,
  scope:{liveActivationAttempted:false,liveRouteMutationAttempted:false,homeOrControlLifecycleMutationAttempted:false,
    syntheticFixturesOnlyForTransactionEffects:true,qualificationClaimed:false,productionPromotionClaimed:false}};

const findings=[
  {id:'TH-01',status:'closed',summary:'The exported coordinator no longer accepts a synthetic-fixture activation bypass; every construction requires a current exact activation-authority receipt.'},
  {id:'TH-02',status:'closed',summary:'Managed-caller closure freshness now covers every required counter sample, not only the latest sample.'},
  {id:'TH-03',status:'closed',summary:'A fresh exact candidate-Caddy health allowlist observation, bound to the publication receipt and reconstructed plan, is required before application deployment and final publication.'},
  {id:'TH-04',status:'closed',summary:'Home readiness requires exact task, process, native observation, enrollment, and TLS operator descriptor bindings in addition to explicit confirmations.'},
  {id:'TH-05',status:'closed',summary:'The append-only journal rejects a second dispatch for one writer and a second effect of one kind, including after restart.'}
];
const review={schemaVersion:'runaai-independent-two-host-closure-review/v1',evaluatorId:result.evaluatorId,sourceCommit,
  disposition:passed?'closed':'not-closed',findings,verification:{result:'result.json',tap:'tests.tap',stderr:'tests.stderr.txt',counts,passed},
  limitations:['This is source, journal, fixture, and isolated child-process evidence; it is not live two-host activation evidence.',
    'No production route, Home runtime, Control service, model, or customer path was changed or exercised.',
    'Future activation still requires the fresh outer activation receipt and the live receipts required by the frozen criteria.']};
const markdown=`# Independent two-host owner-transaction closure review\n\n`+
`Evaluator: \`${review.evaluatorId}\`\n\nSource commit: \`${sourceCommit}\`\n\nDisposition: **${review.disposition}**\n\n`+
`I reviewed the frozen owner-transaction criteria and the implementation lineage at \`8052d32\` as a fresh independent reviewer, author of neither the original criteria nor the original two-host adapter. Five blocking gaps were found and prospectively corrected:\n\n`+
findings.map(item=>`- **${item.id} — ${item.status}:** ${item.summary}`).join('\n')+`\n\n`+
`The exact committed source passed all ${counts.tests} deployment tests serially (${counts.pass} pass, ${counts.fail} fail, ${counts.skipped} skipped). Restart, unknown-effect, rollback-order, activation-authority, receipt-binding, stale-observation, and negative synthetic-boundary cases are retained in the TAP evidence.\n\n`+
`This closes the five source/test findings only. It is not qualification, live activation, production promotion, or customer acceptance. No live route, Home runtime, Control service, model, or customer path was mutated.\n`;

const resultBytes=Buffer.from(JSON.stringify(result,null,2)+'\n');
const reviewBytes=Buffer.from(JSON.stringify(review,null,2)+'\n');
const markdownBytes=Buffer.from(markdown);
writeExclusive('tests.tap',tap);
writeExclusive('tests.stderr.txt',stderr);
writeExclusive('result.json',resultBytes);
writeExclusive('review.json',reviewBytes);
writeExclusive('REVIEW.md',markdownBytes);
const seal={schemaVersion:'runaai-independent-two-host-closure-seal/v1',sourceCommit,evaluatorId:result.evaluatorId,
  files:{'tests.tap':sha256(tap),'tests.stderr.txt':sha256(stderr),'result.json':sha256(resultBytes),'review.json':sha256(reviewBytes),'REVIEW.md':sha256(markdownBytes)},
  passed,privateValuesIncluded:false};
writeExclusive('SEAL.json',Buffer.from(JSON.stringify(seal,null,2)+'\n'));
if(!passed)process.exitCode=1;
