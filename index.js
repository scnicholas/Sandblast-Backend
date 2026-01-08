"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.4.6 (Sponsors Lane v1 routing + catalog-backed replies; preserves v1.4.5)
 *
 * Adds:
 *  - Sponsors Lane router (lane:"sponsors" or sponsor-intent keywords) with safe fallbacks
 *  - sponsorsLane conversational handler (Utils/sponsorsLane.js)
 *  - sponsorsKnowledge catalog loader (Utils/sponsorsKnowledge.js) used for /api/health visibility + optional catalog access
 *  - Sponsors followUps merged into contract-hard respondJson (never missing)
 *
 * Preserves:
 *  - Contract-hard followUps array of {label,send} (never missing)
 *  - Engine loop-closure (re-run once when engine asks for year/mode despite session state)
 *  - Optional debug snapshot: /api/chat?debug=1 includes state + engine metadata (safe, small)
 *  - Render/server timeouts + upstream AbortController timeout
 *  - Top10 chart fallback ladder + gap-aware replies
 *  - CORS origin normalization (www/non-www), same corsOptions for preflight
 *  - Parser defenses (raw body capture, JSON error handler)
 *  - Contract headers + optional strict 409 enforcement
 *  - Session TTL cleanup + MAX_SESSIONS
 *  - Sticky year, #1 routing, next/prev/another year tokens
 */

const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.4.6 (Sponsors Lane v1 routing + catalog-backed replies; preserves v1.4.5)";

/* ======================================================
   Basic middleware
====================================================== */

// ---- Raw body capture (for debugging parser failures) ----
function rawBodySaver(req, res, buf, encoding) {
  try {
    if (buf && buf.length) req.rawBody = buf.toString(encoding || "utf8");
  } catch (_) {
    // ignore
  }
}

// Parse JSON defensively.
app.use(
  express.json({
    limit: "1mb",
    verify: rawBodySaver,
  })
);

// Also accept text payloads (some proxies/clients accidentally send text/plain)
app.use(
  express.text({
    type: ["text/*"],
    limit: "1mb",
    verify: rawBodySaver,
  })
);

/* ======================================================
   Timeout middleware (Render hardening)
====================================================== */

const REQUEST_TIMEOUT_MS = Math.max(
  10000,
  Math.min(60000, Number(process.env.REQUEST_TIMEOUT_MS || 30000))
);

app.use((req, res, next) => {
  try {
    res.setTimeout(REQUEST_TIMEOUT_MS);
  } catch (_) {
    // ignore
  }
  next();
});

/* ======================================================
   CORS
====================================================== */

// CORS: allowlist from env (comma-separated), plus localhost by default
function parseAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return Array.from(new Set([...defaults, ...list]));
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "false") === "true";
const CONTRACT_STRICT = String(process.env.CONTRACT_STRICT || "false") === "true";
const MAX_SESSIONS = Math.max(0, Number(process.env.MAX_SESSIONS || 0));
const CHAT_DEBUG = String(process.env.CHAT_DEBUG || "false") === "true";

function normalizeOrigin(origin) {
  const o = String(origin || "").trim();
  if (!o) return "";
  return o.replace(/\/$/, "");
}

function originMatchesAllowlist(origin) {
  const o = normalizeOrigin(origin);
  if (!o) return false;

  if (ALLOWED_ORIGINS.includes(o)) return true;

  // handle www/non-www symmetry
  try {
    const u = new URL(o);
    const host = String(u.hostname || "");
    if (!host) return false;

    const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const alt = `${u.protocol}//${altHost}${u.port ? `:${u.port}` : ""}`;
    return ALLOWED_ORIGINS.includes(alt);
  } catch (_) {
    return false;
  }
}

const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true); // non-browser clients
    if (CORS_ALLOW_ALL) return cb(null, true);
    if (originMatchesAllowlist(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Requested-With",
    "X-Visitor-Id",
    "X-Contract-Version",
    "X-Request-Id",
  ],
  exposedHeaders: ["X-Request-Id", "X-Contract-Version", "X-Voice-Mode"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("/api/*", cors(corsOptions));
app.options("*", cors(corsOptions));

/* ======================================================
   JSON parse error handler (pre-route)
====================================================== */
app.use((err, req, res, next) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const isJsonParseError =
    err &&
    (err.type === "entity.parse.failed" ||
      err instanceof SyntaxError ||
      String(err.message || "").toLowerCase().includes("json"));

  if (isJsonParseError) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      message: String(err.message || "JSON parse error"),
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  return next(err);
});

/* ======================================================
   Helpers
====================================================== */

function nowIso() {
  return new Date().toISOString();
}

function rid() {
  return crypto.randomBytes(8).toString("hex");
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse(body, rawFallback) {
  try {
    if (body && typeof body === "object") return body;

    if (typeof body === "string" && body.trim()) {
      const t = body.trim();
      if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        return JSON.parse(t);
      }
    }

    if (rawFallback && String(rawFallback).trim()) {
      const rt = String(rawFallback).trim();
      if ((rt.startsWith("{") && rt.endsWith("}")) || (rt.startsWith("[") && rt.endsWith("]"))) {
        return JSON.parse(rt);
      }
    }

    return null;
  } catch {
    return null;
  }
}

function clampYear(y) {
  if (!Number.isFinite(y)) return null;
  if (y < 1950 || y > 2024) return null;
  return y;
}

function pickRotate(session, key, options) {
  if (!session || !Array.isArray(options) || options.length === 0) return options?.[0] || "";
  const k = String(key || "rot");
  const idxKey = `_rot_${k}`;
  const last = Number(session[idxKey] || 0);
  const next = (last + 1) % options.length;
  session[idxKey] = next;
  return options[next];
}

function safeIncYear(y, delta) {
  const yy = clampYear(Number(y));
  if (!yy) return null;
  return clampYear(yy + delta);
}

function makeUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseDebugFlag(req) {
  if (!req) return false;
  const q = String(req.query && req.query.debug ? req.query.debug : "").trim();
  if (q === "1" || q.toLowerCase() === "true") return true;
  return false;
}

/* ======================================================
   Session store (in-memory) + TTL cleanup
====================================================== */

const SESSIONS = new Map();

function issueSessionId() {
  return `s_${rid()}_${Date.now().toString(36)}`;
}

function getSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;

  if (!SESSIONS.has(sid)) {
    if (MAX_SESSIONS > 0 && SESSIONS.size >= MAX_SESSIONS) {
      let oldestKey = null;
      let oldestUpdated = Infinity;
      for (const [k, v] of SESSIONS.entries()) {
        const u = Number(v && v.updatedAt ? v.updatedAt : 0);
        if (u < oldestUpdated) {
          oldestUpdated = u;
          oldestKey = k;
        }
      }
      if (oldestKey) SESSIONS.delete(oldestKey);
    }

    SESSIONS.set(sid, {
      id: sid,
      createdAt: Date.now(),
      updatedAt: Date.now(),

      visitorId: null,

      // Music state
      lastYear: null,
      activeMusicMode: null, // "top10" | "story" | "micro"
      pendingMode: null,
      activeMusicChart: "Billboard Hot 100",

      // Optional lane (widget sends lane; keep for future routing)
      lane: "general",

      // Memory + loop closure anchors
      lastReply: null,
      lastReplyAt: null,
      lastTop10One: null,
      lastIntent: null,
      lastEngine: null, // { kind, chart, note, at }

      // Voice continuity
      voiceMode: "standard", // "calm" | "standard" | "high"

      // Sponsors context (aligned to Utils/sponsorsLane.js expectations)
      sponsors: {
        property: "",
        goal: "",
        category: "",
        budgetTier: "",
        cta: "",
        restrictions: "",
        stage: "",
      },
    });
  }

  const s = SESSIONS.get(sid);
  s.updatedAt = Date.now();
  return s;
}

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 6 * 60 * 60 * 1000);
const CLEAN_INTERVAL_MS = Math.max(
  60 * 1000,
  Math.min(15 * 60 * 1000, Math.floor(SESSION_TTL_MS / 4))
);

