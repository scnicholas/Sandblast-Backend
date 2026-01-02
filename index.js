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

// CORS: permissive by default; tighten if you want
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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

    const rows = Array.isArray(j.rows) ? j.rows : [];
    out.rows = rows.length;

    for (let y = 1950; y <= 1959; y++) {
      out.counts[y] = rows.filter((r) => Number(r.year) === y).length;
    }

    const total = Object.values(out.counts).reduce((a, b) => a + b, 0);
    out.ok = out.file.exists && total >= 300;

    if (!out.ok) out.error = "INCOMPLETE_OR_BAD_ROWS";

    return out;
  } catch (e) {
    out.error = e.message || "SANITY_ERROR";
    return out;
  }
}

// Snapshot cached for /api/health (computed at boot; cheap + stable)
let SANITY_50S = null;

function runBootSanity50s() {
  SANITY_50S = sanityCheck50sSingles();
  const tag = SANITY_50S.ok ? "OK" : "FAIL";

  console.log(
    `[SANITY 50s] ${tag} exists=${SANITY_50S.file.exists} rows=${SANITY_50S.rows} counts=${JSON.stringify(
      SANITY_50S.counts
    )} foundBy=${SANITY_50S.file.foundBy} path=${SANITY_50S.file.abs}`
  );

  // PATCH F: if fail, ALWAYS print high-signal evidence (no env vars required)
  if (!SANITY_50S.ok) {
    try {
      console.log("[SANITY 50s] cwd=", process.cwd());
      console.log("[SANITY 50s] __dirname=", __dirname);

      const renderRoot = "/opt/render/project/src";
      console.log("[SANITY 50s] ls /opt/render/project/src =", safeLs(renderRoot));
      console.log(
        "[SANITY 50s] ls /opt/render/project/src/Data =",
        safeLs(path.join(renderRoot, "Data"))
      );
      console.log(
        "[SANITY 50s] ls /opt/render/project/src/Data/wikipedia =",
        safeLs(path.join(renderRoot, "Data", "wikipedia"))
      );

      console.log("[SANITY 50s] ls __dirname =", safeLs(__dirname));
      console.log(
        "[SANITY 50s] ls __dirname/Data =",
        safeLs(path.resolve(__dirname, "Data"))
      );
      console.log(
        "[SANITY 50s] ls __dirname/Data/wikipedia =",
        safeLs(path.resolve(__dirname, "Data", "wikipedia"))
      );

      console.log(
        "[SANITY 50s] resolve evidence=",
        JSON.stringify(SANITY_50S.evidence, null, 2)
      );
    } catch (e) {
      console.log("[SANITY 50s] debug listing failed:", e.message);
    }
  }

  // PATCH F: legacy enforce is warn-only; only HARD_FAIL can terminate
  if (!SANITY_50S.ok && NYX_SANITY_HARD_FAIL) {
    throw new Error(
      `Boot sanity hard-fail for 50s singles dataset: ${SANITY_50S.error} :: ${SANITY_50S.file.abs} :: foundBy=${SANITY_50S.file.foundBy}`
    );
  }

  if (!SANITY_50S.ok && NYX_SANITY_ENFORCE && !NYX_SANITY_HARD_FAIL) {
    console.warn(
      "[SANITY 50s] NYX_SANITY_ENFORCE=true detected (legacy). Hard-exit is disabled unless NYX_SANITY_HARD_FAIL=true. Continuing in degraded mode."
    );
  }
}

/* ======================================================
   Session Store (authoritative state spine)
====================================================== */

const sessions = new Map();

function nowMs() {
  return Date.now();
}

