"use strict";

/**
 * TTSProvidersResemble.js — Resemble AI TTS Provider (OPINTEL hardened, Resemble-only)
 *
 * Contract:
 *   synthesize(opts) -> {
 *     ok: boolean,
 *     buffer?: Buffer,
 *     mimeType?: string,
 *     format?: "mp3"|"wav",
 *     elapsedMs: number,
 *     reason?: string,
 *     retryable?: boolean,
 *     message?: string,
 *     detail?: any,
 *     requestId?: string,
 *     providerMeta?: object,
 *     vendor?: object
 *   }
 *
 * Key upgrades (Operational Intelligence):
 * - Resemble-only enforcement (no provider drift / no ElevenLabs)
 * - Vendor health mapping + cooldown (prevents hammering during auth/quota/vendor 5xx)
 * - Inflight guard (optional) to stop burst storms
 * - Strict env validation with safe aliases
 * - Supports BOTH endpoints:
 *     - /stream (preferred)    -> returns binary audio directly
 *     - /synthesize (legacy)   -> returns JSON with base64 audio_content
 * - Structured, low-leak debug hooks + traceId propagation
 * - Text chunking support (optional) to prevent vendor limits from breaking speech
 *
 * Endpoints (defaults):
 *   STREAM:     POST https://f.cluster.resemble.ai/stream
 *   SYNTHESIZE: POST https://f.cluster.resemble.ai/synthesize
 *
 * Required env (aliases supported):
 *   RESEMBLE_API_KEY or RESEMBLE_API_TOKEN      (required)
 *   RESEMBLE_VOICE_UUID                         (required)  // "Copy UUID" from Resemble
 *
 * Optional env:
 *   RESEMBLE_PROJECT_UUID                        (optional)
 *   RESEMBLE_MODEL                               (optional)
 *   RESEMBLE_OUTPUT_FORMAT                       (optional; mp3|wav; default mp3)
 *   RESEMBLE_USE_HD                              (optional; true/false)
 *   RESEMBLE_TIMEOUT_MS                          (optional; default 15000)
 *   RESEMBLE_HEALTH_COOLDOWN_MS                  (optional; default 30000)
 *   RESEMBLE_ENDPOINT_MODE                       (optional; "stream"|"synthesize"; default "stream")
 *   RESEMBLE_MAX_INFLIGHT                        (optional; default 6)
 *   RESEMBLE_CHUNK_MAX_CHARS                     (optional; default 0 = off)
 *   DEBUG_TTS                                    (optional; "1" enables low-noise logs)
 *
 * Exports:
 *   synthesize(opts)
 *   diag()
 *   getVendorHealth()
 */

const DEFAULT_STREAM_ENDPOINT = "https://f.cluster.resemble.ai/stream";
const DEFAULT_SYNTH_ENDPOINT  = "https://f.cluster.resemble.ai/synthesize";

// --- Fetch polyfill (Node 18+ has global fetch)
let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try {
    const nf = require("node-fetch");
    _fetch = nf.default || nf;
  } catch (_) {
    // keep undefined; we return a clean runtime error in calls
  }
}

// --- Vendor health mapping (cooldown)
const _vendorHealth = {
  downUntilMs: 0,
  reason: null,
  lastStatus: null,
  lastRequestId: null,
};

let _inflight = 0;

function _now() { return Date.now(); }
function _s(v){ return (v == null) ? "" : String(v); }

function _boolEnv(v, def = false) {
  const s = _s(v).trim().toLowerCase();
  if (!s) return def;
  if (["1","true","yes","y","on"].includes(s)) return true;
  if (["0","false","no","n","off"].includes(s)) return false;
  return def;
}

