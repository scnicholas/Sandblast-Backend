"use strict";

/**
 * Utils/tts.js
 *
 * TTS handler for Nyx
 * Primary: ElevenLabs
 * Secondary failover: optional ElevenLabs host/voice/model via env
 * Fallback synthetic tier: optional OpenAI TTS (if configured) OR deterministic text JSON (if not)
 *
 * Export shape: handleTts(req,res)
 * - Never throws upward (index.js already guards, but we also guard here)
 * - Returns audio/mpeg by default
 * - If not configured, returns 501 TTS_NOT_CONFIGURED (deterministic)
 *
 * Enhancements (structure-preserving, operational hardening):
 *  1) Handshake: accepts lane/turnId/chatMs/e2eStartTs; returns headers for correlation
 *  2) Latency instrumentation: X-SB-* headers + optional JSON log line
 *  3) Hard retry + vendor failover: retry-once + optional secondary ElevenLabs attempt
 *  4) Fallback tier: optional OpenAI TTS (audio/mpeg) if ElevenLabs is down
 *  5) Audio health heartbeat: in-memory health cache + on-demand probe (body.healthCheck=true)
 *
 * Expected env (Primary ElevenLabs):
 *  - ELEVENLABS_API_KEY
 *  - NYX_VOICE_ID   (or ELEVENLABS_VOICE_ID)
 *
 * Optional ElevenLabs tuning env:
 *  - NYX_VOICE_STABILITY        (0..1)
 *  - NYX_VOICE_SIMILARITY       (0..1)
 *  - NYX_VOICE_STYLE            (0..1)
 *  - NYX_VOICE_SPEAKER_BOOST    ("true"/"false")
 *  - ELEVENLABS_MODEL_ID        (default: eleven_multilingual_v2)
 *  - ELEVENLABS_HOST            (default: api.elevenlabs.io)
 *  - ELEVENLABS_TTS_TIMEOUT_MS  (default: 15000)
 *  - ELEVENLABS_TTS_RETRY_ONCE  ("true"/"false", default: true)
 *  - ELEVENLABS_TTS_MAX_CHARS   (default: 1200)
 *  - ELEVENLABS_TTS_MAX_SOCKETS (default: 16)
 *
 * Optional ElevenLabs secondary failover:
 *  - ELEVENLABS_API_KEY_SECONDARY   (defaults to primary key if empty)
 *  - NYX_VOICE_ID_SECONDARY         (or ELEVENLABS_VOICE_ID_SECONDARY)
 *  - ELEVENLABS_MODEL_ID_SECONDARY  (defaults to primary model if empty)
 *  - ELEVENLABS_HOST_SECONDARY      (defaults to primary host if empty)
 *
 * Optional fallback provider (speech tier):
 *  - SB_TTS_FALLBACK_PROVIDER   ("openai" | "none", default: "none")
 *  - OPENAI_API_KEY
 *  - OPENAI_TTS_MODEL           (default: gpt-4o-mini-tts)
 *  - OPENAI_TTS_VOICE           (default: alloy)
 *  - OPENAI_TTS_FORMAT          (default: mp3)
 *  - OPENAI_TTS_URL             (default: api.openai.com/v1/audio/speech)
 *  - OPENAI_TTS_TIMEOUT_MS      (default: 20000)
 *
 * Logging:
 *  - SB_TTS_LOG_JSON ("true"/"false", default: false)  // logs one JSON line per request
 *
 * Heartbeat:
 *  - SB_TTS_HEARTBEAT_INTERVAL_MS (default: 120000)
 *  - SB_TTS_HEARTBEAT_COOLDOWN_MS (default: 30000) // if DOWN, wait this long before next live attempt
 */

const https = require("https");

// Keep sockets warm to reduce cold-start latency and transient 5xx/ECONNRESET patterns.
const KEEPALIVE = true;
const MAX_SOCKETS = (() => {
  const n = parseInt(String(process.env.ELEVENLABS_TTS_MAX_SOCKETS || ""), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(64, n)) : 16;
})();
const keepAliveAgent = new https.Agent({ keepAlive: KEEPALIVE, maxSockets: MAX_SOCKETS });

// -----------------------------
// Heartbeat cache (in-memory)
// -----------------------------
const hb = {
  status: "unknown",          // "ok" | "degraded" | "down" | "unknown"
  lastCheckAt: 0,
  lastOkAt: 0,
  failStreak: 0,
  lastError: null,
  lastUpstreamStatus: null,
  lastUpstreamMs: null
};

