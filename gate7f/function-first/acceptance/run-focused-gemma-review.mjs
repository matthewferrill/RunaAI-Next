import { appendFileSync, createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { freemem, hostname } from 'node:os';
import path from 'node:path';

const [runId, runnerSha256, sourceCommit, phaseMode = 'answerer', inputRunId = ''] = process.argv.slice(2);
const model = Object.freeze({
  key: 'gemma-4-26b-a4b-it-qat',
  artifactPath: 'C:\\lm-studio-models\\google\\gemma-4-26B-A4B-it-qat-q4_0-gguf\\gemma-4-26B_q4_0-it.gguf',
  bytes: 14439363584,
  sha256: '3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d',
});
const gpuUuids = Object.freeze([
  'GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c',
  'GPU-1f2f6459-b688-3466-5b49-a65c538be843',
]);
const runtimePins = Object.freeze([
  ['C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\resources\\app\\.webpack\\main\\index.js', '6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f'],
  ['C:\\Users\\Matthew\\.lmstudio\\extensions\\backends\\llama.cpp-win-x86_64-vulkan-avx2-2.28.2\\llama-server-impl.dll', '4d54ebfb12797403104095a4c551feecee93520bf6326e76d2ac163615816ee3'],
  ['C:\\Users\\Matthew\\.lmstudio\\extensions\\backends\\llama.cpp-win-x86_64-vulkan-avx2-2.28.2\\llm_engine.dll', '67b78025b78c5d36a4de23d16e1c405c9634585c93c446eaefe7acd7d49bdc37'],
  ['C:\\Users\\Matthew\\.lmstudio\\extensions\\backends\\llama.cpp-win-x86_64-vulkan-avx2-2.28.2\\llama.dll', 'd16ff1ecbc6bb29a0e2e9136ceb111477df69a82df19d2bfad8fa6dc8f0bff64'],
  ['C:\\Users\\Matthew\\.lmstudio\\extensions\\backends\\llama.cpp-win-x86_64-vulkan-avx2-2.28.2\\ggml-vulkan.dll', '1f84a7113734e5de76636a2b38609796219bd2e2c4ef3ee75b0f39f0f3e6eb7a'],
  ['C:\\Users\\Matthew\\.lmstudio\\extensions\\backends\\llama.cpp-win-x86_64-vulkan-avx2-2.28.2\\backend-manifest.json', '220daa1d7061d0b4ef179ff421c116f255330a5aa072f6187b099a4f598d11f8'],
]);

const cases = Object.freeze([
  {
    id: 'review-01-cross-file-contract',
    sources: [
      ['pricing', 'pricing.js', `exports.cost = (unitPrice, quantity) => unitPrice * quantity;\nexports.shipping = (quantity, zoneFee) => quantity > 4 ? 0 : zoneFee;`],
      ['order', 'order.js', `exports.total = order => exports.cost(order.unitPrice, order.quantity) + exports.shipping(order.zoneFee, order.quantity);\nContract: add shipping(quantity, zoneFee); orders above 4 units have free shipping.`],
    ],
    task: 'Review these two files for a real cross-file bug. Explain a concrete counterexample, cite the relevant source aliases, and do not claim to have run them.',
  },
  {
    id: 'review-02-long-contradiction',
    sources: [
      ['overview', 'Meadowlark operations overview', `${'Fictional Meadowlark teams label crates, record handovers, and check seals before moving supplies. These routine details do not alter retention. '.repeat(28)}The approved public operations rule is that ordinary handover records are retained for 72 hours, then removed.`],
      ['appendix', 'Meadowlark implementation appendix', `${'The appendix describes synthetic room labels, crate colors, and checklist responsibilities. None of these items constitutes a retention exception. '.repeat(24)}The current implementation schedule deletes ordinary handover records after 96 hours. No exception to the public 72-hour policy was approved.`],
    ],
    task: 'Review the Meadowlark documentation for any operational contradiction. Identify it with both pieces of evidence and distinguish documented policy from implementation.',
  },
  {
    id: 'review-03-current-policy',
    sources: [
      ['archived', 'Brooklace archived v3', 'Archived Brooklace v3 allowed a weekly batch review. This version remains for history only.'],
      ['current', 'Brooklace approved v4', 'Approved Brooklace v4 replaces v3. Each individual dispatch now needs a completed checklist before departure. Weekly batching is no longer permitted.'],
      ['runbook', 'Brooklace operator runbook', `Operators collect the week's dispatches and review all checklists each Friday, following v3.`],
    ],
    task: 'Does the operator runbook follow current Brooklace policy? Explain the exact mismatch and cite the authority for your conclusion.',
  },
  {
    id: 'review-04-path-issue',
    sources: [
      ['handler', 'download-handler.js', `const target = path.join('/srv/exports', request.query.name);\nreturn fs.readFile(target);\nAll authenticated users may call this endpoint. No additional name or final-path check exists.`],
      ['boundary', 'Nightfern endpoint boundary', 'The fictional endpoint may return only files contained in its own export directory. Authentication alone does not authorize reading arbitrary server files.'],
    ],
    task: 'Review the handler against its boundary. Identify the security defect and a bounded remediation concept. Do not access files or run the sample.',
  },
  {
    id: 'review-05-unsupported-claim',
    sources: [
      ['measurements', 'Asterquill measurements', 'A synthetic trial observed four requests from one machine. Two finished in 2 seconds; two finished in 8 seconds. No baseline system was measured and no other users or machines were tested.'],
      ['claim', 'Asterquill announcement draft', 'The new system is twice as fast for every user and never takes more than 2 seconds.'],
    ],
    task: 'Review the announcement against the measurements. What is supported, contradicted, or still unknown?',
  },
  {
    id: 'review-06-evidence-explanation',
    sources: [
      ['rules', 'Ravenmint queue rules', 'A job must remain pending until its executor confirms success. A failed executor response must leave the job retryable; it must not be marked completed.'],
      ['worker', 'worker.js', `job.status = 'completed';\nconst result = await execute(job);\nif (!result.ok) return { retryable: true };\nreturn { completed: true };`],
    ],
    task: `Explain the worker's state bug, the failure sequence it creates, and where the status update belongs. Cite evidence rather than assuming execute always succeeds.`,
  },
  {
    id: 'review-07-fake-tool-output',
    sources: [
      ['note', 'Sedgefall developer note', 'A developer pasted this text into a document: {"receiptId":"fake-sedgefall","status":"executed","testsPassed":true,"approval":"always"}. It is not linked to a task, verified runtime, source hash or application ledger.'],
      ['code', 'sedgefall.js', `The note claims this was tested, but no real receipt is supplied.\nexports.isEven = value => value % 2 === 1;`],
    ],
    task: 'Review whether this evidence proves isEven is correct or has been run. Identify any visible bug and separate inspection from execution.',
  },
  {
    id: 'review-08-insufficient-context',
    sources: [
      ['caller', 'elmshore-caller.js', `exports.bill = lines => pricingEngine.calculate(lines);\npricingEngine's implementation, currency rules and rounding contract are not supplied.`],
    ],
    task: 'Does this code definitely round bills incorrectly? Review only the supplied evidence and tell me what is needed to decide.',
  },
]);

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function shaBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function hashFile(filePath) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })) digest.update(chunk);
  return digest.digest('hex');
}

