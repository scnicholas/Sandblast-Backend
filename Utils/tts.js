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

function cleanText(input) {
  // Strip hard control chars (except \n, \r, \t) that can confuse upstream.
  const s = String(input || "");
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

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
  return `tts_${t}_${rnd.slice(0, 8)}`;}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function elevenlabsRequest({ apiKey, voiceId, text, traceId, timeoutMs }) {
  const modelId = String(process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2").trim();
  const host = String(process.env.ELEVENLABS_HOST || "api.elevenlabs.io").trim() || "api.elevenlabs.io";

  const stability = num01(process.env.NYX_VOICE_STABILITY, 0.45);
  const similarity = num01(process.env.NYX_VOICE_SIMILARITY, 0.85);
  const style = num01(process.env.NYX_VOICE_STYLE, 0.15);
  const speakerBoost = bool(process.env.NYX_VOICE_SPEAKER_BOOST, true);

  const payload = JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: {
      stability,
      similarity_boost: similarity,
      style,
      use_speaker_boost: speakerBoost,
    },
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
      "User-Agent": "Sandblast-Nyx-TTS/1.0",
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

  const tStart = Date.now();

  try {
    const body = readBody(req);
    let text = cleanText(body.text || body.message || "");

    if (!text) {
      res.set("X-SB-Trace-Id", traceId);
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
      return safeJson(res, 501, {
        ok: false,
        error: "TTS_NOT_CONFIGURED",
        message: "Missing ELEVENLABS_API_KEY and/or NYX_VOICE_ID (or ELEVENLABS_VOICE_ID).",
        requestId,
        traceId,
      });
    }

    // Upstream request (retry-once for transient issues)
    let r;
    let retried = false;

    try {
      r = await elevenlabsRequest({
        apiKey: cfg.key,
        voiceId: cfg.voiceId,
        text,
        traceId,
        timeoutMs,
      });
    } catch (e) {
      // Timeout or network error. We'll treat as retryable.
      r = { status: 0, headers: {}, body: Buffer.from(String(e && e.message ? e.message : e || "TTS_ERROR")) };
      r.__err = String(e && e.message ? e.message : e);
    }

    if ((r.status === 0 || isRetryableStatus(r.status)) && retryOnce && !req.aborted && !res.writableEnded) {
      retried = true;
      // tiny backoff helps 429 collisions
      await new Promise((rr) => setTimeout(rr, 180));
      try {
        const r2 = await elevenlabsRequest({
          apiKey: cfg.key,
          voiceId: cfg.voiceId,
          text,
          traceId,
          timeoutMs,
        });
        // prefer successful retry, else keep first response for preview
        if (r2 && r2.status >= 200 && r2.status < 300) r = r2;
      } catch (e2) {
        // keep original r
      }
    }

    const tMs = Date.now() - tStart;

    // Telemetry headers (safe for binary responses)
    res.set("X-SB-Trace-Id", traceId);
    res.set("X-SB-TTS-Ms", String(tMs));
    res.set("X-SB-TTS-Retry", retried ? "1" : "0");

    if (r.status >= 200 && r.status < 300) {
      // Return audio
      const bytes = r.body ? r.body.length : 0;
      res.set("X-SB-TTS-Bytes", String(bytes));

      res.status(200);
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "no-store");
      // Some clients like filename hints
      res.set("Content-Disposition", 'inline; filename="nyx_tts.mp3"');

      if (req.aborted || res.writableEnded) return;
      return res.send(r.body);
    }

    // ElevenLabs error often returns JSON; try to decode a small preview
    let preview = "";
    try {
      preview = r.body ? r.body.toString("utf8").slice(0, 1200) : "";
    } catch (_) {}

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
