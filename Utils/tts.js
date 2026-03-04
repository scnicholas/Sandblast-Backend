"use strict";

/**
 * TTS.js — Runtime TTS handler (Resemble-only)
 *
 * PURPOSE
 * - Canonical backend handler that /utils/tts.js loads (exports { handleTts }).
 * - Produces REAL audio bytes (mp3/wav) OR (optionally) JSON with base64 audio.
 *
 * CONTRACT (accepted request JSON)
 * - text OR data OR message: string
 * - voiceId OR voice_uuid OR voiceUuid: voice UUID (optional; falls back to env)
 * - output_format OR format OR outputFormat: "mp3" | "wav" (optional)
 * - sample_rate (optional)
 * - returnBase64 (optional boolean) -> if true, respond JSON { ok, audio, mimeType, ... }
 * - responseMode (optional string) -> "bytes" | "base64" (alias for returnBase64)
 * - emotion / mood / anxiety (optional) -> passed through to provider as hints (best-effort)
 *
 * ENV (aliases supported)
 * - RESEMBLE_API_TOKEN or RESEMBLE_API_KEY   (required)
 * - RESEMBLE_VOICE_UUID                      (required unless provided in request)
 * - RESEMBLE_PROJECT_UUID                    (optional; passed through if present)
 *
 * NOTES
 * - ElevenLabs: NOT referenced.
 * - "No sound" after provider swaps is commonly caused by returning bytes while the client expects JSON/base64
 *   (or vice versa). This handler supports BOTH safely without breaking the default "bytes" contract.
 */

