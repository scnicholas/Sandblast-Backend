"use strict";

const { getTtsConfig, validateConfig } = require("./config");
const { routeProvider } = require("./router");
const { safeJson } = require("./util");

function diagTts(req, res){
  const cfg = getTtsConfig(process.env);
  const issues = validateConfig(cfg);
  const route = routeProvider(cfg);

  const envFlags = {
    RESEMBLE_API_KEY: !!(process.env.RESEMBLE_API_KEY || process.env.RESEMBLE_API_TOKEN),
    RESEMBLE_PROJECT_UUID: !!process.env.RESEMBLE_PROJECT_UUID,
    RESEMBLE_VOICE_UUID: !!(process.env.RESEMBLE_VOICE_UUID || process.env.SBNYX_RESEMBLE_VOICE_UUID || process.env.SB_RESEMBLE_VOICE_UUID),
    TTS_PROVIDER: !!(process.env.TTS_PROVIDER || process.env.SB_TTS_PROVIDER)
  };

  safeJson(res, 200, {
    ok:true,
    policy: { provider: cfg.provider, sovereignMode: cfg.sovereignMode, allowFallbacks: cfg.allowFallbacks },
    routing: route,
    resilience: {
      maxInflight: cfg.maxInflight,
      vendorTimeoutMs: cfg.vendorTimeoutMs,
      handlerTimeoutMs: cfg.handlerTimeoutMs,
      breakerFailThreshold: cfg.breakerFailThreshold,
      breakerWindowMs: cfg.breakerWindowMs,
      breakerOpenMs: cfg.breakerOpenMs
    },
    caching: { enabled: cfg.cacheEnabled, maxItems: cfg.cacheMaxItems, ttlMs: cfg.cacheTtlMs, maxTextChars: cfg.cacheMaxTextChars },
    resemble: { stream_url: cfg.resemble.stream_url, model: cfg.resemble.model, output_format: cfg.resemble.output_format, precision: cfg.resemble.precision, sample_rate: cfg.resemble.sample_rate || "" },
    envFlags,
    issues
  });
}

module.exports = { diagTts };
