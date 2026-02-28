"use strict";

/**
 * Utils/tts.js
 *
 * TTS handler for Nyx (ElevenLabs)
 * - Export shape: handleTts(req,res)
 * - Never throws upward (index.js already guards, but we also guard here)
 * - Returns audio/mpeg by default
 * - If not configured, returns 501 TTS_NOT_CONFIGURED (deterministic)
 *
 * Enhancements (no structural changes):
 *  - Add configurable timeout + safe retry-once for transient 429/5xx/timeouts
 *  - Add lightweight telemetry via response headers (X-SB-Trace-Id, X-SB-TTS-Ms, X-SB-TTS-Bytes, X-SB-TTS-Retry)
 *  - Add input guardrails (max chars) to prevent runaway latency and upstream rejections
 *  - Add optional first-sentence mode (for "Nick call-agent" fast-start) without changing API shape
 *  - Add upstream error preview hardening
 *  - NEW: Apply per-turn ElevenLabs voice_settings from body.ttsProfile / body.voice_settings (AffectEngine output)
 *  - NEW: Optional presetKey support ("NYX_CALM" | "NYX_COACH" | "NYX_WARM") with env defaults + overrides
 *  - NEW: Structured latency markers (X-SB-Chat-Ms, X-SB-TTS-Upstream-Ms, X-SB-E2E-Ms) when provided
 *
 * Expected env:
 *  - ELEVENLABS_API_KEY
 *  - NYX_VOICE_ID
 * Optional tuning env (strings OK):
 *  - NYX_VOICE_STABILITY        (0..1)
 *  - NYX_VOICE_SIMILARITY       (0..1)
 *  - NYX_VOICE_STYLE            (0..1)
 *  - NYX_VOICE_SPEAKER_BOOST    ("true"/"false")
 *
 * Optional:
 *  - ELEVENLABS_MODEL_ID (default: eleven_multilingual_v2)
 *  - ELEVENLABS_HOST (default: api.elevenlabs.io)
 *  - ELEVENLABS_TTS_TIMEOUT_MS (default: 15000)
 *  - ELEVENLABS_TTS_RETRY_ONCE ("true"/"false", default: true)
 *  - ELEVENLABS_TTS_MAX_CHARS (default: 1200)
 *  - ELEVENLABS_TTS_MAX_SOCKETS (default: 16)
 *  - SB_TTS_LOG_JSON ("true"/"false", default: false)  // logs one JSON line per request
 */

const https = require("https");

// Keep sockets warm to reduce cold-start latency and transient 5xx/ECONNRESET patterns.
// Safe default for small servers; can be tuned via env.
const KEEPALIVE = true;
const MAX_SOCKETS = (() => {
  const n = parseInt(String(process.env.ELEVENLABS_TTS_MAX_SOCKETS || ""), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(64, n)) : 16;
})();
const keepAliveAgent = new https.Agent({ keepAlive: KEEPALIVE, maxSockets: MAX_SOCKETS });

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
  // Your server already parses JSON, so req.body should exist.
  const b = req && req.body;
  if (!b) return {};
  if (typeof b === "string") return { text: b.trim() };
  if (typeof b === "object" && b) return b;
  return {};
}

function readBodyText(req) {
  const b = readBody(req);
  return String(b.text || b.message || "").trim();
}

function firstSentence(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  // Split on sentence-ending punctuation. Keep it simple and deterministic.
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  if (m && m[1]) return m[1].trim();
  // Fallback: first 180 chars
  return t.slice(0, 180).trim();
}