function nowMs() { return Date.now(); }

function num01(x, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function bool(x, fallback) {
  const s = String(x == null ? "" : x).trim().toLowerCase();
  if (!s) return fallback;
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function clampInt(x, fallback, lo, hi) {
  const n = parseInt(String(x || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function safeJson(res, status, obj) {
  try {
    res.status(status).json(obj);
  } catch (_) {
    try {
      res.status(status).type("text/plain").send(String(obj && obj.message ? obj.message : "error"));
    } catch (_) {}
  }
}

function readBody(req) {
  const b = req && req.body;
  if (!b) return {};
  if (typeof b === "string") return { text: b.trim() };
  if (typeof b === "object" && b) return b;
  return {};
}

function firstSentence(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  if (m && m[1]) return m[1].trim();
  return t.slice(0, 180).trim();
}

function cleanText(input) {
  const s = String(input || "");
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function makeTraceId(provided) {
  const rnd = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  if (provided) {
    const p = String(provided).trim();
    if (p && p.length <= 64) return p.replace(/[^\w\-:.]/g, "_");
  }
  return `tts_${t}_${rnd.slice(0, 8)}`;
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function jitterSleep(msBase) {
  const ms = Math.max(0, Math.floor(msBase + Math.random() * 120));
  return new Promise((r) => setTimeout(r, ms));
}

// -----------------------------
// Voice settings (presets + overrides)
// -----------------------------
function presetVoiceSettings(presetKey, envDefaults) {
  const base = {
    stability: envDefaults.stability,
    similarity_boost: envDefaults.similarity_boost,
    style: envDefaults.style,
    use_speaker_boost: envDefaults.use_speaker_boost,
  };

  switch (String(presetKey || "").toUpperCase()) {
    case "NYX_CALM":
      return { ...base, stability: clamp01(base.stability + 0.18), style: clamp01(base.style - 0.08) };
    case "NYX_COACH":
      return { ...base, stability: clamp01(base.stability + 0.10), style: clamp01(base.style + 0.10) };
    case "NYX_WARM":
      return { ...base, stability: clamp01(base.stability + 0.04), style: clamp01(base.style + 0.22) };
    default:
      return base;
  }
}

/**
 * Accepts either:
 *  - body.ttsProfile: { stability, similarity, style, speakerBoost }  (AffectEngine output)
 *  - body.voice_settings: { stability, similarity_boost, style, use_speaker_boost } (ElevenLabs native)
 */
function mergeVoiceSettings({ envDefaults, presetKey, body }) {
  const fromPreset = presetVoiceSettings(presetKey, envDefaults);

  const tp = (body && typeof body.ttsProfile === "object" && body.ttsProfile) ? body.ttsProfile : null;
  const affectOverride = tp ? {
    stability: tp.stability === undefined ? undefined : clamp01(tp.stability),
    similarity_boost: tp.similarity === undefined ? undefined : clamp01(tp.similarity),
    style: tp.style === undefined ? undefined : clamp01(tp.style),
    use_speaker_boost: tp.speakerBoost === undefined ? undefined : !!tp.speakerBoost,
  } : null;

  const vs = (body && typeof body.voice_settings === "object" && body.voice_settings) ? body.voice_settings : null;
  const nativeOverride = vs ? {
    stability: vs.stability === undefined ? undefined : clamp01(vs.stability),
    similarity_boost: vs.similarity_boost === undefined ? undefined : clamp01(vs.similarity_boost),
    style: vs.style === undefined ? undefined : clamp01(vs.style),
    use_speaker_boost: vs.use_speaker_boost === undefined ? undefined : !!vs.use_speaker_boost,
  } : null;

  const merged = { ...fromPreset };

  if (affectOverride) {
    for (const k of Object.keys(affectOverride)) {
      if (affectOverride[k] !== undefined && affectOverride[k] !== null) merged[k] = affectOverride[k];
    }
  }
  if (nativeOverride) {
    for (const k of Object.keys(nativeOverride)) {
      if (nativeOverride[k] !== undefined && nativeOverride[k] !== null) merged[k] = nativeOverride[k];
    }
  }

  merged.stability = clamp01(merged.stability);
  merged.similarity_boost = clamp01(merged.similarity_boost);
  merged.style = clamp01(merged.style);
  merged.use_speaker_boost = !!merged.use_speaker_boost;

  return merged;
}

// -----------------------------
// Provider config + requests
// -----------------------------
function getElevenCfg(which /* "primary" | "secondary" */) {
  const pKey = String(process.env.ELEVENLABS_API_KEY || "").trim();
  const pVoiceId = String(process.env.NYX_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || "").trim();
  const pHost = String(process.env.ELEVENLABS_HOST || "api.elevenlabs.io").trim() || "api.elevenlabs.io";
  const pModel = String(process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2").trim() || "eleven_multilingual_v2";

  if (which === "secondary") {
    const key = String(process.env.ELEVENLABS_API_KEY_SECONDARY || "").trim() || pKey;
    const voiceId = String(process.env.NYX_VOICE_ID_SECONDARY || process.env.ELEVENLABS_VOICE_ID_SECONDARY || "").trim();
    const host = String(process.env.ELEVENLABS_HOST_SECONDARY || "").trim() || pHost;
    const modelId = String(process.env.ELEVENLABS_MODEL_ID_SECONDARY || "").trim() || pModel;
    const ok = !!(key && voiceId);
    return { ok, key, voiceId, host, modelId, which: "secondary" };
  }

  const ok = !!(pKey && pVoiceId);
  return { ok, key: pKey, voiceId: pVoiceId, host: pHost, modelId: pModel, which: "primary" };
}

function elevenlabsRequest({ cfg, text, traceId, timeoutMs, voiceSettings, modelIdOverride }) {
  const modelId = String(modelIdOverride || cfg.modelId || "eleven_multilingual_v2").trim();
  const host = String(cfg.host || "api.elevenlabs.io").trim() || "api.elevenlabs.io";

  const payload = JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: voiceSettings,
  });

  const options = {
    hostname: host,
    agent: keepAliveAgent,
    path: `/v1/text-to-speech/${encodeURIComponent(cfg.voiceId)}`,
    method: "POST",
    headers: {
      "xi-api-key": cfg.key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "User-Agent": "Sandblast-Nyx-TTS/1.2",
      "Content-Length": Buffer.byteLength(payload),
      "x-sb-trace-id": traceId,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode || 0, headers: res.headers || {}, body: buf, provider: "elevenlabs", host });
      });
    });

    req.on("error", (e) => reject(e));
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error("TTS_TIMEOUT")); } catch (_) {}
    });

    req.write(payload);
    req.end();
  });
}

