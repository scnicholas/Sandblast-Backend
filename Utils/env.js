"use strict";

/**
 * Utils/env.js
 *
 * Centralized environment validation + normalization.
 * Safe defaults. No secret leakage.
 * Frozen config object.
 *
 * Updated for Resemble TTS / Nyx voice path.
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
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
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
  // ===== Core Provider =====
  TTS_PROVIDER: optional("TTS_PROVIDER", "resemble"),

  // ===== Resemble Auth / Endpoint =====
  RESEMBLE_API_KEY:
    required("RESEMBLE_API_KEY") ||
    required("SB_RESEMBLE_API_KEY") ||
    required("SBNYX_RESEMBLE_API_KEY"),

  RESEMBLE_HOST: optional("RESEMBLE_HOST", "app.resemble.ai"),
  RESEMBLE_API_BASE_URL: optional(
    "RESEMBLE_API_BASE_URL",
    optional("RESEMBLE_BASE_URL", "https://app.resemble.ai/api/v2")
  ),

  // ===== Voice / Project Resolution =====
  RESEMBLE_VOICE_UUID:
    required("RESEMBLE_VOICE_UUID") ||
    required("SB_RESEMBLE_VOICE_UUID") ||
    required("SBNYX_RESEMBLE_VOICE_UUID") ||
    required("RESEMBLE_VOICE_ID") ||
    required("NYX_VOICE_ID") ||
    required("TTS_VOICE_ID"),

  RESEMBLE_VOICE_NAME:
    optional("RESEMBLE_VOICE_NAME",
      optional("MIXER_VOICE_NAME",
        optional("NYX_VOICE_NAME",
          optional("TTS_VOICE_NAME", "Nyx")
        )
      )
    ),

  RESEMBLE_PROJECT_UUID:
    required("RESEMBLE_PROJECT_UUID") ||
    required("SB_RESEMBLE_PROJECT_UUID") ||
    required("SBNYX_RESEMBLE_PROJECT_UUID") ||
    required("TTS_PROJECT_ID"),

  RESEMBLE_USE_PROJECT_UUID: bool(process.env.RESEMBLE_USE_PROJECT_UUID, false),

  // ===== Timeouts / Retry =====
  RESEMBLE_TTS_TIMEOUT_MS: clampInt(
    process.env.RESEMBLE_TTS_TIMEOUT_MS || process.env.TTS_PROVIDER_TIMEOUT_MS,
    15000,
    3000,
    45000
  ),

  RESEMBLE_TTS_RETRY_ONCE: bool(
    process.env.RESEMBLE_TTS_RETRY_ONCE ?? process.env.TTS_RETRY_ONCE,
    true
  ),

  RESEMBLE_TTS_MAX_CHARS: clampInt(
    process.env.RESEMBLE_TTS_MAX_CHARS || process.env.TTS_MAX_CHARS,
    2200,
    200,
    12000
  ),

  // ===== Output / Transport =====
  RESEMBLE_OUTPUT_FORMAT: optional("RESEMBLE_OUTPUT_FORMAT", "mp3"),
  RESEMBLE_SAMPLE_RATE: optional("RESEMBLE_SAMPLE_RATE", "22050"),
  RESEMBLE_PRECISION: optional("RESEMBLE_PRECISION", "PCM_16"),
  RESEMBLE_USE_HD: bool(process.env.RESEMBLE_USE_HD, false),

  // ===== Voice Tuning (generic Nyx tuning, retained for higher layers) =====
  NYX_VOICE_STABILITY: num01(process.env.NYX_VOICE_STABILITY, 0.45),
  NYX_VOICE_SIMILARITY: num01(process.env.NYX_VOICE_SIMILARITY, 0.85),
  NYX_VOICE_STYLE: num01(process.env.NYX_VOICE_STYLE, 0.15),
  NYX_VOICE_SPEAKER_BOOST: bool(process.env.NYX_VOICE_SPEAKER_BOOST, true),

  // ===== App Controls =====
  NODE_ENV: optional("NODE_ENV", "development"),
  STRICT_ENV: bool(process.env.STRICT_ENV, false),
};

const errors = [];

if (String(config.TTS_PROVIDER || "").toLowerCase() === "resemble") {
  if (!config.RESEMBLE_API_KEY) errors.push("Missing RESEMBLE_API_KEY");
  if (!config.RESEMBLE_VOICE_UUID) {
    errors.push("Missing RESEMBLE_VOICE_UUID (or alias: SB_RESEMBLE_VOICE_UUID / SBNYX_RESEMBLE_VOICE_UUID / RESEMBLE_VOICE_ID / NYX_VOICE_ID / TTS_VOICE_ID)");
  }
  if (config.RESEMBLE_USE_PROJECT_UUID && !config.RESEMBLE_PROJECT_UUID) {
    errors.push("Missing RESEMBLE_PROJECT_UUID while RESEMBLE_USE_PROJECT_UUID=true");
  }
}

if (config.STRICT_ENV && errors.length) {
  console.error("ENV VALIDATION FAILED:");
  errors.forEach((e) => console.error(" -", e));
  process.exit(1);
}

Object.freeze(config);

function getSafeSnapshot() {
  return {
    ttsProvider: config.TTS_PROVIDER,
    resembleConfigured: !!(config.RESEMBLE_API_KEY && config.RESEMBLE_VOICE_UUID),
    resembleHost: config.RESEMBLE_HOST,
    resembleApiBaseUrl: config.RESEMBLE_API_BASE_URL,
    resembleVoiceConfigured: !!config.RESEMBLE_VOICE_UUID,
    resembleProjectConfigured: !!config.RESEMBLE_PROJECT_UUID,
    useProjectUuid: !!config.RESEMBLE_USE_PROJECT_UUID,
    outputFormat: config.RESEMBLE_OUTPUT_FORMAT,
    sampleRate: config.RESEMBLE_SAMPLE_RATE,
    precision: config.RESEMBLE_PRECISION,
    useHd: !!config.RESEMBLE_USE_HD,
    ttsTimeoutMs: config.RESEMBLE_TTS_TIMEOUT_MS,
    ttsMaxChars: config.RESEMBLE_TTS_MAX_CHARS,
    retryTts: config.RESEMBLE_TTS_RETRY_ONCE,
    nodeEnv: config.NODE_ENV,
  };
}

module.exports = {
  config,
  getSafeSnapshot,
};
