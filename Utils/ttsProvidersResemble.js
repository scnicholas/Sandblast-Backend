"use strict";

/**
 * TTSProvidersResemble.js
 * Resemble AI synchronous TTS provider.
 *
 * Exports: { synthesize(opts) }
 *
 * Dependency-free (uses global fetch if available; falls back to https).
 * Returns a Buffer of audio bytes decoded from Resemble's base64 payload.
 *
 * API docs: POST https://f.cluster.resemble.ai/synthesize citeturn1view0
 */

const https = require("https");

const RESEMBLE_SYNTH_URL = "https://f.cluster.resemble.ai/synthesize";

function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _pickFirst(...vals){
  for (const v of vals){
    const t = _trim(v);
    if (t) return t;
  }
  return "";
}
function _lower(s){ return _trim(s).toLowerCase(); }

function _mimeFor(fmt){
  fmt = _lower(fmt);
  if (fmt === "mp3") return "audio/mpeg";
  return "audio/wav";
}

function _getToken(){
  return _pickFirst(process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY, "");
}

function _defaultModel(){
  // Turbo supports lower latency + paralinguistic tags. citeturn1view0
  return _pickFirst(process.env.RESEMBLE_TTS_MODEL, "chatterbox-turbo");
}

function _postJsonViaHttps(url, headers, bodyObj){
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
          "Content-Length": Buffer.byteLength(body),
          ...headers
        }
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
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function _postJson(url, headers, bodyObj){
  if (typeof fetch === "function"){
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(bodyObj)
    });
    const text = await res.text();
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text };
  }
  return _postJsonViaHttps(url, headers, bodyObj);
}

async function synthesize(opts){
  const started = Date.now();

  const text = _trim(opts && opts.text);
  const voiceUuid = _trim(opts && opts.voiceUuid);
  const projectUuid = _trim(opts && opts.projectUuid);
  const outputFormat = _lower(_pickFirst(opts && opts.outputFormat, "wav"));
  const sampleRate = opts && opts.sampleRate ? opts.sampleRate : undefined;
  const traceId = _trim(opts && opts.traceId);
  const token = _getToken();

  if (!token){
    return { ok: false, retryable: false, reason: "missing_token", message: "Missing RESEMBLE_API_TOKEN", status: 0 };
  }
  if (!text){
    return { ok: false, retryable: false, reason: "missing_text", message: "Missing text", status: 0 };
  }
  if (!voiceUuid){
    return { ok: false, retryable: false, reason: "missing_voice", message: "Missing voiceUuid", status: 0 };
  }

  const payload = {
    voice_uuid: voiceUuid,           // API expects snake_case. citeturn1view0
    data: text,
    output_format: (outputFormat === "mp3" ? "mp3" : "wav"),
    model: _defaultModel()
  };

  if (projectUuid) payload.project_uuid = projectUuid;
  if (sampleRate) payload.sample_rate = sampleRate;

  const headers = { Authorization: `Bearer ${token}` };
  if (traceId) headers["X-SB-Trace-ID"] = traceId;

  let resp;
  try{
    resp = await _postJson(RESEMBLE_SYNTH_URL, headers, payload);
  }catch(e){
    return {
      ok: false,
      retryable: true,
      reason: "network_error",
      message: _str(e && e.message ? e.message : e),
      status: 0,
      elapsedMs: Date.now() - started
    };
  }

  const status = resp.status || 0;

  let json;
  try{ json = JSON.parse(resp.text || "{}"); }catch(_){ json = null; }

  if (status !== 200 || !json || json.success !== true || !json.audio_content){
    const retryable = (status >= 500) || status === 429 || status === 408 || status === 0;
    const msg = json && (json.message || json.error) ? (json.message || json.error) : (resp.text || "Resemble synthesis failed.");
    return {
      ok: false,
      retryable,
      reason: "http_error",
      message: _str(msg).slice(0, 900),
      status,
      elapsedMs: Date.now() - started
    };
  }

  let buf;
  try{ buf = Buffer.from(String(json.audio_content), "base64"); }
  catch(e){
    return {
      ok: false,
      retryable: false,
      reason: "base64_decode_failed",
      message: _str(e && e.message ? e.message : e),
      status,
      elapsedMs: Date.now() - started
    };
  }

  if (!Buffer.isBuffer(buf) || buf.length < 16){
    return {
      ok: false,
      retryable: true,
      reason: "empty_audio",
      message: "Decoded audio buffer is empty.",
      status,
      elapsedMs: Date.now() - started
    };
  }

  return {
    ok: true,
    buffer: buf,
    mimeType: _mimeFor(outputFormat),
    elapsedMs: Date.now() - started,
    duration: json.duration,
    synthDuration: json.synth_duration,
    sampleRate: json.sample_rate,
    outputFormat: json.output_format
  };
}

module.exports = { synthesize };