function openaiTtsRequest({ text, traceId, timeoutMs }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return Promise.resolve({ status: 0, headers: {}, body: Buffer.from("OPENAI_API_KEY missing"), provider: "openai" });
  }

  // NOTE: OPENAI_TTS_URL is "host/path" or full "api.openai.com/v1/audio/speech"
  const rawUrl = String(process.env.OPENAI_TTS_URL || "api.openai.com/v1/audio/speech").trim();
  const host = rawUrl.includes("/") ? rawUrl.split("/")[0] : rawUrl;
  const path = rawUrl.includes("/") ? "/" + rawUrl.split("/").slice(1).join("/") : "/v1/audio/speech";

  const model = String(process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts").trim();
  const voice = String(process.env.OPENAI_TTS_VOICE || "alloy").trim();
  const format = String(process.env.OPENAI_TTS_FORMAT || "mp3").trim();

  const payload = JSON.stringify({
    model,
    voice,
    input: text,
    format
  });

  const options = {
    hostname: host,
    agent: keepAliveAgent,
    path,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "User-Agent": "Sandblast-Nyx-TTS/1.2",
      "Content-Length": Buffer.byteLength(payload),
      "x-sb-trace-id": traceId
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode || 0, headers: res.headers || {}, body: buf, provider: "openai", host });
      });
    });

    req.on("error", (e) => reject(e));
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error("TTS_TIMEOUT")); } catch (_) {}
    });

    req.write(payload);
    req.end();
  });
}

// -----------------------------
// Heartbeat / health logic
// -----------------------------
function hbIntervalMs() {
  return clampInt(process.env.SB_TTS_HEARTBEAT_INTERVAL_MS, 120000, 15000, 3600000);
}
function hbCooldownMs() {
  return clampInt(process.env.SB_TTS_HEARTBEAT_COOLDOWN_MS, 30000, 5000, 600000);
}

