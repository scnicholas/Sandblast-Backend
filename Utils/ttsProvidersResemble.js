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

const VERSION = "ttsProvidersResemble v2.0.0 CONTRACT-NORMALIZED";

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function normalizeMimeType(raw, audioUrl, audioBase64) {
  const m = cleanText(raw).toLowerCase();
  if (m) return m;
  const u = cleanText(audioUrl).toLowerCase();
  if (u.endsWith(".mp3")) return "audio/mpeg";
  if (u.endsWith(".wav")) return "audio/wav";
  if (u.endsWith(".ogg")) return "audio/ogg";
  if (u.endsWith(".webm")) return "audio/webm";
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
  const audioBase64 = cleanText(extractNested(src, [
    ["audioBase64"], ["base64"], ["audio_base64"], ["audio", "base64"], ["data", "base64"],
    ["payload", "audioBase64"], ["payload", "base64"], ["result", "audioBase64"]
  ]));
  const audioUrl = cleanText(extractNested(src, [
    ["audioUrl"], ["url"], ["audio_url"], ["audio", "url"], ["data", "url"],
    ["payload", "audioUrl"], ["payload", "url"], ["result", "audioUrl"]
  ]));
  const mimeType = normalizeMimeType(
    extractNested(src, [["mimeType"], ["mime_type"], ["contentType"], ["audio", "mimeType"], ["data", "mimeType"]]),
    audioUrl,
    audioBase64
  );
  const format = cleanText(extractNested(src, [
    ["format"], ["audioFormat"], ["audio", "format"], ["data", "format"]
  ])) || (mimeType === "audio/mpeg" ? "mp3" : "");
  const durationMs = Number(extractNested(src, [
    ["durationMs"], ["duration_ms"], ["audio", "durationMs"], ["data", "durationMs"]
  ]) || 0) || 0;
  const provider = cleanText(src.provider || src.engine || src.vendor || "resemble") || "resemble";
  const textSpoken = cleanText(
    (inputOpts && (inputOpts.textSpeak || inputOpts.text || inputOpts.plainText || inputOpts.textDisplay)) ||
    src.textSpoken || src.text || src.plainText || src.textDisplay || ""
  );
  const playable = !!(audioUrl || audioBase64);

  return {
    ok: playable,
    playable,
    provider,
    textSpoken,
    audioUrl,
    audioBase64,
    mimeType,
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

  const normalized = normalizeSynthesisResult(raw, opts || {});
  if (!normalized.playable) {
    const err = new Error("TTS returned no playable audio payload.");
    err.code = "TTS_EMPTY_AUDIO";
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
