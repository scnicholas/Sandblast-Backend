"use strict";

/**
 * Utils/tts.js  (Nyx/Nix TTS)
 *
 * Provider order (primary -> fallback):
 *   1) Resemble AI (primary)
 *   2) ElevenLabs (fallback; supports secondary host/voice)
 *   3) Optional OpenAI TTS (if SB_TTS_FALLBACK_PROVIDER=openai)
 *   4) Deterministic JSON fallback (never blocks the UX)
 *
 * CONTRACT / PRINCIPLES (hardening):
 * - Never throws upward (caller/index.js guards, but we guard here too)
 * - Never returns a raw vendor error to the client without a stable envelope
 * - Binary-safe audio delivery (audio/mpeg default)
 * - Observability: X-SB-* headers + optional one-line JSON logs
 * - Resilience: retry cap + vendor bypass cooldown to prevent hammering
 * - Structure-preserving: keeps your existing infra expectations, just fixes the broken parts
 *
 * 10 PHASES (mapped into code):
 *  1) Social Warmth Presets: greeting/intent/mood -> preset voice posture (fail-open)
 *  2) State Spine Hints: accepts stateHints (turnDepth/lastIntent) for correlation
 *  3) Resilience Overrides: accepts body.resilience (timeout_ms, retry_cap) within bounds
 *  4) Provider Routing: Resemble primary w/ clean fallback chain
 *  5) Vendor Health Mapping: heartbeat + bypass window for noisy providers
 *  6) Deterministic Caching: short TTL cache for common prompts, provider-scoped keys
 *  7) Telemetry Headers: correlation, latency, provider tags, bytes, upstream statuses
 *  8) Safe Failure Envelope: never breaks the chat loop; returns stable JSON if no audio
 *  9) Security Hygiene: no token leakage; optional debug logs are redacted
 * 10) QA/Health Checks: body.healthCheck=true returns provider readiness + last health
 */

const https = require("https");

// -----------------------------
// Optional provider imports (fail-open)
// -----------------------------
function safeRequire(p) {
  try { return require(p); } catch (_) { return null; }
}

// Prefer the newer hardened provider name if present.
const resembleMod =
  safeRequire("./ttsProvidersresemble") ||
  safeRequire("./TTSProvidersResemble") ||
  safeRequire("./providersResemble");

const resembleSynthesize = (resembleMod && typeof resembleMod.synthesize === "function")
  ? resembleMod.synthesize
  : null;

// -----------------------------
// Keep sockets warm (Eleven/OpenAI use HTTPS)
// -----------------------------
const KEEPALIVE = true;
const MAX_SOCKETS = (() => {
  const n = parseInt(String(process.env.ELEVENLABS_TTS_MAX_SOCKETS || ""), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(64, n)) : 16;
})();
const keepAliveAgent = new https.Agent({ keepAlive: KEEPALIVE, maxSockets: MAX_SOCKETS });

// -----------------------------
// Tiny in-memory audio cache (best-effort)
// -----------------------------
const _cache = {
  map: new Map(), // key -> { at, buf, meta }
};

function nowMs() { return Date.now(); }

