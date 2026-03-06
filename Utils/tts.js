"use strict";

/**
 * TTS.js — Runtime TTS handler (Resemble-only)
 *
 * PURPOSE
 * - Canonical backend handler that /utils/tts.js loads (exports { handleTts }).
 * - Produces REAL audio bytes (mp3/wav) on success.
 * - Hardens the runtime TTS contract for operational-intelligence parity:
 *   trace propagation, timeout discipline, safer input hygiene, richer headers,
 *   deterministic error taxonomy, and provider diagnostics without leaking secrets.
 *
 * CONTRACT (accepted request JSON)
 * - text OR data OR message OR prompt OR speak: string
 * - voiceId OR voice_uuid OR voiceUuid OR voice: voice UUID (optional; falls back to env)
 * - output_format OR format OR outputFormat: "mp3" | "wav" (optional)
 * - sample_rate OR sampleRate: optional integer (provider-specific)
 * - ttsProfile: optional object passthrough
 *
 * ENV (aliases supported)
 * - RESEMBLE_API_TOKEN or RESEMBLE_API_KEY   (required)
 * - RESEMBLE_VOICE_UUID                      (required unless provided in request)
 * - RESEMBLE_PROJECT_UUID                    (optional; passed through if present)
 * - SBNYX_RESEMBLE_VOICE_UUID / SB_RESEMBLE_VOICE_UUID  (optional aliases)
 * - SBNYX_RESEMBLE_PROJECT_UUID / SB_RESEMBLE_PROJECT_UUID (optional aliases)
 * - SB_TTS_TIMEOUT_MS (optional; default 25000, min 3000, max 60000)
 * - SB_MAX_TTS_CHARS (optional; default 1800, min 80, max 5000)
 * - SB_TTS_LOG (optional; "0" disables structured console logging)
 *
 * ElevenLabs: NOT referenced.
 */

