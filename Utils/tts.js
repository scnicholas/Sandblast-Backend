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
 */

const https = require("https");

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

function safeJson(res, status, obj) {
  try {
    res.status(status).json(obj);
  } catch (_) {
    try {
      res.status(status).type("text/plain").send(String(obj && obj.message ? obj.message : "error"));
    } catch (_) {}
  }
}

function readBodyText(req) {
  // Your server already parses JSON, so req.body should exist.
  const b = req && req.body;
  if (!b) return "";
  if (typeof b === "string") return b.trim();
  if (typeof b === "object") return String(b.text || b.message || "").trim();
  return "";
}

function configured() {
  const key = String(process.env.ELEVENLABS_API_KEY || "").trim();
  const voiceId = String(process.env.NYX_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || "").trim();
  return { ok: !!(key && voiceId), key, voiceId };
}

function elevenlabsRequest({ apiKey, voiceId, text }) {
  const modelId = String(process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2").trim();

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
    hostname: "api.elevenlabs.io",
    path: `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
      "Content-Length": Buffer.byteLength(payload),
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
    req.setTimeout(15000, () => {
      try { req.destroy(new Error("TTS_TIMEOUT")); } catch (_) {}
    });

    req.write(payload);
    req.end();
  });
}

async function handleTts(req, res) {
  const requestId = String(req.get("X-Request-Id") || "").trim() || null;

  try {
    const text = readBodyText(req);

    if (!text) {
      return safeJson(res, 400, {
        ok: false,
        error: "BAD_REQUEST",
        detail: "MISSING_TEXT",
        message: "Provide {text} in JSON body.",
        requestId,
      });
    }

    // Guard: config
    const cfg = configured();
    if (!cfg.ok) {
      return safeJson(res, 501, {
        ok: false,
        error: "TTS_NOT_CONFIGURED",
        message: "Missing ELEVENLABS_API_KEY and/or NYX_VOICE_ID (or ELEVENLABS_VOICE_ID).",
        requestId,
      });
    }

    const r = await elevenlabsRequest({ apiKey: cfg.key, voiceId: cfg.voiceId, text });

    if (r.status >= 200 && r.status < 300) {
      // Return audio
      res.status(200);
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "no-store");

      // Some clients like filename hints
      res.set("Content-Disposition", 'inline; filename="nyx_tts.mp3"');

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
      message: "ElevenLabs returned a non-2xx response.",
      preview: preview || null,
      requestId,
    });
  } catch (e) {
    return safeJson(res, 500, {
      ok: false,
      error: "TTS_INTERNAL_ERROR",
      message: String(e && e.message ? e.message : e),
      requestId,
    });
  }
}

module.exports = { handleTts };
