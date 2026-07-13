"use strict";

/**
 * ttsProvidersResemble.js
 *
 * PURPOSE
 * - Provide one stable synthesis contract regardless of the underlying TTS runtime.
 * - Normalize provider-specific payload shapes into a predictable, playback-ready envelope.
 * - Fail loudly when a synth call returns no playable audio instead of silently passing an unusable object downstream.
 */

let tts = null;

try { tts = require("./tts_consolidated"); } catch (_e) { tts = null; }
if (!tts) {
  try { tts = require("./tts"); } catch (_e) { tts = null; }
}

const VERSION = "ttsProvidersResemble v2.2.1 LIVE-ROUTE-MOUNT-COMPAT";

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function coerceBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    const clean = value.trim().replace(/^data:audio\/[^;]+;base64,/i, "").replace(/\s+/g, "");
    if (clean.length > 32 && /^[A-Za-z0-9+/=]+$/.test(clean)) {
      try {
        const buf = Buffer.from(clean, "base64");
        return buf.length ? buf : null;
      } catch (_e) { return null; }
    }
    return null;
  }
  if (isObj(value) && value.type === "Buffer" && Array.isArray(value.data)) {
    try { return Buffer.from(value.data); } catch (_e) { return null; }
  }
  return null;
}

function extractBuffer(src) {
  const candidates = [
    src && src.buffer, src && src.audioBuffer, src && src.binary, src && src.audio_content, src && src.audioContent, src && src.audio, src && src.data,
    src && src.payload && src.payload.buffer,
    src && src.payload && src.payload.audioBuffer,
    src && src.payload && src.payload.binary,
    src && src.payload && src.payload.audio,
    src && src.payload && src.payload.audio_content,
    src && src.data && src.data.audio_content,
    src && src.result && src.result.buffer,
    src && src.result && src.result.audioBuffer,
    src && src.result && src.result.audio,
    src && src.result && src.result.audio_content
  ];
  for (const candidate of candidates) {
    const buffer = coerceBuffer(candidate);
    if (buffer && buffer.length) return buffer;
  }
  return null;
}