const cleaner = setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sid, s] of SESSIONS.entries()) {
    if (!s || (s.updatedAt || 0) < cutoff) SESSIONS.delete(sid);
  }
}, CLEAN_INTERVAL_MS);

try {
  if (typeof cleaner.unref === "function") cleaner.unref();
} catch (_) {
  // ignore
}

/* ======================================================
   Optional modules
====================================================== */

let musicKnowledge = null;
try {
  musicKnowledge = require("./Utils/musicKnowledge");
} catch {
  musicKnowledge = null;
}

// sponsorsKnowledge: catalog loader + normalizers
let sponsorsKnowledge = null;
try {
  sponsorsKnowledge = require("./Utils/sponsorsKnowledge");
} catch {
  sponsorsKnowledge = null;
}

// sponsorsLane: conversational lane handler
let sponsorsLane = null;
try {
  sponsorsLane = require("./Utils/sponsorsLane");
} catch {
  sponsorsLane = null;
}

/* ======================================================
   Sponsors catalog (optional JSON; safe fallback if missing)
====================================================== */

let SPONSORS_CATALOG = null;

function loadSponsorsCatalogOnce() {
  // Prefer sponsorsKnowledge loader if available (canonical)
  if (sponsorsKnowledge && typeof sponsorsKnowledge.loadCatalog === "function") {
    const out = sponsorsKnowledge.loadCatalog(sponsorsKnowledge.DEFAULT_CATALOG_REL);
    if (out && out.ok && out.catalog) return out.catalog;
  }

  if (SPONSORS_CATALOG) return SPONSORS_CATALOG;

  // allow override via env
  const rel = String(process.env.SPONSORS_CATALOG_REL || "Data/sponsors/sponsors_catalog_v1.json");
  const abs = path.resolve(process.cwd(), rel);

  try {
    if (fs.existsSync(abs)) {
      const raw = fs.readFileSync(abs, "utf8");
      const json = JSON.parse(raw);
      SPONSORS_CATALOG = json && typeof json === "object" ? json : null;
      return SPONSORS_CATALOG;
    }
  } catch (_) {
    // ignore; fall through
  }

  // Minimal built-in fallback (keeps Sponsors lane functional even without file)
  SPONSORS_CATALOG = {
    version: "sponsors_catalog_fallback",
    packages: [
      {
        id: "starter",
        name: "Starter",
        priceRange: "Contact for pricing",
        bestFor: ["testing", "local businesses"],
        includes: ["Web placement", "1 social mention", "basic reporting"],
      },
      {
        id: "growth",
        name: "Growth",
        priceRange: "Contact for pricing",
        bestFor: ["lead-gen", "events"],
        includes: ["Web + Radio bundle", "weekly mentions", "tracking + reporting"],
      },
      {
        id: "dominance",
        name: "Dominance",
        priceRange: "Contact for pricing",
        bestFor: ["launches", "brand dominance"],
        includes: ["Multi-channel bundle", "sponsored segment", "priority placement"],
      },
    ],
    intakeQuestions: [
      "What do you sell (and where)?",
      "Is your goal awareness or leads?",
      "What’s your monthly budget range?",
      "Do you already have creative (audio/video/banner), or do you need help?",
    ],
  };

  return SPONSORS_CATALOG;
}

/* ======================================================
   TTS (ElevenLabs)
====================================================== */