function bool(v, fallback) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (!s) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}
function clampInt(v, fallback, lo, hi) {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function num01(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function cacheEnabled() { return bool(process.env.SB_TTS_CACHE, true); }
function cacheTtlMs() { return clampInt(process.env.SB_TTS_CACHE_TTL_MS, 30_000, 2_000, 300_000); }
function cacheMaxEntries() { return clampInt(process.env.SB_TTS_CACHE_MAX, 64, 8, 512); }

function cacheKey({ provider, voiceId, host, modelId, voiceSettings, text }) {
  const vs = voiceSettings ? JSON.stringify(voiceSettings) : "";
  const raw = `${provider || ""}|${voiceId || ""}|${host || ""}|${modelId || ""}|${vs}|${text || ""}`;

  // FNV-1a-ish
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `k_${(h >>> 0).toString(16)}`;
}

function cacheGet(key) {
  try {
    if (!cacheEnabled()) return null;
    const it = _cache.map.get(key);
    if (!it) return null;
    const ttl = cacheTtlMs();
    if ((nowMs() - it.at) > ttl) {
      _cache.map.delete(key);
      return null;
    }
    return it;
  } catch (_) { return null; }
}

function cacheSet(key, buf, meta) {
  try {
    if (!cacheEnabled()) return;
    const max = cacheMaxEntries();
    while (_cache.map.size >= max) {
      const firstKey = _cache.map.keys().next().value;
      if (!firstKey) break;
      _cache.map.delete(firstKey);
    }
    _cache.map.set(key, { at: nowMs(), buf, meta: meta || null });
  } catch (_) {}
}

// -----------------------------
// Heartbeat cache (provider health, fail-open)
// -----------------------------
const hb = {
  status: "unknown", // ok|degraded|down|unknown
  lastCheckAt: 0,
  lastOkAt: 0,
  failStreak: 0,
  lastError: null,
  lastUpstreamStatus: null,
  lastUpstreamMs: null,
  lastFailAt: 0,
};

function hbIntervalMs() { return clampInt(process.env.SB_TTS_HEARTBEAT_INTERVAL_MS, 120_000, 15_000, 3_600_000); }
function hbCooldownMs() { return clampInt(process.env.SB_TTS_HEARTBEAT_COOLDOWN_MS, 30_000, 5_000, 600_000); }

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
    hb.lastFailAt = hb.lastCheckAt;
  }
  if (meta && meta.upstreamStatus != null) hb.lastUpstreamStatus = meta.upstreamStatus;
  if (meta && meta.upstreamMs != null) hb.lastUpstreamMs = meta.upstreamMs;
}

function shouldAutoProbe() {
  return (nowMs() - hb.lastCheckAt) >= hbIntervalMs();
}

function shouldBypassLiveAttempt() {
  const t = nowMs();
  if (hb.status === "down") {
    const base = hbCooldownMs();
    const mult = (hb.failStreak && hb.failStreak >= 3) ? 2 : 1;
    return (t - hb.lastCheckAt) < (base * mult);
  }
  if (hb.status === "degraded" && hb.failStreak >= 2) {
    return (t - hb.lastCheckAt) < Math.max(5_000, Math.floor(hbCooldownMs() * 0.5));
  }
  return false;
}

// -----------------------------
// Helpers
// -----------------------------
function readBody(req) {
  const b = req && req.body;
  if (!b) return {};
  if (typeof b === "string") return { text: b.trim() };
  if (typeof b === "object" && b) return b;
  return {};
}

function safeJson(res, status, obj) {
  try {
    res.status(status).json(obj);
  } catch (_) {
    try { res.status(status).type("text/plain").send(String(obj?.message || obj?.error || "error")); } catch (_) {}
  }
}

