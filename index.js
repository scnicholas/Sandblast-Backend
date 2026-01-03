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
 *  - If very first message is a Music Moments command, arm pendingDomainAfterIntro="music"
 *    while still returning the intro (keeps "intro always wins" rule).
 *
 * HOTFIX (2026-01-02, PATCH I):
 *  - Greeting handling MUST run before name capture post-intro (prevents "hi" => userName).
 *  - isOnlyName must reject greetings explicitly.
 *
 * NEW (2026-01-02, PATCH MM — DETERMINISTIC MOMENTS COMMAND PARSER + GRACEFUL DEGRADE):
 *  - Parse "top 10 ####" and "story moment ####" explicitly.
 *  - If Utils/musicMoments is missing in production, make "top 10 ####" fall back to musicKnowledge(year)
 *    instead of returning the generic “Tell me a year…” loop.
 *  - If story moments layer is missing, say so directly (no looping).
 *  - /api/health reports whether musicMoments is loaded.
 *
 * NEW (2026-01-02, STEP 1 — NYX DEFAULT RESPONSE WRAPPER):
 *  - Enforce: Acknowledge → Lock Intent → Advance (post-intro only)
 *  - Intro remains a single line and always wins on first contact.
 *
 * NEW (2026-01-02, STEP 1 TONE TUNE):
 *  - Slightly warmer, more confident pacing (host presence)
 *
 * NEW (2026-01-02, PATCH J — YEAR-ONLY CHART FALLBACK):
 *  - If user enters a year-only (e.g., "1999") and current chart context can't produce a clean list,
 *    automatically retry against canonical charts (Year-End Hot 100 → Hot 100 → Year-End Singles),
 *    persist the working chart in session, and prevent dead-end messaging.
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
const NYX_VOICE_SIMILARITY = process.env.NYX_VOICE_SIMILARITY || "0.75";
const NYX_VOICE_STYLE = process.env.NYX_VOICE_STYLE || "0.45";
const NYX_VOICE_SPEAKER_BOOST =
  String(process.env.NYX_VOICE_SPEAKER_BOOST || "true").toLowerCase() === "true";

// Sanity enforcement (legacy) — now warn-only by default
const NYX_SANITY_ENFORCE =
  String(process.env.NYX_SANITY_ENFORCE || "false").toLowerCase() === "true";

// Only THIS can hard-fail the process
const NYX_SANITY_HARD_FAIL =
  String(process.env.NYX_SANITY_HARD_FAIL || "false").toLowerCase() === "true";

// Debug
const ENABLE_DEBUG = String(process.env.NYX_DEBUG || "false").toLowerCase() === "true";

/* ======================================================
   Middleware
====================================================== */

app.use(cors());
app.use(express.json({ limit: "5mb" }));

/* ======================================================
   Safe require helpers
====================================================== */

function safeRequire(modPath) {
  try {
    // eslint-disable-next-line global-require
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
    base: process.cwd(),
  });

  // 2) __dirname direct
  tries.push({
    label: "__dirname",
    abs: path.resolve(__dirname, rel),
    base: __dirname,
  });

  // 3) upwards search from __dirname
  const up = findUpwards(__dirname, rel, 8);
  tries.push({
    label: "upwards(__dirname)",
    abs: up.abs,
    base: up.base,
    depth: up.depth,
    found: up.found,
  });

  // Return first existing
  for (const t of tries) {
    if (fs.existsSync(t.abs))
      return { abs: t.abs, evidence: tries, foundBy: t.label };
  }

  // None found: return best guess (upwards path) + evidence
  return { abs: up.abs, evidence: tries, foundBy: "none" };
}

function sanityCheck50sSingles() {
  const resolved = resolveRepoFile(WIKI_SINGLES_50S_REL);
  const abs = resolved.abs;

  const out = {
    ok: false,
    file: {
      rel: WIKI_SINGLES_50S_REL,
      abs,
      exists: false,
      mtimeMs: 0,
      foundBy: resolved.foundBy,
    },
    counts: {},
    rows: 0,
    error: null,
    evidence: resolved.evidence || null,
  };

  try {
    out.file.exists = fs.existsSync(abs);

    if (!out.file.exists) {
      out.error = "FILE_MISSING";
      return out;
    }

    try {
      const st = fs.statSync(abs);
      out.file.mtimeMs = Number(st.mtimeMs || 0);
    } catch (_) {}

    // eslint-disable-next-line global-require, import/no-dynamic-require
    const j = require(abs);

    const rows = Array.isArray(j.rows)
      ? j.rows
      : Array.isArray(j)
      ? j
      : Array.isArray(j.data)
      ? j.data
      : null;

    if (!rows) {
      out.error = "BAD_FORMAT";
      return out;
    }

    out.rows = rows.length;
    const counts = {};
    for (const r of rows) {
      const y = Number(r.year);
      if (!Number.isFinite(y)) continue;
      counts[y] = (counts[y] || 0) + 1;
    }
    out.counts = counts;
    out.ok = out.rows > 0;
    return out;
  } catch (e) {
    out.error = e.message || String(e);
    return out;
  }
}