function makeSessionId() {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * phase:
 *  - "greeting": intro allowed (one time)
 *  - "engaged": post-intro, general conversation (name capture/intent routing)
 *  - "domain_active": user is in a lane (music/tv/sponsors/ai/etc.)
 */
function newSessionState(sessionId) {
  return {
    sessionId,
    createdAt: nowMs(),
    updatedAt: nowMs(),
    intelligenceLevel: DEFAULT_INTELLIGENCE_LEVEL,

    phase: "greeting",
    greetedOnce: false,

    nameCaptured: false,
    userName: null,

    activeDomain: null, // "music" | "tv" | "sponsors" | "ai" | "general"
    lastUserIntent: null,
    lastUserText: null,

    // If the first message was a lane token/chip OR a moments command, store it here so intro can be returned cleanly,
    // but the lane is armed for next message without requiring another chip tap.
    pendingDomainAfterIntro: null,

    // loop protection
    lastReplyHash: null,
    repeatCount: 0,
  };
}

function getSession(sessionIdRaw) {
  const sid = (sessionIdRaw || "").trim() || makeSessionId();
  let st = sessions.get(sid);
  if (!st) {
    st = newSessionState(sid);
    sessions.set(sid, st);
  }
  return st;
}

function touchSession(st) {
  st.updatedAt = nowMs();
}

function cleanupSessions() {
  const ttl = SESSION_TTL_MINUTES * 60 * 1000;
  const cutoff = nowMs() - ttl;
  for (const [sid, st] of sessions.entries()) {
    if ((st.updatedAt || st.createdAt) < cutoff) sessions.delete(sid);
  }
}
setInterval(cleanupSessions, 60 * 1000).unref();

/* ======================================================
   Helpers: text normalization + detection
====================================================== */

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function lower(s) {
  return cleanText(s).toLowerCase();
}

/** PATCH C: never treat lane/commands as a user's name */
const RESERVED_NAME_TOKENS = new Set([
  "music",
  "tv",
  "television",
  "sponsors",
  "sponsor",
  "ads",
  "advertising",
  "ai",
  "a.i.",
  "general",
  "lane:music",
  "lane:tv",
  "lane:sponsors",
  "lane:ai",
  "lane:general",
]);

function isReservedNameToken(s) {
  const t = lower(s);
  return RESERVED_NAME_TOKENS.has(t);
}

function isGreeting(text) {
  const t = lower(text);
  if (!t) return false;
  return (
    t === "hi" ||
    t === "hey" ||
    t === "hello" ||
    t === "good morning" ||
    t === "good afternoon" ||
    t === "good evening" ||
    t.startsWith("hi ") ||
    t.startsWith("hey ") ||
    t.startsWith("hello ")
  );
}

/** PATCH I: harden name detection (reject greetings explicitly) */
function isOnlyName(text) {
  const t = cleanText(text);
  if (!t) return false;

  // Never allow reserved lane tokens to be a "name"
  if (isReservedNameToken(t)) return false;

  // Never allow greetings to be a "name"
  if (isGreeting(t)) return false;

  if (/[\d@#$%^&*_=+[\]{}<>\\/|]/.test(t)) return false;
  const parts = t.split(" ").filter(Boolean);
  if (parts.length < 1 || parts.length > 3) return false;
  if (!parts.every((p) => /^[A-Za-z'’-]{2,}$/.test(p))) return false;
  return true;
}

/** PATCH I: harden extraction paths */
function extractName(text) {
  const t = cleanText(text);
  if (!t) return null;

  // Reject greetings up front
  if (isGreeting(t)) return null;

  // Reject obvious lane tokens early
  if (isReservedNameToken(t)) return null;

  let m = t.match(
    /\bmy name is\s+([A-Za-z'’-]{2,}(?:\s+[A-Za-z'’-]{2,}){0,2})\b/i
  );
  if (m && m[1]) {
    const candidate = m[1].trim();
    if (!isReservedNameToken(candidate) && !isGreeting(candidate)) return candidate;
  }

  m = t.match(
    /\b(i am|i'm)\s+([A-Za-z'’-]{2,}(?:\s+[A-Za-z'’-]{2,}){0,2})\b/i
  );
  if (m && m[2]) {
    const candidate = m[2].trim();
    if (!isReservedNameToken(candidate) && !isGreeting(candidate)) return candidate;
  }

  if (isOnlyName(t)) return t;

  return null;
}

function hashReply(s) {
  return crypto.createHash("sha1").update(String(s || "")).digest("hex");
}

function noteLoopProtection(st, reply) {
  const h = hashReply(reply);
  if (st.lastReplyHash === h) {
    st.repeatCount += 1;
  } else {
    st.lastReplyHash = h;
    st.repeatCount = 0;
  }
  // Less aggressive: require 2 repeats (prevents "nagging" early)
  return st.repeatCount >= 2;
}

/* ======================================================
   SAFE sessionPatch merge (module → session spine)
====================================================== */

function applySessionPatch(st, patch) {
  if (!patch || typeof patch !== "object") return;

  const BLOCK = new Set([
    "sessionId",
    "createdAt",
    "updatedAt",
    "repeatCount",
    "lastReplyHash",
    "phase",
    "greetedOnce",
  ]);

  for (const [k, v] of Object.entries(patch)) {
    if (BLOCK.has(k)) continue;
    st[k] = v;
  }
}

/* ======================================================
   Payload normalization (prevents widget mismatch looping)
====================================================== */

function pickFirstNonEmpty(...vals) {
  for (const v of vals) {
    const t = cleanText(v);
    if (t) return t;
  }
  return "";
}

function resolveSessionId(body) {
  const b = body || {};
  return pickFirstNonEmpty(b.sessionId, b.sid, b.session, b.session_id);
}

function resolveMessage(body) {
  const b = body || {};
  return pickFirstNonEmpty(
    b.message,
    b.text,
    b.input,
    b.value,
    b.label,
    b.query,
    b.prompt
  );
}

/* ======================================================
   Nyx Copy: Intro + social responses (no chips listed)
====================================================== */

function nyxIntroLine() {
  return "On air—welcome to Sandblast. I’m Nyx, your guide. Tell me what you’re here for, and I’ll take it from there.";
}

function nyxAcknowledgeName(name) {
  return `Perfect, ${name}. What do you want to dive into first—music, TV, sponsors, or something else?`;
}

function nyxGreetingReply(st) {
  if (st.nameCaptured && st.userName) {
    return `Hey, ${st.userName}. Where do you want to go next?`;
  }
  return "Hey. What are you in the mood for today—music, TV, sponsors, or something else?";
}

/* ======================================================
   Domain routing (safe, minimal, forward-moving)
====================================================== */

function normalizeDomainFromChipOrText(text) {
  const t = lower(text);
  if (!t) return null;

  if (["music", "lane:music"].includes(t)) return "music";
  if (["tv", "television", "lane:tv"].includes(t)) return "tv";
  if (["sponsors", "sponsor", "ads", "advertising", "lane:sponsors"].includes(t))
    return "sponsors";
  if (["ai", "a.i.", "consulting", "lane:ai"].includes(t)) return "ai";
  if (["general", "lane:general"].includes(t)) return "general";

  return null;
}

// PATCH G: detect when user wants Music Moments
function wantsMusicMoments(text) {
  const t = lower(text);
  if (!t) return false;

  // explicit phrases
  if (t.includes("story moment")) return true;
  if (t.includes("music moment")) return true;

  // top 10 variants
  if (t.includes("top 10")) return true;
  if (t.includes("top ten")) return true;

  // common shorthand: "moment 1988" / "moments 1957"
  // (avoid matching "momentum" etc.)
  if (/\bmoment(s)?\b/.test(t)) return true;

  return false;
}

// PATCH MM: Parse moments commands deterministically
function parseMomentsCommand(text) {
  const t = lower(text);
  if (!t) return null;

  // top 10 1988 / top ten 1988
  let m = t.match(/\btop\s*(10|ten)\s*(\d{4})\b/);
  if (m) return { kind: "top10", year: Number(m[2]) };

  // story moment 1957 / music moment 1957 / moment 1957 / moments 1957
  m = t.match(/\b(story\s+moment|music\s+moment|moment|moments)\s*(\d{4})\b/);
  if (m) return { kind: "story", year: Number(m[2]) };

  return null;
}

function classifyIntent(text) {
  const t = cleanText(text);
  if (!t) return { intent: "empty", confidence: 1.0 };

  if (intentClassifier && typeof intentClassifier.classify === "function") {
    try {
      return intentClassifier.classify(t);
    } catch (e) {
      if (ENABLE_DEBUG) console.warn(`[intentClassifier] failed: ${e.message}`);
    }
  }

  const d = normalizeDomainFromChipOrText(t);
  if (d) return { intent: `domain:${d}`, confidence: 0.75 };

  if (isGreeting(t)) return { intent: "greeting", confidence: 0.9 };
  if (extractName(t)) return { intent: "name", confidence: 0.85 };

  return { intent: "general", confidence: 0.5 };
}

// PATCH G: normalize module return shapes
function normalizeModuleResult(result) {
  if (!result) return null;

  // If module returns {ok, reply, followUp, sessionPatch}
  if (typeof result === "object" && typeof result.reply === "string") {
    return {
      reply: result.reply,
      followUp: result.followUp || null,
      sessionPatch: result.sessionPatch || null,
      domain: result.domain || null,
    };
  }

  // If module returns {text, ...} or anything else: ignore
  return null;
}

function handleDomain(st, domain, userText) {
  const text = cleanText(userText);

  if (domain === "music") {
    // PATCH MM: deterministic command parsing (used for graceful degrade)
    const mmCmd = parseMomentsCommand(text);

    // PATCH G: Music Moments first, when asked and module exists
    if (
      musicMoments &&
      typeof musicMoments.handle === "function" &&
      wantsMusicMoments(text)
    ) {
      try {
        const mm = musicMoments.handle(text, st);
        const normalized = normalizeModuleResult(mm);
        if (normalized) return normalized;
      } catch (e) {
        if (ENABLE_DEBUG) console.warn(`[musicMoments.handle] failed: ${e.message}`);
      }
    }

    // PATCH MM: If musicMoments is missing, prevent the generic "Tell me a year..." loop:
    // - top10: feed just the year into musicKnowledge
    // - story: tell the truth (moments layer not deployed)
    if (
      (!musicMoments || typeof musicMoments.handle !== "function") &&
      mmCmd &&
      mmCmd.year
    ) {
      if (mmCmd.kind === "top10") {
        if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
          try {
            const mk = musicKnowledge.handleChat({ text: String(mmCmd.year), session: st });
            return normalizeModuleResult(mk) || mk;
          } catch (e) {
            if (ENABLE_DEBUG)
              console.warn(`[musicKnowledge.handleChat] failed: ${e.message}`);
          }
        }
        return {
          reply: `Top 10 (${mmCmd.year})—I can do that, but the music charts module isn’t available right now. Try again in a moment.`,
          followUp: [`${mmCmd.year}`, `top 10 ${mmCmd.year}`, "Prince 1984"],
          domain: "music",
        };
      }

      // story moments require the moments dataset/module
      return {
        reply:
          `I can do “story moment ${mmCmd.year}”, but the Music Moments layer isn’t deployed on the server yet.\n\n` +
          `Fix: commit/push Utils/musicMoments.js + the moments dataset, then redeploy. After that, “story moment ${mmCmd.year}” will work instantly.`,
        followUp: [`top 10 ${mmCmd.year}`, `${mmCmd.year}`, "Prince 1984"],
        domain: "music",
      };
    }

    // Existing musicKnowledge path (unchanged)
    if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
      try {
        const mk = musicKnowledge.handleChat({ text, session: st });
        const normalized = normalizeModuleResult(mk) || mk; // preserve legacy shape if you had one
        return normalized;
      } catch (e) {
        if (ENABLE_DEBUG)
          console.warn(`[musicKnowledge.handleChat] failed: ${e.message}`);
      }
    }

    return {
      reply:
        "Alright—music. Give me a year (1950–2024), or say “top 10 1988” / “story moment 1957”, and I’ll pull something memorable.",
      followUp: ["Try: 1957 story moment", "Try: top 10 1988", "Try: Prince 1984"],
      domain: "music",
    };
  }

  if (domain === "tv") {
    if (tvKnowledge && typeof tvKnowledge.handleChat === "function") {
      try {
        return tvKnowledge.handleChat({ text, session: st });
      } catch (e) {
        if (ENABLE_DEBUG) console.warn(`[tvKnowledge.handleChat] failed: ${e.message}`);
      }
    }
    return {
      reply:
        "TV—got it. Tell me a show title, a decade, or a vibe (crime, western, comedy) and I’ll line up the best next step.",
      followUp: ["Try: crime classics", "Try: westerns", "Try: 1960s TV"],
      domain: "tv",
    };
  }

  if (domain === "sponsors") {
    if (sponsorsKnowledge && typeof sponsorsKnowledge.handleChat === "function") {
      try {
        return sponsorsKnowledge.handleChat({ text, session: st });
      } catch (e) {
        if (ENABLE_DEBUG)
          console.warn(`[sponsorsKnowledge.handleChat] failed: ${e.message}`);
      }
    }
    return {
      reply:
        "Sponsors—perfect. Are you looking to advertise, explore packages, or see audience and placement options?",
      followUp: ["Advertising packages", "Audience stats", "Placement options"],
      domain: "sponsors",
    };
  }

  if (domain === "ai") {
    return {
      reply:
        "AI lane—love it. Tell me what you’re trying to achieve: build something, automate a workflow, or improve a business process.",
      followUp: ["Build a chatbot", "Automate outreach", "Improve operations"],
      domain: "ai",
    };
  }

  return {
    reply: "Alright. Tell me what you want to do, and I’ll steer us cleanly.",
    followUp: ["Music", "TV", "Sponsors", "AI"],
    domain: "general",
  };
}

/* ======================================================
   Nyx Tone Wrapper (optional)
====================================================== */

function applyNyxTone(st, reply) {
  if (nyxPersonality && typeof nyxPersonality.applyTone === "function") {
    try {
      return nyxPersonality.applyTone(reply, { session: st });
    } catch (e) {
      if (ENABLE_DEBUG) console.warn(`[nyxPersonality.applyTone] failed: ${e.message}`);
    }
  }
  return reply;
}

/* ======================================================
   TTS (ElevenLabs) — final boundary only
====================================================== */

async function elevenlabsTts(text) {
  let fetchFn = global.fetch;
  if (!fetchFn) {
    try {
      // eslint-disable-next-line global-require
      fetchFn = require("node-fetch");
    } catch (e) {
      throw new Error("Fetch unavailable; install node-fetch or use Node 18+.");
    }
  }

  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const payload = {
    text,
    model_id: ELEVENLABS_MODEL_ID || undefined,
    voice_settings: {
      stability: Number(NYX_VOICE_STABILITY),
      similarity_boost: Number(NYX_VOICE_SIMILARITY),
      style: Number(NYX_VOICE_STYLE),
      use_speaker_boost: NYX_VOICE_SPEAKER_BOOST,
    },
  };

  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(
      `ElevenLabs TTS failed: ${resp.status} ${resp.statusText} :: ${errText}`
    );
  }

  const arrayBuf = await resp.arrayBuffer();
  return {
    audioBytes: Buffer.from(arrayBuf),
    audioMime: "audio/mpeg",
  };
}

async function ttsForReply(text) {
  const raw = cleanText(text);
  if (!raw) return null;

  const natural =
    nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function"
      ? nyxVoiceNaturalize(raw)
      : raw;

  if (!ENABLE_TTS) return null;
  if (TTS_PROVIDER !== "elevenlabs") return null;
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) return null;

  return elevenlabsTts(natural);
}

/* ======================================================
   /api/chat — Core endpoint
====================================================== */

app.post("/api/chat", async (req, res) => {
  try {
    const sessionId = resolveSessionId(req.body);
    const message = resolveMessage(req.body);

    if (ENABLE_DEBUG) {
      const keys = Object.keys(req.body || {});
      console.log("[/api/chat] inbound", {
        keys,
        sessionId: sessionId || "(none)",
        message: message || "(EMPTY)",
        build: BUILD_SHA || "(no-build-sha)",
      });
    }

    const st = getSession(sessionId);
    touchSession(st);
    st.lastUserText = message;

    // --- Precompute chip token safely (FIX precedence bug)
    const chipDomain = normalizeDomainFromChipOrText(message);
    const isLaneToken = lower(message).startsWith("lane:");
    const isSimpleDomainWord = ["music", "tv", "sponsors", "ai", "general"].includes(
      lower(message)
    );
    const messageIsJustChip = Boolean(chipDomain) && (isLaneToken || isSimpleDomainWord);

    // 1) Empty message: if first contact -> intro; else prompt forward
    if (!message) {
      if (st.phase === "greeting" && !st.greetedOnce) {
        st.greetedOnce = true;
        st.phase = "engaged";
        const reply = applyNyxTone(st, nyxIntroLine());
        return res.json({ ok: true, reply, followUp: null, sessionId: st.sessionId });
      }
      const reply = applyNyxTone(st, "I’m here. Tell me what you want to do next.");
      return res.json({ ok: true, reply, followUp: null, sessionId: st.sessionId });
    }

    // 2) HARD RULE: Intro ALWAYS wins on first contact
    // If first message is a lane token/chip, store it for the next user input.
    // PATCH H: if first message is a music moments command, arm music lane for the next turn.
    if (st.phase === "greeting" && !st.greetedOnce) {
      if (messageIsJustChip && chipDomain) {
        st.pendingDomainAfterIntro = chipDomain;
      } else if (wantsMusicMoments(message)) {
        st.pendingDomainAfterIntro = "music";
      }

      st.greetedOnce = true;
      st.phase = "engaged";
      const reply = applyNyxTone(st, nyxIntroLine());
      return res.json({ ok: true, reply, followUp: null, sessionId: st.sessionId });
    }

    // 3) Apply pending domain armed from first-contact lane token / moments command
    if (st.pendingDomainAfterIntro && !st.activeDomain) {
      st.activeDomain = st.pendingDomainAfterIntro;
      st.phase = "domain_active";
      st.pendingDomainAfterIntro = null;
    }

    // 4) Chip arbitration should run BEFORE name capture post-intro
    if (messageIsJustChip && chipDomain) {
      st.activeDomain = chipDomain;
      st.phase = "domain_active";

      const result = handleDomain(st, chipDomain, "");

      if (result && result.sessionPatch) applySessionPatch(st, result.sessionPatch);

      let reply = applyNyxTone(st, result.reply);

      const forcedForward = noteLoopProtection(st, reply);
      if (forcedForward) {
        reply = applyNyxTone(
          st,
          `${reply}\n\nGive me one detail (year, title, or goal) and I’ll move us forward immediately.`
        );
      }

      return res.json({
        ok: true,
        reply,
        followUp: result.followUp || null,
        sessionId: st.sessionId,
      });
    }

    // 5) Intent classification (post-intro)
    const intent = classifyIntent(message);
    st.lastUserIntent = intent.intent;

    // PATCH I: Greeting must be handled BEFORE name capture (prevents "hi" => name)
    if (intent.intent === "greeting" || isGreeting(message)) {
      const reply = applyNyxTone(st, nyxGreetingReply(st));
      return res.json({
        ok: true,
        reply,
        followUp: ["Music", "TV", "Sponsors", "AI"],
        sessionId: st.sessionId,
      });
    }

    // 6) Name capture (safe — reserved tokens + greetings rejected)
    const name = extractName(message);
    if (name && !st.nameCaptured) {
      st.nameCaptured = true;
      st.userName = name;

      const reply = applyNyxTone(st, nyxAcknowledgeName(name));
      return res.json({
        ok: true,
        reply,
        followUp: ["Music", "TV", "Sponsors", "AI"],
        sessionId: st.sessionId,
      });
    }

    // 7) Otherwise: user free-text. Route based on activeDomain if set; else infer domain.
    let domain = st.activeDomain;
    if (!domain) domain = chipDomain || "general";

    // If user explicitly says a domain keyword in free-text, allow it to set active lane
    const explicitDomain = normalizeDomainFromChipOrText(message);
    if (explicitDomain) {
      st.activeDomain = explicitDomain;
      st.phase = "domain_active";
      domain = explicitDomain;
    } else {
      // PATCH G2: Implicit Music lane for moments/top10, even without chip selection
      if (wantsMusicMoments(message)) {
        domain = "music";
        st.activeDomain = "music";
        st.phase = "domain_active";
      } else if (st.phase !== "domain_active" && domain !== "general") {
        st.phase = "domain_active";
      }
    }

    const result = handleDomain(st, domain, message);

    if (result && result.sessionPatch) applySessionPatch(st, result.sessionPatch);

    let reply = applyNyxTone(st, result.reply);

    const forcedForward = noteLoopProtection(st, reply);
    if (forcedForward) {
      reply = applyNyxTone(
        st,
        `${reply}\n\nGive me one specific input (a year, a title, or a goal) and I’ll move us forward immediately.`
      );
    }

    return res.json({
      ok: true,
      reply,
      followUp: result.followUp || null,
      sessionId: st.sessionId,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  }
});

/* ======================================================
   /api/tts + /api/voice — Explicit TTS endpoint + alias
====================================================== */

async function handleTts(req, res) {
  try {
    const text = pickFirstNonEmpty(req.body?.text, req.body?.reply, req.body?.message);
    if (!text) return res.status(400).json({ ok: false, error: "NO_TEXT" });

    const audio = await ttsForReply(text);
    if (!audio) return res.status(501).json({ ok: false, error: "TTS_NOT_CONFIGURED" });

    res.setHeader("Content-Type", audio.audioMime);
    res.setHeader("Cache-Control", "no-store");
    return res.send(audio.audioBytes);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "TTS_ERROR" });
  }
}

app.post("/api/tts", handleTts);
app.post("/api/voice", handleTts);

/* ======================================================
   /api/s2s — Speech-to-speech (minimal placeholder)
====================================================== */

app.post("/api/s2s", upload.single("file"), async (req, res) => {
  try {
    if (!ENABLE_S2S) return res.status(501).json({ ok: false, error: "S2S_DISABLED" });

    const sessionId =
      pickFirstNonEmpty(req.body?.sessionId, req.body?.sid, req.body?.session) ||
      makeSessionId();
    const st = getSession(sessionId);
    touchSession(st);

    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ ok: false, error: "NO_FILE" });
    }

    const transcript = cleanText(req.body.transcript || "");
    const syntheticText = transcript || "Hi Nyx";

    const fakeReq = { body: { message: syntheticText, sessionId: st.sessionId } };
    const fakeRes = {
      _json: null,
      json(obj) {
        this._json = obj;
      },
      status() {
        return this;
      },
    };

    await new Promise((resolve) => {
      app._router.handle(
        { ...fakeReq, method: "POST", url: "/api/chat" },
        fakeRes,
        resolve
      );
    });

    const reply =
      fakeRes._json?.reply || "Want to pick up where we left off, or switch lanes?";

    let audioBytes = null;
    let audioMime = null;
    try {
      const audio = await ttsForReply(reply);
      if (audio) {
        audioBytes = audio.audioBytes.toString("base64");
        audioMime = audio.audioMime;
      }
    } catch (e) {
      if (ENABLE_DEBUG) console.warn(`[s2s tts] failed: ${e.message}`);
    }

    return res.json({
      ok: true,
      transcript: syntheticText,
      reply,
      audioBytes,
      audioMime,
      sessionId: st.sessionId,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "S2S_ERROR" });
  }
});

