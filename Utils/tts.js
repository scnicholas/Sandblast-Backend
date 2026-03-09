"use strict";
/**
 * Nyx TTS Engine — Operationally Hardened Resemble Handler
 *
 * Goals:
 * - preserve structure integrity for existing callers
 * - export a route handler compatible with index.js delegation
 * - unify widget + intro page synthesis behavior
 * - keep fail-open health/circuit state to avoid repeated 503 storms
 */

const crypto = require("crypto");
const { synthesize } = require("./ttsProvidersResemble");

/* ===============================
   CONFIGURATION
================================ */

const MAX_TEXT = 1800;
const MAX_CONCURRENT = Number(process.env.SB_TTS_MAX_CONCURRENT || 3);
const CIRCUIT_LIMIT = Number(process.env.SB_TTS_CIRCUIT_LIMIT || 5);
const CIRCUIT_RESET_MS = Number(process.env.SB_TTS_CIRCUIT_RESET_MS || 30000);
const DEFAULT_VOICE = "nyx";

/* ===============================
   STATE
================================ */

let activeRequests = 0;
let failCount = 0;
let circuitOpenUntil = 0;
let lastError = "";
let lastOkAt = 0;
let lastFailAt = 0;
let lastProviderStatus = 0;
let lastElapsedMs = 0;

/* ===============================
   UTILITIES
================================ */

function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _lower(v){ return _trim(v).toLowerCase(); }
function _now(){ return Date.now(); }
function _makeTrace(){ return `tts_${Date.now().toString(16)}_${crypto.randomBytes(4).toString("hex")}`; }
function _bool(v, dflt){
  if (v == null || v === "") return dflt;
  if (typeof v === "boolean") return v;
  const s = _lower(v);
  if (["1","true","yes","on"].includes(s)) return true;
  if (["0","false","no","off"].includes(s)) return false;
  return dflt;
}
function _pickFirst(){
  for (let i = 0; i < arguments.length; i++){
    const v = _trim(arguments[i]);
    if (v) return v;
  }
  return "";
}
function _safeJson(res, status, body){
  if (res.headersSent) return;
  try { res.status(status).json(body); }
  catch (_) { try { res.status(status).send(JSON.stringify(body)); } catch (__) {} }
}
function _setHeader(res, k, v){ try { if (!res.headersSent) res.setHeader(k, v); } catch (_) {} }
function _setCommonAudioHeaders(res, traceId, meta){
  _setHeader(res, "Cache-Control", "no-store, max-age=0");
  _setHeader(res, "X-SB-Trace-ID", traceId);
  if (meta && meta.provider) _setHeader(res, "X-SB-TTS-Provider", meta.provider);
  if (meta && meta.voiceUuid) _setHeader(res, "X-SB-Voice", meta.voiceUuid);
  if (meta && Number.isFinite(meta.elapsedMs)) _setHeader(res, "X-SB-TTS-MS", String(meta.elapsedMs));
}
function _circuitOpen(){ return _now() < circuitOpenUntil; }
function _recordFailure(message, status){
  failCount += 1;
  lastError = _trim(message) || "tts_failed";
  lastFailAt = _now();
  lastProviderStatus = Number(status || 0) || 0;
  if (failCount >= CIRCUIT_LIMIT) {
    circuitOpenUntil = _now() + CIRCUIT_RESET_MS;
    try { console.warn("[TTS] Circuit breaker OPEN", { failCount, resetInMs: CIRCUIT_RESET_MS }); } catch (_) {}
  }
}
function _recordSuccess(status, elapsedMs){
  failCount = 0;
  circuitOpenUntil = 0;
  lastError = "";
  lastOkAt = _now();
  lastProviderStatus = Number(status || 200) || 200;
  lastElapsedMs = Number(elapsedMs || 0) || 0;
}
function _healthSnapshot(){
  const voiceUuid = _pickFirst(process.env.RESEMBLE_VOICE_UUID, process.env.SB_RESEMBLE_VOICE_UUID, process.env.SBNYX_RESEMBLE_VOICE_UUID);
  const projectUuid = _pickFirst(process.env.RESEMBLE_PROJECT_UUID, process.env.SB_RESEMBLE_PROJECT_UUID);
  const token = _pickFirst(process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY);
  return {
    ok: !!(token && voiceUuid),
    provider: "resemble",
    activeRequests,
    failCount,
    circuitOpen: _circuitOpen(),
    circuitResetAt: circuitOpenUntil,
    lastError,
    lastOkAt,
    lastFailAt,
    lastProviderStatus,
    lastElapsedMs,
    env: {
      hasToken: !!token,
      hasProject: !!projectUuid,
      hasVoice: !!voiceUuid,
      voiceUuidPreview: voiceUuid ? `${voiceUuid.slice(0,4)}***${voiceUuid.slice(-3)}` : "",
      projectUuidPreview: projectUuid ? `${projectUuid.slice(0,4)}***${projectUuid.slice(-3)}` : ""
    }
  };
}
function _resolveInput(req){
  const body = req && req.body && typeof req.body === "object" ? req.body : {};
  const text = _pickFirst(body.text, body.data, body.speak, body.say, body.message);
  const voiceUuid = _pickFirst(
    body.voice_uuid,
    body.voiceUuid,
    body.voiceId,
    process.env.RESEMBLE_VOICE_UUID,
    process.env.SB_RESEMBLE_VOICE_UUID,
    process.env.SBNYX_RESEMBLE_VOICE_UUID
  );
  const projectUuid = _pickFirst(
    body.project_uuid,
    body.projectUuid,
    process.env.RESEMBLE_PROJECT_UUID,
    process.env.SB_RESEMBLE_PROJECT_UUID
  );
  const outputFormat = _lower(_pickFirst(body.output_format, body.outputFormat, "mp3")) === "wav" ? "wav" : "mp3";
  const traceId = _pickFirst(
    req && req.headers && (req.headers["x-sb-trace-id"] || req.headers["x-sb-traceid"]),
    body.traceId,
    _makeTrace()
  );
  return {
    text: _trim(text).slice(0, MAX_TEXT),
    voiceUuid,
    projectUuid,
    outputFormat,
    traceId,
    title: _pickFirst(body.title, body.source, body.client && body.client.source, "nyx_tts").slice(0, 120),
    sampleRate: body.sampleRate || body.sample_rate,
    precision: body.precision,
    useHd: body.useHd,
    intro: _bool(body.intro, false),
    healthCheck: _bool(body.healthCheck, false),
    wantJson: _bool(body.returnJson, false)
  };
}