const TTS_ENABLED = String(process.env.TTS_ENABLED || "true") === "true";
const TTS_PROVIDER = String(process.env.TTS_PROVIDER || "elevenlabs");
const ELEVEN_KEY = String(process.env.ELEVENLABS_API_KEY || "");
const ELEVEN_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || "");
const ELEVEN_MODEL_ID = String(process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2");

const hasFetch = typeof fetch === "function";
const ELEVEN_TTS_TIMEOUT_MS = Math.max(
  8000,
  Math.min(60000, Number(process.env.ELEVEN_TTS_TIMEOUT_MS || 25000))
);

function normalizeVoiceMode(m) {
  const t = String(m || "").toLowerCase().trim();
  if (t === "calm") return "calm";
  if (t === "high" || t === "highenergy" || t === "high-energy") return "high";
  return "standard";
}

function getTtsTuningForMode(voiceMode) {
  const base = {
    stability: Number(process.env.NYX_VOICE_STABILITY ?? 0.55),
    similarity: Number(process.env.NYX_VOICE_SIMILARITY ?? 0.78),
    style: Number(process.env.NYX_VOICE_STYLE ?? 0.12),
    speakerBoost: String(process.env.NYX_VOICE_SPEAKER_BOOST ?? "false") === "true",
  };

  const m = normalizeVoiceMode(voiceMode);

  if (m === "calm") {
    return {
      ...base,
      stability: Math.min(1, base.stability + 0.15),
      style: Math.max(0, base.style - 0.08),
      speakerBoost: false,
    };
  }

  if (m === "high") {
    return {
      ...base,
      stability: Math.max(0, base.stability - 0.12),
      style: Math.min(1, base.style + 0.18),
      speakerBoost: true,
    };
  }

  return base;
}

async function elevenTtsMp3Buffer(text, voiceMode) {
  const tuning = getTtsTuningForMode(voiceMode);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}`;

  const body = {
    text,
    model_id: ELEVEN_MODEL_ID,
    voice_settings: {
      stability: tuning.stability,
      similarity_boost: tuning.similarity,
      style: tuning.style,
      use_speaker_boost: tuning.speakerBoost,
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ELEVEN_TTS_TIMEOUT_MS);

  try {
    const r = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        Connection: "keep-alive",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return { ok: false, status: r.status, detail: errText.slice(0, 1200) };
    }

    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, buf };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const isAbort =
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("abort") ||
      msg.toLowerCase().includes("timeout");
    return {
      ok: false,
      status: isAbort ? 504 : 502,
      detail: isAbort ? `Upstream timeout after ${ELEVEN_TTS_TIMEOUT_MS}ms` : msg,
    };
  } finally {
    clearTimeout(t);
  }
}

/* ======================================================
   Intent helpers
====================================================== */

function extractYearFromText(s) {
  const m = String(s || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  return m ? Number(m[1]) : null;
}

function isBareYearMessage(text) {
  const t = cleanText(text);
  return /^\s*(19[5-9]\d|20[0-1]\d|202[0-4])\s*$/.test(t);
}

function isGreeting(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  if (/^(hi|hey|hello|yo|sup|greetings)\b/.test(t)) return true;
  if (/^(hi\s+nyx|hey\s+nyx|hello\s+nyx)\b/.test(t)) return true;
  return false;
}

function greetingReply() {
  return "Hi — welcome to Sandblast. I’m Nyx. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.";
}

function normalizeModeToken(text) {
  const t = cleanText(text).toLowerCase();
  if (/\b(top\s*10|top10|top ten)\b/.test(t)) return "top10";
  if (/\b(story\s*moment|story)\b/.test(t)) return "story";
  if (/\b(micro\s*moment|micro)\b/.test(t)) return "micro";
  return null;
}

function modeToCommand(mode) {
  if (mode === "top10") return "top 10";
  if (mode === "story") return "story moment";
  if (mode === "micro") return "micro moment";
  return "top 10";
}

function normalizeNavToken(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  if (/^(replay|repeat|again|say that again|one more time|replay last)\b/.test(t)) return "replay";
  if (/^(next|next year|forward|year\+1)\b/.test(t)) return "nextYear";
  if (/^(prev|previous|previous year|back|year-1)\b/.test(t)) return "prevYear";
  if (/^(another year|new year|different year)\b/.test(t)) return "anotherYear";

  if (/^(#?1\s*story|story\s*#?1|number\s*1\s*story)\b/.test(t)) return "oneStory";
  if (/^(#?1\s*micro|micro\s*#?1|number\s*1\s*micro)\b/.test(t)) return "oneMicro";

  if (/^#?1\b/.test(t) || /^number\s*1\b/.test(t)) return "one";

  return null;
}

/* ======================================================
   Sponsors intent (fallback)
   - Prefer Utils/sponsorsLane.isSponsorIntent if available
====================================================== */

function isSponsorIntentFallback(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;

  // strong sponsor signals
  const strong =
    /\b(sponsor|sponsorship|advertis(e|ing)|rate\s*card|media\s*kit|ad\s*package|ad\s*packages|ad\s*pricing|pricing|promote|promotion|commercial|campaign)\b/;

  // avoid false positives like "song sponsor" (rare, but keep safe)
  if (
    /\b(sponsor)\b/.test(t) &&
    /\b(song|music|artist|album)\b/.test(t) &&
    !/\b(advertis|pricing|rate card|media kit)\b/.test(t)
  ) {
    return false;
  }

  return strong.test(t);
}

function isSponsorIntent(text) {
  if (sponsorsLane && typeof sponsorsLane.isSponsorIntent === "function") {
    try {
      return !!sponsorsLane.isSponsorIntent(text);
    } catch (_) {
      return isSponsorIntentFallback(text);
    }
  }
  return isSponsorIntentFallback(text);
}

/* ======================================================
   Sponsors engine wrapper
====================================================== */

async function runSponsorsEngine(text, session) {
  // Prefer sponsorsLane (canonical)
  if (sponsorsLane && typeof sponsorsLane.handleChat === "function") {
    try {
      const out = sponsorsLane.handleChat({ text, session }) || {};
      if (out.sessionPatch && typeof out.sessionPatch === "object") Object.assign(session, out.sessionPatch);
      return out;
    } catch (e) {
      return {
        reply:
          "Sponsors lane hit a snag. Tell me: TV/Radio/Website/Social (or bundle), your goal (calls/foot traffic/clicks/awareness), and a budget range in CAD.",
        error: String(e && e.message ? e.message : e),
      };
    }
  }

  // Minimal fallback if sponsorsLane is missing: keep the lane alive
  loadSponsorsCatalogOnce();
  return {
    reply:
      "Sponsors lane is online. Tell me what you want to promote (TV/Radio/Website/Social/bundle), your goal, and your budget range in CAD.",
    followUps: [
      { label: "TV", send: "TV" },
      { label: "Radio", send: "Radio" },
      { label: "Website", send: "Website" },
      { label: "Social", send: "Social" },
      { label: "Bundle", send: "Bundle" },
      { label: "Request rate card", send: "Request rate card" },
      { label: "Book a call", send: "Book a call" },
    ],
  };
}

/* ======================================================
   Chart spine selection + Top10 fallback ladder
====================================================== */

function pickPrimaryChartForYear(year) {
  // Known strong sources:
  // - 1950–1959: Billboard Year-End Singles
  // - 1970+: Billboard Year-End Hot 100
  if (year >= 1950 && year <= 1959) return "Billboard Year-End Singles";
  return "Billboard Year-End Hot 100";
}

function forceYearSpineChart(session, year) {
  if (!session || typeof session !== "object") return;
  const y = clampYear(Number(year ?? session.lastYear));
  if (!y) return;
  session.activeMusicChart = pickPrimaryChartForYear(y);
}

function looksLikeNoCleanListReply(reply, year) {
  const t = cleanText(reply).toLowerCase();
  if (!t) return false;
  if (!t.includes("clean list")) return false;
  if (year && t.includes(String(year))) return true;
  return true;
}

function buildTop10GapReply(year, session) {
  const y = clampYear(Number(year));
  const prev = y ? safeIncYear(y, -1) : null;
  const next = y ? safeIncYear(y, +1) : null;

  const suggested = [];
  if (y && y >= 1960 && y <= 1969) {
    suggested.push("1959", "1970");
    if (prev && prev >= 1950 && prev <= 1959) suggested.unshift(String(prev));
    if (next && next >= 1970) suggested.push(String(next));
  } else {
    if (prev) suggested.push(String(prev));
    if (next) suggested.push(String(next));
    suggested.push("1959", "1970");
  }

  const unique = [];
  for (const s of suggested) if (s && !unique.includes(s)) unique.push(s);

  const yStr = y ? String(y) : "that year";
  const picks = unique.slice(0, 3).join(", ");

  return `I don’t have a clean Top 10 list for ${yStr} in this build yet — that year sits in a chart coverage gap. Try ${picks}. Or say “story moment ${yStr}” / “micro moment ${yStr}” and I’ll still give you a tight moment if the engine has narrative entries.`;
}

async function runTop10WithFallback(year, session) {
  const y = clampYear(Number(year));
  if (!y) return { reply: "Tell me a year (1950–2024) for Top 10." };

  const primary = pickPrimaryChartForYear(y);

  const ladder = [primary, "Billboard Year-End Singles", "Billboard Hot 100", "Canada RPM", "UK Singles Chart"];

  const originalChart = session.activeMusicChart;

  for (const chart of ladder) {
    session.activeMusicChart = chart;

    const out = await runMusicEngine(`top 10 ${y}`, session);
    const reply0 = cleanText(out.reply || "");

    if (reply0 && !looksLikeNoCleanListReply(reply0, y)) {
      session.lastEngine = { kind: "top10", chart, note: "ok", at: Date.now() };
      return out;
    }
  }

  session.activeMusicChart = originalChart;
  session.lastEngine = { kind: "top10", chart: originalChart, note: "gap", at: Date.now() };
  return { reply: buildTop10GapReply(y, session) };
}

/* ======================================================
   Reply parsing helpers
====================================================== */

function replyLooksLikeTop10List(reply) {
  const t = cleanText(reply);
  return /^Top\s+10\s+—/i.test(t);
}

function stripTrailingWantPrompt(s) {
  return cleanText(String(s || ""))
    .replace(/\s+Want\s+#1.*$/i, "")
    .replace(/\s+Want\s+a\s+story\s+moment.*$/i, "")
    .replace(/\s+Want\s+a\s+micro\s+moment.*$/i, "")
    .trim();
}

function extractTop10NumberOne(reply) {
  const t = cleanText(reply);

  const ym = t.match(/\((19[5-9]\d|20[0-1]\d|202[0-4])\)\s*:/);
  const year = ym ? clampYear(Number(ym[1])) : null;
  if (!year) return null;

  const m = t.match(/:\s*1\.\s*([^—]+?)\s*—\s*(.+?)(?=\s+2\.|$)/i);
  if (!m) return { year, artist: null, title: null };

  const artist = cleanText(m[1]);
  const title = stripTrailingWantPrompt(m[2]);

  if (!artist || !title) return { year, artist: artist || null, title: title || null };
  return { year, artist, title };
}

function makeMicroMomentFromNumberOne({ year, artist, title }) {
  const a = artist || "the year’s biggest artist";
  const s = title ? `“${title}”` : "a massive #1";
  return `Micro moment — ${year}: ${a} hit #1 with ${s}. One hook, one heartbeat—pure year-end momentum that made radios feel like a victory lap. Want a story moment, or another year?`;
}

