"use strict";

/**
 * ttsProvidersResemble.js
 * Resemble AI synchronous TTS provider (hardened).
 *
 * Exports: { synthesize }
 *
 * Dependency-free (uses global fetch if available; falls back to https).
 * Returns a Buffer of audio bytes decoded from Resemble's base64 payload,
 * or downloads audio_src if the provider returns a URL instead.
 */

const https = require("https");

const RESEMBLE_SYNTH_URL = "https://f.cluster.resemble.ai/synthesize";

function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _pickFirst(){
  for (let i = 0; i < arguments.length; i++){
    const t = _trim(arguments[i]);
    if (t) return t;
  }
  return "";
}
function _lower(s){ return _trim(s).toLowerCase(); }
function _clampInt(v, dflt, min, max){
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function _boolish(v, dflt){
  if (v == null || v === "") return dflt;
  if (typeof v === "boolean") return v;
  const s = _trim(v).toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return dflt;
}
function _mimeFor(fmt){
  return _lower(fmt) === "wav" ? "audio/wav" : "audio/mpeg";
}
function _getToken(){
  return _pickFirst(process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY, "");
}
function _defaultModel(){
  return _pickFirst(process.env.RESEMBLE_TTS_MODEL, "chatterbox-turbo");
}
function _requestTimeoutMs(){
  return _clampInt(process.env.SB_TTS_PROVIDER_TIMEOUT_MS, process.env.SB_TTS_TIMEOUT_MS, 3000, 60000);
}
function _looksLikeMp3(buf){
  return Buffer.isBuffer(buf) && buf.length >= 3 && (
    (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
    (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)
  );
}
function _looksLikeWav(buf){
  return Buffer.isBuffer(buf) && buf.length >= 12 &&
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WAVE";
}
function _resolveMime(buffer, fallbackFmt){
  if (_looksLikeWav(buffer)) return "audio/wav";
  if (_looksLikeMp3(buffer)) return "audio/mpeg";
  return _mimeFor(fallbackFmt);
}

function _parseJson(text){
  try{ return JSON.parse(text || "{}"); }catch(_){ return null; }
}

function _buildAuthHeaders(token, mode){
  if (mode === "raw") return { Authorization: token };
  return { Authorization: `Bearer ${token}` };
}

function _postJsonViaHttps(url, headers, bodyObj, timeoutMs){
  const body = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname + (u.search || ""),
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Length": Buffer.byteLength(body),
          ...headers
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode || 0, headers: res.headers || {}, text: raw });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("provider_request_timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function _postJson(url, headers, bodyObj, timeoutMs){
  if (typeof fetch === "function"){
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let to = null;
    try{
      if (controller) to = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          ...headers
        },
        body: JSON.stringify(bodyObj),
        signal: controller ? controller.signal : undefined
      });
      const text = await res.text();
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text };
    }finally{
      if (to) clearTimeout(to);
    }
  }
  return _postJsonViaHttps(url, headers, bodyObj, timeoutMs);
}

function _downloadViaHttps(url, timeoutMs){
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "GET",
        hostname: u.hostname,
        path: u.pathname + (u.search || ""),
        headers: { Accept: "audio/*,*/*;q=0.8" },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            buffer: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("audio_src_timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function _downloadBuffer(url, timeoutMs){
  if (typeof fetch === "function"){
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let to = null;
    try{
      if (controller) to = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "audio/*,*/*;q=0.8" },
        signal: controller ? controller.signal : undefined
      });
      const ab = await res.arrayBuffer();
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        buffer: Buffer.from(ab)
      };
    }finally{
      if (to) clearTimeout(to);
    }
  }
  return _downloadViaHttps(url, timeoutMs);
}

async function _callSynthesize(payload, token, traceId, timeoutMs, authMode){
  const headers = {
    ..._buildAuthHeaders(token, authMode),
    "User-Agent": "sb-nyx-tts/1.0"
  };
  if (traceId) headers["X-SB-Trace-ID"] = traceId;
  return _postJson(RESEMBLE_SYNTH_URL, headers, payload, timeoutMs);
}

function _normalizeProviderMessage(json, fallbackText){
  const raw = json && (
    json.message || json.error || json.detail ||
    (Array.isArray(json.errors) ? json.errors.join("; ") : "") ||
    (Array.isArray(json.issues) ? json.issues.join("; ") : "")
  );
  return _trim(raw) || _trim(fallbackText) || "Resemble synthesis failed.";
}