function cleanText(input) {
  const s = String(input || "");
  // remove ASCII control chars (except common whitespace)
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function firstSentence(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  if (m && m[1]) return m[1].trim();
  return t.slice(0, 180).trim();
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

function jitterSleep(msBase) {
  const ms = Math.max(0, Math.floor(msBase + Math.random() * 120));
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function wantsBase64(body) {
  const r = String((body && body.return) || (body && body.response) || "").trim().toLowerCase();
  return r === "base64" || r === "json";
}

function sendAudio(res, req, { body, buf, headers, mimeType }) {
  if (wantsBase64(body)) {
    try {
      const b64 = buf ? buf.toString("base64") : "";
      const out = { ok: true, audio_b64: b64, bytes: buf ? buf.length : 0 };
      if (headers && typeof headers === "object") out.headers = headers;
      return safeJson(res, 200, out);
    } catch (_) {}
  }

  res.status(200);
  res.set("Content-Type", mimeType || "audio/mpeg");
  res.set("Cache-Control", "no-store");
  res.set("Content-Disposition", 'inline; filename="nyx_tts.mp3"');
  if (req.aborted || res.writableEnded) return;
  return res.send(buf);
}

// -----------------------------
// Voice settings (ElevenLabs)
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

  for (const o of [affectOverride, nativeOverride]) {
    if (!o) continue;
    for (const k of Object.keys(o)) {
      if (o[k] !== undefined && o[k] !== null) merged[k] = o[k];
    }
  }

  merged.stability = clamp01(merged.stability);
  merged.similarity_boost = clamp01(merged.similarity_boost);
  merged.style = clamp01(merged.style);
  merged.use_speaker_boost = !!merged.use_speaker_boost;

  return merged;
}

// -----------------------------
// Provider config + requests (ElevenLabs + OpenAI)
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

function elevenlabsRequest({ cfg, text, traceId, timeoutEff, voiceSettings, modelIdOverride }) {
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
      "User-Agent": "Sandblast-Nyx-TTS/1.3",
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
    req.setTimeout(timeoutEff, () => {
      try { req.destroy(new Error("TTS_TIMEOUT")); } catch (_) {}
    });

    req.write(payload);
    req.end();
  });
}

function openaiTtsRequest({ text, traceId, timeoutEff }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return Promise.resolve({ status: 0, headers: {}, body: Buffer.from("OPENAI_API_KEY missing"), provider: "openai" });
  }

  const rawUrl = String(process.env.OPENAI_TTS_URL || "api.openai.com/v1/audio/speech").trim();
  const host = rawUrl.includes("/") ? rawUrl.split("/")[0] : rawUrl;
  const path = rawUrl.includes("/") ? "/" + rawUrl.split("/").slice(1).join("/") : "/v1/audio/speech";

  const model = String(process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts").trim();
  const voice = String(process.env.OPENAI_TTS_VOICE || "alloy").trim();
  const format = String(process.env.OPENAI_TTS_FORMAT || "mp3").trim();

  const payload = JSON.stringify({ model, voice, input: text, format });

  const options = {
    hostname: host,
    agent: keepAliveAgent,
    path,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "User-Agent": "Sandblast-Nyx-TTS/1.3",
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
        resolve({ status: res.statusCode || 0, headers: res.headers || {}, body: buf, provider: "openai", host });
      });
    });

    req.on("error", (e) => reject(e));
    req.setTimeout(timeoutEff, () => {
      try { req.destroy(new Error("TTS_TIMEOUT")); } catch (_) {}
    });

    req.write(payload);
    req.end();
  });
}

