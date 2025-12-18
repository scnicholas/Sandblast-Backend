/**
 * index.js — Nyx Broadcast Backend (Bulletproof)
 * Sandblast / Nyx
 *
 * Goals:
 * - Zero-loop conversational control-flow (music lane)
 * - Session continuity even if the widget drops meta/sessionId
 * - Handles ~250 concurrent users comfortably (in-memory, TTL, low overhead)
 * - Deterministic state machine + escalation (never repeats the same ask)
 * - Memory safety (caps) + stable error handling
 *
 * Build: nyx-bulletproof-v1.41-2025-12-18
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

// ------------------------------
// Optional modules (safe load)
// ------------------------------
let classifyIntent = null;
try {
  ({ classifyIntent } = require("./Utils/intentClassifier"));
} catch (_) {
  // Safe fallback: heuristics only
}

let musicKB = null;
try {
  musicKB = require("./Utils/musicKnowledge");
} catch (_) {
  musicKB = null;
}

const app = express();

// Render/Proxy correctness (critical for IP-based rate limiting)
app.set("trust proxy", true);

// Body parsing
app.use(express.json({ limit: "1mb" }));

// CORS: permissive for Webflow embeds, but stable headers
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  })
);

// Explicit OPTIONS handler (avoids edge-case preflight failures)
app.options("*", cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-bulletproof-v1.41-2025-12-18";
const DEFAULT_CHART = "Billboard Hot 100";

// ------------------------------
// Request safety / normalization
// ------------------------------
const MAX_MSG_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 2500);

function safeMessage(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.length > MAX_MSG_CHARS ? s.slice(0, MAX_MSG_CHARS) : s;
}

function nowMs() {
  return Date.now();
}

function tryUUID() {
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

// ------------------------------
// Minimal rate limiting (no deps)
// ------------------------------
const RL = new Map(); // key -> {count, resetAt}
const RL_WINDOW_MS = 60_000;
const RL_MAX = Number(process.env.RATE_LIMIT_PER_MIN || 120); // ~2 req/sec

function rateKey(req) {
  const xff = String(req.headers["x-forwarded-for"] || "");
  const ip = (xff.split(",")[0].trim() || req.ip || "unknown").toString();
  return ip;
}

function rateLimit(req, res) {
  const key = rateKey(req);
  const now = nowMs();
  const cur = RL.get(key);

  if (!cur || cur.resetAt <= now) {
    RL.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
    return false;
  }

  cur.count++;
  RL.set(key, cur);

  if (cur.count > RL_MAX) {
    res.status(429).json({
      ok: false,
      error: "RATE_LIMITED",
      retry_after_ms: Math.max(0, cur.resetAt - now),
      build: BUILD_TAG
    });
    return true;
  }
  return false;
}

setInterval(() => {
  const now = nowMs();
  for (const [k, v] of RL.entries()) {
    if (!v || v.resetAt <= now) RL.delete(k);
  }
}, 30_000).unref?.();

// ------------------------------
// Sessions: Self-healing continuity
// ------------------------------
//
// Continuity levels:
// 1) meta.sessionId (preferred)
// 2) Fingerprint -> sessionId mapping if widget drops sessionId
// 3) Hard fallback fingerprint session
//
const SESS = new Map(); // sid -> session
const FP = new Map(); // fingerprint -> { sid, expiresAt }
const SESS_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const FP_TTL_MS = 45 * 60 * 1000; // 45m

// Memory safety caps (prevents unbounded growth under abuse)
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 5000);
const MAX_FINGERPRINTS = Number(process.env.MAX_FINGERPRINTS || 8000);

function genSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function fingerprint(req) {
  // Stable but not overly unique: good enough to recover continuity when widget drops meta
  const xff = String(req.headers["x-forwarded-for"] || "");
  const ip = (xff.split(",")[0].trim() || req.ip || "unknown").toString();
  const ua = String(req.headers["user-agent"] || "").slice(0, 180);
  const lang = String(req.headers["accept-language"] || "").slice(0, 40);
  return `${ip}|${ua}|${lang}`.slice(0, 300);
}

function resolveSessionId(req, incomingMeta) {
  const sid = String(incomingMeta?.sessionId || "").trim();
  if (sid) return sid;

  const fp = fingerprint(req);
  const mapped = FP.get(fp);
  const now = nowMs();
  if (mapped && mapped.sid && mapped.expiresAt > now) return mapped.sid;

  const newSid = genSessionId();
  FP.set(fp, { sid: newSid, expiresAt: now + FP_TTL_MS });
  return newSid;
}

function getSession(sid) {
  return SESS.get(sid) || null;
}

function saveSession(sid, sess) {
  sess.updatedAt = nowMs();
  SESS.set(sid, sess);
}

function capMapSize(map, max) {
  if (map.size <= max) return;
  // Remove oldest entries (simple O(n) scan; fine at these sizes)
  let oldestKey = null;
  let oldestTs = Infinity;
  for (const [k, v] of map.entries()) {
    const ts = v?.updatedAt || v?.expiresAt || Infinity;
    if (ts < oldestTs) {
      oldestTs = ts;
      oldestKey = k;
    }
  }
  if (oldestKey !== null) map.delete(oldestKey);
}

function cleanupSessions() {
  const cutoff = nowMs() - SESS_TTL_MS;

  for (const [sid, sess] of SESS.entries()) {
    if (!sess || !sess.updatedAt || sess.updatedAt < cutoff) SESS.delete(sid);
  }

  const now = nowMs();
  for (const [fp, v] of FP.entries()) {
    if (!v || !v.expiresAt || v.expiresAt <= now) FP.delete(fp);
  }

  // Enforce caps (defensive)
  while (SESS.size > MAX_SESSIONS) capMapSize(SESS, MAX_SESSIONS);
  while (FP.size > MAX_FINGERPRINTS) capMapSize(FP, MAX_FINGERPRINTS);
}

setInterval(cleanupSessions, 15 * 60 * 1000).unref?.();

// ------------------------------
// Music DB (safe load)
// ------------------------------
let MUSIC_DB = { moments: [] };
try {
  if (musicKB && typeof musicKB.loadDb === "function") MUSIC_DB = musicKB.loadDb();
} catch (_) {
  MUSIC_DB = { moments: [] };
}

// ------------------------------
// Debug (optional)
// ------------------------------
const DEBUG_ENABLED = String(process.env.DEBUG || "").toLowerCase() === "true";
let LAST_DEBUG = null;

// ------------------------------
// Health / Ops
// ------------------------------
app.get("/health", (_, res) => res.json({ ok: true, build: BUILD_TAG }));
app.get("/api/health", (_, res) => res.json({ ok: true, build: BUILD_TAG }));

app.get("/api/debug/last", (_, res) => {
  if (!DEBUG_ENABLED) {
    return res.status(403).json({ ok: false, error: "DEBUG_DISABLED", build: BUILD_TAG });
  }
  res.json({ ok: true, build: BUILD_TAG, last: LAST_DEBUG });
});

// ------------------------------
// Utilities
// ------------------------------
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function extractYear(text) {
  if (musicKB && typeof musicKB.extractYear === "function") {
    try {
      return musicKB.extractYear(text);
    } catch {}
  }
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function looksMusicHistory(text) {
  const t = norm(text);
  return (
    t.includes("music") ||
    t.includes("chart") ||
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("#1") ||
    t.includes("number one") ||
    t.includes("top40weekly") ||
    t.includes("uk singles") ||
    t.includes("rpm")
  );
}

function resolveChartFromText(text) {
  const t = norm(text);
  if (t.includes("uk") || t.includes("uk singles") || t.includes("official charts")) return "UK Singles Chart";
  if (t.includes("canada") || t.includes("rpm")) return "Canada RPM";
  if (t.includes("top40weekly") || t.includes("top 40")) return "Top40Weekly";
  if (t.includes("billboard") || t.includes("hot 100")) return "Billboard Hot 100";
  return null;
}

function hasNumberOneIntent(text) {
  return /#1|# 1|number one|no\.?\s?1|no 1/.test(norm(text));
}

function stripLeadingLabel(text, label) {
  const s = String(text || "").trim();
  if (!s) return "";
  const r = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:?\\s*", "i");
  return s.replace(r, "").trim();
}
function sanitizeFact(f) {
  let s = String(f || "").trim();
  s = stripLeadingLabel(s, "chart fact");
  s = stripLeadingLabel(s, "chart anchor");
  s = stripLeadingLabel(s, "fact");
  return s.trim();
}
function sanitizeCulture(c) {
  let s = String(c || "").trim();
  s = stripLeadingLabel(s, "cultural thread");
  s = stripLeadingLabel(s, "culture");
  return s.trim();
}

function safePickBest(fields) {
  try {
    if (musicKB && typeof musicKB.pickBestMoment === "function") {
      return musicKB.pickBestMoment(MUSIC_DB, fields);
    }
  } catch {}
  // fallback minimal search if KB isn’t available
  const moments = (MUSIC_DB && MUSIC_DB.moments) || [];
  const na = fields.artist ? norm(fields.artist) : null;
  const nt = fields.title ? norm(fields.title) : null;
  const y = fields.year ? Number(fields.year) : null;

  if (na && nt && y) return moments.find((m) => norm(m.artist) === na && norm(m.title) === nt && Number(m.year) === y) || null;
  if (na && nt) return moments.find((m) => norm(m.artist) === na && norm(m.title) === nt) || null;
  if (na && y) return moments.find((m) => norm(m.artist) === na && Number(m.year) === y) || null;
  if (nt) return moments.find((m) => norm(m.title) === nt) || null;
  if (na) return moments.find((m) => norm(m.artist) === na) || null;
  return null;
}

function detectArtist(text) {
  if (musicKB && typeof musicKB.detectArtist === "function") {
    try {
      return musicKB.detectArtist(text);
    } catch {}
  }
  return null;
}

function detectTitle(text) {
  if (musicKB && typeof musicKB.detectTitle === "function") {
    try {
      return musicKB.detectTitle(text);
    } catch {}
  }
  return null;
}

function promptSig(stepName, reply) {
  const s = `${stepName || ""}::${String(reply || "").slice(0, 160)}`;
  return norm(s).slice(0, 220);
}

// Commands to resolve mismatch (no “suggest-only” dead ends)
function parseCommand(text) {
  const t = norm(text);

  if (t === "clear title" || t === "reset title") return { cmd: "clear_title" };
  if (t === "clear year" || t === "reset year") return { cmd: "clear_year" };
  if (t === "clear artist" || t === "reset artist") return { cmd: "clear_artist" };
  if (t === "keep year" || t === "keep the year") return { cmd: "keep_year" };

  const setYear = t.match(/^(switch year to|set year to|use year)\s+(19\d{2}|20\d{2})$/);
  if (setYear) return { cmd: "set_year", year: Number(setYear[2]) };

  return { cmd: null };
}

// ------------------------------
// Response helper (stable sessionId, always)
// ------------------------------
function send(res, sid, sess, stepName, reply, advance, requestId) {
  const outMeta = {
    sessionId: sid,
    requestId,
    currentLane: sess.currentLane || "general",
    lastDomain: sess.lastDomain || "general",
    laneDetail: sess.laneDetail || {},
    mem: sess.mem || {},
    _lastStepName: stepName,
    _lastPromptSig: sess._lastPromptSig || "",
    build: BUILD_TAG,
    serverTime: new Date().toISOString()
  };

  res.setHeader("X-Nyx-Session-Id", sid);
  res.setHeader("X-Nyx-Request-Id", requestId);

  return res.json({
    ok: true,
    reply,
    state: {
      mode: outMeta.currentLane,
      step: stepName,
      advance: !!advance,
      slots: {
        artist: outMeta.laneDetail.artist || null,
        year: outMeta.laneDetail.year || null,
        title: outMeta.laneDetail.title || null,
        chart: outMeta.laneDetail.chart || null
      }
    },
    meta: outMeta
  });
}

// ------------------------------
// Main endpoint
// ------------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const requestId = tryUUID();

  try {
    if (rateLimit(req, res)) return;

    const body = req.body || {};
    const userMessage = safeMessage(body.message);
    const incomingMeta = body.meta || {};

    const sid = resolveSessionId(req, incomingMeta);
    const prev = getSession(sid);

    // Base session state
    const sess =
      prev || {
        currentLane: "general",
        lastDomain: "general",
        laneDetail: { chart: DEFAULT_CHART },
        mem: {},
        stepIndex: 0,
        // anti-loop
        _lastStepName: "",
        _lastPromptSig: "",
        _repeatCount: 0,
        _mismatchCount: 0,
        updatedAt: nowMs()
      };

    // Merge in meta.laneDetail/mem if provided (non-destructive; server is authoritative)
    const inLane = incomingMeta.laneDetail || {};
    const inMem = incomingMeta.mem || {};

    sess.laneDetail = sess.laneDetail || {};
    sess.mem = sess.mem || {};

    // Only fill empty slots from client meta (never overwrite server truth with null/empty)
    for (const k of ["artist", "title", "chart"]) {
      if (!sess.laneDetail[k] && inLane[k]) sess.laneDetail[k] = inLane[k];
    }
    if (!sess.laneDetail.year && inLane.year) sess.laneDetail.year = Number(inLane.year) || sess.laneDetail.year;

    // Mem fill (non-destructive)
    if (!sess.mem.musicYear && inMem.musicYear) sess.mem.musicYear = Number(inMem.musicYear) || sess.mem.musicYear;

    const msgN = norm(userMessage);

    // Quick greetings
    const isGreeting =
      ["hi", "hello", "hey", "yo", "hi nyx", "hello nyx", "hey nyx", "nyx"].includes(msgN) ||
      msgN.startsWith("good morning") ||
      msgN.startsWith("good afternoon") ||
      msgN.startsWith("good evening");

    if (isGreeting) {
      sess.currentLane = sess.currentLane || "general";
      sess.lastDomain = sess.lastDomain || "general";
      sess.stepIndex++;

      const stepName = "choose_lane";
      const reply = "Good to have you. Choose a lane: Music history, Sandblast TV, News Canada, or Sponsors.";

      sess._lastPromptSig = promptSig(stepName, reply);
      sess._lastStepName = stepName;
      sess._repeatCount = 0;

      saveSession(sid, sess);

      if (DEBUG_ENABLED) {
        LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, lane: sess.currentLane, message: userMessage };
      }

      return send(res, sid, sess, stepName, reply, true, requestId);
    }

    // Explicit lane selection
    if (["music", "music history", "music_history"].includes(msgN)) {
      sess.currentLane = "music_history";
      sess.lastDomain = "music_history";
      sess.laneDetail.chart ||= DEFAULT_CHART;
      sess.stepIndex++;

      const stepName = "lane_locked";
      const reply = "Music history locked. Give me an artist + year (or a song title).";

      sess._lastPromptSig = promptSig(stepName, reply);
      sess._lastStepName = stepName;
      sess._repeatCount = 0;

      saveSession(sid, sess);

      if (DEBUG_ENABLED) {
        LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, lane: sess.currentLane, message: userMessage };
      }

      return send(res, sid, sess, stepName, reply, true, requestId);
    }

    // Domain: lane wins; otherwise classify/heuristic
    let domain = sess.currentLane || sess.lastDomain || "general";
    if (domain === "general") {
      if (looksMusicHistory(userMessage)) domain = "music_history";
      else if (classifyIntent) {
        try {
          const raw = classifyIntent(userMessage);
          domain = raw?.domain || "general";
        } catch {
          domain = "general";
        }
      }
    }

    // ----------------------------------------------------------
    // MUSIC LANE — Deterministic, escalating, loop-proof
    // ----------------------------------------------------------
    if (domain === "music_history") {
      sess.currentLane = "music_history";
      sess.lastDomain = "music_history";
      sess.stepIndex++;

      // chart switching
      const chart = resolveChartFromText(userMessage);
      if (chart) sess.laneDetail.chart = chart;
      sess.laneDetail.chart ||= DEFAULT_CHART;

      // executable commands (resolve dead-ends)
      const cmd = parseCommand(userMessage);
      if (cmd.cmd === "clear_title") {
        sess.laneDetail.title = null;
        sess._mismatchCount = 0;
      } else if (cmd.cmd === "clear_year") {
        sess.laneDetail.year = null;
        sess.mem.musicYear = null;
        sess._mismatchCount = 0;
      } else if (cmd.cmd === "clear_artist") {
        sess.laneDetail.artist = null;
        sess._mismatchCount = 0;
      } else if (cmd.cmd === "keep_year") {
        sess.laneDetail.title = null;
        sess._mismatchCount = 0;
      } else if (cmd.cmd === "set_year" && cmd.year) {
        sess.laneDetail.year = cmd.year;
        sess.mem.musicYear = cmd.year;
        sess._mismatchCount = 0;
      }

      // lock year
      const y = extractYear(userMessage);
      if (y) {
        sess.laneDetail.year = y;
        sess.mem.musicYear = y;
      } else if (!sess.laneDetail.year && sess.mem.musicYear) {
        sess.laneDetail.year = Number(sess.mem.musicYear) || sess.laneDetail.year;
      }

      // lock artist/title (only fill if missing)
      if (!sess.laneDetail.artist) {
        const n = msgN;
        if (n.includes("peobo bryson")) sess.laneDetail.artist = "Peabo Bryson";
        else if (n.includes("peabo bryson")) sess.laneDetail.artist = "Peabo Bryson";
        else if (n.includes("roberta flack")) sess.laneDetail.artist = "Roberta Flack";
        else if (n.includes("peter cetera")) sess.laneDetail.artist = "Peter Cetera";
        else sess.laneDetail.artist = detectArtist(userMessage) || null;
      }
      if (!sess.laneDetail.title) {
        sess.laneDetail.title = detectTitle(userMessage) || null;
      }

      const slots = sess.laneDetail;
      const lastStep = String(sess._lastStepName || "");
      const lastSig = String(sess._lastPromptSig || "");

      // Attempt full anchor
      const bestFull = safePickBest({
        artist: slots.artist,
        title: slots.title,
        year: slots.year
      });

      if (bestFull) {
        const fact = sanitizeFact(bestFull.fact || bestFull.chart_fact || "Anchor found.");
        const culture = sanitizeCulture(bestFull.culture || bestFull.cultural_moment || "This was a defining radio-era moment.");
        const next = String(bestFull.next || bestFull.next_step || "Next step: want the #1 run, peak position, or the exact chart week?").trim();

        const stepName = "moment_anchored";
        const reply = `Chart fact: ${fact} (${slots.chart})\nCultural thread: ${culture}\nNext step: ${next}`;

        const sig = promptSig(stepName, reply);
        sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

        sess._lastStepName = stepName;
        sess._lastPromptSig = sig;
        sess._mismatchCount = 0;

        saveSession(sid, sess);

        if (DEBUG_ENABLED) {
          LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, slots, message: userMessage };
        }

        return send(res, sid, sess, stepName, reply, true, requestId);
      }

      // Title/year mismatch handler (no “suggest-only” loop)
      if (slots.artist && slots.year && slots.title && !bestFull) {
        sess._mismatchCount = Number(sess._mismatchCount || 0) + 1;

        const byTitle = safePickBest({ title: slots.title });
        const suggestedYear = byTitle?.year ? Number(byTitle.year) : null;

        // If mismatch repeats, force-progress and give executable commands
        if (sess._mismatchCount >= 2) {
          const bestAY = safePickBest({ artist: slots.artist, year: slots.year });

          const fact = sanitizeFact(bestAY?.fact || bestAY?.chart_fact || `Locked: ${slots.artist} (${slots.year}).`);
          const culture = sanitizeCulture(bestAY?.culture || bestAY?.cultural_moment || `This is a strong era pocket for ${slots.artist}.`);

          const switchLine = suggestedYear
            ? `If you meant “${slots.title}”, say: switch year to ${suggestedYear}.`
            : `If you meant “${slots.title}”, tell me the correct year (or say: clear title).`;

          const stepName = "forced_anchor_after_mismatch";
          const reply =
            `Chart anchor: ${fact} (${slots.chart})\n` +
            `Cultural thread: ${culture}\n` +
            `Next step: ${switchLine} Or keep ${slots.year} and give me the correct title for that year.`;

          const sig = promptSig(stepName, reply);
          sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

          sess._lastStepName = stepName;
          sess._lastPromptSig = sig;

          saveSession(sid, sess);

          if (DEBUG_ENABLED) {
            LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, slots, message: userMessage };
          }

          return send(res, sid, sess, stepName, reply, true, requestId);
        }

        const stepName = "title_year_mismatch";
        const reply =
          `I captured: ${slots.artist} + ${slots.year} + “${slots.title}”.\n` +
          `In this dataset, that title doesn’t match the ${slots.year} anchor.\n\n` +
          `Next step (pick one):\n` +
          `1) Keep ${slots.year} → give me the correct title for that year\n` +
          (suggestedYear ? `2) Switch year → say: switch year to ${suggestedYear}\n` : "") +
          `3) Reset title → say: clear title`;

        const sig = promptSig(stepName, reply);
        sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

        sess._lastStepName = stepName;
        sess._lastPromptSig = sig;

        saveSession(sid, sess);

        if (DEBUG_ENABLED) {
          LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, slots, message: userMessage };
        }

        return send(res, sid, sess, stepName, reply, true, requestId);
      }

      // Artist+year locked but no title: anti-loop escalation
      if (slots.artist && slots.year && !slots.title) {
        const askStep = "awaiting_title_or_intent";
        const askReply = `Locked: ${String(slots.artist).toUpperCase()} (${slots.year}). Next step: give the song title (or ask “Was it #1?”).`;

        const askSig = promptSig(askStep, askReply);
        const repeatingAsk = askStep === lastStep && askSig === lastSig;

        if (repeatingAsk || hasNumberOneIntent(userMessage)) {
          const bestAY = safePickBest({ artist: slots.artist, year: slots.year });

          const fact = sanitizeFact(bestAY?.fact || bestAY?.chart_fact || `Locked: ${slots.artist} (${slots.year}).`);
          const culture = sanitizeCulture(bestAY?.culture || bestAY?.cultural_moment || `This was a defining radio-era pocket for ${slots.artist}.`);
          const next = `Next step: give the title for precision, or ask for peak position / #1 run / weeks-on-chart.`;

          const stepName = "forced_anchor_without_title";
          const reply = `Chart anchor: ${fact} (${slots.chart})\nCultural thread: ${culture}\n${next}`;

          const sig = promptSig(stepName, reply);
          sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

          sess._lastStepName = stepName;
          sess._lastPromptSig = sig;

          saveSession(sid, sess);

          if (DEBUG_ENABLED) {
            LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, slots, message: userMessage };
          }

          return send(res, sid, sess, stepName, reply, true, requestId);
        }

        // Ask once
        sess._lastStepName = askStep;
        sess._lastPromptSig = askSig;
        saveSession(sid, sess);

        if (DEBUG_ENABLED) {
          LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, step: askStep, slots, message: userMessage };
        }

        return send(res, sid, sess, askStep, askReply, true, requestId);
      }

      // Artist only
      if (slots.artist && !slots.year && !slots.title) {
        const stepName = "awaiting_year_or_title";
        const reply = `Locked: ${String(slots.artist).toUpperCase()}. Next step: give a year (e.g., 1989) or a song title.`;

        const sig = promptSig(stepName, reply);
        sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

        const finalReply = sess._repeatCount >= 1 ? `We have the artist locked. Give me just one piece now: a year or a title.` : reply;

        sess._lastStepName = stepName;
        sess._lastPromptSig = promptSig(stepName, finalReply);
        saveSession(sid, sess);

        if (DEBUG_ENABLED) {
          LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, slots, message: userMessage };
        }

        return send(res, sid, sess, stepName, finalReply, true, requestId);
      }

      // Year only
      if (slots.year && !slots.artist && !slots.title) {
        const stepName = "awaiting_artist_or_title";
        const reply = `Year locked: ${slots.year}. Next step: give the artist name or the song title.`;

        const sig = promptSig(stepName, reply);
        sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

        const finalReply = sess._repeatCount >= 1 ? `We already have the year. Now I need either the artist or the title.` : reply;

        sess._lastStepName = stepName;
        sess._lastPromptSig = promptSig(stepName, finalReply);
        saveSession(sid, sess);

        if (DEBUG_ENABLED) {
          LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, slots, message: userMessage };
        }

        return send(res, sid, sess, stepName, finalReply, true, requestId);
      }

      // Default prompt
      const stepName = "awaiting_anchor";
      const reply =
        `To anchor the moment, give me an artist + year (or a song title).\n` +
        `Charts supported: Billboard Hot 100, UK Singles, Canada RPM, Top40Weekly. (Current: ${slots.chart || DEFAULT_CHART}).`;

      const sig = promptSig(stepName, reply);
      sess._repeatCount = sig === lastSig && stepName === lastStep ? sess._repeatCount + 1 : 0;

      const finalReply = sess._repeatCount >= 1 ? `Give me either: artist + year, or a song title.` : reply;

      sess._lastStepName = stepName;
      sess._lastPromptSig = promptSig(stepName, finalReply);
      saveSession(sid, sess);

      if (DEBUG_ENABLED) {
        LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, slots, message: userMessage };
      }

      return send(res, sid, sess, stepName, finalReply, false, requestId);
    }

    // ----------------------------------------------------------
    // Non-music lanes (stable placeholders)
    // ----------------------------------------------------------
    sess.lastDomain = domain || "general";
    sess.currentLane = sess.currentLane || "general";
    sess.stepIndex++;

    const stepName = "general_fallback";
    const reply = "Understood. Choose a lane: Music history, Sandblast TV, News Canada, or Sponsors.";

    sess._lastStepName = stepName;
    sess._lastPromptSig = promptSig(stepName, reply);
    saveSession(sid, sess);

    if (DEBUG_ENABLED) {
      LAST_DEBUG = { at: new Date().toISOString(), sid, requestId, stepName, lane: sess.currentLane, message: userMessage };
    }

    return send(res, sid, sess, stepName, reply, true, requestId);
  } catch (err) {
    // Never crash; always return a controlled payload
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: "Nyx hit a backend error. Try again, and if it repeats, enable DEBUG=true and check /api/debug/last.",
      build: BUILD_TAG
    });
  }
});

// ------------------------------
// 404 (clean)
–------------------------------
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "NOT_FOUND",
    path: req.path,
    build: BUILD_TAG
  });
});

// ------------------------------
// Start
// ------------------------------
app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
