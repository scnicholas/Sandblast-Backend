"use strict";

function s(v){ return (v==null) ? "" : String(v); }
function b(v, def=false){
  const x = s(v).trim().toLowerCase();
  if(!x) return def;
  return (x==="1"||x==="true"||x==="yes"||x==="y"||x==="on");
}
function n(v, def){
  const x = parseInt(s(v||"").trim(),10);
  return Number.isFinite(x) ? x : def;
}

function getTtsConfig(env=process.env){
  const provider = (s(env.TTS_PROVIDER || env.SB_TTS_PROVIDER || "resemble").trim().toLowerCase());
  const allowFallbacks = b(env.TTS_ALLOW_FALLBACKS, false);
  const sovereignMode = b(env.TTS_SOVEREIGN_MODE, true);

  const maxInflight = n(env.TTS_MAX_INFLIGHT, 2);
  const vendorTimeoutMs = n(env.TTS_VENDOR_TIMEOUT_MS, 12000);
  const handlerTimeoutMs = n(env.TTS_HANDLER_TIMEOUT_MS, 14000);
  const breakerOpenMs = n(env.TTS_BREAKER_OPEN_MS, 60000);
  const breakerFailThreshold = n(env.TTS_BREAKER_FAIL_THRESHOLD, 3);
  const breakerWindowMs = n(env.TTS_BREAKER_WINDOW_MS, 120000);

  const cacheEnabled = b(env.TTS_CACHE_ENABLED, true);
  const cacheMaxItems = n(env.TTS_CACHE_MAX_ITEMS, 200);
  const cacheTtlMs = n(env.TTS_CACHE_TTL_MS, 24*60*60*1000);
  const cacheMaxTextChars = n(env.TTS_CACHE_MAX_TEXT_CHARS, 800);

  const maxTextChars = n(env.TTS_MAX_TEXT_CHARS, 2000);
  const normalizeWhitespace = b(env.TTS_NORMALIZE_WHITESPACE, true);
  const normalizeYears = b(env.TTS_NORMALIZE_YEARS, true);
  const yearStyle = s(env.TTS_YEAR_STYLE || "spoken").trim().toLowerCase() || "spoken";

  const resembleToken = s(env.RESEMBLE_API_KEY || env.RESEMBLE_API_TOKEN || "");
  const resembleProject = s(env.RESEMBLE_PROJECT_UUID || "");
  const resembleVoice = s(env.RESEMBLE_VOICE_UUID || env.SBNYX_RESEMBLE_VOICE_UUID || env.SB_RESEMBLE_VOICE_UUID || "");

  const resembleStreamUrl = s(env.RESEMBLE_STREAM_URL || "https://f.cluster.resemble.ai/stream");
  const resembleModel = s(env.RESEMBLE_MODEL || "chatterbox-turbo");
  const resembleOutputFormat = s(env.RESEMBLE_OUTPUT_FORMAT || "wav");
  const resemblePrecision = s(env.RESEMBLE_PRECISION || "PCM_16");
  const resembleSampleRate = s(env.RESEMBLE_SAMPLE_RATE || "");

  return {
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

    resemble: {
      token: resembleToken,
      project_uuid: resembleProject,
      voice_uuid: resembleVoice,
      stream_url: resembleStreamUrl,
      model: resembleModel,
      output_format: resembleOutputFormat,
      precision: resemblePrecision,
      sample_rate: resembleSampleRate,
    }
  };
}

function validateConfig(cfg){
  const issues = [];
  const p = (cfg && cfg.provider) || "";
  if(p !== "resemble"){
    issues.push({ code:"PROVIDER_FORBIDDEN", detail:`provider '${p}' not allowed in this build` });
  }
  const r = cfg && cfg.resemble;
  if(!r || !r.token) issues.push({ code:"RESEMBLE_TOKEN_MISSING", detail:"RESEMBLE_API_KEY/RESEMBLE_API_TOKEN is missing" });
  if(!r || !r.voice_uuid) issues.push({ code:"RESEMBLE_VOICE_UUID_MISSING", detail:"RESEMBLE_VOICE_UUID is missing" });
  if(!r || !r.project_uuid) issues.push({ code:"RESEMBLE_PROJECT_UUID_MISSING", detail:"RESEMBLE_PROJECT_UUID is missing (optional but recommended)" });
  return issues;
}

module.exports = { getTtsConfig, validateConfig };
