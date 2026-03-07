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
