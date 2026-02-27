"use strict";

/**
 * Utils/env.js
 *
 * Centralized environment validation + normalization.
 * Safe defaults. No secret leakage.
 * Frozen config object.
 *
 * Usage:
 *   const { config } = require("./env");
 *   config.ELEVENLABS_API_KEY
 */

function clampInt(val, fallback, min, max) {
  const n = parseInt(String(val || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function num01(val, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function bool(val, fallback) {
  const s = String(val || "").toLowerCase().trim();
  if (!s) return fallback;
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return fallback;
}

function required(name) {
  const v = String(process.env[name] || "").trim();
  return v || null;
}

function optional(name, fallback) {
  const v = String(process.env[name] || "").trim();
  return v || fallback;
}

const config = {
  // ===== Core ElevenLabs =====
  ELEVENLABS_API_KEY: required("ELEVENLABS_API_KEY"),
  NYX_VOICE_ID: required("NYX_VOICE_ID") ||
                required("ELEVENLABS_VOICE_ID"),

  ELEVENLABS_HOST: optional("ELEVENLABS_HOST", "api.elevenlabs.io"),
  ELEVENLABS_MODEL_ID: optional("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),

  // ===== TTS Performance =====
  ELEVENLABS_TTS_TIMEOUT_MS: clampInt(
    process.env.ELEVENLABS_TTS_TIMEOUT_MS,
    15000,
    3000,
    45000
  ),

  ELEVENLABS_TTS_RETRY_ONCE: bool(
    process.env.ELEVENLABS_TTS_RETRY_ONCE,
    true
  ),

  ELEVENLABS_TTS_MAX_CHARS: clampInt(
    process.env.ELEVENLABS_TTS_MAX_CHARS,
    1200,
    200,
    6000
  ),

  // ===== STT Performance =====
  ELEVENLABS_STT_TIMEOUT_MS: clampInt(
    process.env.ELEVENLABS_STT_TIMEOUT_MS,
    12000,
    3000,
    45000
  ),

  ELEVENLABS_STT_RETRY_ONCE: bool(
    process.env.ELEVENLABS_STT_RETRY_ONCE,
    true
  ),

  ELEVENLABS_STT_MAX_BYTES: clampInt(
    process.env.ELEVENLABS_STT_MAX_BYTES,
    8000000,
    250000,
    25000000
  ),

  // ===== Voice Tuning (0–1) =====
  NYX_VOICE_STABILITY: num01(
    process.env.NYX_VOICE_STABILITY,
    0.45
  ),

  NYX_VOICE_SIMILARITY: num01(
    process.env.NYX_VOICE_SIMILARITY,
    0.85
  ),

  NYX_VOICE_STYLE: num01(
    process.env.NYX_VOICE_STYLE,
    0.15
  ),

  NYX_VOICE_SPEAKER_BOOST: bool(
    process.env.NYX_VOICE_SPEAKER_BOOST,
    true
  ),

  // ===== App Controls =====
  NODE_ENV: optional("NODE_ENV", "development"),
  STRICT_ENV: bool(process.env.STRICT_ENV, false),
};

// ===== Validation Layer =====

const errors = [];

if (!config.ELEVENLABS_API_KEY)
  errors.push("Missing ELEVENLABS_API_KEY");

if (!config.NYX_VOICE_ID)
  errors.push("Missing NYX_VOICE_ID (or ELEVENLABS_VOICE_ID)");

if (config.STRICT_ENV && errors.length) {
  console.error("ENV VALIDATION FAILED:");
  errors.forEach(e => console.error(" -", e));
  process.exit(1);
}

Object.freeze(config);

// ===== Safe Health Snapshot (no secrets) =====

function getSafeSnapshot() {
  return {
    elevenlabsConfigured: !!(config.ELEVENLABS_API_KEY && config.NYX_VOICE_ID),
    host: config.ELEVENLABS_HOST,
    model: config.ELEVENLABS_MODEL_ID,
    ttsTimeoutMs: config.ELEVENLABS_TTS_TIMEOUT_MS,
    sttTimeoutMs: config.ELEVENLABS_STT_TIMEOUT_MS,
    ttsMaxChars: config.ELEVENLABS_TTS_MAX_CHARS,
    sttMaxBytes: config.ELEVENLABS_STT_MAX_BYTES,
    retryTts: config.ELEVENLABS_TTS_RETRY_ONCE,
    retryStt: config.ELEVENLABS_STT_RETRY_ONCE,
    nodeEnv: config.NODE_ENV,
  };
}

module.exports = {
  config,
  getSafeSnapshot,
};