// -----------------------------
// Heartbeat probe (uses Resemble first if configured, else Eleven)
// -----------------------------
async function runHeartbeatProbe({ traceId }) {
  const probeText = "Quick audio check.";
  const timeoutMs = clampInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS, 15_000, 3_000, 45_000);
  const probeTimeout = Math.max(3_000, Math.min(8_000, Math.floor(timeoutMs * 0.6)));

  // Try Resemble readiness (light)
  const resembleToken = String(process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_KEY || "").trim();
  const resembleVoiceUuid = String(process.env.RESEMBLE_VOICE_UUID || process.env.RESEMBLE_VOICE_UUID || "").trim();

  if (resembleSynthesize && resembleToken && resembleVoiceUuid) {
    const t0 = nowMs();
    try {
      const r = await resembleSynthesize({
        text: probeText,
        voiceUuid: resembleVoiceUuid,
        outputFormat: String(process.env.RESEMBLE_OUTPUT_FORMAT || "mp3").trim(),
        timeoutMs: probeTimeout,
        traceId,
      });

      const dt = nowMs() - t0;
      const ok = !!(r && r.ok && r.buffer && r.buffer.length > 1000);
      updateHealth(ok, { error: ok ? null : (r?.reason || r?.message || "RESEMBLE_FAIL"), upstreamStatus: ok ? 200 : (r?.status || 0), upstreamMs: dt });
      return { ok, provider: "resemble", upstreamStatus: ok ? 200 : (r?.status || 0), upstreamMs: dt, bytes: r?.buffer?.length || 0 };
    } catch (e) {
      const dt = nowMs() - t0;
      updateHealth(false, { error: e?.message || String(e), upstreamStatus: 0, upstreamMs: dt });
      return { ok: false, provider: "resemble", error: e?.message || String(e), upstreamMs: dt };
    }
  }

  // Else try Eleven
  const cfg = getElevenCfg("primary");
  if (!cfg.ok) {
    updateHealth(false, { error: "PRIMARY_NOT_CONFIGURED", upstreamStatus: null, upstreamMs: null });
    return { ok: false, provider: "elevenlabs", error: "PRIMARY_NOT_CONFIGURED" };
  }

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
    r = await elevenlabsRequest({ cfg, text: probeText, traceId, timeoutEff: probeTimeout, voiceSettings });
  } catch (e) {
    updateHealth(false, { error: e?.message || String(e), upstreamStatus: 0, upstreamMs: nowMs() - t0 });
    return { ok: false, provider: "elevenlabs", error: e?.message || String(e) };
  }

  const dt = nowMs() - t0;
  const ok = r.status >= 200 && r.status < 300 && r.body && r.body.length > 1000;
  updateHealth(ok, { error: ok ? null : `UPSTREAM_${r.status}`, upstreamStatus: r.status, upstreamMs: dt });
  return { ok, provider: "elevenlabs", upstreamStatus: r.status, upstreamMs: dt, bytes: r.body ? r.body.length : 0 };
}

