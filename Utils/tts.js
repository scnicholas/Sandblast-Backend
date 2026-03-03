\
"use strict";

/**
 * Utils/TTS.js — Resemble-first hardened TTS handler (Nyx/Nix)
 *
 * Goals
 * - Resemble is PRIMARY and required in production mode.
 * - ElevenLabs is DISABLED by default (explicit opt-in only).
 * - Deterministic behavior: never "silent fallback" to another vendor.
 * - Observable: returns X-SB-* headers for trace, provider, timing, bytes.
 *
 * Inputs (req.body JSON)
 *   { text: string, voiceId?: string, format?: "mp3"|"wav", rate?: number, pitch?: number, meta?: object }
 *
 * Output
 *   - audio/* stream by default
 *   - if ?json=1 then { ok, provider, mimeType, base64, elapsedMs, traceId }
 */

const crypto = require("crypto");

function nowMs() { return Date.now(); }

function makeTraceId() {
  return crypto.randomBytes(8).toString("hex");
}

function safeJson(res, status, payload, headers = {}) {
  try {
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, String(v)));
    res.status(status).json(payload);
  } catch (_) {
    // last ditch
    try { res.status(500).send("TTS error"); } catch (__) {}
  }
}

function pickProvider() {
  // Hard default to resemble
  return String(process.env.TTS_PROVIDER || "resemble").toLowerCase();
}

function loadResembleProvider() {
  // Support multiple filenames to prevent "no audio" from naming drift.
  const candidates = [
    "./TTSProvidersResemble",
    "./ttsProvidersresemble",
    "./providersResemble",
    "./TTSProvidersResemble.js",
    "./ttsProvidersresemble.js",
    "./providersResemble.js"
  ];
  let lastErr = null;
  for (const c of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(c);
      const synth = (mod && mod.synthesize) || (mod && mod.default && mod.default.synthesize);
      if (typeof synth === "function") return { synthesize: synth, modulePath: c };
    } catch (e) {
      lastErr = e;
    }
  }
  const err = new Error("Resemble provider module not found in candidates: " + candidates.join(", "));
  err.cause = lastErr;
  throw err;
}

let _resembleProvider;
function getResembleProvider() {
  if (_resembleProvider) return _resembleProvider;
  _resembleProvider = loadResembleProvider();
  return _resembleProvider;
}

function isElevenEnabled() {
  return String(process.env.SB_TTS_ENABLE_ELEVENLABS || "false").toLowerCase() === "true";
}

// Placeholder: we intentionally do NOT load Eleven by default.
// If you later re-enable, do it behind isElevenEnabled() and no silent fallback.

async function handleTts(req, res) {
  const traceId = (req.headers["x-sb-trace"] && String(req.headers["x-sb-trace"]).slice(0, 64)) || makeTraceId();
  const t0 = nowMs();

  // Basic hardening
  const body = (req && req.body) || {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
  const format = (typeof body.format === "string" ? body.format : (process.env.RESEMBLE_OUTPUT_FORMAT || "mp3")).toLowerCase();

  const wantJson = (String(req.query.json || req.query.format || "") === "1") || (String(req.query.json || "").toLowerCase() === "true");

  // Headers for observability
  res.setHeader("X-SB-TraceId", traceId);
  res.setHeader("X-SB-TTS-Format", format);

  if (!text) {
    return safeJson(res, 400, { ok: false, error: "Missing text", traceId }, { "X-SB-TTS-Provider": "none" });
  }
  if (text.length > 3000) {
    return safeJson(res, 413, { ok: false, error: "Text too long", traceId }, { "X-SB-TTS-Provider": "none" });
  }

  const provider = pickProvider();
  if (provider !== "resemble") {
    // We only support resemble as primary right now; forbid accidental misconfig.
    return safeJson(res, 400, {
      ok: false,
      error: `TTS_PROVIDER must be 'resemble' right now (got '${provider}')`,
      traceId
    }, { "X-SB-TTS-Provider": provider });
  }

  // Ensure Eleven isn't silently in play
  if (isElevenEnabled()) {
    res.setHeader("X-SB-Warn", "SB_TTS_ENABLE_ELEVENLABS=true is set, but Eleven fallback is disabled in this build.");
  }

  let resemble;
  try {
    resemble = getResembleProvider();
  } catch (e) {
    const elapsedMs = nowMs() - t0;
    return safeJson(res, 500, {
      ok: false,
      error: "Resemble provider load failed",
      detail: e.message,
      traceId,
      elapsedMs
    }, { "X-SB-TTS-Provider": "resemble", "X-SB-TTS-ElapsedMs": elapsedMs });
  }

  try {
    const out = await resemble.synthesize({
      text,
      voiceId: voiceId || process.env.RESEMBLE_VOICE_UUID || process.env.RESEMBLE_VOICE_ID || "",
      format,
      traceId
    });

    const elapsedMs = nowMs() - t0;

    // out contract: { ok, buffer, mimeType, elapsedMs, reason?, retryable? }
    const ok = !!(out && out.ok && out.buffer && Buffer.isBuffer(out.buffer) && out.buffer.length > 1024);
    const mimeType = (out && out.mimeType) || (format === "wav" ? "audio/wav" : "audio/mpeg");
    const bytes = out && out.buffer ? out.buffer.length : 0;

    res.setHeader("X-SB-TTS-Provider", "resemble");
    res.setHeader("X-SB-TTS-ElapsedMs", String(elapsedMs));
    res.setHeader("X-SB-TTS-Bytes", String(bytes));

    if (!ok) {
      return safeJson(res, 502, {
        ok: false,
        error: "Resemble synthesis failed or returned empty audio",
        reason: (out && out.reason) || "empty_or_invalid_audio",
        retryable: !!(out && out.retryable),
        traceId,
        elapsedMs,
        bytes
      });
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", mimeType);

    if (wantJson) {
      return safeJson(res, 200, {
        ok: true,
        provider: "resemble",
        mimeType,
        base64: out.buffer.toString("base64"),
        elapsedMs,
        traceId,
        bytes
      });
    }

    res.status(200).send(out.buffer);
  } catch (e) {
    const elapsedMs = nowMs() - t0;
    return safeJson(res, 502, {
      ok: false,
      error: "Resemble request failed",
      detail: e.message,
      traceId,
      elapsedMs
    }, { "X-SB-TTS-Provider": "resemble", "X-SB-TTS-ElapsedMs": elapsedMs });
  }
}

module.exports = { handleTts };