function makeStoryMomentFromNumberOne({ year, artist, title }) {
  const a = artist || "the year’s biggest artist";
  const s = title ? `“${title}”` : "a massive #1";
  return `Story moment — ${year}: ${a} owned the year-end conversation with ${s} at #1. It’s a snapshot of the era—tight chorus, big polish, and that “turn it up again” energy that glued people to their car radios. Want the Top 10, a micro moment, or another year?`;
}

function engineAsksForYear(reply) {
  const t = cleanText(reply).toLowerCase();
  return (
    t.startsWith("tell me a year") ||
    t.includes("tell me a year (1950–2024)") ||
    t.includes("give me a year") ||
    t.includes("what year (1950–2024)")
  );
}

function engineAsksForMode(reply) {
  const t = cleanText(reply).toLowerCase();
  return (
    t.includes("choose: top 10") ||
    t.includes("what do you want: top 10") ||
    t.includes("top 10, story moment, or micro moment")
  );
}

/* ======================================================
   Followups (contract-hard)
====================================================== */

function makeFollowUps(session) {
  const baseModes = ["Top 10", "Story moment", "Micro moment"];

  const hasYear = !!(session && clampYear(session.lastYear));
  const yearChip = hasYear ? String(session.lastYear) : "1950";

  const hasReplay = !!(session && session.lastReply);
  const hasOne = !!(session && session.lastTop10One && session.lastTop10One.year);

  // Sponsors lane fallback followups if engine doesn't provide any
  if (session && session.lane === "sponsors") {
    const sfu = [
      { label: "TV", send: "TV" },
      { label: "Radio", send: "Radio" },
      { label: "Website", send: "Website" },
      { label: "Social", send: "Social" },
      { label: "Bundle", send: "Bundle" },
      { label: "Build my offer", send: "Build my offer" },
      { label: "Request rate card", send: "Request rate card" },
      { label: "Book a call", send: "Book a call" },
    ];
    return {
      followUp: sfu.map((x) => x.label).slice(0, 8),
      followUps: sfu.slice(0, 8),
    };
  }

  const items = [yearChip, ...baseModes];

  if (hasYear && hasOne) items.push("#1", "#1 story", "#1 micro");

  if (hasYear) {
    const py = safeIncYear(session.lastYear, -1);
    const ny = safeIncYear(session.lastYear, +1);
    if (py) items.push("Prev year");
    if (ny) items.push("Next year");
    items.push("Another year");
  }

  if (hasYear && hasReplay) items.push("Replay last");

  const deduped = [];
  for (const x of items) if (x && !deduped.includes(x)) deduped.push(x);

  const primary = deduped.slice(0, 8);
  return {
    followUp: primary,
    followUps: primary.map((x) => ({ label: x, send: x })),
  };
}