// -----------------------------
// Main handler
// -----------------------------
async function handleTts(req, res) {
  const body = readBody(req);

  const inboundTrace = String(req.get("X-SB-Trace-Id") || req.get("x-sb-trace-id") || "").trim();
  const traceId = makeTraceId(inboundTrace);

  const requestId = String(req.get("X-Request-Id") || "").trim() || null;

  const timeoutMsDefault = clampInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS, 15_000, 3_000, 45_000);
  const retryOnceDefault = bool(process.env.ELEVENLABS_TTS_RETRY_ONCE, true);
  const maxChars = clampInt(process.env.ELEVENLABS_TTS_MAX_CHARS, 1200, 200, 6000);

  const logJson = bool(process.env.SB_TTS_LOG_JSON, false);
  const fallbackProvider = String(process.env.SB_TTS_FALLBACK_PROVIDER || "none").trim().toLowerCase();
  const openaiTimeoutMs = clampInt(process.env.OPENAI_TTS_TIMEOUT_MS, 20_000, 3_000, 45_000);

  const tStart = nowMs();

  try {
    // Phase 10: QA/Health checks
    if (body && body.healthCheck === true) {
      const probe = await runHeartbeatProbe({ traceId });

      res.set("X-SB-Trace-Id", traceId);
      return safeJson(res, probe.ok ? 200 : 503, {
        ok: probe.ok,
        probe,
        health: {
          status: hb.status,
          lastCheckAt: hb.lastCheckAt,
          lastOkAt: hb.lastOkAt,
          failStreak: hb.failStreak,
          lastUpstreamStatus: hb.lastUpstreamStatus,
          lastUpstreamMs: hb.lastUpstreamMs,
        },
        requestId,
        traceId,
      });
    }

    // Phase 1/2: social + state hints (fail-open)
    const lane = String(body.lane || body.mode || body.contextLane || "").trim() || null;
    const turnId = String(body.turnId || body.turn || body.tid || "").trim() || null;

    const mood = String((body.mood || body?.cog?.mood || body?.stateHints?.mood || "")).trim().toLowerCase() || "";
    const intent = String((body.intent || body?.cog?.lastIntent || body?.stateHints?.lastIntent || body?.socialIntent || "")).trim().toLowerCase() || "";

    const turnDepthHint = (body && body.stateHints && body.stateHints.turnDepth != null)
      ? clampInt(body.stateHints.turnDepth, 0, 0, 9999)
      : null;
    const lastIntentHint = (body && body.stateHints && body.stateHints.lastIntent)
      ? String(body.stateHints.lastIntent).slice(0, 64)
      : null;

    // Phase 3: resilience overrides (bounded)
    const resilience = (body && typeof body.resilience === "object" && body.resilience) ? body.resilience : null;

    let timeoutEff = timeoutMsDefault;
    if (resilience && resilience.timeout_ms != null) {
      timeoutEff = clampInt(resilience.timeout_ms, timeoutMsDefault, 3_000, 45_000);
    }

    let retryOnceEff = retryOnceDefault;
    if (resilience && resilience.retry_cap != null) {
      const cap = clampInt(resilience.retry_cap, 1, 0, 3);
      retryOnceEff = cap >= 1;
    }

    function presetFromMood(m) {
      switch (String(m || "").toLowerCase()) {
        case "warm":
        case "positive":
        case "happy":
        case "good":
        case "up":
          return "NYX_WARM";
        case "coach":
        case "motivated":
        case "energetic":
          return "NYX_COACH";
        case "calm":
        case "neutral":
        case "steady":
        case "down":
        case "low":
        case "sad":
        case "negative":
          return "NYX_CALM";
        default:
          return "NYX_WARM";
      }
    }

    // Optional timing stamps from upstream
    const chatMs = body.chatMs != null ? clampInt(body.chatMs, 0, 0, 3_600_000) : null;
    const e2eStartTs = body.e2eStartTs != null ? clampInt(body.e2eStartTs, 0, 0, 9_999_999_999_999) : null;
    const e2eMs = (e2eStartTs && e2eStartTs > 0) ? Math.max(0, nowMs() - e2eStartTs) : null;

    let text = cleanText(body.text || body.spokenText || body.replyText || body.message || "");
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

    // Optional "fast-start" mode
    if (!!body.firstSentenceOnly) text = firstSentence(text);
    text = cleanText(text);

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

    // Phase 5: periodic probe (best-effort)
    if (shouldAutoProbe()) {
      runHeartbeatProbe({ traceId }).catch(() => {});
    }

    // Phase 1: build preset + voice settings for Eleven
    const envDefaults = {
      stability: num01(process.env.NYX_VOICE_STABILITY, 0.45),
      similarity_boost: num01(process.env.NYX_VOICE_SIMILARITY, 0.85),
      style: num01(process.env.NYX_VOICE_STYLE, 0.15),
      use_speaker_boost: bool(process.env.NYX_VOICE_SPEAKER_BOOST, true),
    };

    let presetKey = String(body.presetKey || body.voicePreset || body.ttsPresetKey || "").trim();
    if (!presetKey) {
      const isGreetingish = intent && (intent.includes("greet") || intent.includes("hello") || intent.includes("checkin") || intent.includes("social"));
      presetKey = isGreetingish ? "NYX_WARM" : presetFromMood(mood);
    }

    const voiceSettings = mergeVoiceSettings({ envDefaults, presetKey, body });
    const modelIdOverride = body.model_id ? String(body.model_id).trim() : null;

    // Phase 6: cache key helpers
    const setCommonHeaders = () => {
      res.set("X-SB-Trace-Id", traceId);
      if (lane) res.set("X-SB-Lane", lane);
      if (turnId) res.set("X-SB-Turn-Id", turnId);
      if (chatMs != null) res.set("X-SB-Chat-Ms", String(chatMs));
      if (e2eMs != null) res.set("X-SB-E2E-Ms", String(e2eMs));
      if (presetKey) res.set("X-SB-TTS-Preset", String(presetKey).slice(0, 32));
      if (turnDepthHint != null) res.set("X-SB-Turn-Depth", String(turnDepthHint));
      if (lastIntentHint) res.set("X-SB-Last-Intent", String(lastIntentHint));
      if (mood) res.set("X-SB-Mood", String(mood).slice(0, 24));
      if (intent) res.set("X-SB-Intent", String(intent).slice(0, 64));
    };

    // -----------------------------
    // Phase 4: Provider routing (Resemble primary)
    // -----------------------------
    const resembleToken = String(process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_KEY || "").trim();
    const resembleVoiceUuid = String(process.env.RESEMBLE_VOICE_UUID || process.env.RESEMBLE_VOICE_UUID || "").trim();

    if (resembleSynthesize && resembleToken && resembleVoiceUuid && !shouldBypassLiveAttempt()) {
      // Cache lookup for Resemble
      const rKey = cacheKey({
        provider: "resemble",
        voiceId: resembleVoiceUuid,
        host: "f.cluster.resemble.ai",
        modelId: String(process.env.RESEMBLE_MODEL || "resemble").trim(),
        voiceSettings: null, // Resemble provider handles its own voice; keep key minimal
        text,
      });

      const cached = cacheGet(rKey);
      if (cached && cached.buf && cached.buf.length > 1000) {
        const tMs = nowMs() - tStart;

        setCommonHeaders();
        res.set("X-SB-TTS-Provider", "cache");
        res.set("X-SB-TTS-Ms", String(tMs));
        res.set("X-SB-TTS-Upstream-Ms", "0");
        res.set("X-SB-TTS-Retry", "0");
        res.set("X-SB-TTS-Failover", "0");
        res.set("X-SB-TTS-Fallback", "0");
        res.set("X-SB-TTS-Upstream-Status", "200");
        res.set("X-SB-TTS-Bytes", String(cached.buf.length));

        return sendAudio(res, req, { body, buf: cached.buf, headers: { traceId }, mimeType: cached.meta?.mimeType || "audio/mpeg" });
      }

      const rStart = nowMs();
      let r;
      try {
        r = await resembleSynthesize({
          text,
          voiceUuid: resembleVoiceUuid,
          outputFormat: String(process.env.RESEMBLE_OUTPUT_FORMAT || "mp3").trim(),
          timeoutMs: clampInt(process.env.RESEMBLE_TIMEOUT_MS, 15_000, 3_000, 45_000),
          traceId,
        });
      } catch (e) {
        r = { ok: false, reason: "RESEMBLE_EXCEPTION", message: e?.message || String(e) };
      }
      const rUpMs = nowMs() - rStart;

      if (r && r.ok && r.buffer && r.buffer.length > 1000) {
        cacheSet(rKey, r.buffer, { provider: "resemble", mimeType: r.mimeType || "audio/mpeg" });

        const tMs = nowMs() - tStart;
        setCommonHeaders();
        res.set("X-SB-TTS-Provider", "resemble");
        res.set("X-SB-TTS-Ms", String(tMs));
        res.set("X-SB-TTS-Upstream-Ms", String(rUpMs));
        res.set("X-SB-TTS-Retry", "0");
        res.set("X-SB-TTS-Failover", "0");
        res.set("X-SB-TTS-Fallback", "0");
        res.set("X-SB-TTS-Upstream-Status", "200");
        res.set("X-SB-TTS-Bytes", String(r.buffer.length));

        if (logJson) {
          try {
            console.log(JSON.stringify({
              t: nowMs(),
              ok: true,
              provider: "resemble",
              traceId,
              requestId,
              lane,
              turnId,
              ms_total: tMs,
              ms_upstream: rUpMs,
              bytes: r.buffer.length,
              chars: text.length,
            }));
          } catch (_) {}
        }

        return sendAudio(res, req, { body, buf: r.buffer, headers: { traceId }, mimeType: r.mimeType || "audio/mpeg" });
      }

      // Resemble failed -> mark health degraded (fail-open)
      updateHealth(false, { error: r?.reason || r?.message || "RESEMBLE_FAIL", upstreamStatus: r?.status || 0, upstreamMs: rUpMs });

      if (logJson) {
        try {
          console.log(JSON.stringify({
            t: nowMs(),
            ok: false,
            provider: "resemble",
            traceId,
            requestId,
            lane,
            turnId,
            reason: r?.reason || r?.message || "RESEMBLE_FAIL",
            status: r?.status || 0,
            ms_upstream: rUpMs,
            chars: text.length,
          }));
        } catch (_) {}
      }
      // fall through to ElevenLabs
    }

    // -----------------------------
    // ElevenLabs fallback (primary + retry + secondary failover)
    // -----------------------------
    const primaryCfg = getElevenCfg("primary");
    const secondaryCfg = getElevenCfg("secondary");

    const bypassElevenPrimary = shouldBypassLiveAttempt();

    // Attempt helper
    async function attemptEleven(cfg, label) {
      const tUpStart = nowMs();
      try {
        const r = await elevenlabsRequest({
          cfg,
          text,
          traceId,
          timeoutEff,
          voiceSettings,
          modelIdOverride,
        });
        return { r, ms: nowMs() - tUpStart, label };
      } catch (e) {
        const ms = nowMs() - tUpStart;
        const r = { status: 0, headers: {}, body: Buffer.from(String(e?.message || e || "TTS_ERROR")) };
        r.__err = String(e?.message || e);
        return { r, ms, label };
      }
    }

    let retried = false;
    let failoverUsed = false;
    let providerUsed = null;

    let result = null;

    if (!bypassElevenPrimary && primaryCfg.ok) {
      result = await attemptEleven(primaryCfg, "primary");
      providerUsed = "elevenlabs_primary";
    }

    // retry-once on retryable primary failures
    if (result && (result.r.status === 0 || isRetryableStatus(result.r.status)) && retryOnceEff && primaryCfg.ok && !bypassElevenPrimary) {
      retried = true;
      const ra = result?.r?.headers ? result.r.headers["retry-after"] : null;
      let delay = 180;
      if (ra) {
        const s = parseFloat(String(ra));
        if (Number.isFinite(s) && s > 0) delay = Math.min(1200, Math.max(180, Math.floor(s * 1000)));
      }
      await jitterSleep(delay);
      const r2 = await attemptEleven(primaryCfg, "primary_retry");
      if (r2.r.status >= 200 && r2.r.status < 300) {
        result = r2;
        providerUsed = "elevenlabs_primary";
      }
    }

    // secondary failover
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

    const okEleven = result && (result.r.status >= 200 && result.r.status < 300) && result.r.body && result.r.body.length > 1000;

    if (okEleven) {
      updateHealth(true, { upstreamStatus: result.r.status, upstreamMs: result.ms });

      // cache for Eleven
      const hostForKey = result?.r?.host || primaryCfg.host || "";
      const voiceForKey = (providerUsed === "elevenlabs_secondary" ? secondaryCfg.voiceId : primaryCfg.voiceId) || "";
      const modelForKey = String(modelIdOverride || (providerUsed === "elevenlabs_secondary" ? secondaryCfg.modelId : primaryCfg.modelId) || "eleven_multilingual_v2").trim();

      const cKey = cacheKey({
        provider: "elevenlabs",
        voiceId: voiceForKey,
        host: hostForKey,
        modelId: modelForKey,
        voiceSettings,
        text,
      });

      cacheSet(cKey, result.r.body, { provider: providerUsed || "elevenlabs", mimeType: "audio/mpeg" });

      const tMs = nowMs() - tStart;

      setCommonHeaders();
      res.set("X-SB-TTS-Provider", providerUsed || "elevenlabs");
      res.set("X-SB-TTS-Ms", String(tMs));
      res.set("X-SB-TTS-Upstream-Ms", String(result.ms));
      res.set("X-SB-TTS-Retry", retried ? "1" : "0");
      res.set("X-SB-TTS-Failover", failoverUsed ? "1" : "0");
      res.set("X-SB-TTS-Fallback", "0");
      res.set("X-SB-TTS-Upstream-Status", String(result.r.status || 0));
      res.set("X-SB-TTS-Bytes", String(result.r.body.length));

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
            bytes: result.r.body.length,
            chars: text.length,
          }));
        } catch (_) {}
      }

      return sendAudio(res, req, { body, buf: result.r.body, headers: { traceId }, mimeType: "audio/mpeg" });
    }

    // -----------------------------
    // Phase 4 fallback tier: OpenAI optional
    // -----------------------------
    if (fallbackProvider === "openai") {
      const tUpStart = nowMs();
      let fr;
      try {
        fr = await openaiTtsRequest({ text, traceId, timeoutEff: openaiTimeoutMs });
      } catch (e) {
        fr = { status: 0, headers: {}, body: Buffer.from(String(e?.message || e)), provider: "openai" };
        fr.__err = String(e?.message || e);
      }
      const upMs2 = nowMs() - tUpStart;

      if (fr.status >= 200 && fr.status < 300 && fr.body && fr.body.length > 1000) {
        const tMs = nowMs() - tStart;

        setCommonHeaders();
        res.set("X-SB-TTS-Provider", "openai");
        res.set("X-SB-TTS-Ms", String(tMs));
        res.set("X-SB-TTS-Upstream-Ms", String(upMs2));
        res.set("X-SB-TTS-Retry", retried ? "1" : "0");
        res.set("X-SB-TTS-Failover", failoverUsed ? "1" : "0");
        res.set("X-SB-TTS-Fallback", "1");
        res.set("X-SB-TTS-Upstream-Status", String(fr.status || 0));
        res.set("X-SB-TTS-Bytes", String(fr.body.length));

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
              ms_total: tMs,
              ms_upstream: upMs2,
              bytes: fr.body.length,
              chars: text.length,
            }));
          } catch (_) {}
        }

        return sendAudio(res, req, { body, buf: fr.body, headers: { traceId }, mimeType: "audio/mpeg" });
      }
    }

    // -----------------------------
    // Phase 8: deterministic safe failure envelope
    // -----------------------------
    const tMs = nowMs() - tStart;

    setCommonHeaders();
    res.set("X-SB-TTS-Provider", providerUsed || "none");
    res.set("X-SB-TTS-Ms", String(tMs));
    res.set("X-SB-TTS-Upstream-Status", String(result ? (result.r.status || 0) : 0));
    res.set("X-SB-TTS-Retry", retried ? "1" : "0");
    res.set("X-SB-TTS-Failover", failoverUsed ? "1" : "0");
    res.set("X-SB-TTS-Fallback", fallbackProvider === "openai" ? "1" : "0");

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
          fallbackProvider,
          eleven_upstreamStatus: result ? result.r.status : 0,
          eleven_upstreamMs: result ? result.ms : null,
          ms_total: tMs,
          chars: text.length,
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
      traceId,
    });

  } catch (e) {
    try {
      res.set("X-SB-Trace-Id", traceId);
      res.set("X-SB-TTS-Ms", String(nowMs() - tStart));
    } catch (_) {}

    return safeJson(res, 500, {
      ok: false,
      error: "TTS_INTERNAL_ERROR",
      message: String(e?.message || e),
      requestId,
      traceId,
    });
  }
}

module.exports = { handleTts };
"""
out = Path("/mnt/data/tts.hardened.js")
out.write_text(fixed, encoding="utf-8")
(str(out), len(fixed.splitlines()))