function cleanText(input) {
  // Strip hard control chars (except \n, \r, \t) that can confuse upstream.
  const s = String(input || "");
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function configured() {
  const key = String(process.env.ELEVENLABS_API_KEY || "").trim();
  const voiceId = String(process.env.NYX_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || "").trim();
  return { ok: !!(key && voiceId), key, voiceId };
}

function makeTraceId(provided) {
  const rnd = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  if (provided) {
    const p = String(provided).trim();
    // keep short + ascii-ish
    if (p && p.length <= 64) return p.replace(/[^\w\-:.]/g, "_");
  }
  return `tts_${t}_${rnd.slice(0, 8)}`;
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Presets are intentionally subtle. They stabilize "Nyx-as-a-person" across turns.
 * You can tune later without touching other layers.
 */
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

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Accepts either:
 *  - body.ttsProfile: { stability, similarity, style, speakerBoost }  (AffectEngine output)
 *  - body.voice_settings: { stability, similarity_boost, style, use_speaker_boost } (ElevenLabs native)
 * Returns a merged ElevenLabs voice_settings object.
 */
function mergeVoiceSettings({ envDefaults, presetKey, body }) {
  const fromPreset = presetVoiceSettings(presetKey, envDefaults);

  // 1) AffectEngine shape
  const tp = (body && typeof body.ttsProfile === "object" && body.ttsProfile) ? body.ttsProfile : null;
  const affectOverride = tp ? {
    stability: clamp01(tp.stability),
    similarity_boost: clamp01(tp.similarity),
    style: clamp01(tp.style),
    use_speaker_boost: tp.speakerBoost === undefined ? fromPreset.use_speaker_boost : !!tp.speakerBoost,
  } : null;

  // 2) ElevenLabs native shape
  const vs = (body && typeof body.voice_settings === "object" && body.voice_settings) ? body.voice_settings : null;
  const nativeOverride = vs ? {
    stability: vs.stability === undefined ? undefined : clamp01(vs.stability),
    similarity_boost: vs.similarity_boost === undefined ? undefined : clamp01(vs.similarity_boost),
    style: vs.style === undefined ? undefined : clamp01(vs.style),
    use_speaker_boost: vs.use_speaker_boost === undefined ? undefined : !!vs.use_speaker_boost,
  } : null;

  // Merge order: env -> preset -> affectOverride -> nativeOverride
  const merged = { ...fromPreset };
  if (affectOverride) {
    for (const k of Object.keys(affectOverride)) {
      if (affectOverride[k] !== undefined && affectOverride[k] !== null && Number.isFinite(Number(affectOverride[k])) || typeof affectOverride[k] === "boolean") {
        merged[k] = affectOverride[k];
      }
    }
  }
  if (nativeOverride) {
    for (const k of Object.keys(nativeOverride)) {
      if (nativeOverride[k] !== undefined && nativeOverride[k] !== null) merged[k] = nativeOverride[k];
    }
  }

  // Ensure numeric fields exist
  merged.stability = clamp01(merged.stability);
  merged.similarity_boost = clamp01(merged.similarity_boost);
  merged.style = clamp01(merged.style);
  merged.use_speaker_boost = !!merged.use_speaker_boost;

  return merged;
}

function elevenlabsRequest({ apiKey, voiceId, text, traceId, timeoutMs, voiceSettings, modelIdOverride }) {
  const modelId = String(modelIdOverride || process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2").trim();
  const host = String(process.env.ELEVENLABS_HOST || "api.elevenlabs.io").trim() || "api.elevenlabs.io";

  const payload = JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: voiceSettings,
  });

  const options = {
    hostname: host,
    agent: keepAliveAgent,
    path: `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "User-Agent": "Sandblast-Nyx-TTS/1.1",
      "Content-Length": Buffer.byteLength(payload),
      // Trace for your logs / downstream correlation
      "x-sb-trace-id": traceId,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode || 0, headers: res.headers || {}, body: buf });
      });
    });

    req.on("error", (e) => reject(e));
    req.setTimeout(timeoutMs, () => {
      try {
        req.destroy(new Error("TTS_TIMEOUT"));
      } catch (_) {}
    });

    req.write(payload);
    req.end();
  });
}

async function handleTts(req, res) {
  const requestId = String(req.get("X-Request-Id") || "").trim() || null;
  const inboundTrace = String(req.get("X-SB-Trace-Id") || req.get("x-sb-trace-id") || "").trim() || null;
  const traceId = makeTraceId(inboundTrace);

  const timeoutMs = clampInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS, 15000, 3000, 45000);
  const retryOnce = bool(process.env.ELEVENLABS_TTS_RETRY_ONCE, true);
  const maxChars = clampInt(process.env.ELEVENLABS_TTS_MAX_CHARS, 1200, 200, 6000);
  const logJson = bool(process.env.SB_TTS_LOG_JSON, false);

  const tStart = Date.now();

  try {
    const body = readBody(req);

    // optional metadata (for telemetry / dashboards)
    const lane = String(body.lane || body.mode || body.contextLane || "").trim() || null;
    const turnId = String(body.turnId || body.turn || body.tid || "").trim() || null;

    // optional timing stamps (from chatEngine): do NOT trust, just pass through
    const chatMs = body.chatMs != null ? clampInt(body.chatMs, 0, 0, 3600000) : null;
    const e2eStartMs = body.e2eStartMs != null ? clampInt(body.e2eStartMs, 0, 0, 3600000) : null;

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

    // Optional "fast-start" mode without changing the API shape.
    // If client sends { firstSentenceOnly:true }, we synthesize just the first sentence.
    const firstSentenceOnly = !!body.firstSentenceOnly;
    if (firstSentenceOnly) {
      text = firstSentence(cleanText(text));
    }

    // Guard: ensure cleaned text (controls latency + upstream limits)
    text = cleanText(text);

    // Guard: max chars (controls latency + upstream limits)
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

    // Guard: config
    const cfg = configured();
    if (!cfg.ok) {
      res.set("X-SB-Trace-Id", traceId);
      if (lane) res.set("X-SB-Lane", lane);
      if (turnId) res.set("X-SB-Turn-Id", turnId);
      return safeJson(res, 501, {
        ok: false,
        error: "TTS_NOT_CONFIGURED",
        message: "Missing ELEVENLABS_API_KEY and/or NYX_VOICE_ID (or ELEVENLABS_VOICE_ID).",
        requestId,
        traceId,
      });
    }

    // Voice settings: env defaults -> presetKey -> affectEngine overrides (ttsProfile) -> native overrides (voice_settings)
    const envDefaults = {
      stability: num01(process.env.NYX_VOICE_STABILITY, 0.45),
      similarity_boost: num01(process.env.NYX_VOICE_SIMILARITY, 0.85),
      style: num01(process.env.NYX_VOICE_STYLE, 0.15),
      use_speaker_boost: bool(process.env.NYX_VOICE_SPEAKER_BOOST, true),
    };
    const presetKey = String(body.presetKey || body.voicePreset || "").trim() || null;
    const voiceSettings = mergeVoiceSettings({ envDefaults, presetKey, body });

    // Optional model override (rare, but useful for A/B)
    const modelIdOverride = body.model_id ? String(body.model_id).trim() : null;

    // Upstream request (retry-once for transient issues)
    let r;
    let retried = false;

    const tUpStart = Date.now();
    try {
      r = await elevenlabsRequest({
        apiKey: cfg.key,
        voiceId: cfg.voiceId,
        text,
        traceId,
        timeoutMs,
        voiceSettings,
        modelIdOverride,
      });
    } catch (e) {
      // Timeout or network error. We'll treat as retryable.
      r = { status: 0, headers: {}, body: Buffer.from(String(e && e.message ? e.message : e || "TTS_ERROR")) };
      r.__err = String(e && e.message ? e.message : e);
    }
    let tUpMs = Date.now() - tUpStart;

    if ((r.status === 0 || isRetryableStatus(r.status)) && retryOnce && !req.aborted && !res.writableEnded) {
      retried = true;
      // tiny backoff helps 429 collisions
      await new Promise((rr) => setTimeout(rr, 180));
      const tUp2Start = Date.now();
      try {
        const r2 = await elevenlabsRequest({
          apiKey: cfg.key,
          voiceId: cfg.voiceId,
          text,
          traceId,
          timeoutMs,
          voiceSettings,
          modelIdOverride,
        });
        const tUp2Ms = Date.now() - tUp2Start;
        // prefer successful retry, else keep first response for preview
        if (r2 && r2.status >= 200 && r2.status < 300) {
          r = r2;
          tUpMs = tUp2Ms;
        }
      } catch (e2) {
        // keep original r
      }
    }

    const tMs = Date.now() - tStart;

    // Telemetry headers (safe for binary responses)
    res.set("X-SB-Trace-Id", traceId);
    res.set("X-SB-TTS-Ms", String(tMs));
    res.set("X-SB-TTS-Upstream-Ms", String(tUpMs));
    res.set("X-SB-TTS-Retry", retried ? "1" : "0");
    res.set("X-SB-TTS-Upstream-Status", String(r.status || 0));
    if (lane) res.set("X-SB-Lane", lane);
    if (turnId) res.set("X-SB-Turn-Id", turnId);
    if (chatMs != null) res.set("X-SB-Chat-Ms", String(chatMs));
    if (e2eStartMs != null) res.set("X-SB-E2E-Start-Ms", String(e2eStartMs));
    // Helpful for debugging in the field (do NOT include secrets)
    if (presetKey) res.set("X-SB-TTS-Preset", String(presetKey).slice(0, 32));
    res.set("X-SB-TTS-Voice", String(cfg.voiceId).slice(0, 32));

    if (r.status >= 200 && r.status < 300) {
      // Return audio
      const bytes = r.body ? r.body.length : 0;
      res.set("X-SB-TTS-Bytes", String(bytes));

      res.status(200);
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "no-store");
      // Some clients like filename hints
      res.set("Content-Disposition", 'inline; filename="nyx_tts.mp3"');

      if (logJson) {
        try {
          console.log(JSON.stringify({
            t: Date.now(),
            ok: true,
            traceId,
            requestId,
            lane,
            turnId,
            retried,
            upstreamStatus: r.status,
            ms_total: tMs,
            ms_upstream: tUpMs,
            bytes,
            voiceId: cfg.voiceId,
            presetKey: presetKey || null,
            voice_settings: voiceSettings,
            chars: text.length,
          }));
        } catch (_) {}
      }

      if (req.aborted || res.writableEnded) return;
      return res.send(r.body);
    }

    // ElevenLabs error often returns JSON; try to decode a small preview
    let preview = "";
    try {
      preview = r.body ? r.body.toString("utf8").slice(0, 1200) : "";
    } catch (_) {}

    if (logJson) {
      try {
        console.log(JSON.stringify({
          t: Date.now(),
          ok: false,
          traceId,
          requestId,
          lane,
          turnId,
          retried,
          upstreamStatus: r.status,
          ms_total: tMs,
          ms_upstream: tUpMs,
          voiceId: cfg.voiceId,
          presetKey: presetKey || null,
          voice_settings: voiceSettings,
          chars: text.length,
          preview: preview ? preview.slice(0, 200) : null
        }));
      } catch (_) {}
    }

    return safeJson(res, 502, {
      ok: false,
      error: "TTS_UPSTREAM_ERROR",
      status: r.status,
      message: r.__err === "TTS_TIMEOUT" ? "TTS upstream timed out." : "ElevenLabs returned a non-2xx response.",
      preview: preview || null,
      requestId,
      traceId,
      retried,
    });
  } catch (e) {
    try {
      res.set("X-SB-Trace-Id", traceId);
      res.set("X-SB-TTS-Retry", "0");
      res.set("X-SB-TTS-Ms", String(Date.now() - tStart));
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
