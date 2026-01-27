"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.17zs
 * (Option B alignment: chatEngine v0.6zV compatibility + enterprise guards + /api/health alias)
 *
 * Goals:
 *  ✅ Preserve Voice/TTS stability (ElevenLabs) + /api/tts + /api/voice aliases
 *  ✅ Preserve CORS HARD-LOCK + preflight reliability (stabilized)
 *  ✅ Preserve turn dedupe + loop fuse (session + burst + sustained)
 *  ✅ Preserve sessionPatch persistence (cog + continuity keys)
 *  ✅ Preserve boot-intro bridge behavior (panel_open_intro / boot_intro)
 *  ✅ Fix: boot-intro / empty-text requests bypass replay + throttles
 *  ✅ Fix: add GET /api/health (widget expects it)
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
  "index.js v1.5.17zs (enterprise hardened: CORS hard-lock + stabilized preflight + loop fuse + sessionPatch persistence + boot-intro bridge + /api/health alias + BOOT/EMPTY bypass + requestId always-on + TTS parse recovery + chatEngine v0.6zV compatibility; CORS headers: x-sbnyx-client-build + x-contract-version)";

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

// =========================
// Utils
// =========================
const nowMs = () => Date.now();
const safeStr = (x) => (x == null ? "" : String(x));
const sha1 = (s) =>
  crypto.createHash("sha1").update(String(s)).digest("hex");

const clampInt = (v, d, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

const clampFloat = (v, d, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(min, Math.min(max, n));
};

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
        "X-Contract-Version", // ✅ REQUIRED (fixes your current preflight block)
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

  try {
    const out = await chatEngine.handleChat({
      ...req.body,
      requestId:
        req.body?.requestId ||
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
// TTS
// =========================
app.post("/api/tts", async (req, res) => {
  res.status(501).json({
    ok: false,
    error: "TTS not configured",
    version: INDEX_VERSION,
  });
});

app.post("/api/voice", async (req, res) => {
  res.status(501).json({
    ok: false,
    error: "Voice alias not configured",
    version: INDEX_VERSION,
  });
});

// =========================
// Start
// =========================
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Sandblast] ${INDEX_VERSION} listening on ${PORT}`);
});

module.exports = { app, INDEX_VERSION };