function normalizeEngineFollowups(out) {
  // Accept various engine shapes; produce array of {label,send}
  const push = (acc, v) => {
    if (!v) return;
    if (typeof v === "string") {
      const s = cleanText(v);
      if (s) acc.push({ label: s, send: s });
      return;
    }
    if (typeof v === "object") {
      const label = cleanText(v.label || v.text || v.title || v.send || v.value || "");
      const send = cleanText(v.send || v.value || v.payload || v.label || v.text || "");
      if (label && send) acc.push({ label, send });
    }
  };

  const acc = [];
  if (!out || typeof out !== "object") return acc;

  const cands = [out.followUps, out.followupS, out.followups, out.follow_up, out.followUp, out.followup].filter(Boolean);

  for (const c of cands) {
    if (Array.isArray(c)) c.forEach((x) => push(acc, x));
    else push(acc, c);
  }

  // Some engines use followUp as array of strings
  if (Array.isArray(out.followUp)) out.followUp.forEach((x) => push(acc, x));

  // Dedup by send
  const seen = new Set();
  const out2 = [];
  for (const it of acc) {
    const k = cleanText(it.send).toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out2.push(it);
  }
  return out2.slice(0, 12);
}

function replyMissingYearForMode(session, mode) {
  const poolTop10 = [
    "Perfect. What year (1950–2024) for your Top 10?",
    "Got you. Which year (1950–2024) should I use for Top 10?",
    "Alright—name the year (1950–2024) and I’ll pull the Top 10.",
  ];
  const poolStory = [
    "Love it. What year (1950–2024) for the story moment?",
    "Alright—what year (1950–2024) are we doing for the story moment?",
    "Great. Give me the year (1950–2024) and I’ll set the scene.",
  ];
  const poolMicro = [
    "Sure. What year (1950–2024) for the micro-moment?",
    "Quick one—what year (1950–2024) for the micro-moment?",
    "Got it. Drop the year (1950–2024) and I’ll keep it tight.",
  ];

  if (mode === "top10") return pickRotate(session, "askYear_top10", poolTop10);
  if (mode === "story") return pickRotate(session, "askYear_story", poolStory);
  if (mode === "micro") return pickRotate(session, "askYear_micro", poolMicro);
  return pickRotate(session, "askYear_generic", ["What year (1950–2024) should I use?", "Which year (1950–2024)?"]);
}

function addMomentumTail(session, reply) {
  const r = cleanText(reply);
  if (!r) return r;

  // Sponsors lane: do NOT add music momentum tails
  if (session && session.lane === "sponsors") return r;

  const y = session && clampYear(session.lastYear) ? session.lastYear : null;
  const mode = session && session.activeMusicMode ? session.activeMusicMode : null;

  const endsWithQ = /[?]$/.test(r) || /\bwant\b/i.test(r) || /\bchoose\b/i.test(r);
  if (endsWithQ) return r;

  if (y && mode === "top10") return `${r} Next: say “#1”, “#1 story”, “#1 micro”, or “next year”.`;
  if (y && (mode === "story" || mode === "micro")) return `${r} Next: “top 10”, “next year”, “another year”, or “replay”.`;
  return r;
}

function respondJson(req, res, base, session, engineOut) {
  // Contract: followUps ALWAYS exists and is an array of {label,send}
  const fallback = makeFollowUps(session);

  const engineNorm = normalizeEngineFollowups(engineOut);
  const useEngine = engineNorm.length > 0;

  const payload = Object.assign({}, base, {
    followUp: useEngine ? engineNorm.map((x) => x.label).slice(0, 8) : fallback.followUp,
    followUps: useEngine ? engineNorm.slice(0, 8) : fallback.followUps,
  });

  const wantsDebug = CHAT_DEBUG || parseDebugFlag(req);
  if (wantsDebug) {
    // Sponsors catalog quick debug visibility
    let sponsorsCatalogDebug = null;
    try {
      if (sponsorsKnowledge && typeof sponsorsKnowledge.getCatalogDebug === "function") {
        sponsorsCatalogDebug = sponsorsKnowledge.getCatalogDebug();
      }
    } catch (_) {
      sponsorsCatalogDebug = null;
    }

    payload.debug = {
      index: INDEX_VERSION,
      state: {
        lastYear: session ? session.lastYear : null,
        activeMusicMode: session ? session.activeMusicMode : null,
        pendingMode: session ? session.pendingMode : null,
        activeMusicChart: session ? session.activeMusicChart : null,
        lane: session ? session.lane : null,
        voiceMode: session ? session.voiceMode : null,
        lastIntent: session ? session.lastIntent : null,
        lastEngine: session ? session.lastEngine : null,
        sponsors: session ? session.sponsors : null,
      },
      sponsors: {
        laneLoaded: !!(sponsorsLane && typeof sponsorsLane.handleChat === "function"),
        knowledgeLoaded: !!(sponsorsKnowledge && typeof sponsorsKnowledge.loadCatalog === "function"),
        catalogDebug: sponsorsCatalogDebug
          ? {
              loaded: !!sponsorsCatalogDebug.loaded,
              rel: sponsorsCatalogDebug.rel || null,
              abs: sponsorsCatalogDebug.abs || null,
              error: sponsorsCatalogDebug.error || null,
              mtimeMs: sponsorsCatalogDebug.mtimeMs || 0,
            }
          : null,
      },
      engine: engineOut
        ? {
            hasReply: !!cleanText(engineOut.reply),
            hasFollowup: !!engineOut.followUp,
            hasFollowups: !!engineOut.followUps,
          }
        : null,
    };
  }

  return res.json(payload);
}

/* ======================================================
   API: health
====================================================== */