/* ======================================================
   /api/health — Diagnostics (+ music50s + build + modules)
====================================================== */

app.get("/api/health", (req, res) => {
  const ttsConfigured =
    Boolean(ELEVENLABS_API_KEY) &&
    Boolean(ELEVENLABS_VOICE_ID) &&
    ENABLE_TTS &&
    TTS_PROVIDER === "elevenlabs";

  // Ensure sanity snapshot exists even if boot sanity disabled
  if (!SANITY_50S) SANITY_50S = sanityCheck50sSingles();

  return res.json({
    ok: true,
    service: SERVICE_NAME,
    env: NODE_ENV,
    host: HOST,
    port: PORT,
    time: new Date().toISOString(),
    pid: process.pid,
    keepalive: true,

    // PATCH H: Deployment stamp (verify Render is running the commit you expect)
    build: BUILD_SHA,

    nyx: { intelligenceLevel: DEFAULT_INTELLIGENCE_LEVEL },
    sessions: sessions.size,

    // PATCH MM: module visibility
    modules: {
      musicMomentsLoaded: Boolean(musicMoments && typeof musicMoments.handle === "function"),
      musicKnowledgeLoaded: Boolean(musicKnowledge && typeof musicKnowledge.handleChat === "function"),
    },

    // PATCH D/E/F: production visibility
    music50s: {
      ok: SANITY_50S.ok,
      exists: SANITY_50S.file.exists,
      rows: SANITY_50S.rows,
      counts: SANITY_50S.counts,
      rel: SANITY_50S.file.rel,
      abs: SANITY_50S.file.abs,
      foundBy: SANITY_50S.file.foundBy,
      mtimeMs: SANITY_50S.file.mtimeMs,
      error: SANITY_50S.error,
    },

    tts: {
      provider: TTS_PROVIDER,
      configured: ttsConfigured,
      hasApiKey: Boolean(ELEVENLABS_API_KEY),
      hasVoiceId: Boolean(ELEVENLABS_VOICE_ID),
      hasModelId: Boolean(ELEVENLABS_MODEL_ID),
      voiceTuning: {
        stability: NYX_VOICE_STABILITY,
        similarity: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        speakerBoost: NYX_VOICE_SPEAKER_BOOST,
      },
    },
  });
});

/* ======================================================
   Start
====================================================== */

try {
  if (NYX_SANITY_ON_BOOT) runBootSanity50s();
} catch (e) {
  console.error(`[SANITY 50s] BOOT BLOCKED: ${e.message}`);

  // PATCH F: never crash-loop unless explicitly requested
  if (NYX_SANITY_HARD_FAIL) process.exit(1);

  if (NYX_SANITY_ENFORCE) {
    console.warn(
      "[SANITY 50s] NYX_SANITY_ENFORCE=true detected (legacy). Continuing in degraded mode. Set NYX_SANITY_HARD_FAIL=true to hard-fail."
    );
  }
}

app.listen(PORT, HOST, () => {
  console.log(
    `[${SERVICE_NAME}] up :: env=${NODE_ENV} host=${HOST} port=${PORT} build=${
      BUILD_SHA || "none"
    } tts=${ENABLE_TTS ? TTS_PROVIDER : "off"}`
  );
});