async function synthesize(opts){
  const started = Date.now();

  const text = _trim(opts && opts.text);
  const voiceUuid = _trim(opts && opts.voiceUuid);
  const projectUuid = _trim(opts && opts.projectUuid);
  const outputFormat = _lower(_pickFirst(opts && opts.outputFormat, "mp3")) === "wav" ? "wav" : "mp3";
  const sampleRate = opts && opts.sampleRate ? opts.sampleRate : undefined;
  const precision = _pickFirst(opts && opts.precision, "").toUpperCase();
  const title = _trim(opts && opts.title);
  const useHd = opts && typeof opts.useHd !== "undefined" ? _boolish(opts.useHd, false) : undefined;
  const traceId = _trim(opts && opts.traceId);
  const token = _getToken();
  const timeoutMs = _requestTimeoutMs();

  if (!token){
    return { ok: false, retryable: false, reason: "missing_token", message: "Missing RESEMBLE_API_TOKEN", status: 0, elapsedMs: Date.now() - started };
  }
  if (!text){
    return { ok: false, retryable: false, reason: "missing_text", message: "Missing text", status: 0, elapsedMs: Date.now() - started };
  }
  if (!voiceUuid){
    return { ok: false, retryable: false, reason: "missing_voice", message: "Missing voiceUuid", status: 0, elapsedMs: Date.now() - started };
  }

  const payload = {
    voice_uuid: voiceUuid,
    data: text,
    output_format: outputFormat,
    model: _defaultModel()
  };

  if (projectUuid) payload.project_uuid = projectUuid;
  if (sampleRate) payload.sample_rate = sampleRate;
  if (precision && ["MULAW", "PCM_16", "PCM_24", "PCM_32"].includes(precision)) payload.precision = precision;
  if (title) payload.title = title.slice(0, 120);
  if (typeof useHd !== "undefined") payload.use_hd = !!useHd;

  let resp;
  let authMode = "bearer";
  try{
    resp = await _callSynthesize(payload, token, traceId, timeoutMs, authMode);

    // Resemble docs show Authorization examples in both raw-key and Bearer form.
    // If Bearer is rejected, retry once with the raw key to prevent false no-audio failures.
    if (resp && (resp.status === 401 || resp.status === 403)){
      authMode = "raw";
      resp = await _callSynthesize(payload, token, traceId, timeoutMs, authMode);
    }
  }catch(e){
    const msg = _str(e && e.message ? e.message : e);
    const timeoutish = /timeout|abort/i.test(msg);
    return {
      ok: false,
      retryable: true,
      reason: timeoutish ? "provider_timeout" : "network_error",
      message: msg,
      status: 0,
      elapsedMs: Date.now() - started,
      authMode
    };
  }

  const status = resp && resp.status ? resp.status : 0;
  const json = _parseJson(resp && resp.text ? resp.text : "");

  if (status !== 200 || !json || json.success !== true){
    const retryable = status >= 500 || status === 429 || status === 408 || status === 0;
    return {
      ok: false,
      retryable,
      reason: (status === 401 || status === 403) ? "auth_error" : "http_error",
      message: _normalizeProviderMessage(json, resp && resp.text ? resp.text : "Resemble synthesis failed."),
      status,
      elapsedMs: Date.now() - started,
      issues: json && Array.isArray(json.issues) ? json.issues : undefined,
      requestId: json && (json.request_id || json.id) ? (json.request_id || json.id) : undefined,
      authMode
    };
  }

  let buf = null;
  if (json.audio_content){
    try{
      buf = Buffer.from(String(json.audio_content), "base64");
    }catch(e){
      return {
        ok: false,
        retryable: false,
        reason: "base64_decode_failed",
        message: _str(e && e.message ? e.message : e),
        status,
        elapsedMs: Date.now() - started,
        issues: json && Array.isArray(json.issues) ? json.issues : undefined,
        requestId: json && (json.request_id || json.id) ? (json.request_id || json.id) : undefined,
        authMode
      };
    }
  } else if (json.audio_src){
    try{
      const dl = await _downloadBuffer(String(json.audio_src), timeoutMs);
      if (!dl || dl.status < 200 || dl.status >= 300 || !Buffer.isBuffer(dl.buffer) || dl.buffer.length < 16){
        return {
          ok: false,
          retryable: true,
          reason: "audio_src_download_failed",
          message: "Provider returned audio_src but the audio could not be downloaded.",
          status: dl && dl.status ? dl.status : status,
          elapsedMs: Date.now() - started,
          issues: json && Array.isArray(json.issues) ? json.issues : undefined,
          requestId: json && (json.request_id || json.id) ? (json.request_id || json.id) : undefined,
          authMode
        };
      }
      buf = dl.buffer;
    }catch(e){
      return {
        ok: false,
        retryable: true,
        reason: "audio_src_download_failed",
        message: _str(e && e.message ? e.message : e),
        status,
        elapsedMs: Date.now() - started,
        issues: json && Array.isArray(json.issues) ? json.issues : undefined,
        requestId: json && (json.request_id || json.id) ? (json.request_id || json.id) : undefined,
        authMode
      };
    }
  } else {
    return {
      ok: false,
      retryable: true,
      reason: "missing_audio_payload",
      message: "Provider returned success but no audio_content/audio_src payload.",
      status,
      elapsedMs: Date.now() - started,
      issues: json && Array.isArray(json.issues) ? json.issues : undefined,
      requestId: json && (json.request_id || json.id) ? (json.request_id || json.id) : undefined,
      authMode
    };
  }

  if (!Buffer.isBuffer(buf) || buf.length < 16){
    return {
      ok: false,
      retryable: true,
      reason: "empty_audio",
      message: "Decoded audio buffer is empty.",
      status,
      elapsedMs: Date.now() - started,
      issues: json && Array.isArray(json.issues) ? json.issues : undefined,
      requestId: json && (json.request_id || json.id) ? (json.request_id || json.id) : undefined,
      authMode
    };
  }

  return {
    ok: true,
    buffer: buf,
    mimeType: _resolveMime(buf, json.output_format || outputFormat),
    elapsedMs: Date.now() - started,
    duration: json.duration,
    synthDuration: json.synth_duration,
    sampleRate: json.sample_rate,
    outputFormat: json.output_format || outputFormat,
    issues: Array.isArray(json.issues) ? json.issues : undefined,
    requestId: json.request_id || json.id,
    providerStatus: status,
    authMode
  };
}

module.exports = { synthesize };