app.get("/api/health", (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const origin = req.headers.origin || null;
  const originAllowed = CORS_ALLOW_ALL ? true : origin ? originMatchesAllowlist(origin) : null;

  const cat = loadSponsorsCatalogOnce();
  const sponsorsOk = !!(cat && typeof cat === "object");
  const sponsorsPkgs = sponsorsOk && Array.isArray(cat.packages) ? cat.packages.length : 0;

  res.json({
    ok: true,
    service: "sandblast-backend",
    env: process.env.NODE_ENV || "production",
    time: nowIso(),
    build: process.env.RENDER_GIT_COMMIT || null,
    version: INDEX_VERSION,
    sessions: SESSIONS.size,
    cors: {
      allowAll: CORS_ALLOW_ALL,
      allowedOrigins: CORS_ALLOW_ALL ? "ALL" : ALLOWED_ORIGINS.length,
      originEcho: origin,
      originAllowed,
    },
    contract: {
      version: NYX_CONTRACT_VERSION,
      strict: CONTRACT_STRICT,
    },
    timeouts: {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      elevenTtsTimeoutMs: ELEVEN_TTS_TIMEOUT_MS,
    },
    tts: {
      enabled: TTS_ENABLED,
      provider: TTS_PROVIDER,
      hasKey: !!ELEVEN_KEY,
      hasVoiceId: !!ELEVEN_VOICE_ID,
      model: ELEVEN_MODEL_ID || null,
      tuning: getTtsTuningForMode("standard"),
      hasFetch,
    },
    sponsors: {
      laneLoaded: !!(sponsorsLane && typeof sponsorsLane.handleChat === "function"),
      knowledgeLoaded: !!(sponsorsKnowledge && typeof sponsorsKnowledge.loadCatalog === "function"),
      catalog: {
        ok: sponsorsOk,
        version: sponsorsOk ? cat.version || null : null,
        packages: sponsorsPkgs,
        source:
          SPONSORS_CATALOG && SPONSORS_CATALOG.version === "sponsors_catalog_fallback"
            ? "fallback"
            : sponsorsKnowledge
            ? "sponsorsKnowledge_or_file"
            : "file_or_env",
      },
    },
    requestId,
  });
});

/* ======================================================
   API: tts
====================================================== */

