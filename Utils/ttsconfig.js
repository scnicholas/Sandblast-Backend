"use strict";

const VERSION = "ttsconfig v2.0.0 COHESION-HARDENED";

function s(v){ return (v == null) ? "" : String(v); }
function b(v, def = false){
  const x = s(v).trim().toLowerCase();
  if(!x) return def;
  return (x === "1" || x === "true" || x === "yes" || x === "y" || x === "on");
}
function n(v, def){
  const x = parseInt(s(v || "").trim(), 10);
  return Number.isFinite(x) ? x : def;
}
function clampInt(v, min, max, fallback){
  const x = n(v, fallback);
  return Math.min(max, Math.max(min, x));
}
function safeObj(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

function getTtsConfig(env = process.env){
  const provider = s(env.TTS_PROVIDER || env.SB_TTS_PROVIDER || "resemble").trim().toLowerCase();
  const allowFallbacks = b(env.TTS_ALLOW_FALLBACKS, false);
  const sovereignMode = b(env.TTS_SOVEREIGN_MODE, true);

  const maxInflight = clampInt(env.TTS_MAX_INFLIGHT, 1, 16, 2);
  const vendorTimeoutMs = clampInt(env.TTS_VENDOR_TIMEOUT_MS, 1000, 60000, 12000);
  const handlerTimeoutMs = clampInt(env.TTS_HANDLER_TIMEOUT_MS, 1000, 65000, 14000);
  const breakerOpenMs = clampInt(env.TTS_BREAKER_OPEN_MS, 5000, 300000, 60000);
  const breakerFailThreshold = clampInt(env.TTS_BREAKER_FAIL_THRESHOLD, 1, 20, 3);
  const breakerWindowMs = clampInt(env.TTS_BREAKER_WINDOW_MS, 10000, 600000, 120000);

  const cacheEnabled = b(env.TTS_CACHE_ENABLED, true);
  const cacheMaxItems = clampInt(env.TTS_CACHE_MAX_ITEMS, 1, 5000, 200);
  const cacheTtlMs = clampInt(env.TTS_CACHE_TTL_MS, 1000, 7 * 24 * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
  const cacheMaxTextChars = clampInt(env.TTS_CACHE_MAX_TEXT_CHARS, 64, 4000, 800);

  const maxTextChars = clampInt(env.TTS_MAX_TEXT_CHARS, 64, 12000, 2000);
  const normalizeWhitespace = b(env.TTS_NORMALIZE_WHITESPACE, true);
  const normalizeYears = b(env.TTS_NORMALIZE_YEARS, true);
  const yearStyle = s(env.TTS_YEAR_STYLE || "spoken").trim().toLowerCase() || "spoken";
  const englishNormalization = b(env.TTS_ENGLISH_NORMALIZATION, true);
  const acronymGuard = b(env.TTS_ACRONYM_GUARD, true);

  const resembleToken = s(env.RESEMBLE_API_KEY || env.RESEMBLE_API_TOKEN || "");
  const resembleProject = s(env.RESEMBLE_PROJECT_UUID || "");
  const resembleVoice = s(env.RESEMBLE_VOICE_UUID || env.SBNYX_RESEMBLE_VOICE_UUID || env.SB_RESEMBLE_VOICE_UUID || "");
  const resembleStreamUrl = s(env.RESEMBLE_STREAM_URL || "https://f.cluster.resemble.ai/stream");
  const resembleModel = s(env.RESEMBLE_MODEL || "chatterbox-turbo");
  const resembleOutputFormat = s(env.RESEMBLE_OUTPUT_FORMAT || "wav");
  const resemblePrecision = s(env.RESEMBLE_PRECISION || "PCM_16");
  const resembleSampleRate = s(env.RESEMBLE_SAMPLE_RATE || "");

  return {
    version: VERSION,
    provider,
    allowFallbacks,
    sovereignMode,
    maxInflight,
    vendorTimeoutMs,
    handlerTimeoutMs,
    breakerOpenMs,
    breakerFailThreshold,
    breakerWindowMs,
    cacheEnabled,
    cacheMaxItems,
    cacheTtlMs,
    cacheMaxTextChars,
    maxTextChars,
    normalizeWhitespace,
    normalizeYears,
    yearStyle,
    englishNormalization,
    acronymGuard,
    resemble: {
      token: resembleToken,
      project_uuid: resembleProject,
      voice_uuid: resembleVoice,
      stream_url: resembleStreamUrl,
      model: resembleModel,
      output_format: resembleOutputFormat,
      precision: resemblePrecision,
      sample_rate: resembleSampleRate
    }
  };
}

function deriveTtsRuntimeSettings(route = {}, cfg = getTtsConfig()){
  const safeRoute = safeObj(route);
  const flags = safeObj(safeRoute.supportFlags);
  const expression = safeObj(safeRoute.expressionContract);

  return {
    pacingBias: s(expression.pacingBias || safeRoute.downstream?.tts?.pacingBias || "steady") || "steady",
    caution: !!(flags.needsContainment || flags.needsStabilization || safeRoute.downstream?.tts?.caution),
    suppressExpressiveEscalation: !!(flags.highDistress || safeRoute.downstream?.tts?.suppressExpressiveEscalation),
    tone: s(safeRoute.deliveryTone || safeRoute.downstream?.tts?.tone || "neutral_warm") || "neutral_warm",
    normalizeWhitespace: !!cfg.normalizeWhitespace,
    normalizeYears: !!cfg.normalizeYears,
    yearStyle: cfg.yearStyle,
    englishNormalization: !!cfg.englishNormalization,
    acronymGuard: !!cfg.acronymGuard,
    maxTextChars: cfg.maxTextChars
  };
}

function validateConfig(cfg){
  const issues = [];
  const p = (cfg && cfg.provider) || "";
  if(p !== "resemble"){
    issues.push({ code: "PROVIDER_FORBIDDEN", detail: `provider '${p}' not allowed in this build` });
  }
  const r = cfg && cfg.resemble;
  if(!r || !r.token) issues.push({ code: "RESEMBLE_TOKEN_MISSING", detail: "RESEMBLE_API_KEY/RESEMBLE_API_TOKEN is missing" });
  if(!r || !r.voice_uuid) issues.push({ code: "RESEMBLE_VOICE_UUID_MISSING", detail: "RESEMBLE_VOICE_UUID is missing" });
  if(!r || !r.project_uuid) issues.push({ code: "RESEMBLE_PROJECT_UUID_MISSING", detail: "RESEMBLE_PROJECT_UUID is missing (optional but recommended)" });
  if(cfg && cfg.handlerTimeoutMs < cfg.vendorTimeoutMs){
    issues.push({ code: "HANDLER_TIMEOUT_TOO_LOW", detail: "TTS_HANDLER_TIMEOUT_MS should be >= TTS_VENDOR_TIMEOUT_MS" });
  }
  if(cfg && cfg.cacheMaxTextChars > cfg.maxTextChars){
    issues.push({ code: "CACHE_TEXT_LIMIT_EXCEEDS_MAX", detail: "TTS_CACHE_MAX_TEXT_CHARS should not exceed TTS_MAX_TEXT_CHARS" });
  }
  return issues;
}

module.exports = {
  VERSION,
  getTtsConfig,
  deriveTtsRuntimeSettings,
  validateConfig
};