const bootSanity50s = sanityCheck50sSingles();

function runBootSanity50s() {
  // PATCH F: deploy survival — never crash by default
  if (bootSanity50s.ok) {
    if (ENABLE_DEBUG) {
      console.log(
        `[bootSanity50s] ok=true rows=${bootSanity50s.rows} foundBy=${bootSanity50s.file.foundBy}`
      );
    }
    return;
  }

  // Always-on evidence when sanity fails (so you can see why in Render logs)
  console.warn(
    `[bootSanity50s] ok=false error=${bootSanity50s.error} exists=${bootSanity50s.file.exists} abs=${bootSanity50s.file.abs} foundBy=${bootSanity50s.file.foundBy}`
  );

  if (ENABLE_DEBUG && bootSanity50s.evidence) {
    for (const t of bootSanity50s.evidence) {
      console.warn(
        `[bootSanity50s] evidence label=${t.label} base=${t.base} abs=${t.abs} exists=${fs.existsSync(
          t.abs
        )}`
      );
      try {
        const dir = path.dirname(t.abs);
        console.warn(`[bootSanity50s] ls ${dir} ->`, safeLs(dir));
      } catch (_) {}
    }
  }

  if (NYX_SANITY_HARD_FAIL) {
    console.error("[bootSanity50s] HARD FAIL enabled. Exiting.");
    process.exit(1);
  }

  // Legacy behavior becomes warn-only
  if (NYX_SANITY_ENFORCE) {
    console.warn(
      "[bootSanity50s] NYX_SANITY_ENFORCE is legacy. Warning only (no crash). Use NYX_SANITY_HARD_FAIL=true to terminate."
    );
  }
}

runBootSanity50s();

/* ======================================================
   Session store
====================================================== */

const sessions = new Map();

function nowMs() {
  return Date.now();
}

function makeSessionId() {
  return crypto.randomBytes(8).toString("hex");
}

function newSessionState() {
  return {
    id: makeSessionId(),
    createdAt: nowMs(),
    updatedAt: nowMs(),
    // "greeting" -> intro shown; "domain_active" -> chip selected or inferred
    phase: "greeting",
    // user name capture
    userName: null,
    // active domain lane
    activeDomain: "general",
    // if first message was a lane token, we store it to arm after intro
    pendingDomainAfterIntro: null,

    // OPTION 3 (Music Moments) state spine
    lastStoryYear: null,
    lastStoryAt: 0,
    pendingMicroYear: null, // year awaiting user confirmation for a micro-moment
    usedMicroYears: {}, // { [year:number]: true }
    suppressWrapOnce: false, // one-turn wrapper bypass when we intentionally format beats

    // loop protection
    lastReplyHash: null,
    repeatCount: 0,
    lastUserText: null,

    // music continuity (module-provided sessionPatch may update)
    activeMusicChart: null,
    lastMusicYear: null,
    lastMusicChart: null,

    // intelligence
    intelligenceLevel: DEFAULT_INTELLIGENCE_LEVEL,
  };
}