/* ===============================
   MAIN GENERATOR
================================ */

async function generate(text, options){
  const opts = options && typeof options === "object" ? options : {};
  const fakeReq = { body: { text, ...opts }, headers: { "x-sb-trace-id": opts.traceId || _makeTrace() } };
  const input = _resolveInput(fakeReq);

  if (!input.text) return { ok:false, reason:"empty_text", status:400 };
  if (activeRequests >= MAX_CONCURRENT) return { ok:false, reason:"concurrency_limit", status:429 };
  if (_circuitOpen()) return { ok:false, reason:"circuit_open", status:503 };

  activeRequests += 1;
  try {
    const out = await synthesize(input);
    if (!out || !out.ok) {
      _recordFailure(out && out.message ? out.message : out && out.reason, out && out.status);
      return {
        ok: false,
        reason: out && out.reason ? out.reason : "provider_failed",
        message: out && out.message ? out.message : "TTS failed",
        status: out && out.retryable === false ? 400 : (out && out.status) || 503,
        retryable: !!(out && out.retryable),
        provider: "resemble"
      };
    }
    _recordSuccess(out.providerStatus, out.elapsedMs);
    return {
      ok: true,
      provider: "resemble",
      buffer: out.buffer,
      mimeType: out.mimeType || "audio/mpeg",
      elapsedMs: out.elapsedMs || 0,
      requestId: out.requestId,
      providerStatus: out.providerStatus || 200
    };
  } catch (err) {
    const msg = _trim(err && (err.message || err)) || "tts_exception";
    _recordFailure(msg, 503);
    return { ok:false, reason:"exception", message:msg, status:503, retryable:true, provider:"resemble" };
  } finally {
    activeRequests -= 1;
  }
}

/* ===============================
   EXPRESS HANDLER
================================ */

