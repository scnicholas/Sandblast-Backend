"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.17zu
 * (Option B alignment: chatEngine v0.6zV compatibility + enterprise guards + /api/health alias)
 *
 * Goals:
 *  ✅ Preserve Voice/TTS stability (ElevenLabs) + /api/tts + /api/voice aliases  <-- FIXED (no more 501 stub)
 *  ✅ Preserve CORS HARD-LOCK + preflight reliability (stabilized)
 *  ✅ Preserve sessionPatch persistence
 *  ✅ Fix: allow x-sbnyx-client-build header (CORS)
 *  ✅ FIX: allow x-contract-version header (CORS)  <-- REQUIRED
 *
 * NOTE:
 *  - Expects ./Utils/chatEngine.js to export handleChat
 *  - Full-file deliverable (drop-in)
 */

// =========================
// Imports
// =========================
const express = require("express");
const crypto = require("crypto");

// Optional safe require
function safeRequire(p) {
  try {
    return require(p);
  } catch {
    return null;
  }
}

// Engine + fetch
const chatEngine =
  safeRequire("./Utils/chatEngine") ||
  safeRequire("./Utils/chatEngine.js") ||
  null;

const fetch = global.fetch || safeRequire("node-fetch");

// =========================
// Version
// =========================
const INDEX_VERSION =
  "index.js v1.5.17zu (enterprise hardened: CORS hard-lock + stabilized preflight + chatEngine v0.6zV compatibility; CORS headers: x-sbnyx-client-build + x-contract-version; ElevenLabs TTS restored on /api/tts + /api/voice)";

// =========================
// Env / knobs
// =========================
const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = String(process.env.NODE_ENV || "production").trim();
const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim();
const MAX_JSON_BODY = String(process.env.MAX_JSON_BODY || "512kb");

const ORIGINS_ALLOWLIST = String(
  process.env.CORS_ALLOW_ORIGINS ||
    "https://sandblast.channel,https://www.sandblast.channel,https://sandblastchannel.com,https://www.sandblastchannel.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ORIGINS_REGEX_ALLOWLIST = String(
  process.env.CORS_ALLOW_ORIGINS_REGEX || ""
).trim();

// ElevenLabs
const ELEVEN_API_KEY = String(
  process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY || ""
).trim();

const ELEVEN_VOICE_ID = String(
  process.env.ELEVENLABS_VOICE_ID || process.env.NYX_VOICE_ID || ""
).trim();

const NYX_VOICE_STABILITY = clampFloat(process.env.NYX_VOICE_STABILITY, 0.45, 0, 1);
const NYX_VOICE_SIMILARITY = clampFloat(process.env.NYX_VOICE_SIMILARITY, 0.72, 0, 1);
const NYX_VOICE_STYLE = clampFloat(process.env.NYX_VOICE_STYLE, 0.25, 0, 1);
const NYX_VOICE_SPEAKER_BOOST = toBool(process.env.NYX_VOICE_SPEAKER_BOOST, true);

// =========================
// Utils
// =========================
const nowMs = () => Date.now();
const safeStr = (x) => (x == null ? "" : String(x));
const sha1 = (s) =>
  crypto.createHash("sha1").update(String(s)).digest("hex");

function clampFloat(v, d, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

const toBool = (v, d) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return !!d;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return !!d;
};

const normalizeOrigin = (o) => safeStr(o).replace(/\/$/, "");

const ORIGIN_REGEXES = ORIGINS_REGEX_ALLOWLIST
  .split(";")
  .map((r) => {
    try {
      const t = r.trim();
      if (!t) return null;
      return new RegExp(t);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const o = normalizeOrigin(origin);
  if (ORIGINS_ALLOWLIST.includes(o)) return true;
  return ORIGIN_REGEXES.some((rx) => {
    try {
      return rx.test(o);
    } catch {
      return false;
    }
  });
}

function safeJsonParseMaybe(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "object") return x;
  const s = String(x).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// =========================
// App
// =========================
const app = express();

if (toBool(TRUST_PROXY, false)) {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: MAX_JSON_BODY }));
app.use(express.text({ type: ["text/*"], limit: MAX_JSON_BODY }));

