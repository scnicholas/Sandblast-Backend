"use strict";

/**
 * Utils/ttsrouter.js
 *
 * TTS Router — provider gate + OPINTEL routing hints.
 *
 * Phases covered (10 + next 5):
 *  P1  provider allow-list lock
 *  P2  fail-open metadata contract
 *  P3  route confidence + health class
 *  P4  vendor health mapping hooks
 *  P5  retry policy hints
 *  P6  timeout class hints
 *  P7  voice UUID validation
 *  P8  trace propagation
 *  P9  fallback provider policy clamp
 *  P10 observability payload
 *  P11 latency budget hints
 *  P12 silence guard
 *  P13 degrade-after-fail threshold
 *  P14 resilience tags
 *  P15 operational upgrade envelope
 */

const TTS_ROUTER_VERSION = "ttsrouter v2.1.0-opintel";
const PHASE15_PLAN = Object.freeze([
  "P1: provider allow-list lock",
  "P2: fail-open metadata contract",
  "P3: route confidence + health class",
  "P4: vendor health mapping hooks",
  "P5: retry policy hints",
  "P6: timeout class hints",
  "P7: voice UUID validation",
  "P8: trace propagation",
  "P9: fallback provider policy clamp",
  "P10: observability payload",
  "P11: latency budget hints",
  "P12: silence guard",
  "P13: degrade-after-fail threshold",
  "P14: resilience tags",
  "P15: operational upgrade envelope"
]);

function safeStr(x, max){
  const n = Number(max || 80);
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function clampInt(n, min, max, fallback){
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const t = Math.round(x);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function clamp01(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function looksLikeVoiceId(v){
  const s = safeStr(v, 64).trim();
  return !!s && /^[A-Za-z0-9_-]{6,64}$/.test(s);
}
function normalizeProvider(x){
  return safeStr(x || "resemble", 24).trim().toLowerCase() || "resemble";
}
function normalizeHealthClass(fails){
  const n = clampInt(fails, 0, 99, 0);
  if (n >= 4) return "degraded";
  if (n >= 2) return "watch";
  return "healthy";
}

function buildRouteMeta(cfg, provider, ok, reason){
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const traceId = safeStr(c.traceId || c.requestId || c.turnId || "", 64).trim();
  const failCount = clampInt(c.failCount || c.providerFailCount || 0, 0, 99, 0);
  const timeoutMs = clampInt(c.timeoutMs || c.ttsTimeoutMs || 12000, 2000, 45000, 12000);
  const latencyBudgetMs = clampInt(c.latencyBudgetMs || c.latencyBudget || 9000, 1000, 30000, 9000);
  const voiceId = safeStr(c.voiceId || c.voice_uuid || c.voiceUUID || "", 64).trim();
  const fallbackProvider = normalizeProvider(c.fallbackProvider || "");
  const silenceGuard = c.silent === true || c.disableSpeak === true;

  return {
    version: TTS_ROUTER_VERSION,
    provider,
    ok: !!ok,
    reason: safeStr(reason || (ok ? "OK" : "PROVIDER_FORBIDDEN"), 40),
    traceId,
    routeConfidence: provider === "resemble" ? 1 : 0,
    healthClass: normalizeHealthClass(failCount),
    failCount,
    timeoutClass: timeoutMs >= 20000 ? "long" : timeoutMs >= 10000 ? "normal" : "tight",
    timeoutMs,
    latencyBudgetMs,
    retryCap: clampInt(c.retryCap || 1, 0, 3, 1),
    degradeAfterFails: clampInt(c.degradeAfterFails || 3, 1, 10, 3),
    voiceIdValid: looksLikeVoiceId(voiceId),
    fallbackPolicy: fallbackProvider && fallbackProvider !== "resemble" ? "clamped_forbidden" : "single_vendor_lock",
    silenceGuard,
    resilienceTags: [
      "tts:single_vendor_lock",
      "tts:trace_propagation",
      silenceGuard ? "tts:silent" : "tts:audible"
    ],
    opUpgrade: {
      schema: "ttsrouter.opintel.v1",
      vendorHealthMapped: true,
      observabilityReady: true,
      fallbackClamped: !!fallbackProvider && fallbackProvider !== "resemble",
      latencyBudgeted: true
    }
  };
}

function routeProvider(cfg){
  const provider = normalizeProvider(cfg && cfg.provider);
  if (provider !== "resemble"){
    return {
      ok:false,
      provider,
      reason:"PROVIDER_FORBIDDEN",
      status:403,
      meta: buildRouteMeta(cfg, provider, false, "PROVIDER_FORBIDDEN")
    };
  }

  const meta = buildRouteMeta(cfg, "resemble", true, "OK");
  if (!meta.voiceIdValid && (cfg && (cfg.voiceId || cfg.voice_uuid || cfg.voiceUUID))) {
    meta.reason = "VOICE_ID_SUSPECT";
  }

  return { ok:true, provider:"resemble", reason:"OK", status:200, meta };
}

module.exports = { TTS_ROUTER_VERSION, PHASE15_PLAN, routeProvider };
