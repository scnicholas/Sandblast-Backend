/**
 * index.js — Sandblast Backend (Nyx)
 * Critical fixes:
 *  - Intro ALWAYS wins on first contact (even if widget sends lane token)
 *  - Fix chip arbitration boolean precedence bug
 *  - Loop guard less aggressive + never pollutes the intro
 *  - /api/voice is a real alias of /api/tts
 *  - Keeps your state spine + safe imports + final-boundary TTS
 *
 * Additional critical updates (non-destructive):
 *  - If first message is a lane token/chip, intro still returns (single line),
 *    BUT we store the selected lane so next user text continues in that lane
 *    without requiring a second chip tap.
 *
 * NEW (2026-01-01):
 *  - Merge module-provided sessionPatch into session spine safely
 *    (needed for musicKnowledge Moment Intelligence continuity: lastMusicYear/lastMusicChart)
 *
 * NEW (2026-01-01, PATCH B):
 *  - Payload tolerance: accept message from multiple keys (message/text/input/value/label/query)
 *    to prevent "empty message" looping when the widget sends a different shape.
 *  - Optional sessionId aliases (sid/session) for the same reason.
 *  - Debug tracing of incoming payload keys + resolved message (NYX_DEBUG=true)
 *
 * NEW (2026-01-01, PATCH C — LOOP FIX):
 *  - NEVER treat lane keywords (music/tv/sponsors/ai/general or lane:*) as a user name.
 *  - Harden extractName/isOnlyName and reorder chip arbitration ahead of name capture post-intro.
 *
 * NEW (2026-01-01, PATCH D — PRODUCTION SANITY):
 *  - Optional boot sanity check for 1950–1959 singles dataset (Render deployment visibility).
 *  - /api/health includes music50s counts (if file present) so you can verify production instantly.
 *
 * NEW (2026-01-01, PATCH E — RENDER ROOT-DIR FIX):
 *  - Sanity check no longer relies on process.cwd() only.
 *  - Walks UP parent directories (from __dirname) to find Data/wikipedia dataset even if
 *    Render "Root Directory" is a subfolder.
 *  - Adds high-signal directory evidence so missing file is obvious (NYX_DEBUG=true).
 *
 * NEW (2026-01-01, PATCH F — DEPLOY SURVIVAL):
 *  - Never crash-loop production just because a static dataset is missing.
 *  - Legacy NYX_SANITY_ENFORCE becomes warn-only.
 *  - Only NYX_SANITY_HARD_FAIL=true can terminate the process.
 *  - Always-on directory evidence when sanity fails (no need to enable debug).
 *
 * NEW (2026-01-01, PATCH G — MUSIC MOMENTS ROUTING):
 *  - Add musicMoments module (Utils/musicMoments.js) if present.
 *  - If user asks for "story moment" / "moment" / "top 10" / "top ten" (etc.), route to musicMoments first.
 *  - Fallback to existing musicKnowledge.handleChat unchanged.
 *
 * NEW (2026-01-02, PATCH G2 — IMPLICIT MUSIC LANE):
 *  - If user types "story moment 1957" or "top 10 1988" WITHOUT selecting the music chip,
 *    automatically treat that message as the music domain (and persist activeDomain="music").
 *
 * NEW (2026-01-02, PATCH H — BUILD STAMP + FIRST-CONTACT MUSIC ARM):
 *  - /api/health exposes BUILD_SHA so you can confirm Render deployment instantly.
 *
 * NEW (2026-01-03, PATCH CORS-HARDEN — BROWSER REACHABILITY FIX):
 *  - Replace wildcard CORS with allowlist + explicit OPTIONS preflight handling.
 *  - Prevents widget “I can’t reach the backend right now” caused by blocked preflight.
 */

"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

/* ======================================================
   ENV + Config
====================================================== */

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const SERVICE_NAME = process.env.SERVICE_NAME || "sandblast-backend";
const NODE_ENV = process.env.NODE_ENV || "development";

// PATCH H: Build stamp (Render sets RENDER_GIT_COMMIT for deploys)
const BUILD_SHA =
  process.env.RENDER_GIT_COMMIT ||
  process.env.GIT_SHA ||
  process.env.COMMIT_SHA ||
  null;