function _now(){ return Date.now(); }
function _str(v){ return v==null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _isObj(v){ return !!v && typeof v === "object"; }
function _pickFirst(...vals){
  for (const v of vals){
    const t = _trim(v);
    if (t) return t;
  }
  return "";
}

function _lower(s){ return _trim(s).toLowerCase(); }

function _makeTraceId(req){
  const h = (req && req.headers) ? req.headers : {};
  return _pickFirst(h["x-sb-trace-id"], h["x-sb-traceid"], h["x-request-id"], "");
}

function _safeJson(res, status, obj){
  try{
    res.status(status).json(obj);
  }catch(_){
    try{
      res.status(status).set("Content-Type","application/json; charset=utf-8").send(JSON.stringify(obj));
    }catch(__){}
  }
}

function _requireProvider(){
  const tries = [
    "./utils/ttsProvidersResemble",
    "./utils/ttsProvidersresemble",
    "./ttsProvidersResemble",
    "./ttsProvidersresemble",
    "./TTSProvidersResemble",
    "./TTSProvidersresemble",
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
  fmt = _lower(fmt);
  if (fmt === "wav") return "audio/wav";
  return "audio/mpeg"; // mp3 default
}

function _detectText(body){
  if (!_isObj(body)) return "";
  return _pickFirst(body.text, body.data, body.message, body.prompt, body.speak, "");
}

function _detectFormat(body){
  if (!_isObj(body)) return "mp3";
  return _pickFirst(body.output_format, body.format, body.outputFormat, "mp3").toLowerCase();
}

function _detectVoice(body){
  if (!_isObj(body)) return "";
  return _pickFirst(body.voice_uuid, body.voiceUuid, body.voiceId, body.voice, "");
}

function _envVoice(){
  return _pickFirst(process.env.RESEMBLE_VOICE_UUID, process.env.SBNYX_RESEMBLE_VOICE_UUID, "");
}

function _envProject(){
  return _pickFirst(process.env.RESEMBLE_PROJECT_UUID, process.env.SBNYX_RESEMBLE_PROJECT_UUID, "");
}

function _hasToken(){
  const tok = _pickFirst(process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY, "");
  return !!tok;
}

function _wantsBase64(req, body){
  // Explicit body flags win.
  if (_isObj(body)){
    if (body.returnBase64 === true) return true;
    if (_lower(body.responseMode) === "base64") return true;
    if (_lower(body.mode) === "base64") return true;
    if (_lower(body.response) === "base64") return true;
  }

  // Next: Accept header hints (some clients default to JSON).
  const h = (req && req.headers) ? req.headers : {};
  const accept = _lower(h.accept);
  if (accept.includes("application/json")) return true;

  // Default: bytes (most audio players want raw bytes).
  return false;
}

function _hintEmotion(body){
  if (!_isObj(body)) return undefined;
  // Allow multiple keys: emotion/mood/anxiety
  const emotion = _pickFirst(body.emotion, body.mood, body.affect, "");
  const anxiety = body.anxiety === true || _lower(body.anxiety) === "true" ? "anxiety" : "";
  const hint = _pickFirst(emotion, anxiety, "");
  return hint ? hint : undefined;
}

function _maxTextBytes(){
  // Safety guard; keep it conservative to avoid runaway costs/latency.
  // Allow override via env if needed.
  const v = _pickFirst(process.env.SBNYX_TTS_MAX_TEXT_BYTES, "6000");
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 200 ? n : 6000;
}

function _truncateUtf8(str, maxBytes){
  try{
    const b = Buffer.from(_str(str), "utf8");
    if (b.length <= maxBytes) return _str(str);
    return b.slice(0, maxBytes).toString("utf8");
  }catch(_){
    const s = _str(str);
    return s.length > 2000 ? s.slice(0, 2000) : s;
  }
}

async function handleTts(req, res){
  const started = _now();
  const traceId = _makeTraceId(req);

  // Handle preflight quickly (defensive; index.js often handles this too).
  if (req && _lower(req.method) === "options"){
    try{
      res.set("Cache-Control", "no-store");
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-SB-Trace-Id, X-Request-Id");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    }catch(_){}
    return res.status(204).send("");
  }

  // Basic headers safety (harmless to repeat)
  try{
    res.set("Cache-Control", "no-store");
    res.set("X-SB-Trace-ID", traceId || "");
    res.set("X-SB-TTS-Provider", "resemble");
  }catch(_){}

  const body = (req && req.body) ? req.body : {};
  let text = _trim(_detectText(body));

  if (!text){
    return _safeJson(res, 400, {
      ok: false,
      error: "BAD_REQUEST",
      detail: "Missing text/data in request body.",
      traceId,
      ms: _now() - started
    });
  }

  // Guard: cap payload size to avoid timeouts/cost blowups.
  const maxBytes = _maxTextBytes();
  text = _truncateUtf8(text, maxBytes);

  const outputFormat = _detectFormat(body);
  const voiceUuid = _pickFirst(_detectVoice(body), _envVoice());
  const projectUuid = _envProject();

  if (!_hasToken()){
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_MISCONFIG",
      detail: "Missing RESEMBLE_API_TOKEN (or RESEMBLE_API_KEY) in environment.",
      traceId,
      ms: _now() - started
    });
  }

  if (!voiceUuid){
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_MISCONFIG",
      detail: "Missing RESEMBLE_VOICE_UUID (or voice_uuid in request).",
      traceId,
      ms: _now() - started
    });
  }

  let provider;
  try{
    provider = _requireProvider();
  }catch(e){
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_PROVIDER_MISSING",
      detail: _str(e && e.message ? e.message : e).slice(0, 400),
      traceId,
      ms: _now() - started
    });
  }

  const wantBase64 = _wantsBase64(req, body);
  const emotionHint = _hintEmotion(body);

  // Call provider with the *correct* contract keys:
  // - voiceUuid (NOT voiceId)
  // - outputFormat (NOT format)
  let out;
  try{
    out = await provider.synthesize({
      text,
      voiceUuid,
      projectUuid: projectUuid || undefined,
      outputFormat,
      sampleRate: body && body.sample_rate ? body.sample_rate : undefined,
      // Optional hinting (provider may ignore, but won't break)
      emotion: emotionHint,
      traceId
    });
  }catch(e){
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_PROVIDER_THROW",
      detail: _str(e && e.message ? e.message : e).slice(0, 500),
      traceId,
      ms: _now() - started
    });
  }

  if (!out || out.ok !== true || !out.buffer || !Buffer.isBuffer(out.buffer) || out.buffer.length < 16){
    const reason = out && out.reason ? _str(out.reason) : "synthesis_failed";
    const msg = out && (out.message || out.detail) ? (out.message || out.detail) : "Resemble synthesis failed.";
    return _safeJson(res, 503, {
      ok: false,
      error: "TTS_SYNTH_FAILED",
      reason,
      detail: _str(msg).slice(0, 700),
      retryable: !!(out && out.retryable),
      requestId: out && out.requestId ? out.requestId : undefined,
      traceId,
      ms: _now() - started
    });
  }

  const mime = out.mimeType || _mimeFor(outputFormat);
  const elapsed = (out.elapsedMs != null ? out.elapsedMs : (_now() - started));

  // --- RESPONSE MODES ---
  // bytes: raw audio bytes (default)
  // base64: JSON payload with audio base64 (helps when frontend expects JSON)
  if (wantBase64){
    const b64 = out.buffer.toString("base64");
    return _safeJson(res, 200, {
      ok: true,
      provider: "resemble",
      traceId,
      mimeType: mime,
      format: outputFormat,
      audio: b64,
      bytes: out.buffer.length,
      ttsMs: elapsed
    });
  }

  // Default: send raw bytes (no JSON)
  try{
    res.status(200);
    res.set("Content-Type", mime);
    res.set("Content-Length", String(out.buffer.length));
    res.set("X-SB-TTS-MS", String(elapsed));
    return res.send(out.buffer);
  }catch(e){
    return _safeJson(res, 500, {
      ok: false,
      error: "TTS_SEND_FAILED",
      detail: _str(e && e.message ? e.message : e).slice(0, 400),
      traceId,
      ms: _now() - started
    });
  }
}

/**
 * Optional diagnostics helper (for /api/diag/tts if you want richer output)
 */
function diag(){
  return {
    ok: true,
    provider: "resemble",
    env: {
      hasToken: _hasToken(),
      hasVoice: !!_envVoice(),
      hasProject: !!_envProject(),
      maxTextBytes: _maxTextBytes()
    }
  };
}

module.exports = { handleTts, diag };