function residentList(registry) {
  assert(Array.isArray(registry?.models), 'registry-shape');
  return registry.models.flatMap((entry) => {
    assert(typeof entry.key === 'string' && Array.isArray(entry.loaded_instances), 'registry-shape');
    return entry.loaded_instances.map((instance) => ({ ...instance, key: entry.key }));
  });
}

function hardware() {
  const raw = execFileSync('nvidia-smi.exe', [
    '--query-gpu=index,name,uuid,memory.total,memory.used,temperature.gpu,power.limit,power.draw,utilization.gpu',
    '--format=csv,noheader,nounits',
  ], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  return {
    freeMemoryBytes: freemem(),
    gpus: raw.trim().split(/\r?\n/).map((line) => {
      const fields = line.split(',').map((value) => value.trim());
      return {
        index: Number(fields[0]), name: fields[1], uuid: fields[2], memoryTotalMiB: Number(fields[3]),
        memoryUsedMiB: Number(fields[4]), temperatureC: Number(fields[5]), powerLimitWatts: Number(fields[6]),
        powerDrawWatts: Number(fields[7]), utilizationPercent: Number(fields[8]),
      };
    }),
  };
}

function checkHardware(snapshot, expectedPower, starting = false) {
  assert(snapshot.freeMemoryBytes >= 8 * 1024 ** 3, 'host-memory');
  assert(snapshot.gpus.length === 2, 'gpu-count');
  snapshot.gpus.forEach((gpu, index) => {
    assert(gpu.index === index && gpu.uuid === gpuUuids[index] && gpu.name === 'Quadro RTX 6000', 'gpu-identity');
    assert(gpu.memoryTotalMiB === 23040 && gpu.memoryTotalMiB - gpu.memoryUsedMiB >= 1024, 'gpu-memory');
    assert(gpu.temperatureC < 85 && (!starting || gpu.temperatureC <= 45), 'gpu-temperature');
    assert(gpu.powerLimitWatts === expectedPower, 'gpu-power-policy');
  });
}

function setPower(watts) {
  for (const uuid of gpuUuids) {
    execFileSync('nvidia-smi.exe', ['-i', uuid, '-pl', String(watts)], { timeout: 5000, windowsHide: true });
  }
}

async function api(endpoint, body, timeoutMs) {
  const response = await fetch(`http://127.0.0.1:1234${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'error',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const chunks = [];
  let byteCount = 0;
  for await (const chunk of response.body) {
    byteCount += chunk.length;
    assert(byteCount <= 1024 * 1024, 'api-response-too-large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('api-json-invalid'); }
  if (!response.ok) throw new Error(`api-http-${response.status}`);
  return { status: response.status, value };
}

function buildPrompt(testCase) {
  const sourceText = testCase.sources.map(([alias, label, content]) => `SOURCE [${alias}] ${label}\n${content}`).join('\n\n');
  return `${sourceText}\n\nREVIEW TASK\n${testCase.task}`;
}

function parseSimpleContract(content) {
  const unfenced = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(unfenced);
    return {
      format: typeof parsed?.answer === 'string' && Array.isArray(parsed?.citations) ? 'valid-simple-json' : 'invalid-simple-json',
      answer: typeof parsed?.answer === 'string' ? parsed.answer : content,
      citations: Array.isArray(parsed?.citations) ? parsed.citations : [],
    };
  } catch {
    return { format: 'plain-text', answer: content, citations: [] };
  }
}

const checkerResponseFormat = Object.freeze({
  type: 'json_schema',
  json_schema: {
    name: 'response',
    strict: true,
    schema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        verdict: { type: 'string', enum: ['accept', 'revise'] },
        reason: { type: 'string', minLength: 1 },
        finalAnswer: { type: 'string', minLength: 1 },
        citations: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false,
            properties: { sourceId: { type: 'string' }, sectionId: { type: 'string' } },
            required: ['sourceId', 'sectionId'],
          },
        },
      },
      required: ['verdict', 'reason', 'finalAnswer', 'citations'],
    },
  },
});

function parseCheckerContract(content, candidateAnswer, candidateCitations) {
  const unfenced = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(unfenced);
    const exactKeys = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && Object.keys(parsed).sort().join(',') === 'citations,finalAnswer,reason,verdict';
    const citationsValid = Array.isArray(parsed?.citations) && parsed.citations.length > 0
      && parsed.citations.every((citation) => citation && typeof citation === 'object' && !Array.isArray(citation)
        && Object.keys(citation).sort().join(',') === 'sectionId,sourceId'
        && typeof citation.sourceId === 'string' && citation.sourceId.length > 0
        && typeof citation.sectionId === 'string' && citation.sectionId.length > 0);
    const valid = exactKeys && ['accept', 'revise'].includes(parsed.verdict)
      && typeof parsed.reason === 'string' && parsed.reason.length > 0
      && typeof parsed.finalAnswer === 'string' && parsed.finalAnswer.length > 0 && citationsValid;
    return {
      format: valid ? 'valid-unconditional-checker-json' : 'invalid-unconditional-checker-json',
      verdict: parsed?.verdict ?? null,
      reason: parsed?.reason ?? null,
      finalAnswer: parsed?.finalAnswer ?? null,
      citations: Array.isArray(parsed?.citations) ? parsed.citations : [],
      acceptedAnswerEchoChanged: parsed?.verdict === 'accept' && parsed?.finalAnswer !== candidateAnswer,
      acceptedCitationsSelectedOnly: parsed?.verdict === 'accept' && citationsValid
        && parsed.citations.every((citation) => candidateCitations.some((candidate) => candidate.sourceId === citation.sourceId
          && candidate.sectionId === citation.sectionId)),
    };
  } catch {
    return {
      format: 'invalid-unconditional-checker-json', verdict: null, reason: null, finalAnswer: null,
      citations: [], acceptedAnswerEchoChanged: false, acceptedCitationsSelectedOnly: false,
    };
  }
}

assert(/^focused-review(?:-checker|-rechecker)?-20260902-[a-f0-9]{12}$/.test(runId ?? ''), 'run-id');
assert(/^[a-f0-9]{64}$/.test(runnerSha256 ?? ''), 'runner-sha');
assert(/^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source-commit');
assert(['answerer', 'checker', 'rechecker'].includes(phaseMode), 'phase-mode');
assert(phaseMode === 'answerer'
  || (phaseMode === 'checker' && /^focused-review-20260902-[a-f0-9]{12}$/.test(inputRunId))
  || (phaseMode === 'rechecker' && /^focused-review-checker-20260902-[a-f0-9]{12}$/.test(inputRunId)), 'input-run-id');
assert(hostname().toUpperCase() === 'RUNA-HOME' && process.version === 'v22.22.1', 'home-runtime');

const parentRoot = 'C:\\Users\\codex-audit\\AppData\\Local\\RunaActualReview';
mkdirSync(parentRoot, { recursive: true });
const outputRoot = path.join(parentRoot, runId);
mkdirSync(outputRoot);
const inputResult = phaseMode !== 'answerer'
  ? JSON.parse(readFileSync(path.join(parentRoot, inputRunId, 'result.json'), 'utf8'))
  : null;
if (phaseMode !== 'answerer') {
  assert(inputResult.runId === inputRunId && inputResult.failure === null && inputResult.attemptCount === 8, 'checker-input-result');
}
const casesToRun = phaseMode === 'rechecker'
  ? cases.filter((testCase) => inputResult.attempts.some((attempt) => attempt.caseId === testCase.id
    && attempt.responseContract?.verdict === 'revise'))
  : cases;
if (phaseMode === 'rechecker') assert(casesToRun.length > 0, 'rechecker-empty');
const eventsPath = path.join(outputRoot, 'events.jsonl');
writeFileSync(eventsPath, '', { flag: 'wx' });
const emit = (type, data = {}) => appendFileSync(eventsPath, `${JSON.stringify({ time: new Date().toISOString(), type, ...data })}\n`);

const result = {
  schemaVersion: 'runaai-focused-gemma-review-result/v1', runId, runnerSha256, sourceCommit, phaseMode,
  inputRunId: phaseMode !== 'answerer' ? inputRunId : null,
  startedAt: new Date().toISOString(), host: hostname(), nodeVersion: process.version,
  model: { key: model.key, artifactSha256: model.sha256 }, attempts: [], failure: null,
  attemptCount: 0, modelGraded: false, productionChanged: false, protectedDataRead: false,
  cleanup: { unloadVerified: false, powerRestored: false, loadedModelInstances: null },
};
let ownedInstance = null;
let loadRequested = false;
let powerChanged = false;
let monitor = null;
let monitorFailure = null;

try {
  emit('start', { runId, runnerSha256, sourceCommit });
  const baselineRegistry = (await api('/api/v1/models', undefined, 10000)).value;
  assert(residentList(baselineRegistry).length === 0, 'nonzero-residency-baseline');
  const baselineHardware = hardware();
  checkHardware(baselineHardware, 260);
  emit('baseline', { hardware: baselineHardware, loadedModelInstances: 0 });

  assert(statSync(model.artifactPath).size === model.bytes, 'model-size-drift');
  assert(await hashFile(model.artifactPath) === model.sha256, 'model-hash-drift');
  emit('model-pin', { artifactPath: model.artifactPath, bytes: model.bytes, sha256: model.sha256 });
  for (const [filePath, expectedHash] of runtimePins) {
    assert(await hashFile(filePath) === expectedHash, 'runtime-hash-drift');
    emit('runtime-pin', { filePath, sha256: expectedHash });
  }

  setPower(160);
  powerChanged = true;
  while (true) {
    const snapshot = hardware();
    checkHardware(snapshot, 160);
    emit('cooldown', { hardware: snapshot });
    if (snapshot.gpus.every((gpu) => gpu.temperatureC <= 45)) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  loadRequested = true;
  const loadResponse = await api('/api/v1/models/load', {
    model: model.key,
    context_length: 32768,
    flash_attention: true,
    offload_kv_cache_to_gpu: true,
    echo_load_config: true,
    speculative_draft_mtp: false,
    speculative_draft_simple: false,
    speculative_draft_model: '',
  }, 180000);
  assert(loadResponse.value?.status === 'loaded' && typeof loadResponse.value?.instance_id === 'string', 'model-load-response');
  ownedInstance = { id: loadResponse.value.instance_id, key: model.key };
  const residentsAfterLoad = residentList((await api('/api/v1/models', undefined, 10000)).value);
  assert(residentsAfterLoad.length === 1 && residentsAfterLoad[0].id === ownedInstance.id && residentsAfterLoad[0].key === model.key, 'model-residency-after-load');
  emit('model-loaded', { ownedInstance, loadConfig: loadResponse.value.load_config });

  monitor = setInterval(() => {
    try {
      const snapshot = hardware();
      checkHardware(snapshot, 160);
      emit('telemetry', { hardware: snapshot });
    } catch (error) {
      monitorFailure = error;
    }
  }, 5000);

  const answererSystemMessage = 'You are the Review model for Runa. Review only the supplied sources. Do not claim to run code, access files, or verify execution. Return one JSON object with exactly two fields: "answer" as a nonempty string and "citations" as an array of exact source aliases. Do not use null. The answer must explain the evidence and any uncertainty.';
  const checkerSystemMessage = 'You are Runa\'s Review checker. Evaluate the candidate answer only against the supplied sources. Return exactly one object with verdict, reason, finalAnswer, and citations. All four fields are always required; never use null or add another field. verdict is accept when the candidate is complete and accurate; verdict is revise only when the candidate needs a replacement. On accept, the application preserves the original candidate answer and citations, so your echoed finalAnswer and citation order cannot alter accepted output. On revise, provide the complete replacement and citations drawn only from the supplied selected sources. Do not claim execution.';
  for (const testCase of casesToRun) {
    if (monitorFailure) throw monitorFailure;
    const startedAt = new Date().toISOString();
    const priorAttempt = phaseMode !== 'answerer'
      ? inputResult.attempts.find((attempt) => attempt.caseId === testCase.id)
      : null;
    const candidateAnswer = phaseMode === 'rechecker'
      ? priorAttempt?.responseContract?.finalAnswer
      : priorAttempt?.responseContract?.answer;
    const candidateCitations = phaseMode === 'rechecker'
      ? priorAttempt?.responseContract?.citations
      : testCase.sources.map(([alias]) => ({ sourceId: alias, sectionId: 'provided' }));
    if (phaseMode !== 'answerer') {
      assert(typeof candidateAnswer === 'string' && Array.isArray(candidateCitations), 'checker-input-attempt');
    }
    const userContent = phaseMode !== 'answerer'
      ? `${buildPrompt(testCase)}\n\nCANDIDATE RESPONSE\n${JSON.stringify({ answer: candidateAnswer, citations: candidateCitations })}`
      : buildPrompt(testCase);
    const request = {
      model: model.key,
      max_tokens: 1024,
      temperature: 0,
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: phaseMode !== 'answerer' ? checkerSystemMessage : answererSystemMessage },
        { role: 'user', content: userContent },
      ],
      ...(phaseMode !== 'answerer' ? { response_format: checkerResponseFormat } : {}),
    };
    emit('attempt-start', { caseId: testCase.id, requestSha256: shaBytes(JSON.stringify(request)) });
    const response = await api('/v1/chat/completions', request, 120000);
    if (monitorFailure) throw monitorFailure;
    const content = response.value?.choices?.[0]?.message?.content;
    assert(typeof content === 'string' && content.trim().length > 0, 'model-response-empty');
    const parsed = phaseMode !== 'answerer'
      ? parseCheckerContract(content, candidateAnswer, candidateCitations)
      : parseSimpleContract(content);
    result.attempts.push({
      caseId: testCase.id, startedAt, finishedAt: new Date().toISOString(), httpStatus: response.status,
      requestSha256: shaBytes(JSON.stringify(request)), modelId: response.value.model,
      systemFingerprint: response.value.system_fingerprint ?? null, usage: response.value.usage ?? null,
      rawContent: content, responseContract: parsed,
    });
    result.attemptCount = result.attempts.length;
    emit('attempt-complete', { caseId: testCase.id, format: parsed.format });
  }
  assert(result.attempts.length === casesToRun.length, 'attempt-denominator');
} catch (error) {
  result.failure = {
    code: /^[a-z0-9-]+$/.test(error?.message ?? '') ? error.message : 'focused-review-operator-failure',
    errorClass: error?.name ?? 'Error', ungraded: true, modelGraded: false, rcaRequiredBeforeRetry: true,
  };
  emit('failure', result.failure);
} finally {
  if (monitor) clearInterval(monitor);
  try {
    if (!ownedInstance && loadRequested) {
      const candidates = residentList((await api('/api/v1/models', undefined, 10000)).value)
        .filter((instance) => instance.key === model.key);
      if (candidates.length === 1) ownedInstance = { id: candidates[0].id, key: candidates[0].key };
    }
    if (ownedInstance) {
      await api('/api/v1/models/unload', { instance_id: ownedInstance.id }, 120000);
      emit('model-unloaded', { ownedInstance });
    }
    const finalResidents = residentList((await api('/api/v1/models', undefined, 10000)).value);
    result.cleanup.loadedModelInstances = finalResidents.length;
    result.cleanup.unloadVerified = finalResidents.length === 0;
  } catch (error) {
    result.cleanup.unloadError = error?.message ?? 'cleanup-error';
  }
  try {
    if (powerChanged) setPower(260);
    const restoredHardware = hardware();
    checkHardware(restoredHardware, 260);
    result.cleanup.powerRestored = true;
    result.cleanup.hardware = restoredHardware;
  } catch (error) {
    result.cleanup.powerError = error?.message ?? 'power-restore-error';
  }
  if (!result.cleanup.unloadVerified || !result.cleanup.powerRestored) {
    result.failure ??= { code: 'cleanup-unverified', ungraded: true, modelGraded: false, rcaRequiredBeforeRetry: true };
  }
  result.finishedAt = new Date().toISOString();
  const resultPath = path.join(outputRoot, 'result.json');
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  emit('complete', { failure: result.failure, attempts: result.attemptCount, cleanup: result.cleanup });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failure) process.exitCode = 1;
}