// Session TTL to prevent memory bloat
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 90);

// Intelligence Level (keep your pattern)
const DEFAULT_INTELLIGENCE_LEVEL = Number(process.env.NYX_INTELLIGENCE_LEVEL || 2);

// TTS settings
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || ""; // optional
const ELEVENLABS_BASE_URL =
  process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

// Voice tuning (canonical approach you locked)
const NYX_VOICE_STABILITY = process.env.NYX_VOICE_STABILITY || "0.35";
const NYX_VOICE_SIMILARITY = process.env.NYX_VOICE_SIMILARITY || "0.80";
const NYX_VOICE_STYLE = process.env.NYX_VOICE_STYLE || "0.25";
const NYX_VOICE_SPEAKER_BOOST =
  (process.env.NYX_VOICE_SPEAKER_BOOST || "true") === "true";

// Utility feature toggles
const ENABLE_TTS = (process.env.ENABLE_TTS || "true") === "true";
const ENABLE_S2S = (process.env.ENABLE_S2S || "true") === "true";
const ENABLE_DEBUG = (process.env.NYX_DEBUG || "false") === "true";

// PATCH D/F: Boot sanity behavior
// - NYX_SANITY_ON_BOOT=true runs check + logs (default true)
// - NYX_SANITY_ENFORCE=true is legacy; now WARN-ONLY (prevents crash-loops)
// - NYX_SANITY_HARD_FAIL=true is the ONLY flag that can terminate the process
const NYX_SANITY_ON_BOOT = (process.env.NYX_SANITY_ON_BOOT || "true") === "true";
const NYX_SANITY_ENFORCE = (process.env.NYX_SANITY_ENFORCE || "false") === "true"; // legacy
const NYX_SANITY_HARD_FAIL = (process.env.NYX_SANITY_HARD_FAIL || "false") === "true"; // NEW

/* ======================================================
   PATCH CORS-HARDEN: Allowlist + explicit OPTIONS handling
   - Fixes browser preflight blocks that produce “can’t reach backend”
====================================================== */

// Comma-separated list, e.g.
// CORS_ORIGINS="https://sandblast.channel,https://www.sandblast.channel,http://localhost:3000"
const ALLOWED_ORIGINS = String(
  process.env.CORS_ORIGINS ||
    "https://sandblast.channel,https://www.sandblast.channel,https://sandblastchannel.com,https://www.sandblastchannel.com,https://sandblast-channel.webflow.io,https://www.sandblast-channel.webflow.io,http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

// Always apply high-signal CORS headers early (before body parsing)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight for 24h

  if (req.method === "OPTIONS") {
    // Preflight must be a clean 200 or the browser will block the POST
    return res.status(200).json({ ok: true });
  }

  next();
});

// Keep cors() installed for compatibility, but driven by allowlist
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server calls with no Origin header
      if (!origin) return cb(null, true);
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ======================================================
   Safe Imports (do not crash if a module changes)
====================================================== */

function safeRequire(modPath) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(modPath);
  } catch (e) {
    if (ENABLE_DEBUG)
      console.warn(`[safeRequire] missing/failed: ${modPath} :: ${e.message}`);
    return null;
  }
}

const musicKnowledge = safeRequire("./Utils/musicKnowledge");
const intentClassifier = safeRequire("./Utils/intentClassifier");
const nyxPersonality = safeRequire("./Utils/nyxPersonality");

// Canonical: Nyx voice naturalizer (you locked this)
const nyxVoiceNaturalize = safeRequire("./Utils/nyxVoiceNaturalize");

// Optional routers
const tvKnowledge = safeRequire("./Utils/tvKnowledge");
const sponsorsKnowledge = safeRequire("./Utils/sponsorsKnowledge");

// PATCH G: Music Moments module (optional)
const musicMoments = safeRequire("./Utils/musicMoments");

/* ======================================================
   PATCH D/E/F: One-command sanity + health visibility + root-dir robustness + deploy survival
====================================================== */

const WIKI_SINGLES_50S_REL =
  "Data/wikipedia/billboard_yearend_singles_1950_1959.json";

