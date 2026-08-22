'use strict';

const Contract = require('./MarionLingoSentinelContract');

const VERSION = 'marion.lingosentinel.bridge/1.0';
let injectedRunner = null;

function runnerFrom(mod) {
  if (!mod) return null;
  if (typeof mod === 'function') return mod;
  for (const k of ['runMarionBridge','run','handle','handleChat','reply','processWithMarion','handleMessage','ask','default']) {
    if (typeof mod[k] === 'function') return mod[k].bind(mod);
  }
  return null;
}
function resolveRunner() {
  if (injectedRunner) return injectedRunner;
  for (const p of ['../marionBridge','../marionBridge.js']) {
    try { const r = runnerFrom(require(p)); if (r) return r; } catch (_) {}
  }
  return null;
}
function clean(v) { return String(v == null ? '' : v).trim(); }
function outputText(v) {
  if (typeof v === 'string') return clean(v);
  if (!v || typeof v !== 'object') return '';
  const m = v.marion && typeof v.marion === 'object' ? v.marion : {};
  return clean(v.text || v.message || v.content || v.reply || v.output || m.text || m.message || m.content || m.reply);
}
function registerMarionRunner(fn) { injectedRunner = typeof fn === 'function' ? fn : null; return !!injectedRunner; }
function getHealth() {
  return { ok: !!resolveRunner(), service: 'MarionLingoSentinelBridge', version: VERSION, contract: Contract.CONTRACT, marionRunnerReady: !!resolveRunner() };
}
async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => { timer = setTimeout(() => { const e = new Error('marion_timeout'); e.code = 'MARION_TIMEOUT'; reject(e); }, ms); })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
async function runMarionLingoSentinelBridge(input = {}, options = {}) {
  const request = Contract.createEnvelope(input);
  const valid = Contract.validateEnvelope(request);
  if (!valid.ok) return { ok: false, stage: 'contract', errors: valid.errors, request };

  if (request.eventType === 'handshake.request') {
    return { ok: true, request, response: Contract.createResponse(request, { eventType: 'handshake.ack', message: 'Marion link acknowledged.', metadata: getHealth() }) };
  }
  if (request.eventType === 'health.request') {
    return { ok: true, request, response: Contract.createResponse(request, { eventType: 'health.response', message: 'Health response.', metadata: getHealth() }) };
  }

  const run = resolveRunner();
  if (!run) return { ok: false, stage: 'marion_resolve', errors: ['marion_runner_unavailable'], request };

  const marionInput = {
    text: request.message,
    userText: request.message,
    query: request.message,
    sourceLanguage: request.sourceLanguage,
    targetLanguage: request.targetLanguage,
    cultureContext: request.cultureContext,
    mode: request.mode,
    layer: request.layer,
    sessionId: request.sessionId,
    roomId: request.roomId,
    conversationId: request.conversationId,
    participantId: request.participantId,
    speakerRole: request.speakerRole,
    requestId: request.requestId,
    lingoSentinel: request
  };

  try {
    const raw = await withTimeout(run(marionInput), Math.max(1200, +(options.timeoutMs || process.env.LS_MARION_TIMEOUT || 8000)));
    const text = outputText(raw);
    return {
      ok: true,
      request,
      response: Contract.createResponse(request, { message: text, metadata: { bridgeVersion: VERSION, marionResponded: !!text } }),
      marionRaw: options.includeRaw === true ? raw : undefined
    };
  } catch (err) {
    return { ok: false, stage: err && err.code === 'MARION_TIMEOUT' ? 'timeout' : 'marion_run', errors: [clean(err && (err.code || err.message || err.name) || 'marion_error')], request };
  }
}

module.exports = Object.freeze({ VERSION, runMarionLingoSentinelBridge, registerMarionRunner, getHealth, resolveRunner });
