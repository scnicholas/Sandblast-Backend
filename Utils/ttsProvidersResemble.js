"use strict";

let tts = null;

try { tts = require("./tts_consolidated"); } catch (_e) { tts = null; }
if (!tts) {
  try { tts = require("./tts"); } catch (_e) { tts = null; }
}

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Buffer.isBuffer(v) && v.length) return v;
  }
  return "";
}

function normalizeSynthesisResult(raw, opts) {
  const input = isPlainObject(opts) ? opts : {};
  const textToSpeak = safeStr(input.textSpeak || input.text || input.plainText || input.textDisplay || "").trim();

  if (typeof raw === "string") {
    const looksUrl = /^https?:\/\//i.test(raw);
    const looksDataUri = /^data:audio\//i.test(raw);
    return {
      ok: true,
      provider: "resemble",
      textToSpeak,
      audioUrl: looksUrl ? raw : "",
      url: looksUrl ? raw : "",
      audioBase64: looksDataUri ? raw : "",
      base64: looksDataUri ? raw : "",
      mimeType: looksDataUri ? (raw.slice(5, raw.indexOf(';')) || "audio/mpeg") : "",
      playable: !!raw,
      autoPlay: input.autoPlay !== false,
      raw
    };
  }

  if (Buffer.isBuffer(raw)) {
    const b64 = raw.toString("base64");
    return {
      ok: raw.length > 0,
      provider: "resemble",
      textToSpeak,
      audioBuffer: raw,
      buffer: raw,
      audioBase64: b64 ? `data:audio/mpeg;base64,${b64}` : "",
      base64: b64 ? `data:audio/mpeg;base64,${b64}` : "",
      mimeType: "audio/mpeg",
      bytes: raw.length,
      playable: raw.length > 0,
      autoPlay: input.autoPlay !== false,
      raw
    };
  }

  const obj = isPlainObject(raw) ? { ...raw } : {};
  const url = pickFirst(obj.audioUrl, obj.url, obj.src, obj.fileUrl, obj.streamUrl, obj.hostedUrl);
  const base64 = pickFirst(obj.audioBase64, obj.base64, obj.dataUri, obj.audioDataUri);
  const mimeType = pickFirst(obj.mimeType, obj.contentType, obj.audioMime, obj.format && `audio/${safeStr(obj.format).toLowerCase()}`);
  const audioBuffer = Buffer.isBuffer(obj.audioBuffer) ? obj.audioBuffer : (Buffer.isBuffer(obj.buffer) ? obj.buffer : null);
  const playable = !!(url || base64 || (audioBuffer && audioBuffer.length));

  return {
    ...obj,
    ok: obj.ok !== false && playable,
    provider: pickFirst(obj.provider, obj.vendor, "resemble") || "resemble",
    textToSpeak: pickFirst(obj.textToSpeak, obj.textSpeak, obj.text, textToSpeak),
    audioUrl: url,
    url,
    audioBase64: base64,
    base64,
    audioBuffer: audioBuffer || undefined,
    buffer: audioBuffer || undefined,
    mimeType: mimeType || (/^data:audio\//i.test(base64) ? (base64.slice(5, base64.indexOf(';')) || 'audio/mpeg') : ''),
  };
}

async function synthesize(opts) {
  if (!tts) throw new Error("No TTS runtime is available.");
  const input = isPlainObject(opts) ? { ...opts } : {};
  const text = safeStr(input.textSpeak || input.text || input.plainText || input.textDisplay || "").trim();
  let raw;
  if (typeof tts.generate === "function") {
    raw = await tts.generate(text, input);
  } else if (typeof tts.synthesize === "function") {
    raw = await tts.synthesize({ ...input, textSpeak: text || input.textSpeak, text: text || input.text });
  } else {
    throw new Error("TTS runtime does not expose generate() or synthesize().");
  }

  const out = normalizeSynthesisResult(raw, { ...input, textSpeak: text });
  if (!out.ok) {
    const err = new Error("TTS synthesis returned no playable audio payload.");
    err.ttsResult = out;
    throw err;
  }
  return out;
}

module.exports = {
  synthesize,
  normalizeSynthesisResult,
  MANUAL_RESEMBLE_CONFIG: tts && tts.MANUAL_RESEMBLE_CONFIG ? tts.MANUAL_RESEMBLE_CONFIG : Object.freeze({})
};