// =========================
// CORS HARD-LOCK (FIXED)
// =========================
app.use((req, res, next) => {
  const origin = normalizeOrigin(req.headers.origin || "");
  const allow = origin && isAllowedOrigin(origin);

  if (origin) res.setHeader("Vary", "Origin");

  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-SB-Session",
        "X-Session-Id",
        "X-Visitor-Id",
        "X-Request-Id",
        "X-Route-Hint",
        "X-SBNYX-Client-Build",
        "X-SBNYX-Widget-Version",
        "X-Contract-Version", // ✅ REQUIRED
        // helpful extras (browsers sometimes add these):
        "Accept",
        "Range",
      ].join(", ")
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  return next();
});

// =========================
// Health
// =========================
app.get("/health", (req, res) => {
  res.json({ ok: true, version: INDEX_VERSION, up: true, env: NODE_ENV, now: new Date().toISOString() });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: INDEX_VERSION, up: true, env: NODE_ENV, now: new Date().toISOString() });
});

// =========================
// Chat
// =========================
app.post("/api/chat", async (req, res) => {
  if (!chatEngine || typeof chatEngine.handleChat !== "function") {
    return res.status(500).json({
      ok: false,
      error: "chatEngine missing",
      version: INDEX_VERSION,
    });
  }

  const body = (typeof req.body === "object" && req.body) ? req.body : safeJsonParseMaybe(req.body) || {};

  try {
    const out = await chatEngine.handleChat({
      ...body,
      requestId:
        body?.requestId ||
        (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : sha1(`${nowMs()}|${Math.random()}`)),
    });

    return res.json({ ok: true, ...out });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: safeStr(e?.message || e),
      version: INDEX_VERSION,
    });
  }
});

// =========================
// TTS (ElevenLabs) — FIXED
// =========================
async function handleTtsRoute(req, res) {
  // Accept either JSON body or raw text
  let body = (typeof req.body === "object" && req.body) ? req.body : safeJsonParseMaybe(req.body) || {};
  if (typeof req.body === "string") body = { text: req.body };

  const text = safeStr(body.text || body.message || body.prompt || "").trim();
  const noText = toBool(body.NO_TEXT || body.noText, false);

  // Hard truth: if not configured, return 501
  if (!ELEVEN_API_KEY || !ELEVEN_VOICE_ID || !fetch) {
    return res.status(501).json({
      ok: false,
      error:
        "TTS not configured (set ELEVENLABS_API_KEY/ELEVEN_API_KEY and ELEVENLABS_VOICE_ID/NYX_VOICE_ID).",
      version: INDEX_VERSION,
    });
  }

  if (!text && !noText) {
    return res.status(400).json({
      ok: false,
      error: "Missing text for TTS.",
      version: INDEX_VERSION,
    });
  }

  try {
    const payload = {
      text: text || " ",
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: NYX_VOICE_STABILITY,
        similarity_boost: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        use_speaker_boost: NYX_VOICE_SPEAKER_BOOST,
      },
    };

    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVEN_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!r.ok) {
      const errTxt = await r.text().catch(() => "");
      return res.status(502).json({
        ok: false,
        error: "TTS upstream error",
        detail: safeStr(errTxt).slice(0, 800),
        status: r.status,
        version: INDEX_VERSION,
      });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(buf.length));
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "TTS failure",
      detail: safeStr(e?.message || e).slice(0, 250),
      version: INDEX_VERSION,
    });
  }
}

app.post("/api/tts", handleTtsRoute);
app.post("/api/voice", handleTtsRoute);

// =========================
// Start
// =========================
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Sandblast] ${INDEX_VERSION} listening on ${PORT}`);
});

module.exports = { app, INDEX_VERSION };