function getSession(sessionId) {
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function touchSession(st) {
  if (!st) return;
  st.updatedAt = nowMs();
}

function cleanupSessions() {
  const ttlMs = SESSION_TTL_MINUTES * 60 * 1000;
  const cutoff = nowMs() - ttlMs;
  for (const [id, st] of sessions.entries()) {
    if (!st || !st.updatedAt || st.updatedAt < cutoff) sessions.delete(id);
  }
}

// periodic cleanup
setInterval(cleanupSessions, 30 * 60 * 1000).unref();

/* ======================================================
   Text helpers
====================================================== */

function cleanText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(s) {
  return cleanText(s).toLowerCase();
}

function isYearOnly(text) {
  const t = cleanText(text);
  return /^\d{4}$/.test(t);
}

function extractYear(text) {
  const t = cleanText(text);
  const m = t.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function looksLikeMissingYearList(reply) {
  const r = lower(reply);
  return (
    r.includes("give me a year") ||
    r.includes("tell me a year") ||
    r.includes("pick a year") ||
    r.includes("choose a year") ||
    r.includes("year (") ||
    r.includes("enter a year")
  );
}

function isReservedNameToken(text) {
  const t = lower(text);
  if (!t) return false;
  return (
    t === "music" ||
    t === "tv" ||
    t === "sponsors" ||
    t === "ai" ||
    t === "general" ||
    t.startsWith("lane:") ||
    t.includes("story moment") ||
    t.includes("top 10") ||
    t.includes("top ten")
  );
}

function isGreeting(text) {
  const t = lower(text);
  if (!t) return false;
  return (
    t === "hi" ||
    t === "hello" ||
    t === "hey" ||
    t === "yo" ||
    t === "hiya" ||
    t === "good morning" ||
    t === "good afternoon" ||
    t === "good evening"
  );
}

function isAffirmation(text) {
  const t = lower(text);
  if (!t) return false;

  // Tight, high-signal confirmations (avoid false positives like "yeah but...")
  return (
    t === "yes" ||
    t === "y" ||
    t === "yeah" ||
    t === "yep" ||
    t === "sure" ||
    t === "ok" ||
    t === "okay" ||
    t === "please" ||
    t === "do it" ||
    t === "go" ||
    t === "let's go" ||
    t === "lets go" ||
    t === "hit it" ||
    t === "continue" ||
    t === "keep going"
  );
}

function isNextCue(text) {
  const t = lower(text);
  if (!t) return false;
  return (
    t === "next" ||
    t === "next year" ||
    t === "keep going" ||
    t === "continue" ||
    t === "go on" ||
    t === "move on" ||
    t === "another" ||
    t === "one more"
  );
}

/** PATCH I: harden name detection to avoid greetings and lane tokens */
function isOnlyName(text) {
  const t = cleanText(text);
  if (!t) return false;

  // reject greeting-only, lane tokens, or reserved words
  if (isGreeting(t)) return false;
  if (isReservedNameToken(t)) return false;

  // single word or two-word "First Last"
  const parts = t.split(" ").filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return false;

  // must be alphabetic-ish
  const ok = parts.every((p) => /^[a-zA-Z][a-zA-Z'-]*$/.test(p));
  return ok;
}

function extractName(text) {
  const t = cleanText(text);
  if (!isOnlyName(t)) return null;
  return t;
}

/* ======================================================
   Loop protection (lightweight)
====================================================== */

function hashReply(reply) {
  return crypto.createHash("sha1").update(String(reply || "")).digest("hex");
}

function noteLoopProtection(st, reply) {
  if (!st) return;
  const h = hashReply(reply);
  if (st.lastReplyHash === h) {
    st.repeatCount = (st.repeatCount || 0) + 1;
  } else {
    st.lastReplyHash = h;
    st.repeatCount = 0;
  }
}

/* ======================================================
   Session patch merge (safe)
====================================================== */

function applySessionPatch(st, patch) {
  if (!st || !patch || typeof patch !== "object") return;
  // Only allow known keys; prevent module from overwriting critical session scaffolding
  const allow = new Set([
    "activeMusicChart",
    "lastMusicYear",
    "lastMusicChart",
    "activeDomain",
    "phase",
    "userName",
    "intelligenceLevel",
  ]);
  for (const [k, v] of Object.entries(patch)) {
    if (!allow.has(k)) continue;
    st[k] = v;
  }
}

/* ======================================================
   Payload tolerance (PATCH B)
====================================================== */

function pickFirstNonEmpty(obj, keys) {
  for (const k of keys) {
    const v = obj && obj[k];
    if (typeof v === "string" && cleanText(v)) return cleanText(v);
  }
  return "";
}

function resolveSessionId(body) {
  return (
    pickFirstNonEmpty(body, ["sessionId", "sid", "session"]) ||
    pickFirstNonEmpty(body, ["id"])
  );
}

function resolveMessage(body) {
  return pickFirstNonEmpty(body, [
    "message",
    "text",
    "input",
    "value",
    "label",
    "query",
  ]);
}

/* ======================================================
   Nyx voice / intro / greeting
====================================================== */

function nyxIntroLine() {
  // single line, no extra options
  return "On air—welcome to Sandblast. I’m Nyx. Tell me what you’re here for, and I’ll take it from there.";
}

function nyxAcknowledgeName(name) {
  const n = cleanText(name);
  if (!n) return null;
  return `Got you, ${n}.`;
}

function nyxGreetingReply(st, userText) {
  const greet = isGreeting(userText);
  if (!greet) return null;

  // If we already know the name, greet with name.
  if (st && st.userName) {
    return `Hey, ${st.userName}—good to have you back. What are we doing today?`;
  }
  return "Hey—good to have you here. What are we doing today?";
}

/* ======================================================
   STEP 1 — Acknowledge → Lock Intent → Advance
====================================================== */

function shouldApplyDefaultWrapper(st, baseReply) {
  // Never wrap the hard intro line. Keep it single-line and canonical.
  if (!st) return true;
  if (st.phase === "greeting") return false;
  if (st.suppressWrapOnce) return false;
  if (!baseReply) return true;
  const r = String(baseReply).trim();
  if (!r) return true;
  if (r === nyxIntroLine()) return false;
  return true;
}

function pickAckForDomain(domain, userText) {
  const d = (domain || "general").toLowerCase();
  const t = lower(userText);

  if (d === "music") {
    if (t.includes("top 10") || t.includes("top ten")) return "Music—top ten. Clean and sharp.";
    if (t.includes("story")) return "Music—story moment. Got it.";
    if (isYearOnly(t)) return "Music—year locked.";
    return "Music—locked.";
  }
  if (d === "tv") return "TV—locked.";
  if (d === "sponsors") return "Sponsors—locked.";
  if (d === "ai") return "AI—locked.";
  return "Got it.";
}

function lockIntentLine({ dom, intent, year }) {
  const d = (dom || "general").toLowerCase();
  if (d === "music" && year) return `Intent: Music moments (${year}).`;
  if (d === "music") return "Intent: Music moments.";
  if (d === "tv") return "Intent: TV.";
  if (d === "sponsors") return "Intent: Sponsors.";
  if (d === "ai") return "Intent: AI.";
  return "Intent: General.";
}

function extractYearForWrapper(userText, st) {
  const y = extractYear(userText);
  if (y) return y;
  if (st && st.lastMusicYear) return Number(st.lastMusicYear);
  return null;
}

function needsAdvanceLine(coreReply) {
  const r = lower(coreReply);
  // Avoid adding “advance” if the reply already ends with a question or offers next steps
  if (r.endsWith("?")) return false;
  if (r.includes("want") && r.includes("?")) return false;
  if (r.includes("say") && r.includes("story moment")) return false;
  if (r.includes("want") && r.includes("another year")) return false;
  return true;
}

function advanceLineForDomain(dom, year) {
  const d = (dom || "general").toLowerCase();
  if (d === "music") {
    if (year) return `Next: say “top 10 ${year}”, “story moment ${year}”, or give me another year.`;
    return "Next: give me a year, or say “top 10 ####” / “story moment ####”.";
  }
  if (d === "tv") return "Next: tell me a show, decade, or mood and I’ll line it up.";
  if (d === "sponsors") return "Next: tell me what you’re promoting and your budget range.";
  if (d === "ai") return "Next: tell me your goal (automation, growth, support, or security) and your timeline.";
  return "Next: tell me what you want to do, and I’ll drive.";
}

function nyxWrapDefaultReply({
  st,
  userText,
  domain,
  intent,
  coreReply,
  year,
} = {}) {
  const core = String(coreReply || "").trim();
  if (!shouldApplyDefaultWrapper(st, core)) return core;

  const ack = pickAckForDomain(domain, userText);
  const y = year || extractYearForWrapper(userText, st);
  const lock = lockIntentLine({ dom: domain, intent, year: y });
  const advance = needsAdvanceLine(core) ? advanceLineForDomain(domain, y) : "";

  // 3-beat, clean. No filler.
  return [ack, lock, core, advance].filter(Boolean).join("\n");
}

/* ======================================================
   Domain normalization + moments intent
====================================================== */

function normalizeDomainFromChipOrText(chip, text) {
  const c = lower(chip);
  if (c === "music") return "music";
  if (c === "tv") return "tv";
  if (c === "sponsors") return "sponsors";
  if (c === "ai") return "ai";
  if (c === "general") return "general";

  const t = lower(text);
  if (!t) return null;

  if (t.startsWith("lane:")) {
    const lane = t.split(":")[1] || "";
    return normalizeDomainFromChipOrText(lane, "");
  }

  // PATCH G2: implicit music lane if message looks like a moments command
  if (wantsMusicMoments(t)) return "music";

  return null;
}

function wantsMusicMoments(text) {
  const t = lower(text);
  if (!t) return false;
  return (
    /\btop\s*(10|ten)\b/.test(t) ||
    /\bstory\s*moment\b/.test(t) ||
    /\bmoment\b/.test(t) ||
    /\bmicro(?:\s+moment)?\b/.test(t)
  );
}

// PATCH MM: deterministic command parsing
function parseMomentsCommand(text) {
  const t = lower(text);
  if (!t) return null;

  // micro moment 1957 / micro 1957
  let m = t.match(/\bmicro(?:\s+moment)?\s*(\d{4})\b/);
  if (m) return { kind: "micro", year: Number(m[1]) };

  // top 10 1988 / top ten 1988
  m = t.match(/\btop\s*(10|ten)\s*(\d{4})\b/);
  if (m) return { kind: "top10", year: Number(m[2]) };

  // story moment 1957 / moment 1957
  m = t.match(/\b(story\s*moment|moment)\s*(\d{4})\b/);
  if (m) return { kind: "story", year: Number(m[2]) };

  return null;
}

/* ======================================================
   Intent classifier (fallback)
====================================================== */

function classifyIntent(text) {
  if (intentClassifier && typeof intentClassifier.classify === "function") {
    return intentClassifier.classify(text);
  }
  // Minimal fallback
  const t = lower(text);
  if (t.includes("sponsor")) return { domain: "sponsors", intent: "sponsors" };
  if (t.includes("tv") || t.includes("show")) return { domain: "tv", intent: "tv" };
  if (t.includes("ai") || t.includes("automation")) return { domain: "ai", intent: "ai" };
  if (wantsMusicMoments(t)) return { domain: "music", intent: "music_moments" };
  return { domain: "general", intent: "general" };
}

/* ======================================================
   Module result normalization
====================================================== */

function normalizeModuleResult(result) {
  if (!result) return null;

  // If module returns {ok, reply, followUp, sessionPatch}
  if (typeof result === "object" && typeof result.reply === "string") {
    return {
      reply: result.reply,
      followUp: result.followUp || null,
      sessionPatch: result.sessionPatch || null,
      domain: result.domain || null,
      meta: result.meta || null,
    };
  }

  // If module returns a raw string
  if (typeof result === "string") {
    return { reply: result, followUp: null, sessionPatch: null, domain: null };
  }

  return null;
}

/* ======================================================
   Domain router
====================================================== */

function handleDomain(domain, text, st) {
  const d = (domain || "general").toLowerCase();
  const t = cleanText(text);

  // MUSIC
  if (d === "music") {
    // PATCH MM: deterministic command parsing and graceful degrade
    const mmCmd = parseMomentsCommand(t);

    // Prefer musicMoments if present and the text is a moments command
    if (mmCmd && musicMoments && typeof musicMoments.handle === "function") {
      try {
        const mm = musicMoments.handle(text, st);
        const normalized = normalizeModuleResult(mm);

        if (normalized && mmCmd && mmCmd.year) {
          const y = Number(mmCmd.year);

          // OPTION 3: Story → Offer Micro → Advance (no wrapper; we already format the beats)
          if (mmCmd.kind === "story") {
            st.lastStoryYear = y;
            st.lastStoryAt = nowMs();

            // Offer a micro-moment once per year per session (unless already used)
            const used = Boolean(st.usedMicroYears && st.usedMicroYears[y]);
            if (!used) st.pendingMicroYear = y;

            const anchor = `Anchor: ${y} → #1 sets the emotional temperature for the year.`;

            const microOffer = used
              ? "If you want the next beat, say “next year”."
              : `Want the 10-second micro-moment for ${y}? Say “yes” (or just “micro ${y}”).`;

            return {
              ...normalized,
              reply: `${normalized.reply}\n\n${anchor}\n${microOffer}`,
              followUp: used
                ? [`story moment ${y + 1}`, "top 10 " + (y + 1)]
                : [`micro ${y}`, `story moment ${y + 1}`, `top 10 ${y}`],
              meta: { noWrap: true },
              domain: "music",
            };
          }

          // OPTION 3: Micro moment (assumes musicMoments supports "micro moment ####")
          if (mmCmd.kind === "micro") {
            st.pendingMicroYear = null;
            st.usedMicroYears = st.usedMicroYears || {};
            st.usedMicroYears[y] = true;

            const nextYear = y + 1;
            const nextCue =
              nextYear <= 2024
                ? `Next beat: say “story moment ${nextYear}” (or just “next”).`
                : "If you want another decade, give me a year and I’ll keep rolling.";

            return {
              ...normalized,
              reply: `${normalized.reply}\n\n${nextCue}`,
              followUp:
                nextYear <= 2024
                  ? [`story moment ${nextYear}`, "next", `top 10 ${y}`]
                  : [`top 10 ${y}`, "1950", "1960"],
              meta: { noWrap: true },
              domain: "music",
            };
          }
        }

        if (normalized) return normalized;
      } catch (e) {
        if (ENABLE_DEBUG) console.warn("[musicMoments.handle] failed:", e.message);
      }
    }

    // Graceful degrade:
    // If musicMoments missing, we try to handle "top 10 ####" via musicKnowledge by feeding just the year.
    if (mmCmd && mmCmd.kind === "top10" && musicKnowledge && typeof musicKnowledge.handleChat === "function") {
      const y = Number(mmCmd.year);
      const r = musicKnowledge.handleChat({ text: String(y), session: st });
      const normalized = normalizeModuleResult(r);
      if (normalized) {
        normalized.domain = "music";
        return normalized;
      }
    }

    if (mmCmd && mmCmd.kind === "story" && (!musicMoments || typeof musicMoments.handle !== "function")) {
      return {
        reply:
          "Story moments aren’t loaded on this deployment yet. If you want, ask for “top 10 ####” and I’ll still give you the list—then we’ll add the story layer back in.",
        followUp: ["top 10 1950", "top 10 1988", "music 1957"],
        sessionPatch: null,
        domain: "music",
      };
    }

    // Default musicKnowledge routing
    if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
      const r = musicKnowledge.handleChat({ text: t, session: st });
      const normalized = normalizeModuleResult(r);
      if (normalized) {
        normalized.domain = "music";
        return normalized;
      }
    }

    return {
      reply: "Music module isn’t available right now.",
      followUp: ["general", "tv", "sponsors", "ai"],
      sessionPatch: null,
      domain: "music",
    };
  }

  // TV
  if (d === "tv" && tvKnowledge && typeof tvKnowledge.handleChat === "function") {
    const r = tvKnowledge.handleChat({ text: t, session: st });
    const normalized = normalizeModuleResult(r);
    if (normalized) {
      normalized.domain = "tv";
      return normalized;
    }
  }

  // Sponsors
  if (
    d === "sponsors" &&
    sponsorsKnowledge &&
    typeof sponsorsKnowledge.handleChat === "function"
  ) {
    const r = sponsorsKnowledge.handleChat({ text: t, session: st });
    const normalized = normalizeModuleResult(r);
    if (normalized) {
      normalized.domain = "sponsors";
      return normalized;
    }
  }

  // AI
  if (d === "ai" && nyxPersonality && typeof nyxPersonality.handleAiChat === "function") {
    const r = nyxPersonality.handleAiChat({ text: t, session: st });
    const normalized = normalizeModuleResult(r);
    if (normalized) {
      normalized.domain = "ai";
      return normalized;
    }
  }

  // General fallback
  if (nyxPersonality && typeof nyxPersonality.handleGeneralChat === "function") {
    const r = nyxPersonality.handleGeneralChat({ text: t, session: st });
    const normalized = normalizeModuleResult(r);
    if (normalized) {
      normalized.domain = "general";
      return normalized;
    }
  }

  // Last resort
  return {
    reply: "Tell me what you want to do, and I’ll take it from there.",
    followUp: ["Music", "TV", "Sponsors", "AI"],
    sessionPatch: null,
    domain: "general",
  };
}

/* ======================================================
   Tone wrapper (non-destructive)
====================================================== */

function applyNyxTone(text) {
  const t = cleanText(text);
  if (!t) return t;
  // If you want to route through nyxPersonality’s tone wrapper, do it safely.
  if (nyxPersonality && typeof nyxPersonality.toneWrap === "function") {
    try {
      return nyxPersonality.toneWrap(t);
    } catch (_) {
      return t;
    }
  }
  return t;
}

/* ======================================================
   ElevenLabs TTS
====================================================== */

async function elevenlabsTts(text) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return { ok: false, error: "Missing ElevenLabs API key/voice ID." };
  }

  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const payload = {
    text,
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
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `ElevenLabs ${res.status}: ${txt}` };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: true, audioBytes: buf, audioMime: "audio/mpeg" };
}