async function handleTts(req, res){
  const input = _resolveInput(req);
  _setCommonAudioHeaders(res, input.traceId, { provider: "resemble", voiceUuid: input.voiceUuid });

  if (input.healthCheck) {
    return _safeJson(res, 200, {
      ok: true,
      provider: "resemble",
      health: _healthSnapshot(),
      traceId: input.traceId
    });
  }

  if (!input.text) {
    return _safeJson(res, 400, {
      ok: false,
      spokenUnavailable: true,
      error: "missing_text",
      detail: "No TTS text was provided.",
      traceId: input.traceId,
      payload: { spokenUnavailable: true }
    });
  }

  const result = await generate(input.text, input);
  _setCommonAudioHeaders(res, input.traceId, {
    provider: result.provider || "resemble",
    voiceUuid: input.voiceUuid,
    elapsedMs: result.elapsedMs || 0
  });

  if (!result.ok) {
    const status = result.status === 429 ? 429 : (result.status >= 400 && result.status < 500 ? result.status : 503);
    return _safeJson(res, status, {
      ok: false,
      spokenUnavailable: true,
      error: result.reason || "tts_unavailable",
      detail: result.message || "TTS unavailable.",
      retryable: !!result.retryable,
      traceId: input.traceId,
      provider: result.provider || "resemble",
      health: _healthSnapshot(),
      payload: { spokenUnavailable: true }
    });
  }

  if (input.wantJson) {
    return _safeJson(res, 200, {
      ok: true,
      provider: result.provider,
      mimeType: result.mimeType,
      audioBase64: result.buffer.toString("base64"),
      traceId: input.traceId,
      elapsedMs: result.elapsedMs || 0,
      requestId: result.requestId
    });
  }

  try {
    _setHeader(res, "Content-Type", result.mimeType || "audio/mpeg");
    _setHeader(res, "Content-Length", String(result.buffer.length));
    _setHeader(res, "Accept-Ranges", "none");
    res.status(200).send(result.buffer);
  } catch (e) {
    return _safeJson(res, 503, {
      ok: false,
      spokenUnavailable: true,
      error: "send_failed",
      detail: _trim(e && (e.message || e)) || "Failed to send audio buffer.",
      traceId: input.traceId,
      provider: result.provider || "resemble",
      payload: { spokenUnavailable: true }
    });
  }
}

/* ===============================
   HEALTH CHECK
================================ */

function health(){
  return _healthSnapshot();
}

/* ===============================
   EXPORT
================================ */

module.exports = {
  handleTts,
  ttsHandler: handleTts,
  handler: handleTts,
  generate,
  health
};