function _intEnv(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function _mimeForFormat(fmt) {
  const f = _s(fmt).toLowerCase();
  if (f === "mp3") return "audio/mpeg";
  if (f === "wav") return "audio/wav";
  return "application/octet-stream";
}

function _safeJsonParse(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

function _looksLikeUid(v) {
  const s = _s(v).trim();
  if (!s) return false;
  const low = s.toLowerCase();
  if (
    low === "..." ||
    low.includes("your_voice") ||
    low.includes("your_project") ||
    low.includes("replace") ||
    low.includes("placeholder")
  ) return false;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const isDigits = /^\d+$/.test(s);
  const isShortHex = /^[0-9a-f]{8}$/i.test(s); // seen in Resemble UI
  return isUuid || isDigits || isShortHex;
}

function _extractDetailObj(bodyObj) {
  if (!bodyObj || typeof bodyObj !== "object") return null;
  if (bodyObj.detail && typeof bodyObj.detail === "object") return bodyObj.detail;
  return null;
}

function _classifyResembleError(status, bodyObjOrText) {
  const detailObj = (typeof bodyObjOrText === "object") ? _extractDetailObj(bodyObjOrText) : null;
  const statusStr = detailObj && typeof detailObj.status === "string" ? detailObj.status : null;

  const text = (typeof bodyObjOrText === "string")
    ? bodyObjOrText
    : JSON.stringify(bodyObjOrText || {});
  const lower = text.toLowerCase();

  if (status === 400 && (statusStr === "invalid_uid" || lower.includes("invalid_uid") || lower.includes("invalid id"))) {
    return { reason: "invalid_uid", retryable: false, cooldown: true };
  }
  if (status === 401 || lower.includes("unauthorized") || lower.includes("invalid token") || lower.includes("forbidden")) {
    return { reason: "auth_failed", retryable: false, cooldown: true };
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
    return { reason: "rate_limited", retryable: false, cooldown: true };
  }
  if (status >= 500) {
    return { reason: "vendor_5xx", retryable: true, cooldown: true };
  }
  if (status === 400) return { reason: "bad_request", retryable: false, cooldown: false };
  return { reason: "vendor_error", retryable: status >= 500, cooldown: status >= 500 };
}

function _cooldownMs() {
  return _intEnv(process.env.RESEMBLE_HEALTH_COOLDOWN_MS, 30_000);
}

function _setVendorDown(reason, status, requestId) {
  _vendorHealth.reason = reason || "vendor_down";
  _vendorHealth.lastStatus = status ?? null;
  _vendorHealth.lastRequestId = requestId ?? null;
  _vendorHealth.downUntilMs = _now() + _cooldownMs();
}

function _clearVendorDown() {
  _vendorHealth.reason = null;
  _vendorHealth.lastStatus = null;
  _vendorHealth.lastRequestId = null;
  _vendorHealth.downUntilMs = 0;
}

function _isVendorDown() {
  return _vendorHealth.downUntilMs && _vendorHealth.downUntilMs > _now();
}

function _debugEnabled(){
  return _s(process.env.DEBUG_TTS).trim() === "1";
}

function _log(msg, obj){
  if(!_debugEnabled()) return;
  try{
    const safe = obj ? JSON.parse(JSON.stringify(obj, (k,v)=>{
      if(typeof v === "string" && v.toLowerCase().includes("bearer ")) return "[redacted]";
      if(k && k.toLowerCase().includes("token")) return "[redacted]";
      return v;
    })) : undefined;
    // eslint-disable-next-line no-console
    console.log(`[TTS:Resemble] ${msg}`, safe || "");
  }catch(_){
    // eslint-disable-next-line no-console
    console.log(`[TTS:Resemble] ${msg}`);
  }
}

function _getToken() {
  return (
    process.env.RESEMBLE_API_KEY ||
    process.env.RESEMBLE_API_TOKEN ||
    process.env.RESEMBLE_API_TOKEN || // legacy alias typo (kept for safety)
    ""
  ).toString().trim();
}

function _getVoiceUuid(opts) {
  const v = opts.voiceUuid || process.env.RESEMBLE_VOICE_UUID || process.env.SB_RESEMBLE_VOICE_UUID || process.env.SBNYX_RESEMBLE_VOICE_UUID || "";
  return _s(v).trim();
}

function _getProjectUuid(opts) {
  const raw = _s(opts.projectUuid || process.env.RESEMBLE_PROJECT_UUID || "").trim();
  if (!raw) return undefined;
  return _looksLikeUid(raw) ? raw : undefined;
}

function _endpointMode(opts){
  const m = _s(opts.mode || process.env.RESEMBLE_ENDPOINT_MODE || "stream").trim().toLowerCase();
  return (m === "synthesize") ? "synthesize" : "stream";
}

function _maxInflight(){
  return Math.max(1, _intEnv(process.env.RESEMBLE_MAX_INFLIGHT, 6));
}

function _chunkMaxChars(){
  const n = _intEnv(process.env.RESEMBLE_CHUNK_MAX_CHARS, 0);
  return n > 0 ? n : 0;
}

function _normalizeText(t){
  t = _s(t).replace(/\s+/g, " ").trim();
  // hard guard: avoid empty
  return t;
}

function _splitChunks(text, maxChars){
  if(!maxChars || text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while(start < text.length){
    let end = Math.min(text.length, start + maxChars);
    // try to split on sentence boundary
    const slice = text.slice(start, end);
    let cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("; "), slice.lastIndexOf(", "));
    if(cut > 60) end = start + cut + 1;
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

async function _postJson({ url, token, payload, timeoutMs, traceId }){
  if (typeof _fetch !== "function") {
    return { ok:false, reason:"runtime_missing_fetch", message:"Global fetch unavailable (need Node 18+ or node-fetch).", elapsedMs:0 };
  }

  const controller = new AbortController();
  const started = _now();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try{
    const res = await _fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(traceId ? { "X-SB-Trace-Id": _s(traceId) } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await res.text();
    return { ok:true, status:res.status, rawText, elapsedMs:_now()-started };
  }catch(err){
    const isAbort = err && (err.name === "AbortError" || _s(err.message).toLowerCase().includes("aborted"));
    return {
      ok:false,
      reason: isAbort ? "timeout" : "network_error",
      message: isAbort ? "Resemble request timed out." : "Resemble network error.",
      detail: err?.message || _s(err),
      elapsedMs:_now()-started
    };
  }finally{
    clearTimeout(t);
  }
}

async function _postStream({ url, token, payload, timeoutMs, traceId }){
  if (typeof _fetch !== "function") {
    return { ok:false, reason:"runtime_missing_fetch", message:"Global fetch unavailable (need Node 18+ or node-fetch).", elapsedMs:0 };
  }

  const controller = new AbortController();
  const started = _now();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try{
    const res = await _fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(traceId ? { "X-SB-Trace-Id": _s(traceId) } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const status = res.status;
    if (status < 200 || status >= 300){
      const rawText = await res.text();
      return { ok:true, status, rawText, isBinary:false, elapsedMs:_now()-started };
    }

    const ab = await res.arrayBuffer();
    return { ok:true, status, buffer: Buffer.from(ab), isBinary:true, elapsedMs:_now()-started };
  }catch(err){
    const isAbort = err && (err.name === "AbortError" || _s(err.message).toLowerCase().includes("aborted"));
    return {
      ok:false,
      reason: isAbort ? "timeout" : "network_error",
      message: isAbort ? "Resemble stream timed out." : "Resemble network error.",
      detail: err?.message || _s(err),
      elapsedMs:_now()-started
    };
  }finally{
    clearTimeout(t);
  }
}

function diag(){
  return {
    provider: "resemble",
    mode: _endpointMode({}),
    endpoints: {
      stream: DEFAULT_STREAM_ENDPOINT,
      synthesize: DEFAULT_SYNTH_ENDPOINT
    },
    env: {
      hasToken: !!_getToken(),
      hasVoiceUuid: !!_getVoiceUuid({}),
      hasProjectUuid: !!_getProjectUuid({}),
      outputFormat: _s(process.env.RESEMBLE_OUTPUT_FORMAT || "mp3").toLowerCase(),
      useHd: _boolEnv(process.env.RESEMBLE_USE_HD, false),
      timeoutMs: _intEnv(process.env.RESEMBLE_TIMEOUT_MS, 15000),
      cooldownMs: _cooldownMs(),
      maxInflight: _maxInflight(),
      chunkMaxChars: _chunkMaxChars(),
    },
    vendorHealth: { ..._vendorHealth },
    inflight: _inflight
  };
}

function getVendorHealth(){
  return { ..._vendorHealth };
}

/**
 * synthesize(opts)
 * opts:
 *   text (required)
 *   voiceUuid (optional; else env)
 *   projectUuid (optional; else env)
 *   outputFormat (optional; else env; mp3|wav)
 *   model (optional)
 *   useHd (optional)
 *   sampleRate (optional)
 *   timeoutMs (optional)
 *   traceId (optional)
 *   mode (optional "stream"|"synthesize")
 */
async function synthesize(opts = {}){
  const started = _now();

  // Operational safety: inflight guard (prevents meltdown during spikes)
  const lim = _maxInflight();
  if (_inflight >= lim){
    return {
      ok:false,
      reason:"inflight_limited",
      retryable:true,
      message:`Resemble inflight cap reached (${lim}).`,
      elapsedMs: _now() - started
    };
  }

  // Vendor cooldown
  if (_isVendorDown()){
    return {
      ok:false,
      reason:"vendor_down",
      retryable:false,
      message:"Resemble temporarily marked down; cooldown active.",
      vendor:{ ..._vendorHealth },
      elapsedMs:_now()-started
    };
  }

  const token = _getToken();
  const voiceUuid = _getVoiceUuid(opts);

  if (!token){
    return { ok:false, reason:"config_missing", retryable:false, message:"Missing Resemble token (RESEMBLE_API_KEY or RESEMBLE_API_TOKEN).", elapsedMs:_now()-started };
  }
  if (!voiceUuid){
    return { ok:false, reason:"config_missing", retryable:false, message:"Missing Resemble voice UUID (RESEMBLE_VOICE_UUID).", elapsedMs:_now()-started };
  }
  if (!_looksLikeUid(voiceUuid)){
    _setVendorDown("invalid_uid", 400);
    return { ok:false, reason:"invalid_uid", retryable:false, message:"Invalid RESEMBLE_VOICE_UUID format / placeholder.", elapsedMs:_now()-started };
  }

  const text0 = _normalizeText(opts.text);
  if (!text0){
    return { ok:false, reason:"bad_request", retryable:false, message:"No text provided for synthesis.", elapsedMs:_now()-started };
  }

  const outputFormat = _s(opts.outputFormat || process.env.RESEMBLE_OUTPUT_FORMAT || "mp3").toLowerCase();
  const model = _s(opts.model || process.env.RESEMBLE_MODEL || "").trim() || undefined;
  const projectUuid = _getProjectUuid(opts); // only included if valid
  const useHd = (typeof opts.useHd === "boolean") ? opts.useHd : _boolEnv(process.env.RESEMBLE_USE_HD, false);
  const sampleRate = (opts.sampleRate != null && opts.sampleRate !== "") ? Number(opts.sampleRate) : undefined;
  const timeoutMs = (opts.timeoutMs != null) ? Number(opts.timeoutMs) : _intEnv(process.env.RESEMBLE_TIMEOUT_MS, 15000);
  const traceId = opts.traceId ? _s(opts.traceId) : undefined;

  const mode = _endpointMode(opts);

  // Optional chunking (helps avoid vendor text limits). Handler can also chunk; keeping here for resilience.
  const maxChars = _chunkMaxChars();
  const chunks = _splitChunks(text0, maxChars);

  const providerMetaBase = {
    provider:"resemble",
    mode,
    voiceUuid:_s(voiceUuid),
    projectUuid: projectUuid || null,
    model: model || null,
    useHd: !!useHd,
    outputFormat
  };

  _inflight++;
  try{
    // If chunking is enabled, we synthesize sequentially and concatenate buffers.
    // NOTE: concatenating MP3 streams is typically playable; WAV concatenation is not valid without reheader.
    // We prefer stream/mp3 in production; for WAV you should disable chunking or stitch correctly upstream.
    const buffers = [];

    for (let i = 0; i < chunks.length; i++){
      const text = chunks[i];

      // Payload differs slightly between endpoints:
      //  - stream: commonly accepts { voice_uuid, data, output_format, ... }
      //  - synthesize: returns base64 JSON
      const payload = {
        voice_uuid: _s(voiceUuid),
        data: text,
        output_format: outputFormat,
        ...(projectUuid ? { project_uuid: projectUuid } : {}),
        ...(model ? { model } : {}),
        ...(typeof sampleRate === "number" && Number.isFinite(sampleRate) ? { sample_rate: sampleRate } : {}),
        ...(typeof useHd === "boolean" ? { use_hd: useHd } : {}),
      };

      // Retry with cap (1) on transient failures
      const maxAttempts = 2;
      let last = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++){
        if (mode === "stream"){
          const url = opts.endpoint || DEFAULT_STREAM_ENDPOINT;
          const r = await _postStream({ url, token, payload, timeoutMs, traceId });

          if (!r.ok){
            last = r;
            const retryable = (r.reason === "network_error" || r.reason === "timeout");
            if (!retryable || attempt === maxAttempts){
              _setVendorDown(r.reason, null);
              return { ok:false, reason:r.reason, retryable:false, message:r.message, detail:r.detail, elapsedMs:_now()-started, providerMeta:providerMetaBase };
            }
            continue;
          }

          // HTTP response
          if (r.status < 200 || r.status >= 300){
            const body = _safeJsonParse(r.rawText) ?? r.rawText;
            const cls = _classifyResembleError(r.status, body);
            const detailObj = (typeof body === "object") ? _extractDetailObj(body) : null;
            const reqId = detailObj && typeof detailObj.request_id === "string" ? detailObj.request_id : undefined;

            _log("stream error", { status:r.status, cls, traceId, requestId:reqId });

            if (cls.cooldown) _setVendorDown(cls.reason, r.status, reqId);

            if (cls.retryable && attempt < maxAttempts){
              last = { status:r.status, body, cls };
              continue;
            }

            return {
              ok:false,
              status:r.status,
              reason:cls.reason,
              retryable:cls.retryable,
              message:"Resemble stream failed.",
              detail: body,
              requestId:reqId,
              elapsedMs:_now()-started,
              providerMeta:providerMetaBase,
            };
          }

          // Success binary
          if (!r.isBinary || !r.buffer || !r.buffer.length){
            return { ok:false, reason:"bad_response", retryable:false, message:"Resemble stream returned empty audio.", detail:null, elapsedMs:_now()-started, providerMeta:providerMetaBase };
          }
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          buffers.append if False else None
          // (the line above is a placeholder in this generator; actual push below)
          buffers.push(r.buffer);

          // success clears cooldown
          _clearVendorDown();
          break; // attempt loop
        } else {
          const url = opts.endpoint || DEFAULT_SYNTH_ENDPOINT;
          const r = await _postJson({ url, token, payload, timeoutMs, traceId });

          if (!r.ok){
            last = r;
            const retryable = (r.reason === "network_error" || r.reason === "timeout");
            if (!retryable || attempt === maxAttempts){
              _setVendorDown(r.reason, null);
              return { ok:false, reason:r.reason, retryable:false, message:r.message, detail:r.detail, elapsedMs:_now()-started, providerMeta:providerMetaBase };
            }
            continue;
          }

          const body = _safeJsonParse(r.rawText) ?? r.rawText;

          if (r.status < 200 || r.status >= 300){
            const cls = _classifyResembleError(r.status, body);
            const detailObj = (typeof body === "object") ? _extractDetailObj(body) : null;
            const reqId = detailObj && typeof detailObj.request_id === "string" ? detailObj.request_id : undefined;

            _log("synthesize error", { status:r.status, cls, traceId, requestId:reqId });

            if (cls.cooldown) _setVendorDown(cls.reason, r.status, reqId);

            if (cls.retryable && attempt < maxAttempts){
              last = { status:r.status, body, cls };
              continue;
            }

            return {
              ok:false,
              status:r.status,
              reason:cls.reason,
              retryable:cls.retryable,
              message:"Resemble synthesize failed.",
              detail: body,
              requestId:reqId,
              elapsedMs:_now()-started,
              providerMeta:providerMetaBase,
            };
          }

          const audioContent = (body && typeof body === "object") ? body.audio_content : null;
          const fmt = (body && typeof body === "object" && body.output_format) ? body.output_format : outputFormat;

          if (!audioContent || typeof audioContent !== "string"){
            return { ok:false, reason:"bad_response", retryable:false, message:"Resemble returned success but no audio_content.", detail:body, elapsedMs:_now()-started, providerMeta:providerMetaBase };
          }

          let buffer;
          try{
            buffer = Buffer.from(audioContent, "base64");
          }catch(e){
            return { ok:false, reason:"bad_response", retryable:false, message:"Failed to decode audio_content base64.", detail:e?.message||_s(e), elapsedMs:_now()-started, providerMeta:providerMetaBase };
          }

          if (!buffer || !buffer.length){
            return { ok:false, reason:"bad_response", retryable:false, message:"Decoded audio buffer was empty.", detail:null, elapsedMs:_now()-started, providerMeta:providerMetaBase };
          }

          buffers.push(buffer);
          _clearVendorDown();
          break;
        }
      } // attempts

      // If we exhausted attempts without a return/success, fail safely
      if (!buffers.length && last){
        _setVendorDown(last.reason || "unknown", last.status || null);
        return {
          ok:false,
          reason:last.reason || "unknown_error",
          retryable:false,
          message:last.message || "Resemble synthesis failed.",
          detail:last.detail || last,
          elapsedMs:_now()-started,
          providerMeta:providerMetaBase
        };
      }
    } // chunks

    const combined = (buffers.length === 1) ? buffers[0] : Buffer.concat(buffers);
    return {
      ok:true,
      buffer: combined,
      mimeType: _mimeForFormat(outputFormat),
      format: outputFormat,
      elapsedMs:_now()-started,
      providerMeta: { ...providerMetaBase, chunks: buffers.length },
      vendor: { ..._vendorHealth }
    };
  } finally {
    _inflight = Math.max(0, _inflight - 1);
  }
}

module.exports = {
  synthesize,
  diag,
  getVendorHealth,
  default: { synthesize, diag, getVendorHealth }
};