async function ttsForReply(replyText) {
  const text = String(replyText || "").trim();
  if (!text) return { ok: false, error: "NO_TEXT" };

  // Canonical: naturalize before TTS (you locked this)
  let t = text;
  if (nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function") {
    try {
      t = nyxVoiceNaturalize(t);
    } catch (_) {}
  }

  if (TTS_PROVIDER === "elevenlabs") {
    return elevenlabsTts(t);
  }

  return { ok: false, error: `Unknown TTS provider: ${TTS_PROVIDER}` };
}

/* ======================================================
   /api/chat
====================================================== */

app.post("/api/chat", async (req, res) => {
  try {
    const incomingKeys = Object.keys(req.body || {});
    let sessionId = resolveSessionId(req.body);

    let st = sessionId ? getSession(sessionId) : null;
    if (!st) {
      st = newSessionState();
      sessions.set(st.id, st);
      sessionId = st.id;
    }
    touchSession(st);

    let message = resolveMessage(req.body);

    if (ENABLE_DEBUG) {
      console.log("[/api/chat] keys=", incomingKeys, "sessionId=", sessionId, "msg=", message);
    }

    // Empty message guard — do not loop; ask once.
    if (!cleanText(message)) {
      const reply = "I didn’t catch that. Tell me what you want to do—Music, TV, Sponsors, or AI.";
      noteLoopProtection(st, reply);
      return res.json({ ok: true, reply, followUp: null, sessionId });
    }

    // Store last user text
    st.lastUserText = message;

    // OPTION 3 (Music Moments): intercept confirmations so Nyx can advance without looping.
    //  - If we just offered a micro-moment for a given year and the user affirms, convert this turn into "micro moment YEAR".
    //  - If user says "next" after a story, convert to the next year's story moment.
    if (st.pendingMicroYear && isAffirmation(message)) {
      const y = Number(st.pendingMicroYear);
      st.pendingMicroYear = null;
      st.activeDomain = "music";
      st.phase = "domain_active";
      // Mark micro used so it can't be re-fired in-session.
      st.usedMicroYears = st.usedMicroYears || {};
      st.usedMicroYears[y] = true;
      // Preserve formatting; this is a deliberate 3-beat response.
      st.suppressWrapOnce = true;
      // Rewrite message for downstream routing.
      message = `micro moment ${y}`;
    } else if (st.lastStoryYear && isNextCue(message)) {
      const nextYear = Number(st.lastStoryYear) + 1;
      if (nextYear >= 1950 && nextYear <= 2024) {
        st.activeDomain = "music";
        st.phase = "domain_active";
        st.suppressWrapOnce = true;
        message = `story moment ${nextYear}`;
      }
    }

    // Keep lastUserText consistent if we rewrote the message above.
    st.lastUserText = message;

    // --- Precompute chip token if provided (widget may send lane token in message)
    const inferredChip = normalizeDomainFromChipOrText(message, message);
    let chipDomain = inferredChip || st.activeDomain || "general";

    // First contact: intro ALWAYS wins (single line), but store pending domain if message is a lane token/moments cmd
    if (st.phase === "greeting") {
      // greeting handler first (PATCH I)
      const greetReply = nyxGreetingReply(st, message);
      if (greetReply) {
        const reply = greetReply;
        noteLoopProtection(st, reply);
        // Keep greeting phase until they say something real
        return res.json({ ok: true, reply, followUp: null, sessionId });
      }

      // If first message implies a domain, arm it for after intro
      const dom = normalizeDomainFromChipOrText(inferredChip, message);
      if (dom) {
        st.pendingDomainAfterIntro = dom;
      }

      const reply = nyxIntroLine();
      noteLoopProtection(st, reply);
      // Flip phase after returning intro
      st.phase = "intro_shown";
      return res.json({ ok: true, reply, followUp: null, sessionId });
    }

    // After intro: if pending domain was armed, activate it now
    if (st.phase === "intro_shown" && st.pendingDomainAfterIntro) {
      st.activeDomain = st.pendingDomainAfterIntro;
      chipDomain = st.activeDomain;
      st.pendingDomainAfterIntro = null;
      st.phase = "domain_active";
    }

    // greeting handler post-intro (PATCH I)
    const greetReply2 = nyxGreetingReply(st, message);
    if (greetReply2) {
      const base = greetReply2;
      let reply;
      if (st.suppressWrapOnce) {
        reply = base;
      } else {
        reply = nyxWrapDefaultReply({
          st,
          userText: message,
          domain: chipDomain,
          intent: `domain:${chipDomain}`,
          coreReply: base,
        });
      }
      noteLoopProtection(st, reply);
      st.suppressWrapOnce = false;
      return res.json({ ok: true, reply, followUp: null, sessionId });
    }

    // Chip arbitration BEFORE name capture (PATCH C)
    const maybeDom = normalizeDomainFromChipOrText(inferredChip, message);
    if (maybeDom) {
      st.activeDomain = maybeDom;
      chipDomain = maybeDom;
      st.phase = "domain_active";
    }

    // Name capture ONLY if the message looks like a real name (PATCH C/I)
    if (!st.userName && isOnlyName(message)) {
      const name = extractName(message);
      if (name) {
        st.userName = name;
        const base = `${nyxAcknowledgeName(name)} What are we doing today—Music, TV, Sponsors, or AI?`;
        let reply;
        if (st.suppressWrapOnce) {
          reply = base;
        } else {
          reply = nyxWrapDefaultReply({
            st,
            userText: message,
            domain: "general",
            intent: "name_capture",
            coreReply: base,
          });
        }
        noteLoopProtection(st, reply);
        st.phase = "domain_active";
        // Reset one-turn flags
        st.suppressWrapOnce = false;

        return res.json({ ok: true, reply, followUp: null, sessionId });
      }
    }

    // Intent classification (fallback)
    const classified = classifyIntent(message);
    if (classified && classified.domain) {
      // Do not override explicit domain selection unless it's still general
      if (st.activeDomain === "general" && classified.domain !== "general") {
        st.activeDomain = classified.domain;
        chipDomain = classified.domain;
        st.phase = "domain_active";
      }
    }

    // Domain handle
    const result = handleDomain(chipDomain, message, st);
    const normalized = normalizeModuleResult(result) || {
      reply: "Tell me what you want to do, and I’ll take it from there.",
      followUp: null,
      sessionPatch: null,
      domain: chipDomain,
    };

    // Merge sessionPatch safely (PATCH 2026-01-01)
    if (normalized.sessionPatch) applySessionPatch(st, normalized.sessionPatch);

    // PATCH J: Year-only chart fallback (if music + year-only + dead-end year prompt)
    if (
      chipDomain === "music" &&
      isYearOnly(message) &&
      looksLikeMissingYearList(normalized.reply) &&
      musicKnowledge &&
      typeof musicKnowledge.handleChat === "function"
    ) {
      const y = Number(message);
      const tryCharts = [
        "Billboard Year-End Hot 100",
        "Billboard Hot 100",
        "Billboard Year-End Singles",
      ];
      let recovered = null;
      for (const ch of tryCharts) {
        const sessionClone = { ...st, activeMusicChart: ch };
        const r = musicKnowledge.handleChat({ text: String(y), session: sessionClone });
        const n = normalizeModuleResult(r);
        if (n && n.reply && !looksLikeMissingYearList(n.reply)) {
          recovered = { n, ch, sessionClone };
          break;
        }
      }
      if (recovered) {
        // Persist the working chart
        st.activeMusicChart = recovered.ch;
        normalized.reply = recovered.n.reply;
        normalized.followUp = recovered.n.followUp || normalized.followUp;
      }
    }

    // Apply tone wrapper (non-destructive)
    let base = applyNyxTone(normalized.reply);

    // STEP 1: enforce wrapper post-intro (unless this turn intentionally formats the beats)
    let reply;
    if ((result && result.meta && result.meta.noWrap) || st.suppressWrapOnce) {
      reply = base;
    } else {
      reply = nyxWrapDefaultReply({
        st,
        userText: message,
        domain: chipDomain,
        intent: `domain:${chipDomain}`,
        coreReply: base,
      });
    }

    // Loop guard: if same reply repeats too often, force a hard pivot question
    noteLoopProtection(st, reply);
    if (st.repeatCount >= 2) {
      reply = "Quick pivot—tell me one clear thing you want right now: a year, a top 10, or a story moment.";
      st.repeatCount = 0;
      st.lastReplyHash = hashReply(reply);
    }

    // Reset one-turn flags
    st.suppressWrapOnce = false;

    return res.json({
      ok: true,
      reply,
      followUp: normalized.followUp || null,
      sessionId,
    });
  } catch (e) {
    console.error("[/api/chat] error:", e);
    return res.status(500).json({
      ok: false,
      error: e.message || String(e),
    });
  }
});