/* ===============================
   OPINTEL AUDIO/TTS WRAPPER v1.0.0
   - preserves existing exports
   - injects Marion/Evidence/AudioGovernor awareness
   - adds duplicate suppression + trace-safe route metadata
   - keeps existing Resemble path authoritative
================================= */
(function attachOpIntelTtsWrapper() {
  const __base = module.exports || {};
  if (__base.__opIntelWrapped) return;

  let __MarionBridge = null;
  let __EvidenceEngine = null;
  let __AudioGovernor = null;
  try { __MarionBridge = require("./marionBridge"); } catch (_e) { __MarionBridge = null; }
  try { __EvidenceEngine = require("./evidenceEngine"); } catch (_e) { __EvidenceEngine = null; }
  try { __AudioGovernor = require("./audioGovernor"); } catch (_e) { __AudioGovernor = null; }

  const __recentSpeak = new Map();

  function __opNow(){ return Date.now(); }
  function __opStr(v){ return v == null ? "" : String(v); }
  function __opTrim(v){ return __opStr(v).trim(); }
  function __opLower(v){ return __opTrim(v).toLowerCase(); }
  function __opObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
  function __opBool(v, dflt){
    if (v == null || v === "") return !!dflt;
    if (typeof v === "boolean") return v;
    const s = __opLower(v);
    if (["1","true","yes","on"].includes(s)) return true;
    if (["0","false","no","off"].includes(s)) return false;
    return !!dflt;
  }
  function __opHashLite(input){
    const s = __opStr(input || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  function __opPickFirst(){
    for (let i = 0; i < arguments.length; i += 1) {
      const v = __opTrim(arguments[i]);
      if (v) return v;
    }
    return "";
  }
  function __opDomainFrom(input){
    const meta = __opObj(input && input.meta) ? input.meta : {};
    const body = __opObj(input && input.body) ? input.body : {};
    const text = __opLower(__opPickFirst(body.text, body.speak, body.say, body.message));
    const hinted = __opLower(__opPickFirst(body.domain, meta.domain, meta.domainHint, body.lane, meta.lane));
    if (hinted) return hinted;
    if (/\b(contract|copyright|liability|compliance|legal)\b/.test(text)) return "law";
    if (/\b(budget|revenue|pricing|funding|grant|roi)\b/.test(text)) return "finance";
    if (/\b(rewrite|grammar|copy|tone|headline)\b/.test(text)) return "language";
    if (/\b(anxious|hurt|sad|panic|stress|emotion)\b/.test(text)) return "psychology";
    if (/\b(ai|agent|bridge|pipeline|security|token|dataset)\b/.test(text)) return "ai_cyber";
    if (/\b(roku|channel|streaming|metadata|audience|brand|media)\b/.test(text)) return "marketing_media";
    return "general";
  }
  function __opIntentFrom(input){
    const meta = __opObj(input && input.meta) ? input.meta : {};
    const body = __opObj(input && input.body) ? input.body : {};
    const hinted = __opLower(__opPickFirst(body.intent, meta.intent, meta.intentHint));
    if (hinted) return hinted;
    const text = __opLower(__opPickFirst(body.text, body.speak, body.say, body.message));
    if (/\b(fix|debug|broken|issue|error|not working)\b/.test(text)) return "diagnostic";
    if (/\b(plan|roadmap|phase|sequence|priority|steps)\b/.test(text)) return "planning";
    if (/\b(write|rewrite|draft|improve|summarize|pitch)\b/.test(text)) return "composition";
    if (/\b(help|how do i|what should|recommend)\b/.test(text)) return "guidance";
    return "general";
  }
  function __opSet(res, k, v){ try { if (res && !res.headersSent) res.setHeader(k, v); } catch (_) {} }
  function __opPruneRecent(){
    const t = __opNow();
    for (const [k, v] of __recentSpeak.entries()) {
      if (!v || !v.at || (t - v.at) > 12000) __recentSpeak.delete(k);
    }
  }
  function __opMarkDuplicate(sig, traceId){
    __recentSpeak.set(sig, { at: __opNow(), traceId: __opStr(traceId || "") });
  }
  function __opIsDuplicate(sig){
    __opPruneRecent();
    const hit = __recentSpeak.get(sig);
    return !!(hit && (__opNow() - hit.at) < 12000);
  }
  function __opSignature(text, opts){
    const domain = __opPickFirst(opts && opts.domain, opts && opts.meta && opts.meta.domain, "general");
    const intent = __opPickFirst(opts && opts.intent, opts && opts.meta && opts.meta.intent, "general");
    return __opHashLite([domain, intent, __opLower(text)].join("|"));
  }
  function __opModules(){
    return {
      marionBridge: !!(__MarionBridge && typeof __MarionBridge.createMarionBridge === "function"),
      evidenceEngine: !!(__EvidenceEngine && typeof __EvidenceEngine.createEvidenceEngine === "function"),
      audioGovernor: !!(__AudioGovernor && typeof __AudioGovernor.createAudioGovernor === "function"),
    };
  }

  const __baseGenerate = typeof __base.generate === "function" ? __base.generate : (typeof generate === "function" ? generate : null);
  const __baseHandle = typeof __base.handleTts === "function" ? __base.handleTts : (typeof handleTts === "function" ? handleTts : null);
  const __baseHealth = typeof __base.health === "function" ? __base.health : (typeof health === "function" ? health : null);

  async function wrappedGenerate(text, options){
    const opts = __opObj(options) ? { ...options } : {};
    const t = __opTrim(text);
    const modules = __opModules();
    opts.meta = __opObj(opts.meta) ? { ...opts.meta } : {};
    opts.meta.domain = __opPickFirst(opts.meta.domain, opts.domain, __opDomainFrom({ body: opts, meta: opts.meta }), "general");
    opts.meta.intent = __opPickFirst(opts.meta.intent, opts.intent, __opIntentFrom({ body: opts, meta: opts.meta }), "general");
    opts.meta.traceId = __opPickFirst(opts.meta.traceId, opts.traceId, _makeTrace());
    opts.traceId = __opPickFirst(opts.traceId, opts.meta.traceId, _makeTrace());

    const sig = __opSignature(t, opts);
    if (t && __opIsDuplicate(sig)) {
      return {
        ok: false,
        reason: "duplicate_tts_blocked",
        message: "Duplicate speech blocked by operational audio guard.",
        status: 409,
        retryable: false,
        provider: "resemble",
        traceId: opts.traceId,
        modules,
      };
    }

    const out = await __baseGenerate(t, opts);
    if (out && out.ok) __opMarkDuplicate(sig, opts.traceId);
    if (__opObj(out)) {
      out.traceId = __opPickFirst(out.traceId, opts.traceId);
      out.modules = modules;
      out.opintel = {
        domain: opts.meta.domain,
        intent: opts.meta.intent,
        bridgeAware: modules.marionBridge,
        evidenceAware: modules.evidenceEngine,
        audioGovernorAware: modules.audioGovernor,
      };
    }
    return out;
  }

  async function wrappedHandleTts(req, res){
    const body = req && req.body && typeof req.body === "object" ? req.body : {};
    body.meta = __opObj(body.meta) ? { ...body.meta } : {};
    body.meta.domain = __opPickFirst(body.meta.domain, body.domain, __opDomainFrom(req), "general");
    body.meta.intent = __opPickFirst(body.meta.intent, body.intent, __opIntentFrom(req), "general");
    body.meta.allowFallback = __opBool(body.meta.allowFallback ?? body.allowFallback, false);
    body.allowFallback = body.meta.allowFallback;
    body.traceId = __opPickFirst(body.traceId, body.meta.traceId, req && req.headers && (req.headers["x-sb-trace-id"] || req.headers["x-sb-traceid"]), _makeTrace());
    req.body = body;

    const modules = __opModules();
    __opSet(res, "X-SB-Bridge-Ready", modules.marionBridge ? "1" : "0");
    __opSet(res, "X-SB-Evidence-Ready", modules.evidenceEngine ? "1" : "0");
    __opSet(res, "X-SB-Audio-Governor-Ready", modules.audioGovernor ? "1" : "0");
    __opSet(res, "X-SB-OpIntel-Domain", body.meta.domain);
    __opSet(res, "X-SB-OpIntel-Intent", body.meta.intent);
    return __baseHandle(req, res);
  }

  function wrappedHealth(){
    const baseHealth = __baseHealth ? (__baseHealth() || {}) : {};
    return {
      ...baseHealth,
      modules: __opModules(),
      duplicateSpeechWindowMs: 12000,
      duplicateSpeechEntries: __recentSpeak.size,
    };
  }

  module.exports = {
    ...__base,
    __opIntelWrapped: true,
    handleTts: wrappedHandleTts,
    ttsHandler: wrappedHandleTts,
    handler: wrappedHandleTts,
    generate: wrappedGenerate,
    health: wrappedHealth,
  };
})();

/* ===============================
   OPINTEL AUDIO/TTS WRAPPER v1.1.0
   - converts audioGovernor from advisory to authoritative prepare path
   - removes false-negative duplicate failures that surface as "TTS unavailable"
   - wires route metadata through Marion/Evidence/AudioGovernor safely
   - phases 16–20: governor prepare mode, route cohesion, skip-not-fail, turn suppression, self-heal
================================= */
(function attachOpIntelTtsWrapperV110() {
  const __base = module.exports || {};
  if (__base.__opIntelWrappedV110) return;

  let __AudioGovernor = null;
  try { __AudioGovernor = require("./audioGovernor"); } catch (_e) { __AudioGovernor = null; }

  function __opStr(v){ return v == null ? "" : String(v); }
  function __opTrim(v){ return __opStr(v).trim(); }
  function __opObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
  function __opPickFirst(){ for (let i = 0; i < arguments.length; i += 1) { const v = __opTrim(arguments[i]); if (v) return v; } return ""; }
  function __opSet(res, k, v){ try { if (res && !res.headersSent) res.setHeader(k, v); } catch (_) {} }
  function __opDomainFrom(body){
    const text = __opTrim(body && (body.text || body.speak || body.say || body.message || "")).toLowerCase();
    const hinted = __opTrim(body && ((body.meta && body.meta.domain) || body.domain || body.lane || "")).toLowerCase();
    if (hinted) return hinted;
    if (/\b(contract|copyright|liability|compliance|legal)\b/.test(text)) return "law";
    if (/\b(budget|revenue|pricing|funding|grant|roi)\b/.test(text)) return "finance";
    if (/\b(rewrite|grammar|copy|tone|headline)\b/.test(text)) return "language";
    if (/\b(anxious|hurt|sad|panic|stress|emotion)\b/.test(text)) return "psychology";
    if (/\b(ai|agent|bridge|pipeline|security|token|dataset)\b/.test(text)) return "ai_cyber";
    if (/\b(roku|channel|streaming|metadata|audience|brand|media)\b/.test(text)) return "marketing_media";
    return "general";
  }
  function __opIntentFrom(body){
    const text = __opTrim(body && (body.text || body.speak || body.say || body.message || "")).toLowerCase();
    const hinted = __opTrim(body && ((body.meta && body.meta.intent) || body.intent || "")).toLowerCase();
    if (hinted) return hinted;
    if (/\b(fix|debug|broken|issue|error|not working)\b/.test(text)) return "diagnostic";
    if (/\b(plan|roadmap|phase|sequence|priority|steps)\b/.test(text)) return "planning";
    if (/\b(write|rewrite|draft|improve|summarize|pitch)\b/.test(text)) return "composition";
    if (/\b(help|how do i|what should|recommend)\b/.test(text)) return "guidance";
    return "general";
  }

  const __baseGenerate = typeof __base.generate === "function" ? __base.generate : null;
  const __baseHealth = typeof __base.health === "function" ? __base.health : (() => ({}));
  const __governor = (__AudioGovernor && typeof __AudioGovernor.createAudioGovernor === "function")
    ? __AudioGovernor.createAudioGovernor({
        ttsProvider: {
          synthesize: async (request) => {
            const out = await __baseGenerate(request.text, {
              traceId: request.traceId,
              voiceUuid: request.voice,
              projectUuid: request.projectUuid,
              intro: !!request.meta && !!request.meta.intro,
              returnJson: false,
              meta: request.meta,
            });
            if (!out || !out.ok) {
              const err = new Error(__opPickFirst(out && out.reason, out && out.message, "tts_unavailable"));
              err.code = __opPickFirst(out && out.reason, "tts_unavailable");
              err.status = out && out.status ? out.status : 503;
              throw err;
            }
            return out;
          },
        },
        settings: { providerName: "resemble", allowFallbackByDefault: false },
        logger: { info(){}, warn(){}, error(){} },
      })
    : null;

  async function wrappedGenerate(text, options){
    const opts = __opObj(options) ? { ...options } : {};
    opts.meta = __opObj(opts.meta) ? { ...opts.meta } : {};
    opts.traceId = __opPickFirst(opts.traceId, opts.meta.traceId, _makeTrace());
    opts.meta.traceId = __opPickFirst(opts.meta.traceId, opts.traceId, _makeTrace());
    opts.meta.domain = __opPickFirst(opts.meta.domain, opts.domain, __opDomainFrom({ ...opts, text }), "general");
    opts.meta.intent = __opPickFirst(opts.meta.intent, opts.intent, __opIntentFrom({ ...opts, text }), "general");
    opts.allowFallback = false;

    if (!__governor || typeof __governor.prepare !== "function") {
      const raw = await __baseGenerate(text, opts);
      return raw;
    }

    const prepared = await __governor.prepare({
      text,
      traceId: opts.traceId,
      sessionId: __opPickFirst(opts.sessionId, opts.meta.sessionId, "session_unknown"),
      userId: __opPickFirst(opts.userId, opts.meta.userId, "user_unknown"),
      turnId: __opPickFirst(opts.turnId, opts.meta.turnId, opts.traceId),
      domain: opts.meta.domain,
      intent: opts.meta.intent,
      voice: __opPickFirst(opts.voiceUuid, opts.voice, ""),
      priority: opts.priority === "high" ? "high" : "normal",
      isIntro: !!opts.intro,
      allowFallback: false,
      meta: { ...opts.meta, intro: !!opts.intro },
    });

    if (prepared && prepared.skipped) {
      return {
        ok: true,
        skipped: true,
        reason: prepared.reason || "speech_skipped",
        traceId: prepared.traceId || opts.traceId,
        mimeType: "application/json",
        buffer: Buffer.from(""),
        provider: "resemble",
        elapsedMs: 0,
      };
    }

    return {
      ok: true,
      provider: prepared.provider || "resemble",
      buffer: prepared.buffer,
      mimeType: prepared.mimeType || "audio/mpeg",
      elapsedMs: 0,
      traceId: prepared.traceId || opts.traceId,
      requestId: prepared.traceId || opts.traceId,
      skipped: false,
      opintel: prepared.meta || {},
    };
  }

  async function wrappedHandleTts(req, res){
    const body = req && req.body && typeof req.body === "object" ? req.body : {};
    body.meta = __opObj(body.meta) ? { ...body.meta } : {};
    body.traceId = __opPickFirst(body.traceId, body.meta.traceId, req && req.headers && (req.headers["x-sb-trace-id"] || req.headers["x-sb-traceid"]), _makeTrace());
    body.meta.traceId = body.traceId;
    body.meta.domain = __opPickFirst(body.meta.domain, body.domain, __opDomainFrom(body), "general");
    body.meta.intent = __opPickFirst(body.meta.intent, body.intent, __opIntentFrom(body), "general");
    body.allowFallback = false;
    req.body = body;

    _setCommonAudioHeaders(res, body.traceId, { provider: "resemble", voiceUuid: _pickFirst(body.voice_uuid, body.voiceUuid, body.voiceId, process.env.RESEMBLE_VOICE_UUID, process.env.SB_RESEMBLE_VOICE_UUID, process.env.SBNYX_RESEMBLE_VOICE_UUID) });
    __opSet(res, "X-SB-OpIntel-Domain", body.meta.domain);
    __opSet(res, "X-SB-OpIntel-Intent", body.meta.intent);
    __opSet(res, "X-SB-Audio-Governor", __governor ? "1" : "0");

    if (_bool(body.healthCheck, false)) {
      return _safeJson(res, 200, {
        ok: true,
        provider: "resemble",
        health: { ..._healthSnapshot(), governor: (__governor && typeof __governor.getHealth === "function") ? __governor.getHealth() : null },
        traceId: body.traceId
      });
    }

    const text = _pickFirst(body.text, body.data, body.speak, body.say, body.message);
    if (!__opTrim(text)) {
      return _safeJson(res, 400, { ok: false, spokenUnavailable: true, error: "missing_text", detail: "No TTS text was provided.", traceId: body.traceId, payload: { spokenUnavailable: true } });
    }

    const result = await wrappedGenerate(text, body);
    if (result && result.skipped) {
      return _safeJson(res, 200, {
        ok: true,
        spokenUnavailable: false,
        skipped: true,
        reason: result.reason || "speech_skipped",
        traceId: body.traceId,
        payload: { skipped: true }
      });
    }
    if (!result || !result.ok || !result.buffer) {
      const status = result && result.status === 429 ? 429 : ((result && result.status >= 400 && result.status < 500) ? result.status : 503);
      return _safeJson(res, status, {
        ok: false,
        spokenUnavailable: true,
        error: result && result.reason ? result.reason : "tts_unavailable",
        detail: result && result.message ? result.message : "TTS unavailable.",
        traceId: body.traceId,
        provider: result && result.provider ? result.provider : "resemble",
        health: _healthSnapshot(),
        payload: { spokenUnavailable: true }
      });
    }

    if (_bool(body.returnJson, false)) {
      return _safeJson(res, 200, {
        ok: true,
        provider: result.provider,
        mimeType: result.mimeType || "audio/mpeg",
        audioBase64: result.buffer.toString("base64"),
        traceId: body.traceId,
        elapsedMs: result.elapsedMs || 0,
        requestId: result.requestId || body.traceId
      });
    }

    try {
      _setHeader(res, "Content-Type", result.mimeType || "audio/mpeg");
      _setHeader(res, "Content-Length", String(result.buffer.length || 0));
      _setHeader(res, "Accept-Ranges", "none");
      return res.status(200).send(result.buffer);
    } catch (e) {
      return _safeJson(res, 503, {
        ok: false,
        spokenUnavailable: true,
        error: "send_failed",
        detail: __opTrim(e && (e.message || e)) || "Failed to send audio buffer.",
        traceId: body.traceId,
        provider: result.provider || "resemble",
        payload: { spokenUnavailable: true }
      });
    }
  }

  function wrappedHealth(){
    const baseHealth = __baseHealth ? (__baseHealth() || {}) : {};
    const governor = (__governor && typeof __governor.getHealth === "function") ? __governor.getHealth() : null;
    return { ...baseHealth, governor };
  }

  module.exports = {
    ...__base,
    __opIntelWrappedV110: true,
    handleTts: wrappedHandleTts,
    ttsHandler: wrappedHandleTts,
    handler: wrappedHandleTts,
    generate: wrappedGenerate,
    health: wrappedHealth,
  };
})();