async function ttsHandler(req, res) {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const body = safeJsonParse(req.body, req.rawBody);
  if (!body) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  const text = cleanText(body.text || body.message || "");
  const sid = cleanText(body.sessionId || "");
  const s = sid ? getSession(sid) : null;

  const hasExplicitVoiceMode =
    Object.prototype.hasOwnProperty.call(body, "voiceMode") && String(body.voiceMode || "").trim() !== "";

  const voiceMode = normalizeVoiceMode(hasExplicitVoiceMode ? body.voiceMode : (s && s.voiceMode) || "standard");

  if (!TTS_ENABLED)
    return res.status(503).json({ ok: false, error: "TTS_DISABLED", requestId, contractVersion: NYX_CONTRACT_VERSION });
  if (TTS_PROVIDER !== "elevenlabs")
    return res.status(500).json({
      ok: false,
      error: "TTS_PROVIDER_UNSUPPORTED",
      provider: TTS_PROVIDER,
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (!hasFetch)
    return res.status(500).json({
      ok: false,
      error: "TTS_RUNTIME",
      detail: "fetch() not available",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (!ELEVEN_KEY || !ELEVEN_VOICE_ID)
    return res.status(500).json({
      ok: false,
      error: "TTS_MISCONFIG",
      detail: "Missing ELEVENLABS env",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  if (!text)
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "Missing text",
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });

  if (s && hasExplicitVoiceMode) s.voiceMode = voiceMode;

  try {
    const out = await elevenTtsMp3Buffer(text, voiceMode);
    if (!out.ok) {
      return res.status(502).json({
        ok: false,
        error: "TTS_UPSTREAM",
        upstreamStatus: out.status,
        upstreamBody: out.detail,
        requestId,
        contractVersion: NYX_CONTRACT_VERSION,
      });
    }

    const buf = out.buf || Buffer.alloc(0);
    if (!Buffer.isBuffer(buf) || buf.length < 1024) {
      return res.status(502).json({
        ok: false,
        error: "TTS_BAD_AUDIO",
        detail: `Audio payload too small (${buf.length} bytes)`,
        requestId,
        contractVersion: NYX_CONTRACT_VERSION,
      });
    }

    res.status(200);
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(buf.length));
    res.set("Cache-Control", "no-store");
    res.set("X-Voice-Mode", voiceMode);
    return res.end(buf);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "TTS_ERROR",
      detail: String(e && e.message ? e.message : e),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }
}

app.post("/api/tts", ttsHandler);
app.post("/api/voice", ttsHandler);

/* ======================================================
   Music engine wrapper + loop-closure helper
====================================================== */

async function runMusicEngine(text, session) {
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") {
    return { reply: "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment." };
  }

  try {
    const out = musicKnowledge.handleChat({ text, session }) || {};
    if (out.sessionPatch && typeof out.sessionPatch === "object") Object.assign(session, out.sessionPatch);
    return out;
  } catch (e) {
    return {
      reply: "I hit a snag in the music engine. Try again with a year (1950–2024).",
      error: String(e && e.message ? e.message : e),
    };
  }
}

async function runEngineWithLoopClosure(command, session, maxReruns = 1) {
  // Prevent the last “engine asks for year/mode even though we have it” loop.
  let out = await runMusicEngine(command, session);
  let reply0 = cleanText(out.reply || "");

  if (maxReruns <= 0) return out;

  const y = clampYear(session.lastYear);
  const m = session.activeMusicMode || session.pendingMode || null;

  // If engine asks for year but we have y, rerun with explicit "command y"
  if (reply0 && engineAsksForYear(reply0) && y) {
    const cmd = m ? `${modeToCommand(m)} ${y}` : `${command} ${y}`;
    out = await runMusicEngine(cmd, session);
    session.lastEngine = { kind: "loopClosure", chart: session.activeMusicChart, note: "askedYear_rerun", at: Date.now() };
    return out;
  }

  // If engine asks for mode but we have mode, rerun with explicit mode
  if (reply0 && engineAsksForMode(reply0) && m && y) {
    const cmd = `${modeToCommand(m)} ${y}`;
    out = await runMusicEngine(cmd, session);
    session.lastEngine = { kind: "loopClosure", chart: session.activeMusicChart, note: "askedMode_rerun", at: Date.now() };
    return out;
  }

  return out;
}

/* ======================================================
   API: chat
====================================================== */

app.post("/api/chat", async (req, res) => {
  const requestId = req.get("X-Request-Id") || rid();
  res.set("X-Request-Id", requestId);
  res.set("X-Contract-Version", NYX_CONTRACT_VERSION);
  res.set("Cache-Control", "no-store");

  const body = safeJsonParse(req.body, req.rawBody);
  if (!body) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      contentType: req.headers["content-type"] || null,
      rawPreview: String(req.rawBody || "").slice(0, 700),
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  const message = cleanText(body.message || body.text || "");
  let sessionId = cleanText(body.sessionId || "");
  const incomingVisitorId = cleanText(body.visitorId || "") || makeUuid();
  const incomingContract = cleanText(body.contractVersion || body.contract || "");

  if (CONTRACT_STRICT && incomingContract && incomingContract !== NYX_CONTRACT_VERSION) {
    return res.status(409).json({
      ok: false,
      error: "CONTRACT_MISMATCH",
      expected: NYX_CONTRACT_VERSION,
      got: incomingContract,
      requestId,
      contractVersion: NYX_CONTRACT_VERSION,
    });
  }

  if (!sessionId) sessionId = issueSessionId();
  const session = getSession(sessionId);
  if (!session.visitorId) session.visitorId = incomingVisitorId;

  // Store lane (widget sends lane)
  const incomingLane = cleanText((body.lane || (body.context && body.context.lane) || "")).toLowerCase();
  if (incomingLane && ["general", "music", "tv", "sponsors", "ai"].includes(incomingLane)) {
    session.lane = incomingLane;
  }

  // Voice continuity
  const incomingVoiceMode = normalizeVoiceMode(
    body.voiceMode || (body.context && body.context.voiceMode) || session.voiceMode || "standard"
  );
  session.voiceMode = incomingVoiceMode;
  res.set("X-Voice-Mode", session.voiceMode);

  const visitorId = session.visitorId;
  const nav = normalizeNavToken(message);

  // ======================================================
  // Sponsors Lane router (early, before music nav tokens)
  //  - If lane is sponsors OR sponsor-intent detected, handle here.
  //  - Exception: explicit music commands keep music lane behavior.
  // ======================================================

  const explicitMusic =
    !!normalizeModeToken(message) ||
    !!clampYear(extractYearFromText(message)) ||
    /^#?1\b/i.test(cleanText(message));

  const sponsorRoute = session.lane === "sponsors" || (isSponsorIntent(message) && !explicitMusic);

  if (sponsorRoute) {
    session.lane = "sponsors";
    session.lastIntent = "sponsors";

    const out = await runSponsorsEngine(message || "Sponsors", session);
    const reply0 = cleanText(out.reply || "");
    const reply = reply0 || "Sponsors lane is ready. Tell me what you’re promoting and your budget range in CAD.";

    session.lastReply = reply;
    session.lastReplyAt = Date.now();

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };

    return respondJson(req, res, base, session, out);
  }

  // replay
  if (nav === "replay" && session.lastReply) {
    const base = {
      ok: true,
      reply: session.lastReply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    session.lastIntent = "replay";
    return respondJson(req, res, base, session, null);
  }

  // another year
  if (nav === "anotherYear") {
    session.pendingMode = session.activeMusicMode || session.pendingMode || null;
    const ask = session.pendingMode ? replyMissingYearForMode(session, session.pendingMode) : "Alright. What year (1950–2024)?";
    session.lastReply = ask;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askYear";
    const base = {
      ok: true,
      reply: ask,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null);
  }

  // next/prev year
  if ((nav === "nextYear" || nav === "prevYear") && clampYear(session.lastYear)) {
    const nextY = safeIncYear(session.lastYear, nav === "nextYear" ? +1 : -1);
    if (nextY) {
      session.lastYear = nextY;

      if (session.activeMusicMode) {
        const mode = session.activeMusicMode;

        forceYearSpineChart(session, nextY);

        let out;
        if (mode === "top10") out = await runTop10WithFallback(nextY, session);
        else out = await runEngineWithLoopClosure(`${modeToCommand(mode)} ${nextY}`, session, 1);

        const reply0 = cleanText(out.reply || "");
        const reply = addMomentumTail(session, reply0);

        session.lastReply = reply;
        session.lastReplyAt = Date.now();
        session.lastIntent = mode;

        if (replyLooksLikeTop10List(reply0)) session.lastTop10One = extractTop10NumberOne(reply0);

        const base = {
          ok: true,
          reply,
          sessionId,
          requestId,
          visitorId,
          contractVersion: NYX_CONTRACT_VERSION,
          voiceMode: session.voiceMode,
        };
        return respondJson(req, res, base, session, out);
      }

      const base = {
        ok: true,
        reply: `Got it — ${nextY}. What do you want: Top 10, Story moment, or Micro moment?`,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
      };
      session.lastReply = base.reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = "askMode";
      return respondJson(req, res, base, session, null);
    }
  }

  // #1 story/micro from lastTop10One
  if ((nav === "oneStory" || nav === "oneMicro") && session.lastTop10One && session.lastTop10One.year) {
    const rep =
      nav === "oneStory"
        ? makeStoryMomentFromNumberOne(session.lastTop10One)
        : makeMicroMomentFromNumberOne(session.lastTop10One);

    session.activeMusicMode = nav === "oneStory" ? "story" : "micro";
    session.pendingMode = null;
    session.lastYear = session.lastTop10One.year;

    session.lastReply = rep;
    session.lastReplyAt = Date.now();
    session.lastIntent = session.activeMusicMode;

    const base = {
      ok: true,
      reply: rep,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null);
  }

  // #1 (engine first, fallback)
  if (nav === "one") {
    if (!clampYear(session.lastYear)) {
      const ask = "Tell me a year first (1950–2024), then I’ll give you #1.";
      session.lastReply = ask;
      session.lastReplyAt = Date.now();
      session.lastIntent = "askYear";
      const base = {
        ok: true,
        reply: ask,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
      };
      return respondJson(req, res, base, session, null);
    }

    const out = await runEngineWithLoopClosure("#1", session, 1);
    const reply0 = cleanText(out.reply || "");

    let reply = reply0;
    if (!reply || /^tell me a year/i.test(reply)) {
      if (session.lastTop10One && session.lastTop10One.year === session.lastYear) {
        reply = `#1 — ${session.lastTop10One.artist || "Unknown Artist"} — ${session.lastTop10One.title || "Unknown Title"}`;
      } else {
        reply = "Run “top 10” first so I can lock the year’s #1 cleanly.";
      }
    }

    reply = addMomentumTail(session, reply);

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "number1";

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out);
  }

  // Greeting / empty
  if (!message || isGreeting(message)) {
    const base = {
      ok: true,
      reply: greetingReply(),
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    session.lastReply = base.reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = "greeting";
    return respondJson(req, res, base, session, null);
  }

  const parsedYear = clampYear(extractYearFromText(message));
  const parsedMode = normalizeModeToken(message);
  const bareYear = parsedYear ? isBareYearMessage(message) : false;

  // MODE + YEAR in one shot
  if (parsedYear && parsedMode) {
    session.lastYear = parsedYear;
    session.activeMusicMode = parsedMode;
    session.pendingMode = null;

    forceYearSpineChart(session, parsedYear);

    let out;
    if (parsedMode === "top10") out = await runTop10WithFallback(parsedYear, session);
    else out = await runEngineWithLoopClosure(`${modeToCommand(parsedMode)} ${parsedYear}`, session, 1);

    const reply0 = cleanText(out.reply || "");
    const reply = addMomentumTail(session, reply0);

    session.lastReply = reply;
    session.lastReplyAt = Date.now();
    session.lastIntent = parsedMode;

    if (replyLooksLikeTop10List(reply0)) session.lastTop10One = extractTop10NumberOne(reply0);

    const base = {
      ok: true,
      reply,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, out);
  }

  // MODE only
  if (parsedMode && !parsedYear) {
    session.activeMusicMode = parsedMode;
    session.pendingMode = parsedMode;

    // Sticky year: run immediately if we have lastYear
    if (clampYear(session.lastYear)) {
      session.pendingMode = null;

      forceYearSpineChart(session, session.lastYear);

      let out;
      if (parsedMode === "top10") out = await runTop10WithFallback(session.lastYear, session);
      else out = await runEngineWithLoopClosure(`${modeToCommand(parsedMode)} ${session.lastYear}`, session, 1);

      const reply0 = cleanText(out.reply || "");
      const reply = addMomentumTail(session, reply0);

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = parsedMode;

      if (replyLooksLikeTop10List(reply0)) session.lastTop10One = extractTop10NumberOne(reply0);

      const base = {
        ok: true,
        reply,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
      };
      return respondJson(req, res, base, session, out);
    }

    const ask = replyMissingYearForMode(session, parsedMode);
    session.lastReply = ask;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askYear";

    const base = {
      ok: true,
      reply: ask,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null);
  }

  // YEAR present: treat as year selection (prefers pending/active mode)
  if (parsedYear && !parsedMode) {
    session.lastYear = parsedYear;
    const mode = session.pendingMode || session.activeMusicMode || null;

    if (mode) {
      session.activeMusicMode = mode;
      session.pendingMode = null;

      forceYearSpineChart(session, parsedYear);

      let out;
      if (mode === "top10") out = await runTop10WithFallback(parsedYear, session);
      else out = await runEngineWithLoopClosure(`${modeToCommand(mode)} ${parsedYear}`, session, 1);

      const reply0 = cleanText(out.reply || "");
      const reply = addMomentumTail(session, reply0);

      session.lastReply = reply;
      session.lastReplyAt = Date.now();
      session.lastIntent = mode;

      if (replyLooksLikeTop10List(reply0)) session.lastTop10One = extractTop10NumberOne(reply0);

      const base = {
        ok: true,
        reply,
        sessionId,
        requestId,
        visitorId,
        contractVersion: NYX_CONTRACT_VERSION,
        voiceMode: session.voiceMode,
      };
      return respondJson(req, res, base, session, out);
    }

    const askMode = `Got it — ${parsedYear}. What do you want: Top 10, Story moment, or Micro moment?`;
    session.lastReply = askMode;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askMode";

    const base = {
      ok: true,
      reply: askMode,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null);
  }

  // If user only sent a bare year but no mode, prefer a crisp mode prompt (avoids engine wandering)
  if (bareYear && parsedYear) {
    const askMode = `Got it — ${parsedYear}. What do you want: Top 10, Story moment, or Micro moment?`;
    session.lastReply = askMode;
    session.lastReplyAt = Date.now();
    session.lastIntent = "askMode";

    const base = {
      ok: true,
      reply: askMode,
      sessionId,
      requestId,
      visitorId,
      contractVersion: NYX_CONTRACT_VERSION,
      voiceMode: session.voiceMode,
    };
    return respondJson(req, res, base, session, null);
  }

  // passthrough to engine (with spine chart + loop closure)
  forceYearSpineChart(session, session.lastYear);

  const out = await runEngineWithLoopClosure(message, session, 1);
  const reply0 = cleanText(out.reply || "");
  const reply = addMomentumTail(session, reply0);

  session.lastReply = reply;
  session.lastReplyAt = Date.now();
  session.lastIntent = "passthrough";

  if (replyLooksLikeTop10List(reply0)) {
    session.lastTop10One = extractTop10NumberOne(reply0);
    if (session.lastTop10One && session.lastTop10One.year) session.lastYear = session.lastTop10One.year;
  }

  const base = {
    ok: true,
    reply,
    sessionId,
    requestId,
    visitorId,
    contractVersion: NYX_CONTRACT_VERSION,
    voiceMode: session.voiceMode,
  };
  return respondJson(req, res, base, session, out);
});

/* ======================================================
   Start server
====================================================== */

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[sandblast-backend] up :${PORT} env=${process.env.NODE_ENV || "production"} build=${
      process.env.RENDER_GIT_COMMIT || "n/a"
    } contract=${NYX_CONTRACT_VERSION} version=${INDEX_VERSION}`
  );
});

// Node server timeout hardening
try {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.max(REQUEST_TIMEOUT_MS + 5000, 35000);
  server.keepAliveTimeout = Math.max(65000, server.keepAliveTimeout || 0);
} catch (_) {
  // ignore
}

server.on("error", (err) => {
  console.error("[sandblast-backend] fatal listen error", err);
  process.exit(1);
});