/* ======================================================
   /api/tts + /api/voice alias
====================================================== */

async function handleTts(req, res) {
  try {
    // Payload tolerance: accept NO_TEXT (widget may send reply elsewhere)
    const text = pickFirstNonEmpty(req.body, ["text", "message", "reply"]) || "";
    if (!cleanText(text)) {
      return res.status(400).json({ ok: false, error: "NO_TEXT" });
    }

    const out = await ttsForReply(text);
    if (!out.ok) return res.status(500).json(out);

    // Safer audio headers (canonical)
    res.setHeader("Content-Type", out.audioMime || "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(out.audioBytes);
  } catch (e) {
    console.error("[/api/tts] error:", e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}

app.post("/api/tts", handleTts);
// Canonical alias you locked
app.post("/api/voice", handleTts);

/* ======================================================
   /api/s2s (speech-to-speech passthrough)
====================================================== */

app.post("/api/s2s", upload.single("file"), async (req, res) => {
  try {
    // This endpoint expects your existing implementation elsewhere; keep non-destructive.
    // If you’ve wired it in another module, you can call it here.
    return res.status(501).json({
      ok: false,
      error: "S2S endpoint is not implemented in this build.",
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/* ======================================================
   /api/health
====================================================== */

app.get("/api/health", (req, res) => {
  return res.json({
    ok: true,
    service: SERVICE_NAME,
    env: NODE_ENV,
    host: HOST,
    port: PORT,
    time: new Date().toISOString(),
    pid: process.pid,
    keepalive: true,
    build: BUILD_SHA,
    nyx: { intelligenceLevel: DEFAULT_INTELLIGENCE_LEVEL },
    sessions: sessions.size,
    music50s: {
      ok: bootSanity50s.ok,
      exists: bootSanity50s.file.exists,
      rows: bootSanity50s.rows,
      counts: bootSanity50s.counts,
      rel: bootSanity50s.file.rel,
      abs: bootSanity50s.file.abs,
      foundBy: bootSanity50s.file.foundBy,
      mtimeMs: bootSanity50s.file.mtimeMs,
      error: bootSanity50s.error,
    },
    musicMomentsLoaded: Boolean(musicMoments && typeof musicMoments.handle === "function"),
    tts: {
      provider: TTS_PROVIDER,
      voiceIdPresent: Boolean(ELEVENLABS_VOICE_ID),
      keyPresent: Boolean(ELEVENLABS_API_KEY),
    },
  });
});

/* ======================================================
   Start
====================================================== */

app.listen(PORT, HOST, () => {
  console.log(
    `[${SERVICE_NAME}] listening on http://${HOST}:${PORT} env=${NODE_ENV} build=${BUILD_SHA || "n/a"}`
  );
});