function updateHealth(ok, meta) {
  hb.lastCheckAt = nowMs();
  if (ok) {
    hb.status = "ok";
    hb.lastOkAt = hb.lastCheckAt;
    hb.failStreak = 0;
    hb.lastError = null;
  } else {
    hb.failStreak = (hb.failStreak || 0) + 1;
    hb.status = hb.failStreak >= 2 ? "down" : "degraded";
    hb.lastError = meta && meta.error ? String(meta.error).slice(0, 200) : "unknown";
  }
  if (meta && meta.upstreamStatus != null) hb.lastUpstreamStatus = meta.upstreamStatus;
  if (meta && meta.upstreamMs != null) hb.lastUpstreamMs = meta.upstreamMs;
}

function shouldAutoProbe() {
  const t = nowMs();
  return (t - hb.lastCheckAt) >= hbIntervalMs();
}

function shouldBypassPrimaryLiveAttempt() {
  // If we know we're DOWN very recently, bypass to failover/fallback immediately.
  if (hb.status !== "down") return false;
  const t = nowMs();
  return (t - hb.lastCheckAt) < hbCooldownMs();
}

async function runHeartbeatProbe({ traceId }) {
  const cfg = getElevenCfg("primary");
  if (!cfg.ok) {
    updateHealth(false, { error: "PRIMARY_NOT_CONFIGURED", upstreamStatus: null, upstreamMs: null });
    return { ok: false, error: "PRIMARY_NOT_CONFIGURED" };
  }

  const timeoutMs = clampInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS, 15000, 3000, 45000);
  const probeTimeout = Math.max(3000, Math.min(8000, Math.floor(timeoutMs * 0.6)));

  const envDefaults = {
    stability: num01(process.env.NYX_VOICE_STABILITY, 0.45),
    similarity_boost: num01(process.env.NYX_VOICE_SIMILARITY, 0.85),
    style: num01(process.env.NYX_VOICE_STYLE, 0.15),
    use_speaker_boost: bool(process.env.NYX_VOICE_SPEAKER_BOOST, true),
  };
  const voiceSettings = presetVoiceSettings("NYX_CALM", envDefaults);

  const t0 = nowMs();
  let r;
  try {
    r = await elevenlabsRequest({
      cfg,
      text: "Quick audio check.",
      traceId,
      timeoutMs: probeTimeout,
      voiceSettings
    });
  } catch (e) {
    updateHealth(false, { error: e && e.message ? e.message : String(e), upstreamStatus: 0, upstreamMs: nowMs() - t0 });
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }

  const dt = nowMs() - t0;
  const ok = r.status >= 200 && r.status < 300 && r.body && r.body.length > 1000;
  updateHealth(ok, { error: ok ? null : `UPSTREAM_${r.status}`, upstreamStatus: r.status, upstreamMs: dt });
  return { ok, upstreamStatus: r.status, upstreamMs: dt, bytes: r.body ? r.body.length : 0 };
}