function _now(){ return Date.now(); }
function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
function _pickFirst(){
  for (let i = 0; i < arguments.length; i++){
    const t = _trim(arguments[i]);
    if (t) return t;
  }
  return "";
}
function _clampInt(v, dflt, min, max){
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function _isBuf(v){
  return typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(v);
}
function _safeBuf(v){
  if (_isBuf(v)) return v;
  try{
    if (v instanceof Uint8Array) return Buffer.from(v);
    if (v instanceof ArrayBuffer) return Buffer.from(new Uint8Array(v));
    if (Array.isArray(v)) return Buffer.from(v);
    if (_isObj(v) && Array.isArray(v.data)) return Buffer.from(v.data);
  }catch(_){ }
  return null;
}
function _genTraceId(){
  try{ return (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 32); }
  catch(_){ return String(Date.now()); }
}
function _makeTraceId(req){
  const h = (req && req.headers) ? req.headers : {};
  return _pickFirst(h["x-sb-trace-id"], h["x-sb-traceid"], h["x-request-id"], "");
}
function _safeJson(res, status, obj){
  try{
    return res.status(status).json(obj);
  }catch(_){
    try{
      return res.status(status).set("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(obj));
    }catch(__){ return undefined; }
  }
}
function _safeSet(res, key, val){
  try{ res.set(key, val); }catch(_){ try{ res.setHeader(key, val); }catch(__){} }
}
function _boolEnv(name, dflt){
  const v = _trim(process.env[name]);
  if (!v) return dflt;
  return !(v === "0" || /^false$/i.test(v) || /^off$/i.test(v));
}
function _timeoutMs(){
  return _clampInt(process.env.SB_TTS_TIMEOUT_MS, 25000, 3000, 60000);
}
function _maxChars(){
  return _clampInt(process.env.SB_MAX_TTS_CHARS, 1800, 80, 5000);
}
function _shouldLog(){
  return _boolEnv("SB_TTS_LOG", true);
}
function _log(meta){
  if (!_shouldLog()) return;
  try{
    const out = {
      scope: "tts",
      at: new Date().toISOString(),
      traceId: meta && meta.traceId ? meta.traceId : "",
      ok: !!(meta && meta.ok),
      provider: "resemble",
      ms: meta && meta.ms != null ? meta.ms : undefined,
      status: meta && meta.status != null ? meta.status : undefined,
      error: meta && meta.error ? _str(meta.error).slice(0, 120) : undefined,
      reason: meta && meta.reason ? _str(meta.reason).slice(0, 120) : undefined,
      voice: meta && meta.voice ? _str(meta.voice).slice(0, 64) : undefined,
      chars: meta && meta.chars != null ? meta.chars : undefined,
      bytes: meta && meta.bytes != null ? meta.bytes : undefined
    };
    console.log("[sb:tts]", JSON.stringify(out));
  }catch(_){ }
}

function _requireProvider(){
  const tries = [
    "./ttsProvidersResemble",
    "./ttsProvidersResemble.js",
    "./TTSProvidersResemble",
    "./TTSProvidersResemble.js"
  ];
  let lastErr = null;
  for (const p of tries){
    try{
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(p);
      if (mod && typeof mod.synthesize === "function") return mod;
      if (mod && mod.default && typeof mod.default.synthesize === "function") return mod.default;
    }catch(e){ lastErr = e; }
  }
  const msg = lastErr ? _str(lastErr.message || lastErr) : "unknown";
  const err = new Error("Resemble provider module not found. Tried: " + tries.join(", ") + ". Last: " + msg);
  err.code = "PROVIDER_MISSING";
  throw err;
}

function _mimeFor(fmt){
  fmt = _trim(fmt).toLowerCase();
  if (fmt === "wav") return "audio/wav";
  return "audio/mpeg";
}
function _detectText(body){
  if (!_isObj(body)) return "";
  return _pickFirst(body.text, body.data, body.message, body.prompt, body.speak, "");
}
function _detectFormat(body){
  if (!_isObj(body)) return "mp3";
  const fmt = _pickFirst(body.output_format, body.format, body.outputFormat, "mp3").toLowerCase();
  return fmt === "wav" ? "wav" : "mp3";
}
function _detectVoice(body){
  if (!_isObj(body)) return "";
  return _pickFirst(body.voice_uuid, body.voiceUuid, body.voiceId, body.voice, "");
}
function _detectSampleRate(body){
  if (!_isObj(body)) return undefined;
  const n = _clampInt(_pickFirst(body.sample_rate, body.sampleRate, ""), NaN, 8000, 96000);
  return Number.isFinite(n) ? n : undefined;
}
function _detectProfile(body){
  if (!_isObj(body)) return undefined;
  return _isObj(body.ttsProfile) ? body.ttsProfile : undefined;
}
function _envVoice(){
  return _pickFirst(
    process.env.RESEMBLE_VOICE_UUID,
    process.env.SBNYX_RESEMBLE_VOICE_UUID,
    process.env.SB_RESEMBLE_VOICE_UUID,
    ""
  );
}
function _envProject(){
  return _pickFirst(
    process.env.RESEMBLE_PROJECT_UUID,
    process.env.SBNYX_RESEMBLE_PROJECT_UUID,
    process.env.SB_RESEMBLE_PROJECT_UUID,
    ""
  );
}
function _hasToken(){
  return !!_pickFirst(process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY, "");
}
function _voiceLooksBad(v){
  const s = _trim(v);
  if (!s) return true;
  if (s === "." || s === "-" || /^placeholder$/i.test(s) || /^default$/i.test(s)) return true;
  return false;
}
function _normalizeText(text){
  const max = _maxChars();
  let s = _trim(text).replace(/\s+/g, " ");
  if (s.length > max) s = s.slice(0, max).trim();
  return s;
}
function _hintFor(reason){
  const r = _trim(reason).toLowerCase();
  if (!r) return "Check provider availability and environment wiring.";
  if (r.includes("token") || r.includes("auth")) return "Verify RESEMBLE_API_TOKEN / RESEMBLE_API_KEY in the runtime environment.";
  if (r.includes("voice")) return "Verify RESEMBLE_VOICE_UUID or request voice_uuid is valid.";
  if (r.includes("project")) return "Verify RESEMBLE_PROJECT_UUID if your provider requires a project binding.";
  if (r.includes("timeout") || r.includes("abort")) return "Upstream TTS timed out. Check provider latency and timeout settings.";
  return "Check provider response, env wiring, and upstream status.";
}
async function _withTimeout(promise, ms){
  let to = null;
  return await Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      to = setTimeout(() => {
        const err = new Error("TTS provider timed out after " + ms + "ms");
        err.code = "TTS_TIMEOUT";
        reject(err);
      }, ms);
    })
  ]).finally(() => {
    try{ if (to) clearTimeout(to); }catch(_){ }
  });
}

