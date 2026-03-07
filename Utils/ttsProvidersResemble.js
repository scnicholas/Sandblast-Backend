"use strict";

/**
 * ttsProvidersResemble.js
 * Resemble AI synchronous TTS provider (hardened).
 *
 * Exports: { synthesize }
 *
 * Improvements in this revision:
 * - preserves existing structure and function names
 * - accepts both token env naming patterns
 * - supports short voice ids by resolving from env when needed
 * - tolerates multiple provider success/body shapes
 * - returns richer diagnostics to stop blind 503s
 */

const https = require("https");

const RESEMBLE_SYNTH_URL = _pickFirst(
  process.env.RESEMBLE_SYNTH_URL,
  process.env.RESEMBLE_TTS_URL,
  "https://f.cluster.resemble.ai/synthesize"
);

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
function _getProjectUuid(){
  return _pickFirst(process.env.RESEMBLE_PROJECT_UUID, process.env.SB_RESEMBLE_PROJECT_UUID, "");
}
function _getVoiceUuid(){
  return _pickFirst(process.env.RESEMBLE_VOICE_UUID, process.env.SB_RESEMBLE_VOICE_UUID, process.env.SBNYX_RESEMBLE_VOICE_UUID, "");
}
function _defaultModel(){
  return _pickFirst(process.env.RESEMBLE_TTS_MODEL, "chatterbox-turbo");
}
function _requestTimeoutMs(){
  return _clampInt(process.env.SB_TTS_PROVIDER_TIMEOUT_MS || process.env.SB_TTS_TIMEOUT_MS, 12000, 3000, 60000);
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
function _looksLikeUuid(v){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_trim(v));
}
function _resolveVoiceUuid(v){
  const requested = _trim(v);
  const envVoice = _getVoiceUuid();
  if (_looksLikeUuid(requested)) return requested;
  if (requested && envVoice && requested === envVoice.slice(0, requested.length)) return envVoice;
  return envVoice || requested;
}

function _parseJson(text){
  try{ return JSON.parse(text || "{}"); }catch(_){ return null; }
}

function _buildAuthHeaders(token, mode){
  if (mode === "raw") return { Authorization: token };
  if (mode === "token") return { Authorization: `Token ${token}` };
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
    "User-Agent": "sb-nyx-tts/1.1"
  };
  if (traceId) headers["X-SB-Trace-ID"] = traceId;
  return _postJson(RESEMBLE_SYNTH_URL, headers, payload, timeoutMs);
}

function _normalizeProviderMessage(json, fallbackText){
  const raw = json && (
    json.message || json.error || json.detail || json.reason ||
    (json.data && (json.data.message || json.data.error || json.data.detail)) ||
    (Array.isArray(json.errors) ? json.errors.join("; ") : "") ||
    (Array.isArray(json.issues) ? json.issues.join("; ") : "")
  );
  return _trim(raw) || _trim(fallbackText) || "Resemble synthesis failed.";
}

function _providerSucceeded(status, json){
  if (!(status >= 200 && status < 300) || !json) return false;
  if (json.success === true) return true;
  if (json.ok === true) return true;
  if (json.audio_content || json.audio_src) return true;
  if (json.data && (json.data.audio_content || json.data.audio_src)) return true;
  return false;
}

function _extractAudioEnvelope(json){
  if (!json || typeof json !== "object") return {};
  const base = json.data && typeof json.data === "object" ? json.data : null;
  return {
    audio_content: _pickFirst(json.audio_content, base && base.audio_content),
    audio_src: _pickFirst(json.audio_src, base && base.audio_src),
    output_format: _pickFirst(json.output_format, base && base.output_format),
    duration: json.duration || (base && base.duration),
    synth_duration: json.synth_duration || (base && base.synth_duration),
    sample_rate: json.sample_rate || (base && base.sample_rate),
    request_id: _pickFirst(json.request_id, json.id, base && (base.request_id || base.id)),
    issues: Array.isArray(json.issues) ? json.issues : (base && Array.isArray(base.issues) ? base.issues : undefined)
  };
}