// -----------------------------
// Main handler
// -----------------------------
async function handleTts(req, res) {
  const requestId = String(req.get("X-Request-Id") || "").trim() || null;
  const inboundTrace = String(req.get("X-SB-Trace-Id") || req.get("x-sb-trace-id") || "").trim() || null;
  const traceId = makeTraceId(inboundTrace);

  const timeoutMs = clampInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS, 15000, 3000, 45000);
  const retryOnce = bool(process.env.ELEVENLABS_TTS_RETRY_ONCE, true);
  const maxChars = clampInt(process.env.ELEVENLABS_TTS_MAX_CHARS, 1200, 200, 6000);
  const logJson = bool(process.env.SB_TTS_LOG_JSON, false);

  const fallbackProvider = String(process.env.SB_TTS_FALLBACK_PROVIDER || "none").trim().toLowerCase();
  const openaiTimeoutMs = clampInt(process.env.OPENAI_TTS_TIMEOUT_MS, 20000, 3000, 45000);

  const tStart = nowMs();

  try {
    const body = readBody(req);

    // Optional health check mode (does not change handler shape; just JSON response when asked)
    if (body && body.healthCheck === true) {
      const probe = await runHeartbeatProbe({ traceId });
      res.set("X-SB-Trace-Id", traceId);
      return safeJson(res, probe.ok ? 200 : 503, {
        ok: probe.ok,
        provider: "elevenlabs",
        probe,
        health: {
          status: hb.status,
          lastCheckAt: hb.lastCheckAt,
          lastOkAt: hb.lastOkAt,
          failStreak: hb.failStreak,
          lastUpstreamStatus: hb.lastUpstreamStatus,
          lastUpstreamMs: hb.lastUpstreamMs
        },
        requestId,
        traceId
      });
    }

    // optional metadata (for telemetry / dashboards)
    const lane = String(body.lane || body.mode || body.contextLane || "").trim() || null;
    const turnId = String(body.turnId || body.turn || body.tid || "").trim() || null;

    // Optional timing stamps from upstream
    const chatMs = body.chatMs != null ? clampInt(body.chatMs, 0, 0, 3600000) : null;
    const e2eStartTs = body.e2eStartTs != null ? clampInt(body.e2eStartTs, 0, 0, 9999999999999) : null; // epoch ms
    const e2eMs = (e2eStartTs && e2eStartTs > 0) ? Math.max(0, nowMs() - e2eStartTs) : null;

    let text = cleanText(body.text || body.message || "");

    if (!text) {
      res.set("X-SB-Trace-Id", traceId);
      if (lane) res.set("X-SB-Lane", lane);
      if (turnId) res.set("X-SB-Turn-Id", turnId);
      return safeJson(res, 400, {
        ok: false,
        error: "BAD_REQUEST",
        detail: "MISSING_TEXT",
        message: "Provide {text} in JSON body.",
        requestId,
        traceId,
      });
    }

    // Optional "fast-start" mode: first sentence only
    const firstSentenceOnly = !!body.firstSentenceOnly;
    if (firstSentenceOnly) text = firstSentence(cleanText(text));
    text = cleanText(text);

    // Guard: max chars
    if (text.length > maxChars) {
      res.set("X-SB-Trace-Id", traceId);
      if (lane) res.set("X-SB-Lane", lane);
      if (turnId) res.set("X-SB-Turn-Id", turnId);
      return safeJson(res, 413, {
        ok: false,
        error: "TTS_TEXT_TOO_LONG",
        message: `Text too long for TTS. Max ${maxChars} characters.`,
        chars: text.length,
        maxChars,
        requestId,
        traceId,
      });
    }

    // Auto-probe periodically (best-effort; never blocks main request if it fails quickly)
    if (shouldAutoProbe()) {
      runHeartbeatProbe({ traceId }).catch(() => {});
    }

    // Config defaults (voice settings)
    const envDefaults = {
      stability: num01(process.env.NYX_VOICE_STABILITY, 0.45),
      similarity_boost: num01(process.env.NYX_VOICE_SIMILARITY, 0.85),
      style: num01(process.env.NYX_VOICE_STYLE, 0.15),
      use_speaker_boost: bool(process.env.NYX_VOICE_SPEAKER_BOOST, true),
    };
    const presetKey = String(body.presetKey || body.voicePreset || body.ttsPresetKey || "").trim() || null;
    const voiceSettings = mergeVoiceSettings({ envDefaults, presetKey, body });
    const modelIdOverride = body.model_id ? String(body.model_id).trim() : null;

    // Primary ElevenLabs
    const primaryCfg = getElevenCfg("primary");
    const secondaryCfg = getElevenCfg("secondary");

    // If primary isn't configured, we can still try secondary, then fallback.
    // Also: if health says DOWN recently, bypass primary to reduce user-facing latency.
    const bypassPrimary = shouldBypassPrimaryLiveAttempt();

    // Helper to attempt one provider
    async function attemptEleven(cfg, label) {
      const tUpStart = nowMs();
      try {
        const r = await elevenlabsRequest({
          cfg,
          text,
          traceId,
          timeoutMs,
          voiceSettings,
          modelIdOverride
        });
        return { r, ms: nowMs() - tUpStart, label };
      } catch (e) {
        const ms = nowMs() - tUpStart;
        const r = { status: 0, headers: {}, body: Buffer.from(String(e && e.message ? e.message : e || "TTS_ERROR")) };
        r.__err = String(e && e.message ? e.message : e);
        return { r, ms, label };
      }
    }

    let retried = false;
    let failoverUsed = false;
    let providerUsed = null;

    let result = null;

    if (!bypassPrimary && primaryCfg.ok) {
      result = await attemptEleven(primaryCfg, "primary");
      providerUsed = "elevenlabs_primary";
    }

    // Retry-once if primary failed (retry same provider)
    if (result && (result.r.status === 0 || isRetryableStatus(result.r.status)) && retryOnce && primaryCfg.ok && !bypassPrimary) {
      retried = true;
      await jitterSleep(180);
      const r2 = await attemptEleven(primaryCfg, "primary_retry");
      // Prefer successful retry
      if (r2.r.status >= 200 && r2.r.status < 300) {
        result = r2;
        providerUsed = "elevenlabs_primary";
      }
    }

    // Vendor failover (secondary ElevenLabs) if still not OK
    const needFailover = !result || !(result.r.status >= 200 && result.r.status < 300);
    if (needFailover && secondaryCfg.ok) {
      failoverUsed = true;
      await jitterSleep(retried ? 90 : 40);
      const r3 = await attemptEleven(secondaryCfg, "secondary");
      if (r3.r.status >= 200 && r3.r.status < 300) {
        result = r3;
        providerUsed = "elevenlabs_secondary";
      } else if (!result) {
        result = r3;
        providerUsed = "elevenlabs_secondary";
      }
    }

    // If no ElevenLabs config succeeded and fallback is enabled, try fallback provider.
    let fallbackUsed = false;
    let fallbackMeta = null;

    const okEleven = result && (result.r.status >= 200 && result.r.status < 300);

    if (!okEleven) {
      // Update heartbeat as degraded/down
      const upStatus = result ? result.r.status : 0;
      const upMs = result ? result.ms : null;
      updateHealth(false, { error: `ELEVEN_FAIL_${upStatus}`, upstreamStatus: upStatus, upstreamMs: upMs });

      if (fallbackProvider === "openai") {
        fallbackUsed = true;
        providerUsed = "openai_fallback";
        const tUpStart = nowMs();
        let fr;
        try {
          fr = await openaiTtsRequest({ text, traceId, timeoutMs: openaiTimeoutMs });
        } catch (e) {
          fr = { status: 0, headers: {}, body: Buffer.from(String(e && e.message ? e.message : e)), provider: "openai" };
          fr.__err = String(e && e.message ? e.message : e);
        }
        const upMs2 = nowMs() - tUpStart;
        fallbackMeta = { upstreamStatus: fr.status, upstreamMs: upMs2 };

        if (fr.status >= 200 && fr.status < 300) {
          // Respond with audio/mpeg
          const tMs = nowMs() - tStart;

          res.set("X-SB-Trace-Id", traceId);
          res.set("X-SB-TTS-Provider", "openai");
          res.set("X-SB-TTS-Ms", String(tMs));
          res.set("X-SB-TTS-Upstream-Ms", String(upMs2));
          res.set("X-SB-TTS-Retry", retried ? "1" : "0");
          res.set("X-SB-TTS-Failover", failoverUsed ? "1" : "0");
          res.set("X-SB-TTS-Fallback", "1");
          res.set("X-SB-TTS-Upstream-Status", String(fr.status || 0));
          if (lane) res.set("X-SB-Lane", lane);
          if (turnId) res.set("X-SB-Turn-Id", turnId);
          if (chatMs != null) res.set("X-SB-Chat-Ms", String(chatMs));
          if (e2eMs != null) res.set("X-SB-E2E-Ms", String(e2eMs));

          const bytes = fr.body ? fr.body.length : 0;
          res.set("X-SB-TTS-Bytes", String(bytes));

          if (logJson) {
            try {
              console.log(JSON.stringify({
                t: nowMs(),
                ok: true,
                provider: "openai",
                traceId,
                requestId,
                lane,
                turnId,
                retried,
                failoverUsed,
                fallbackUsed: true,
                upstreamStatus: fr.status,
                ms_total: tMs,
                ms_upstream: upMs2,
                bytes,
                chars: text.length
              }));
            } catch (_) {}
          }

          res.status(200);
          res.set("Content-Type", "audio/mpeg");
          res.set("Cache-Control", "no-store");
          res.set("Content-Disposition", 'inline; filename="nyx_tts.mp3"');
          if (req.aborted || res.writableEnded) return;
          return res.send(fr.body);
        }

        // fallback failed too: fall through to deterministic JSON error
      }

      // Deterministic non-audio fallback (keeps the system responsive instead of stalling)
      const tMs = nowMs() - tStart;
      res.set("X-SB-Trace-Id", traceId);
      res.set("X-SB-TTS-Provider", providerUsed || "none");
      res.set("X-SB-TTS-Ms", String(tMs));
      res.set("X-SB-TTS-Upstream-Status", String(result ? (result.r.status || 0) : 0));
      res.set("X-SB-TTS-Retry", retried ? "1" : "0");
      res.set("X-SB-TTS-Failover", failoverUsed ? "1" : "0");
      res.set("X-SB-TTS-Fallback", fallbackUsed ? "1" : "0");
      if (lane) res.set("X-SB-Lane", lane);
      if (turnId) res.set("X-SB-Turn-Id", turnId);
      if (chatMs != null) res.set("X-SB-Chat-Ms", String(chatMs));
      if (e2eMs != null) res.set("X-SB-E2E-Ms", String(e2eMs));

      if (logJson) {
        try {
          console.log(JSON.stringify({
            t: nowMs(),
            ok: false,
            traceId,
            requestId,
            lane,
            turnId,
            provider: providerUsed || "none",
            retried,
            failoverUsed,
            fallbackUsed,
            fallbackProvider: fallbackProvider || "none",
            eleven_upstreamStatus: result ? result.r.status : 0,
            eleven_upstreamMs: result ? result.ms : null,
            openai_upstreamStatus: fallbackMeta ? fallbackMeta.upstreamStatus : null,
            openai_upstreamMs: fallbackMeta ? fallbackMeta.upstreamMs : null,
            ms_total: tMs,
            chars: text.length
          }));
        } catch (_) {}
      }

      return safeJson(res, 502, {
        ok: false,
        error: "TTS_UNAVAILABLE",
        message: "TTS providers failed. Returning text-only fallback (no audio).",
        provider: providerUsed || null,
        retried,
        failoverUsed,
        fallbackProvider,
        requestId,
        traceId
      });
    }

    // ElevenLabs succeeded -> update heartbeat OK
    updateHealth(true, { upstreamStatus: result.r.status, upstreamMs: result.ms });

    const tMs = nowMs() - tStart;

    // Telemetry headers (safe for binary responses)
    res.set("X-SB-Trace-Id", traceId);
    res.set("X-SB-TTS-Provider", providerUsed || "elevenlabs");
    res.set("X-SB-TTS-Ms", String(tMs));
    res.set("X-SB-TTS-Upstream-Ms", String(result.ms));
    res.set("X-SB-TTS-Retry", retried ? "1" : "0");
    res.set("X-SB-TTS-Failover", failoverUsed ? "1" : "0");
    res.set("X-SB-TTS-Fallback", "0");
    res.set("X-SB-TTS-Upstream-Status", String(result.r.status || 0));
    if (lane) res.set("X-SB-Lane", lane);
    if (turnId) res.set("X-SB-Turn-Id", turnId);
    if (chatMs != null) res.set("X-SB-Chat-Ms", String(chatMs));
    if (e2eMs != null) res.set("X-SB-E2E-Ms", String(e2eMs));
    if (presetKey) res.set("X-SB-TTS-Preset", String(presetKey).slice(0, 32));
    res.set("X-SB-TTS-Voice", String((providerUsed === "elevenlabs_secondary" ? secondaryCfg.voiceId : primaryCfg.voiceId) || "").slice(0, 32));
    res.set("X-SB-TTS-Host", String((providerUsed === "elevenlabs_secondary" ? secondaryCfg.host : primaryCfg.host) || "").slice(0, 48));

    // Return audio
    const bytes = result.r.body ? result.r.body.length : 0;
    res.set("X-SB-TTS-Bytes", String(bytes));

    if (logJson) {
      try {
        console.log(JSON.stringify({
          t: nowMs(),
          ok: true,
          provider: providerUsed || "elevenlabs",
          traceId,
          requestId,
          lane,
          turnId,
          retried,
          failoverUsed,
          upstreamStatus: result.r.status,
          ms_total: tMs,
          ms_upstream: result.ms,
          bytes,
          voice_settings: voiceSettings,
          chars: text.length
        }));
      } catch (_) {}
    }

    res.status(200);
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-store");
    res.set("Content-Disposition", 'inline; filename="nyx_tts.mp3"');

    if (req.aborted || res.writableEnded) return;
    return res.send(result.r.body);

  } catch (e) {
    try {
      res.set("X-SB-Trace-Id", traceId);
      res.set("X-SB-TTS-Ms", String(nowMs() - tStart));
    } catch (_) {}

    return safeJson(res, 500, {
      ok: false,
      error: "TTS_INTERNAL_ERROR",
      message: String(e && e.message ? e.message : e),
      requestId,
      traceId,
    });
  }
}

module.exports = { handleTts };