async function handleTts(req, res){
  const started = _now();
  const traceId = _makeTraceId(req) || _genTraceId();

  try{
    _safeSet(res, "Cache-Control", "no-store");
    _safeSet(res, "X-SB-Trace-ID", traceId || "");
    _safeSet(res, "X-SB-TTS-Provider", "resemble");
    _safeSet(res, "X-SB-TTS-Cache", "BYPASS");
    _safeSet(res, "X-SB-Trace-Spine", "tts");
  }catch(_){ }

  const body = (req && req.body) ? req.body : {};
  const rawText = _detectText(body);
  const text = _normalizeText(rawText);
  const chars = text.length;

  if (!text){
    _log({ ok:false, traceId, status:400, error:"BAD_REQUEST", chars:0 });
    return _safeJson(res, 400, {
      ok: false,
      error: "BAD_REQUEST",
      detail: "Missing text/data in request body.",
      spokenUnavailable: true,
      traceId,
      ms: _now() - started
    });
  }

  const outputFormat = _detectFormat(body);
  const voiceUuid = _pickFirst(_detectVoice(body), _envVoice());
  const projectUuid = _envProject();
  const sampleRate = _detectSampleRate(body);
  const ttsProfile = _detectProfile(body);

  if (!_hasToken()){
    _log({ ok:false, traceId, status:503, error:"TTS_MISCONFIG", reason:"missing_token", chars, voice:voiceUuid });
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_MISCONFIG",
      reason: "missing_token",
      detail: "Missing RESEMBLE_API_TOKEN (or RESEMBLE_API_KEY) in environment.",
      hint: _hintFor("token"),
      spokenUnavailable: true,
      traceId,
      ms: _now() - started
    });
  }

  if (_voiceLooksBad(voiceUuid)){
    _log({ ok:false, traceId, status:503, error:"TTS_MISCONFIG", reason:"missing_or_invalid_voice", chars, voice:voiceUuid });
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_MISCONFIG",
      reason: "missing_or_invalid_voice",
      detail: "Missing or invalid RESEMBLE_VOICE_UUID (or voice_uuid in request).",
      hint: _hintFor("voice"),
      spokenUnavailable: true,
      traceId,
      ms: _now() - started
    });
  }

  _safeSet(res, "X-SB-Voice", voiceUuid);

  let provider;
  try{
    provider = _requireProvider();
  }catch(e){
    const detail = _str(e && e.message ? e.message : e).slice(0, 900);
    _log({ ok:false, traceId, status:503, error:"TTS_PROVIDER_MISSING", reason:detail, chars, voice:voiceUuid });
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_PROVIDER_MISSING",
      detail,
      hint: "Expected ./ttsProvidersResemble in the same directory as this handler.",
      spokenUnavailable: true,
      traceId,
      ms: _now() - started
    });
  }

  let out;
  try{
    out = await _withTimeout(provider.synthesize({
      text,
      voiceUuid,
      projectUuid: projectUuid || undefined,
      outputFormat,
      sampleRate,
      ttsProfile,
      traceId
    }), _timeoutMs());
  }catch(e){
    const code = _trim(e && e.code ? e.code : "") || "TTS_PROVIDER_THROW";
    const detail = _str(e && e.message ? e.message : e).slice(0, 500);
    const status = code === "TTS_TIMEOUT" ? 504 : 503;
    _log({ ok:false, traceId, status, error:code, reason:detail, chars, voice:voiceUuid });
    return _safeJson(res, status, {
      ok: false,
      error: code,
      detail,
      hint: _hintFor(detail),
      spokenUnavailable: true,
      traceId,
      ms: _now() - started
    });
  }

  const buffer = _safeBuf(out && out.buffer);
  if (!out || out.ok !== true || !buffer || buffer.length < 16){
    const reason = out && out.reason ? _str(out.reason) : "synthesis_failed";
    const msg = out && (out.message || out.detail) ? (out.message || out.detail) : "Resemble synthesis failed.";
    const upstreamStatus = out && out.status != null ? out.status : undefined;
    _log({ ok:false, traceId, status:503, error:"TTS_SYNTH_FAILED", reason, chars, voice:voiceUuid, bytes:buffer ? buffer.length : 0 });
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_SYNTH_FAILED",
      reason,
      detail: _str(msg).slice(0, 700),
      hint: _hintFor(reason || msg),
      retryable: !!(out && out.retryable),
      providerStatus: upstreamStatus,
      requestId: out && out.requestId ? out.requestId : undefined,
      spokenUnavailable: true,
      traceId,
      ms: _now() - started
    });
  }

  const mime = out.mimeType || _mimeFor(outputFormat);
  const elapsedMs = out.elapsedMs != null ? out.elapsedMs : (_now() - started);

  try{
    res.status(200);
    _safeSet(res, "Content-Type", mime);
    _safeSet(res, "Content-Length", String(buffer.length));
    _safeSet(res, "X-SB-TTS-MS", String(elapsedMs));
    _safeSet(res, "X-SB-Voice", voiceUuid);
    _safeSet(res, "X-SB-TTS-Result", "ok");
    _log({ ok:true, traceId, status:200, ms:elapsedMs, chars, voice:voiceUuid, bytes:buffer.length });
    return res.send(buffer);
  }catch(e){
    const detail = _str(e && e.message ? e.message : e).slice(0, 400);
    _log({ ok:false, traceId, status:500, error:"TTS_SEND_FAILED", reason:detail, chars, voice:voiceUuid, bytes:buffer.length });
    return _safeJson(res, 500, {
      ok: false,
      error: "TTS_SEND_FAILED",
      detail,
      spokenUnavailable: true,
      traceId,
      ms: _now() - started
    });
  }
}

function diag(){
  return {
    ok: true,
    provider: "resemble",
    contract: {
      accepts: ["text","data","message","prompt","speak","voice_uuid","voiceUuid","voiceId","voice","output_format","format","outputFormat","sample_rate","sampleRate","ttsProfile"],
      returns: ["audio/mpeg","audio/wav","json_error_envelope"]
    },
    env: {
      hasToken: _hasToken(),
      hasVoice: !!_envVoice(),
      hasProject: !!_envProject(),
      timeoutMs: _timeoutMs(),
      maxChars: _maxChars()
    }
  };
}

module.exports = { handleTts, diag };