/** Small, safe directory listing to prove what exists on Render */
function safeLs(absDir) {
  try {
    const items = fs.readdirSync(absDir);
    return items.slice(0, 50);
  } catch (e) {
    return `LS_FAIL: ${e.message}`;
  }
}

/**
 * PATCH E: Find a file by walking UP from a starting directory.
 * This solves Render Root Directory mis-scope (service started in subfolder).
 */
function findUpwards(startDir, relPath, maxDepth = 6) {
  let dir = path.resolve(startDir);
  for (let i = 0; i <= maxDepth; i++) {
    const candidate = path.resolve(dir, relPath);
    if (fs.existsSync(candidate))
      return { found: true, abs: candidate, base: dir, depth: i };
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return {
    found: false,
    abs: path.resolve(startDir, relPath),
    base: path.resolve(startDir),
    depth: maxDepth,
  };
}

/**
 * Primary resolver:
 * - try process.cwd()
 * - try __dirname (location of index.js)
 * - walk upwards from __dirname to handle nested root directories
 */
function resolveRepoFile(rel) {
  const tries = [];

  // 1) cwd direct
  tries.push({
    label: "cwd",
    abs: path.resolve(process.cwd(), rel),
  });

  // 2) __dirname direct
  tries.push({
    label: "__dirname",
    abs: path.resolve(__dirname, rel),
  });

  // 3) upwards from __dirname
  const up = findUpwards(__dirname, rel, 8);
  tries.push({
    label: `upwards(depth=${up.depth})`,
    abs: up.abs,
    base: up.base,
  });

  for (const t of tries) {
    if (fs.existsSync(t.abs)) return { found: true, ...t };
  }

  return { found: false, tries };
}

function runMusic50sSanity() {
  const r = resolveRepoFile(WIKI_SINGLES_50S_REL);
  if (!r.found) {
    return {
      ok: false,
      exists: false,
      rel: WIKI_SINGLES_50S_REL,
      tried: r.tries,
      cwd: process.cwd(),
      __dirname,
      ls_cwd: safeLs(process.cwd()),
      ls_dirname: safeLs(__dirname),
      error: "DATASET_NOT_FOUND",
    };
  }

  try {
    const raw = fs.readFileSync(r.abs, "utf8");
    const db = JSON.parse(raw);
    const rows = Array.isArray(db) ? db.length : Array.isArray(db?.rows) ? db.rows.length : Array.isArray(db?.data) ? db.data.length : null;

    // Attempt year counts (best-effort)
    const counts = {};
    const arr = Array.isArray(db) ? db : Array.isArray(db?.rows) ? db.rows : Array.isArray(db?.data) ? db.data : [];
    for (const x of arr) {
      const y = Number(x.year);
      if (!Number.isFinite(y)) continue;
      counts[String(y)] = (counts[String(y)] || 0) + 1;
    }

    return {
      ok: true,
      exists: true,
      rows: rows ?? arr.length,
      counts,
      rel: WIKI_SINGLES_50S_REL,
      abs: r.abs,
      foundBy: r.label,
      mtimeMs: (() => {
        try {
          return fs.statSync(r.abs).mtimeMs;
        } catch (_) {
          return 0;
        }
      })(),
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      exists: true,
      rel: WIKI_SINGLES_50S_REL,
      abs: r.abs,
      foundBy: r.label,
      error: e.message,
    };
  }
}

// Boot sanity (warn-only unless hard-fail)
let MUSIC50S_SANITY = null;
if (NYX_SANITY_ON_BOOT) {
  MUSIC50S_SANITY = runMusic50sSanity();
  if (!MUSIC50S_SANITY.ok) {
    console.warn("[musicKnowledge] 50s Singles sanity failed:", MUSIC50S_SANITY.error);
    // legacy enforce becomes warn-only
    if (NYX_SANITY_HARD_FAIL) {
      console.error("[NYX_SANITY_HARD_FAIL] Terminating due to missing/invalid dataset.");
      process.exit(1);
    }
    if (NYX_SANITY_ENFORCE) {
      console.warn("[NYX_SANITY_ENFORCE] legacy flag detected; continuing (warn-only).");
    }
  } else if (ENABLE_DEBUG) {
    console.log(
      "[musicKnowledge] 50s Singles cache loaded:",
      `counts=${JSON.stringify(MUSIC50S_SANITY.counts)}`
    );
  }
}

/* ======================================================
   Session store (simple in-memory)
====================================================== */

const SESSIONS = new Map();

function nowMs() {
  return Date.now();
}

function makeSessionId() {
  return crypto.randomBytes(9).toString("hex");
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const s = SESSIONS.get(sessionId);
  if (!s) return null;
  // TTL
  const ageMin = (nowMs() - (s._t || 0)) / 60000;
  if (ageMin > SESSION_TTL_MINUTES) {
    SESSIONS.delete(sessionId);
    return null;
  }
  s._t = nowMs();
  return s;
}

function setSession(sessionId, session) {
  if (!sessionId) return;
  session._t = nowMs();
  SESSIONS.set(sessionId, session);
}

/* ======================================================
   Helpers: payload tolerance, intro, name parsing, routing
====================================================== */

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// PATCH B: payload tolerance
function extractMessage(body) {
  if (!body || typeof body !== "object") return "";
  const candidates = [
    body.message,
    body.text,
    body.input,
    body.value,
    body.label,
    body.query,
  ];
  for (const c of candidates) {
    const t = cleanText(c);
    if (t) return t;
  }
  return "";
}

function extractSessionId(body) {
  if (!body || typeof body !== "object") return null;
  return body.sessionId || body.sid || body.session || null;
}

function isLaneToken(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  return (
    t === "general" ||
    t === "music" ||
    t === "tv" ||
    t === "sponsors" ||
    t === "ai" ||
    t.startsWith("lane:")
  );
}

function normalizeLane(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;
  if (t.startsWith("lane:")) return t.slice(5);
  return t;
}

// PATCH C: don't treat lane tokens as names
function isOnlyName(text) {
  const t = cleanText(text);
  if (!t) return false;
  if (isLaneToken(t)) return false;
  // only letters/spaces/apostrophes/hyphens
  if (!/^[A-Za-z][A-Za-z\s'\-]{0,30}$/.test(t)) return false;
  // single word or two-word name
  const parts = t.split(" ").filter(Boolean);
  return parts.length >= 1 && parts.length <= 2;
}

function extractName(text) {
  const t = cleanText(text);
  if (!t) return null;
  if (isLaneToken(t)) return null;

  // common: "my name is Mac" / "I'm Mac" / "I am Mac"
  const m =
    t.match(/\bmy name is\s+([A-Za-z][A-Za-z'\-]{0,30})\b/i) ||
    t.match(/\bi[' ]?m\s+([A-Za-z][A-Za-z'\-]{0,30})\b/i) ||
    t.match(/\bi am\s+([A-Za-z][A-Za-z'\-]{0,30})\b/i);

  if (m && m[1]) return m[1];

  // fallback: if it's ONLY a name
  if (isOnlyName(t)) return t.split(" ")[0];

  return null;
}

function getIntroLine() {
  // Single line as you requested (chips handle the rest)
  return "On air—welcome to Sandblast. I’m Nyx. Tell me what you’re here for, and I’ll take it from there.";
}

/* ======================================================
   Intent classification + domain routing
====================================================== */

function classifyDomain(text, session) {
  const t = cleanText(text).toLowerCase();

  // PATCH G2: implicit music lane for “top 10 1988” / “story moment 1957”
  const hasYear = /\b(19[5-9]\d|20[0-2]\d)\b/.test(t);
  const looksMusicQuery =
    /top\s*(10|ten)/.test(t) || /\bstory\b/.test(t) || /\bmoment\b/.test(t) || /\bmicro\b/.test(t);

  if (hasYear && looksMusicQuery) return "music";

  // Explicit lane tokens
  if (isLaneToken(t)) return normalizeLane(t);

  // Persisted domain
  if (session?.activeDomain) return session.activeDomain;

  // Classifier module (optional)
  if (intentClassifier && typeof intentClassifier.classify === "function") {
    try {
      const out = intentClassifier.classify(text);
      if (out && out.domain) return out.domain;
    } catch (_) {}
  }

  // Lightweight fallback
  if (/\b(tv|show|series|episode|roku)\b/.test(t)) return "tv";
  if (/\b(sponsor|advertis|ad client|pricing)\b/.test(t)) return "sponsors";
  if (/\b(ai|prompt|model|llm)\b/.test(t)) return "ai";
  if (/\b(music|song|chart|billboard|top\s*(10|ten)|moment)\b/.test(t)) return "music";

  return "general";
}

/* ======================================================
   Chat handler
====================================================== */

function handleChat(text, session) {
  const msg = cleanText(text);

  // First-contact ALWAYS returns intro, even if the first message is a lane token
  if (!session.hasSpoken) {
    session.hasSpoken = true;

    // If first payload is lane token, store it for next turn
    if (isLaneToken(msg)) {
      session.activeDomain = normalizeLane(msg) || "general";
    }

    return {
      reply: getIntroLine(),
      followUp: null,
      sessionPatch: {},
    };
  }

  // Lane token after intro: just set domain and prompt
  if (isLaneToken(msg)) {
    session.activeDomain = normalizeLane(msg) || "general";
    return {
      reply: `Locked. You’re in ${session.activeDomain.toUpperCase()}. What do you want to do next?`,
      followUp: null,
      sessionPatch: {},
    };
  }

  // Name capture (post-intro)
  const name = extractName(msg);
  if (name && !session.userName) {
    session.userName = name;
    return {
      reply: `Got you, ${name}. What are you here for today—music, TV, sponsors, or AI?`,
      followUp: null,
      sessionPatch: {},
    };
  }

  // Domain routing
  const domain = classifyDomain(msg, session);
  session.activeDomain = domain;

  // Music Moments routing first (curated story/micro)
  if (domain === "music" && musicMoments && typeof musicMoments.handle === "function") {
    try {
      const out = musicMoments.handle(msg, session);
      if (out && out.reply) return out;
    } catch (e) {
      if (ENABLE_DEBUG) console.warn("[musicMoments] failed:", e.message);
    }
  }

  // Music knowledge (chart truth spine etc.)
  if (domain === "music" && musicKnowledge && typeof musicKnowledge.handleChat === "function") {
    try {
      const out = musicKnowledge.handleChat({ text: msg, session });
      if (out && out.reply) return out;
    } catch (e) {
      if (ENABLE_DEBUG) console.warn("[musicKnowledge] failed:", e.message);
    }
  }

  // TV
  if (domain === "tv" && tvKnowledge && typeof tvKnowledge.handleChat === "function") {
    try {
      const out = tvKnowledge.handleChat({ text: msg, session });
      if (out && out.reply) return out;
    } catch (e) {
      if (ENABLE_DEBUG) console.warn("[tvKnowledge] failed:", e.message);
    }
  }

  // Sponsors
  if (domain === "sponsors" && sponsorsKnowledge && typeof sponsorsKnowledge.handleChat === "function") {
    try {
      const out = sponsorsKnowledge.handleChat({ text: msg, session });
      if (out && out.reply) return out;
    } catch (e) {
      if (ENABLE_DEBUG) console.warn("[sponsorsKnowledge] failed:", e.message);
    }
  }

  // General personality wrapper
  if (nyxPersonality && typeof nyxPersonality.reply === "function") {
    try {
      const out = nyxPersonality.reply({ text: msg, session });
      if (out && out.reply) return out;
    } catch (e) {
      if (ENABLE_DEBUG) console.warn("[nyxPersonality] failed:", e.message);
    }
  }

  // Final fallback
  return {
    reply: "I’m here. Tell me what you want to do next—music, TV, sponsors, or AI.",
    followUp: null,
    sessionPatch: {},
  };
}

/* ======================================================
   TTS: ElevenLabs helper
====================================================== */

function normalizeTtsText(s) {
  const raw = cleanText(s);
  if (!raw) return "";
  if (nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function") {
    try {
      return nyxVoiceNaturalize(raw);
    } catch (_) {
      return raw;
    }
  }
  return raw;
}

async function elevenLabsTts(text) {
  const payloadText = normalizeTtsText(text);
  if (!payloadText) return null;
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) return null;

  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
  const body = {
    text: payloadText,
    model_id: ELEVENLABS_MODEL_ID || undefined,
    voice_settings: {
      stability: Number(NYX_VOICE_STABILITY),
      similarity_boost: Number(NYX_VOICE_SIMILARITY),
      style: Number(NYX_VOICE_STYLE),
      use_speaker_boost: Boolean(NYX_VOICE_SPEAKER_BOOST),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${t}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return { audioBytes: buf.toString("base64"), audioMime: "audio/mpeg" };
}

/* ======================================================
   Routes
====================================================== */

app.get("/", (req, res) => {
  res.json({ ok: true, service: SERVICE_NAME });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
    env: NODE_ENV,
    host: HOST,
    port: PORT,
    time: new Date().toISOString(),
    build: BUILD_SHA,
    nyx: { intelligenceLevel: DEFAULT_INTELLIGENCE_LEVEL },
    sessions: SESSIONS.size,
    music50s: MUSIC50S_SANITY || null,
    tts: {
      provider: TTS_PROVIDER,
      enabled: ENABLE_TTS,
      hasKey: Boolean(ELEVENLABS_API_KEY),
      hasVoiceId: Boolean(ELEVENLABS_VOICE_ID),
      model: ELEVENLABS_MODEL_ID || null,
      tuning: {
        stability: NYX_VOICE_STABILITY,
        similarity: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        speakerBoost: NYX_VOICE_SPEAKER_BOOST,
      },
    },
  });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  const sessionId = extractSessionId(req.body) || makeSessionId();
  const incoming = extractMessage(req.body);

  if (ENABLE_DEBUG) {
    console.log("[/api/chat] keys=", Object.keys(req.body || {}));
    console.log("[/api/chat] sessionId=", sessionId, "msg=", incoming);
  }

  const session = getSession(sessionId) || {
    _t: nowMs(),
    hasSpoken: false,
    userName: null,
    activeDomain: null,
    activeMusicChart: "Billboard Hot 100",
  };

  // Guard empty message (prevents looping)
  if (!incoming) {
    setSession(sessionId, session);
    return res.json({
      ok: true,
      reply: getIntroLine(),
      followUp: null,
      sessionId,
    });
  }

  const out = handleChat(incoming, session);

  // PATCH: merge module-provided sessionPatch safely
  if (out && out.sessionPatch && typeof out.sessionPatch === "object") {
    Object.assign(session, out.sessionPatch);
  }

  setSession(sessionId, session);

  res.json({
    ok: true,
    reply: out.reply,
    followUp: out.followUp || null,
    sessionId,
  });
});

// TTS endpoint
app.post("/api/tts", async (req, res) => {
  if (!ENABLE_TTS) return res.status(503).json({ ok: false, error: "TTS_DISABLED" });

  const text = cleanText(req.body?.text || req.body?.message || req.body?.input || "");
  if (!text) return res.status(400).json({ ok: false, error: "NO_TEXT" });

  try {
    if (TTS_PROVIDER === "elevenlabs") {
      const out = await elevenLabsTts(text);
      if (!out) return res.status(500).json({ ok: false, error: "TTS_NOT_CONFIGURED" });

      // Safer audio headers
      res.setHeader("Content-Type", out.audioMime || "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");

      return res.json({ ok: true, ...out });
    }

    return res.status(400).json({ ok: false, error: `UNKNOWN_TTS_PROVIDER:${TTS_PROVIDER}` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// /api/voice alias (canonical)
app.post("/api/voice", async (req, res) => {
  // Forward to /api/tts behavior
  req.url = "/api/tts";
  return app._router.handle(req, res, () => {});
});

// Optional s2s (kept as-is if used elsewhere)
app.post("/api/s2s", upload.single("file"), async (req, res) => {
  if (!ENABLE_S2S) return res.status(503).json({ ok: false, error: "S2S_DISABLED" });

  // Placeholder: your existing s2s pipeline would go here.
  return res.status(501).json({ ok: false, error: "S2S_NOT_IMPLEMENTED_IN_THIS_BUILD" });
});

/* ======================================================
   Start
====================================================== */

app.listen(PORT, HOST, () => {
  console.log(
    `[${SERVICE_NAME}] up on http://${HOST}:${PORT} env=${NODE_ENV} build=${BUILD_SHA || "n/a"}`
  );
});