function normalizeMimeType(raw, audioUrl, audioBase64, buffer, declaredFormat) {
  const m = cleanText(raw).toLowerCase();
  if (m) return m;
  const f = cleanText(declaredFormat).toLowerCase();
  if (f === "wav") return "audio/wav";
  if (f === "mp3") return "audio/mpeg";
  if (f === "ogg") return "audio/ogg";
  if (f === "webm") return "audio/webm";
  if (buffer && buffer.length >= 12 && buffer.slice(0, 4).toString("ascii") === "RIFF") return "audio/wav";
  const u = cleanText(audioUrl).toLowerCase();
  if (/\.mp3(?:[?#]|$)/.test(u)) return "audio/mpeg";
  if (/\.wav(?:[?#]|$)/.test(u)) return "audio/wav";
  if (/\.ogg(?:[?#]|$)/.test(u)) return "audio/ogg";
  if (/\.webm(?:[?#]|$)/.test(u)) return "audio/webm";
  if (audioBase64) return "audio/mpeg";
  return "";
}

function extractNested(obj, paths) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const key of path) {
      if (!isObj(cur) && !Array.isArray(cur)) { ok = false; break; }
      cur = cur[key];
      if (cur === undefined || cur === null) { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return "";
}

function normalizeSynthesisResult(raw, inputOpts) {
  const src = isObj(raw) ? raw : {};
  const buffer = extractBuffer(src);
  let audioBase64 = cleanText(extractNested(src, [
    ["audioBase64"], ["base64"], ["audio_base64"], ["audio_content"], ["audioContent"],
    ["audio", "base64"], ["audio", "audio_content"], ["data", "base64"], ["data", "audio_content"],
    ["payload", "audioBase64"], ["payload", "base64"], ["payload", "audio_content"],
    ["result", "audioBase64"], ["result", "audio_content"]
  ])).replace(/^data:audio\/[^;]+;base64,/i, "").replace(/\s+/g, "");
  if (!audioBase64 && buffer && buffer.length) audioBase64 = buffer.toString("base64");

  const audioUrl = cleanText(extractNested(src, [
    ["audioUrl"], ["url"], ["audio_url"], ["audio_src"], ["audio", "url"], ["audio", "audio_src"], ["data", "url"], ["data", "audio_src"],
    ["payload", "audioUrl"], ["payload", "url"], ["payload", "audio_src"], ["result", "audioUrl"], ["result", "audio_src"]
  ]));
  const declaredFormat = extractNested(src, [["output_format"], ["format"], ["audioFormat"], ["audio", "format"], ["data", "output_format"], ["data", "format"]]);
  const mimeType = normalizeMimeType(
    extractNested(src, [["mimeType"], ["mime_type"], ["contentType"], ["content_type"], ["audio", "mimeType"], ["data", "mimeType"]]),
    audioUrl,
    audioBase64,
    buffer,
    declaredFormat
  ) || "audio/mpeg";
  const format = cleanText(declaredFormat) || (mimeType === "audio/mpeg" ? "mp3" : mimeType.replace(/^audio\//, ""));
  const durationMs = Number(extractNested(src, [
    ["durationMs"], ["duration_ms"], ["audio", "durationMs"], ["data", "durationMs"]
  ]) || 0) || 0;
  const provider = cleanText(src.provider || src.engine || src.vendor || "resemble") || "resemble";
  const textSpoken = cleanText(
    (inputOpts && (inputOpts.textSpeak || inputOpts.text || inputOpts.plainText || inputOpts.textDisplay)) ||
    src.textSpoken || src.textSpeak || src.text || src.plainText || src.textDisplay || ""
  );
  const playable = !!(audioUrl || audioBase64 || (buffer && buffer.length));

  return {
    ok: playable,
    playable,
    provider,
    providerStatus: Number(src.providerStatus || src.status || 200) || 200,
    requestId: cleanText(src.requestId || src.id || ""),
    textSpoken,
    textSpeak: textSpoken,
    audioUrl,
    audioBase64,
    buffer: buffer || null,
    audioBuffer: buffer || null,
    binary: buffer || null,
    audio: buffer || audioBase64 || audioUrl || null,
    byteLength: buffer && buffer.length ? buffer.length : 0,
    mimeType,
    mime: mimeType,
    format,
    durationMs,
    chars: textSpoken.length,
    raw: src
  };
}

async function synthesize(opts) {
  if (!tts) throw new Error("No TTS runtime is available.");

  let raw;
  if (typeof tts.generate === "function") {
    raw = await tts.generate((opts && (opts.textSpeak || opts.text || opts.plainText || opts.textDisplay)) || "", opts || {});
  } else if (typeof tts.synthesize === "function") {
    raw = await tts.synthesize(opts || {});
  } else {
    throw new Error("TTS runtime does not expose generate() or synthesize().");
  }

  if (isObj(raw) && raw.ok === false) {
    const message = cleanText(raw.message || raw.detail || raw.reason || raw.error || "TTS synthesis failed.");
    const err = new Error(message);
    err.code = cleanText(raw.code || raw.reason || raw.error || "TTS_PROVIDER_FAILURE");
    err.status = Number(raw.providerStatus || raw.status || 503) || 503;
    err.retryable = !!raw.retryable;
    err.result = raw;
    throw err;
  }

  const normalized = normalizeSynthesisResult(raw, opts || {});
  if (!normalized.playable) {
    const err = new Error("TTS returned no playable audio payload.");
    err.code = "TTS_EMPTY_AUDIO";
    err.status = Number(raw && (raw.providerStatus || raw.status) || 502) || 502;
    err.retryable = true;
    err.result = normalized.raw;
    throw err;
  }
  return normalized;
}

module.exports = {
  VERSION,
  synthesize,
  normalizeSynthesisResult,
  MANUAL_RESEMBLE_CONFIG: tts && tts.MANUAL_RESEMBLE_CONFIG ? tts.MANUAL_RESEMBLE_CONFIG : Object.freeze({})
};