async function synthesize(opts){
  const started = Date.now();

  const text = _trim(opts && opts.text);
  const voiceUuid = _resolveVoiceUuid(opts && opts.voiceUuid);
  const projectUuid = _pickFirst(opts && opts.projectUuid, _getProjectUuid());
  const outputFormat = _lower(_pickFirst(opts && opts.outputFormat, "mp3")) === "wav" ? "wav" : "mp3";
  const sampleRate = opts && opts.sampleRate ? opts.sampleRate : undefined;
  const precision = _pickFirst(opts && opts.precision, "").toUpperCase();
  const title = _trim(opts && opts.title);
  const useHd = opts && typeof opts.useHd !== "undefined" ? _boolish(opts.useHd, false) : undefined;
  const traceId = _trim(opts && opts.traceId);
  const token = _getToken();
  const timeoutMs = _requestTimeoutMs();

  if (!token){
    return { ok: false, retryable: false, reason: "missing_token", message: "Missing RESEMBLE_API_TOKEN/RESEMBLE_API_KEY", status: 0, elapsedMs: Date.now() - started };
  }
  if (!text){
    return { ok: false, retryable: false, reason: "missing_text", message: "Missing text", status: 0, elapsedMs: Date.now() - started };
  }
  if (!voiceUuid){
    return { ok: false, retryable: false, reason: "missing_voice", message: "Missing voiceUuid / RESEMBLE_VOICE_UUID", status: 0, elapsedMs: Date.now() - started };
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
    if (resp && (resp.status === 401 || resp.status === 403)) {
      authMode = "raw";
      resp = await _callSynthesize(payload, token, traceId, timeoutMs, authMode);
    }
    if (resp && (resp.status === 401 || resp.status === 403)) {
      authMode = "token";
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
      authMode,
      providerEndpoint: RESEMBLE_SYNTH_URL
    };
  }

  const status = resp && resp.status ? resp.status : 0;
  const json = _parseJson(resp && resp.text ? resp.text : "");

  if (!_providerSucceeded(status, json)){
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
      authMode,
      providerEndpoint: RESEMBLE_SYNTH_URL,
      voiceUuid
    };
  }

  const env = _extractAudioEnvelope(json);
  let buf = null;
  if (env.audio_content){
    try{
      buf = Buffer.from(String(env.audio_content), "base64");
    }catch(e){
      return {
        ok: false,
        retryable: false,
        reason: "base64_decode_failed",
        message: _str(e && e.message ? e.message : e),
        status,
        elapsedMs: Date.now() - started,
        issues: env.issues,
        requestId: env.request_id,
        authMode,
        providerEndpoint: RESEMBLE_SYNTH_URL,
        voiceUuid
      };
    }
  } else if (env.audio_src){
    try{
      const dl = await _downloadBuffer(String(env.audio_src), timeoutMs);
      if (!dl || dl.status < 200 || dl.status >= 300 || !Buffer.isBuffer(dl.buffer) || dl.buffer.length < 16){
        return {
          ok: false,
          retryable: true,
          reason: "audio_src_download_failed",
          message: "Provider returned audio_src but the audio could not be downloaded.",
          status: dl && dl.status ? dl.status : status,
          elapsedMs: Date.now() - started,
          issues: env.issues,
          requestId: env.request_id,
          authMode,
          providerEndpoint: RESEMBLE_SYNTH_URL,
          voiceUuid
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
        issues: env.issues,
        requestId: env.request_id,
        authMode,
        providerEndpoint: RESEMBLE_SYNTH_URL,
        voiceUuid
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
      issues: env.issues,
      requestId: env.request_id,
      authMode,
      providerEndpoint: RESEMBLE_SYNTH_URL,
      voiceUuid
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
      issues: env.issues,
      requestId: env.request_id,
      authMode,
      providerEndpoint: RESEMBLE_SYNTH_URL,
      voiceUuid
    };
  }

  return {
    ok: true,
    buffer: buf,
    mimeType: _resolveMime(buf, env.output_format || outputFormat),
    elapsedMs: Date.now() - started,
    duration: env.duration,
    synthDuration: env.synth_duration,
    sampleRate: env.sample_rate,
    outputFormat: env.output_format || outputFormat,
    issues: env.issues,
    requestId: env.request_id,
    providerStatus: status,
    authMode,
    providerEndpoint: RESEMBLE_SYNTH_URL,
    voiceUuid
  };
}

module.exports = { synthesize };
