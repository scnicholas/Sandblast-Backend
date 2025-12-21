/**
 * index.js — Nyx Broadcast Backend (Wizard-Locked)
 * Build: nyx-wizard-v1.80-2025-12-20
 *
 * Based on your v1.73 bulletproof backend :contentReference[oaicite:3]{index=3}
 *
 * Major upgrades:
 * - Wizard-style state machine: sess.step
 * - Deterministic step transitions with escalation (prevents looping)
 * - Slots are preserved on timeout / KB errors
 * - Artist==Title placeholder trap applies globally (Prince/Prince for all artists)
 * - Still "smart wizard": accepts Artist-Title-Year in one message and jumps ahead
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Worker, isMainThread, parentPort } = require("worker_threads");

// =======================================================
// WORKER MODE (persistent KB engine)
// =======================================================
if (!isMainThread) {
  let musicKB = null;

  function safe(fn, fallback = null) {
    try { return fn(); } catch { return fallback; }
  }

  function handleJob(msg) {
    const id = msg && msg.id;
    const text = String(msg && msg.text ? msg.text : "").trim();
    const laneDetail =
      (msg && msg.laneDetail && typeof msg.laneDetail === "object") ? msg.laneDetail : {};

    if (!id) return;

    try {
      if (!musicKB) {
        musicKB = require("./Utils/musicKnowledge");
      }

      const out = {
        year: safe(() => musicKB.extractYear?.(text), null),
        artist: safe(() => musicKB.detectArtist?.(text), null),
        title: safe(() => musicKB.detectTitle?.(text), null),
        best: null
      };

      const slots = { ...laneDetail };
      if (out.year) slots.year = out.year;
      if (out.artist && !slots.artist) slots.artist = out.artist;
      if (out.title && !slots.title) slots.title = out.title;

      out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);

      parentPort.postMessage({ id, ok: true, out });
    } catch (e) {
      parentPort.postMessage({ id, ok: false, error: String(e && e.message ? e.message : e) });
    }
  }

  parentPort.on("message", handleJob);
  parentPort.postMessage({ ok: true, ready: true });
  return;
}

// =======================================================
// MAIN THREAD
// =======================================================

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));
app.options("*", cors());

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-wizard-v1.80-2025-12-20";
const DEFAULT_CHART = "Billboard Hot 100";
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 2000);

// ---------------- SESSION ----------------
const SESS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const CLEANUP_EVERY_MS = 1000 * 60 * 10;   // 10 minutes

// Wizard steps
const STEPS = {
  MUSIC_START: "MUSIC_START",
  MUSIC_NEED_ARTIST: "MUSIC_NEED_ARTIST",
  MUSIC_NEED_TITLE: "MUSIC_NEED_TITLE",
  MUSIC_NEED_YEAR: "MUSIC_NEED_YEAR",
  MUSIC_LOOKUP: "MUSIC_LOOKUP",
  MUSIC_RESULT: "MUSIC_RESULT",
  MUSIC_NOT_FOUND: "MUSIC_NOT_FOUND",
  MUSIC_ESCALATE: "MUSIC_ESCALATE"
};

function sid() {
  try { return crypto.randomUUID(); }
  catch { return "sid_" + Date.now() + "_" + Math.random().toString(36).slice(2); }
}

function nowIso() { return new Date().toISOString(); }
function safeStr(x) { return String(x == null ? "" : x).trim(); }
function safeObj(x) { return x && typeof x === "object" ? x : {}; }
function touch(sess) { sess.lastSeen = Date.now(); }

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of SESS.entries()) {
    if (!s || !s.lastSeen) continue;
    if (now - s.lastSeen > SESSION_TTL_MS) SESS.delete(k);
  }
}, CLEANUP_EVERY_MS).unref?.();

// ---------------- HELPERS ----------------
function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function normalizeToken(s) { return safeStr(s).toLowerCase(); }

function isGreeting(text) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;
  return (
    t === "hi" || t === "hello" || t === "hey" || t === "yo" ||
    t.startsWith("hi ") || t.startsWith("hello ") || t.startsWith("hey ")
  );
}

function isArtistEqualsTitle(artist, title) {
  const a = normalizeToken(artist);
  const t = normalizeToken(title);
  return !!a && !!t && a === t;
}

function isYearOnly(text) {
  const t = safeStr(text);
  return /^\d{4}$/.test(t);
}

function parseMode(text) {
  const t = safeStr(text);
  if (!t) return null;
  const m = t.match(/^mode\s*:\s*(music|music_history|radio|tv|sponsors|ai)\s*$/i);
  if (!m) return null;
  return safeStr(m[1]).toLowerCase();
}

function parseArtistTitle(text) {
  const t = safeStr(text);
  if (!t) return null;

  const normalized = t.replace(/[–—]/g, "-");
  const m = normalized.match(/^(.{2,}?)\s*-\s*(.{2,}?)$/);
  if (!m) return null;

  const artist = safeStr(m[1]);
  const title = safeStr(m[2]);

  if (!artist || !title) return null;
  if (/^\d{4}$/.test(artist)) return null;
  if (/^\d{4}$/.test(title)) return null;

  if (isArtistEqualsTitle(artist, title)) return null;
  return { artist, title };
}

function looksLikeArtistOnly(text) {
  const t = safeStr(text);
  if (!t) return false;
  if (t.length > 40) return false;
  if (isGreeting(t)) return false;
  if (parseMode(t)) return false;
  if (parseArtistTitle(t)) return false;
  if (isYearOnly(t)) return false;
  if (/^random\b/i.test(t)) return false;
  if (/\d/.test(t)) return false;
  return true;
}

function looksLikeTitleOnly(text) {
  const t = safeStr(text);
  if (!t) return false;
  if (t.length < 2) return false;
  if (isGreeting(t)) return false;
  if (parseMode(t)) return false;
  if (parseArtistTitle(t)) return false;
  if (isYearOnly(t)) return false;
  return true;
}

function isReset(text) {
  const t = normalizeToken(text);
  return (
    t === "reset" || t === "reset music" || t === "start over" ||
    t === "restart" || t === "clear" || t === "clear music"
  );
}

function slotSummary(slots) {
  const s = safeObj(slots);
  const parts = [];
  if (s.artist) parts.push(`artist=${s.artist}`);
  if (s.title) parts.push(`title=${s.title}`);
  if (s.year) parts.push(`year=${s.year}`);
  if (s.chart) parts.push(`chart=${s.chart}`);
  return parts.length ? parts.join(", ") : "none";
}

// Step repeat fuse (per step)
function bumpStepFuse(sess, step) {
  const prev = safeStr(sess.lastPromptStep);
  if (prev === step) {
    sess.promptRepeatCount = clampInt(sess.promptRepeatCount, 0, 9999, 0) + 1;
  } else {
    sess.lastPromptStep = step;
    sess.promptRepeatCount = 1;
  }
  return sess.promptRepeatCount;
}

function pickVariant(repeatCount, variants) {
  if (!Array.isArray(variants) || variants.length === 0) return "";
  const idx = Math.min(variants.length - 1, Math.max(0, repeatCount - 1));
  return variants[idx];
}

// ---------------- SEND ----------------
function send(res, sessionId, sess, step, reply, advance = false) {
  sess.lastReply = reply;
  sess.lastReplyStep = step;

  res.status(200).json({
    ok: true,
    reply,
    state: {
      mode: sess.currentLane,
      step,
      advance,
      wizardStep: sess.step,
      slots: sess.laneDetail || {}
    },
    meta: {
      sessionId,
      build: BUILD_TAG,
      serverTime: nowIso()
    }
  });
}

function sendStableError(res, sessionId, sess, step, reply) {
  if (sess) {
    sess.lastReply = reply;
    sess.lastReplyStep = step;
  }
  res.status(200).json({
    ok: true,
    reply,
    state: {
      mode: sess?.currentLane || "music_history",
      step,
      advance: false,
      wizardStep: sess?.step || STEPS.MUSIC_START,
      slots: sess?.laneDetail || {}
    },
    meta: {
      sessionId: sessionId || null,
      build: BUILD_TAG,
      serverTime: nowIso()
    }
  });
}

// ---------------- SESSION RESOLUTION ----------------
function resolveSession(req) {
  const headerSid = safeStr(req.headers["x-session-id"]);
  const bodySid = safeStr(req.body?.sessionId);
  const metaSid = safeStr(req.body?.meta?.sessionId);

  const clientSid = metaSid || bodySid || headerSid;
  const key = clientSid || sid();

  let sess = SESS.get(key);
  if (!sess) {
    sess = {
      id: key,
      currentLane: "music_history",
      laneDetail: { chart: DEFAULT_CHART },

      greeted: false,
      step: STEPS.MUSIC_START,

      lastPromptStep: "",
      promptRepeatCount: 0,

      lastRequestId: "",
      lastReply: "",
      lastReplyStep: "",

      lastSeen: Date.now()
    };
    SESS.set(key, sess);
  } else {
    touch(sess);
  }

  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";

  sess.greeted = !!sess.greeted;
  sess.step = safeStr(sess.step) || STEPS.MUSIC_START;

  sess.lastPromptStep = safeStr(sess.lastPromptStep);
  sess.promptRepeatCount = clampInt(sess.promptRepeatCount, 0, 9999, 0);
  sess.lastRequestId = safeStr(sess.lastRequestId);
  sess.lastReply = safeStr(sess.lastReply);
  sess.lastReplyStep = safeStr(sess.lastReplyStep);

  return { key, sess };
}

// =======================================================
// KB WORKER (singleton)
// =======================================================
let KB_WORKER = null;
let KB_READY = false;
const PENDING = new Map();

function startKbWorker() {
  KB_READY = false;

  try {
    KB_WORKER = new Worker(__filename);
  } catch (e) {
    console.error("[Nyx][KB] Failed to start worker:", e);
    KB_WORKER = null;
    return;
  }

  KB_WORKER.on("message", (msg) => {
    if (msg && msg.ready) {
      KB_READY = true;
      return;
    }

    const id = msg && msg.id;
    if (!id) return;

    const pending = PENDING.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    PENDING.delete(id);
    pending.resolve(msg);
  });

  KB_WORKER.on("error", (err) => {
    console.error("[Nyx][KB] Worker error:", err);
    KB_READY = false;

    for (const [id, p] of PENDING.entries()) {
      clearTimeout(p.timer);
      p.resolve({ id, ok: false, error: "KB_WORKER_ERROR" });
    }
    PENDING.clear();
  });

  KB_WORKER.on("exit", (code) => {
    console.error("[Nyx][KB] Worker exited:", code);
    KB_READY = false;
    KB_WORKER = null;

    for (const [id, p] of PENDING.entries()) {
      clearTimeout(p.timer);
      p.resolve({ id, ok: false, error: "KB_WORKER_EXIT" });
    }
    PENDING.clear();

    setTimeout(() => startKbWorker(), 250).unref?.();
  });
}

function ensureKbWorker() {
  if (!KB_WORKER) startKbWorker();
  return !!KB_WORKER;
}

function restartKbWorker() {
  try {
    if (KB_WORKER) KB_WORKER.terminate().catch(() => {});
  } catch {}
  KB_WORKER = null;
  KB_READY = false;
  startKbWorker();
}

function kbQuery(text, laneDetail, timeoutMs) {
  return new Promise((resolve) => {
    if (!ensureKbWorker()) {
      return resolve({ ok: false, error: "KB_WORKER_NOT_AVAILABLE" });
    }

    const id = "q_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    const timer = setTimeout(() => {
      PENDING.delete(id);
      restartKbWorker();
      resolve({ ok: false, timedOut: true });
    }, timeoutMs);

    PENDING.set(id, { resolve, timer });

    try {
      KB_WORKER.postMessage({ id, text, laneDetail });
    } catch {
      clearTimeout(timer);
      PENDING.delete(id);
      resolve({ ok: false, error: "KB_POST_FAILED" });
    }
  });
}

// =======================================================
// WIZARD STEP LOGIC
// =======================================================
function computeNextStep(slots) {
  const s = safeObj(slots);

  // Placeholder trap
  if (s.artist && s.title && isArtistEqualsTitle(s.artist, s.title)) {
    s.title = "";
  }

  if (!s.artist) return STEPS.MUSIC_NEED_ARTIST;
  if (!s.title) return STEPS.MUSIC_NEED_TITLE;
  if (!s.year) return STEPS.MUSIC_NEED_YEAR;
  return STEPS.MUSIC_LOOKUP;
}

function quickActions() {
  return [
    "Quick picks:",
    "1) Send: Artist - Title (optional year)",
    "2) Send: 1984 (or any year)",
    "3) Say: random 80s",
    "4) Say: reset music"
  ].join("\n");
}

async function handleMusicWizard(req, res, key, sess, text) {
  // Reset command
  if (isReset(text)) {
    sess.laneDetail = { chart: DEFAULT_CHART };
    sess.step = STEPS.MUSIC_START;
    sess.lastPromptStep = "";
    sess.promptRepeatCount = 0;
    touch(sess);
    return send(res, key, sess, "music_reset", "Music reset. Send Artist - Title (optional year) to begin.", true);
  }

  // Normalize chart
  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;

  // Global placeholder trap
  if (sess.laneDetail.artist && sess.laneDetail.title && isArtistEqualsTitle(sess.laneDetail.artist, sess.laneDetail.title)) {
    sess.laneDetail.title = "";
  }

  // Smart wizard: parse Artist - Title anytime
  const at = parseArtistTitle(text);
  if (at) {
    sess.laneDetail.artist = sess.laneDetail.artist || at.artist;
    const existingIsPlaceholder =
      sess.laneDetail.artist && sess.laneDetail.title && isArtistEqualsTitle(sess.laneDetail.artist, sess.laneDetail.title);

    if (!sess.laneDetail.title || existingIsPlaceholder) {
      sess.laneDetail.title = at.title;
    }
  }

  // Wizard step-aware capture:
  // If we need artist, accept artist-only tokens.
  if (sess.step === STEPS.MUSIC_NEED_ARTIST && !sess.laneDetail.artist && looksLikeArtistOnly(text)) {
    sess.laneDetail.artist = safeStr(text);
  }

  // If we need title, accept title-only tokens.
  if (sess.step === STEPS.MUSIC_NEED_TITLE && sess.laneDetail.artist && !sess.laneDetail.title && looksLikeTitleOnly(text)) {
    if (!isArtistEqualsTitle(sess.laneDetail.artist, text)) {
      sess.laneDetail.title = safeStr(text);
    }
  }

  // If we need year and user sends year only, capture it.
  if (sess.step === STEPS.MUSIC_NEED_YEAR && isYearOnly(text)) {
    sess.laneDetail.year = Number(text);
  }

  // Always allow year capture if present in text (smart wizard)
  // We’ll rely on KB extraction too, but this covers simple inputs.
  if (!sess.laneDetail.year) {
    const m = safeStr(text).match(/\b(19\d{2}|20\d{2})\b/);
    if (m) sess.laneDetail.year = Number(m[1]);
  }

  // Recompute step
  sess.step = computeNextStep(sess.laneDetail);

  // Escalation rule (no more looping)
  const repeatCount = bumpStepFuse(sess, sess.step);
  if (repeatCount >= 3 && sess.step !== STEPS.MUSIC_ESCALATE && sess.step !== STEPS.MUSIC_LOOKUP) {
    sess.step = STEPS.MUSIC_ESCALATE;
  }

  // If escalated, provide deterministic choices
  if (sess.step === STEPS.MUSIC_ESCALATE) {
    touch(sess);
    return send(res, key, sess, "music_escalate", `Let’s stop the spin.\n${quickActions()}`, false);
  }

  // Step prompts
  if (sess.step === STEPS.MUSIC_NEED_ARTIST) {
    touch(sess);
    const msg = pickVariant(repeatCount, [
      "Who’s the artist? (Example: Styx, Madonna, Prince)",
      "Send the artist name — or use Artist - Title (optional year).",
      `Still need the artist.\n${quickActions()}`
    ]);
    return send(res, key, sess, "music_need_artist", msg, false);
  }

  if (sess.step === STEPS.MUSIC_NEED_TITLE) {
    touch(sess);
    const msg = pickVariant(repeatCount, [
      `Got it: ${sess.laneDetail.artist}. What’s the song title?`,
      "Send the title — or send Artist - Title.",
      `Still need the title.\n${quickActions()}`
    ]);
    return send(res, key, sess, "music_need_title", msg, false);
  }

  if (sess.step === STEPS.MUSIC_NEED_YEAR) {
    touch(sess);
    const msg = pickVariant(repeatCount, [
      `What year should I anchor for ${sess.laneDetail.artist} — "${sess.laneDetail.title}"? (Example: 1984)`,
      "Send a year (e.g., 1984). If you don’t know it, say: random 80s.",
      `Still need the year.\n${quickActions()}`
    ]);
    return send(res, key, sess, "music_need_year", msg, false);
  }

  // Lookup step
  if (sess.step === STEPS.MUSIC_LOOKUP) {
    // Query KB
    const kbResult = await kbQuery(text, sess.laneDetail, KB_TIMEOUT_MS);

    if (!kbResult.ok) {
      touch(sess);

      if (kbResult.timedOut) {
        // Preserve slots and step; do not wipe.
        sess.laneDetail = safeObj(sess.laneDetail);
        sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;

        const msg = pickVariant(bumpStepFuse(sess, "kb_timeout"), [
          "I’m loading the music library. Try again in a few seconds.",
          "Still warming up. Try again — or send just a year (example: 1984).",
          `No stress — try again.\n${quickActions()}`
        ]);

        return send(res, key, sess, "kb_timeout", msg, false);
      }

      return sendStableError(res, key, sess, "kb_error", "Backend hiccup (music library). Try again in a moment.");
    }

    const out = kbResult.out || {};

    // Merge detected values (smart wizard)
    if (out.year && !sess.laneDetail.year) sess.laneDetail.year = out.year;
    if (out.artist && !sess.laneDetail.artist) sess.laneDetail.artist = out.artist;
    if (out.title && !sess.laneDetail.title) {
      if (!isArtistEqualsTitle(sess.laneDetail.artist, out.title)) sess.laneDetail.title = out.title;
    }

    // Clear placeholder again
    if (sess.laneDetail.artist && sess.laneDetail.title && isArtistEqualsTitle(sess.laneDetail.artist, sess.laneDetail.title)) {
      sess.laneDetail.title = "";
    }

    let best = out.best || null;

    // If best missing after merge, retry once with cleaned slots
    if (!best) {
      const retry = await kbQuery("", sess.laneDetail, KB_TIMEOUT_MS);
      best = retry?.ok ? retry?.out?.best || null : null;
    }

    if (best) {
      touch(sess);
      sess.step = STEPS.MUSIC_RESULT;
      sess.lastPromptStep = "";
      sess.promptRepeatCount = 0;

      const chart = best.chart || sess.laneDetail.chart || DEFAULT_CHART;
      const fact = best.fact ? `\nFact: ${best.fact}` : "";
      const culture = best.culture ? `\n\n${best.culture}` : "";
      const next = best.next ? `\nNext: ${best.next}` : "";

      return send(
        res,
        key,
        sess,
        "music_answer",
        `${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}${fact}${culture}${next}`,
        true
      );
    }

    // Not found: escalate deterministically
    sess.step = STEPS.MUSIC_NOT_FOUND;
    const repeatsNF = bumpStepFuse(sess, STEPS.MUSIC_NOT_FOUND);
    if (repeatsNF >= 2) sess.step = STEPS.MUSIC_ESCALATE;

    touch(sess);

    if (sess.step === STEPS.MUSIC_ESCALATE) {
      return send(res, key, sess, "music_escalate_nf", `I’m not finding an exact hit for: ${slotSummary(sess.laneDetail)}\n${quickActions()}`, false);
    }

    return send(
      res,
      key,
      sess,
      "music_not_found",
      `I didn’t find that exact match yet.\nWhat I have: ${slotSummary(sess.laneDetail)}\nTry Artist - Title (optional year), or change the year.`,
      false
    );
  }

  // Default safety
  sess.step = computeNextStep(sess.laneDetail);
  touch(sess);
  return send(res, key, sess, "music_fallback", "Send Artist - Title (optional year) to continue.", false);
}

// =======================================================
// ROUTES
// =======================================================

app.post("/api/sandblast-gpt", async (req, res) => {
  const text = safeStr(req.body?.message);
  const requestId = safeStr(req.body?.meta?.requestId || req.body?.requestId);
  const clientGreeted = !!req.body?.meta?.clientGreeted;

  const { key, sess } = resolveSession(req);

  if (clientGreeted && !sess.greeted) sess.greeted = true;

  // Dedupe
  if (requestId && sess.lastRequestId === requestId && sess.lastReply) {
    touch(sess);
    return send(res, key, sess, sess.lastReplyStep || "dedupe", sess.lastReply, false);
  }
  if (requestId) sess.lastRequestId = requestId;

  // Greeting
  if (!sess.greeted && !clientGreeted && isGreeting(text)) {
    sess.greeted = true;
    touch(sess);
    return send(
      res,
      key,
      sess,
      "greet",
      "Good evening — I’m Nyx. Welcome to Sandblast. Choose: Music, TV, Radio, Sponsors, or AI.\nTip: For Music, use Artist - Title (optional year).",
      false
    );
  }

  // Empty
  if (!text) {
    touch(sess);

    if (!sess.greeted && !clientGreeted) {
      sess.greeted = true;
      return send(
        res,
        key,
        sess,
        "greet_empty",
        "Welcome to Sandblast — I’m Nyx. Choose: Music, TV, Radio, Sponsors, or AI.\nTip: For Music, use Artist - Title (optional year).",
        false
      );
    }

    // If music lane, wizard prompt
    if (!sess.currentLane || sess.currentLane === "music_history") {
      sess.currentLane = "music_history";
      sess.step = sess.step || STEPS.MUSIC_START;
      return send(res, key, sess, "music_empty", "Send Artist - Title (optional year) to begin.", false);
    }

    // Non-music lanes
    const lane = sess.currentLane;
    if (lane === "radio") return send(res, key, sess, "radio_empty", "Radio mode: what are we tuning — station, show, schedule, or a segment idea?", false);
    if (lane === "tv") return send(res, key, sess, "tv_empty", "TV mode: tell me the show/genre/grid goal and I’ll tune it.", false);
    if (lane === "sponsors") return send(res, key, sess, "sponsors_empty", "Sponsors mode: tell me business type + goal and I’ll draft a sponsor angle.", false);
    if (lane === "ai") return send(res, key, sess, "ai_empty", "AI mode: tell me what you’re building and what you want Nyx to do.", false);
  }

  // MODE routing
  const forcedMode = parseMode(text);
  if (forcedMode) {
    sess.currentLane = forcedMode === "music" ? "music_history" : forcedMode;
    sess.lastPromptStep = "";
    sess.promptRepeatCount = 0;

    if (sess.currentLane === "music_history") {
      sess.step = STEPS.MUSIC_START;
      touch(sess);
      return send(res, key, sess, "mode_music", "Music mode locked. Send Artist - Title (optional year).", true);
    }

    touch(sess);
    if (sess.currentLane === "radio") return send(res, key, sess, "mode_radio", "Radio mode locked. What are we tuning: station identity, show segment, schedule, or promo script?", true);
    if (sess.currentLane === "tv") return send(res, key, sess, "mode_tv", "TV mode locked. What are we tuning: a show, the grid, or a channel identity direction?", true);
    if (sess.currentLane === "sponsors") return send(res, key, sess, "mode_sponsors", "Sponsors mode locked. What’s the sponsor category and the outcome you want?", true);
    if (sess.currentLane === "ai") return send(res, key, sess, "mode_ai", "AI mode locked. Tell me what you’re building and what done looks like.", true);
  }

  // Soft lane switch
  const lower = text.toLowerCase();
  if (["radio", "tv", "sponsors", "ai", "music"].includes(lower)) {
    sess.currentLane = lower === "music" ? "music_history" : lower;
    sess.lastPromptStep = "";
    sess.promptRepeatCount = 0;

    if (sess.currentLane === "music_history") {
      sess.step = STEPS.MUSIC_START;
      touch(sess);
      return send(res, key, sess, "lane_music", "Music mode. Send Artist - Title (optional year).", true);
    }

    touch(sess);
    if (sess.currentLane === "radio") return send(res, key, sess, "lane_radio", "Radio mode. What are we tuning: station identity, show segment, schedule, or promo copy?", true);
    if (sess.currentLane === "tv") return send(res, key, sess, "lane_tv", "TV mode. What are we tuning: a show, the grid, or programming blocks?", true);
    if (sess.currentLane === "sponsors") return send(res, key, sess, "lane_sponsors", "Sponsors mode. Tell me sponsor category + goal and I’ll build the angle.", true);
    if (sess.currentLane === "ai") return send(res, key, sess, "lane_ai", "AI mode. Tell me what you’re building and where it’s failing.", true);
  }

  // Non-music lanes: do not drift into music
  if (sess.currentLane && sess.currentLane !== "music_history") {
    touch(sess);
    if (sess.currentLane === "radio") return send(res, key, sess, "radio_hold", "Radio mode is active. If you meant Music, say: music.", false);
    if (sess.currentLane === "tv") return send(res, key, sess, "tv_hold", "TV mode is active. If you meant Music, say: music.", false);
    if (sess.currentLane === "sponsors") return send(res, key, sess, "sponsors_hold", "Sponsors mode is active. If you meant Music, say: music.", false);
    if (sess.currentLane === "ai") return send(res, key, sess, "ai_hold", "AI mode is active. If you meant Music, say: music.", false);
  }

  // Music wizard
  sess.currentLane = "music_history";
  sess.step = sess.step || STEPS.MUSIC_START;

  return handleMusicWizard(req, res, key, sess, text);
});

// Health
app.get("/api/health", (_, res) =>
  res.json({
    ok: true,
    build: BUILD_TAG,
    serverTime: nowIso(),
    kbTimeoutMs: KB_TIMEOUT_MS,
    kbWorkerReady: KB_READY
  })
);

// Debug session
app.get("/api/debug/session/:id", (req, res) => {
  const id = safeStr(req.params.id);
  const sess = SESS.get(id);
  if (!sess) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

  res.json({
    ok: true,
    meta: { sessionId: id, build: BUILD_TAG, serverTime: nowIso() },
    state: {
      mode: sess.currentLane,
      wizardStep: sess.step,
      lastSeen: sess.lastSeen,
      slots: sess.laneDetail || {},
      greeted: !!sess.greeted,
      lastPromptStep: safeStr(sess.lastPromptStep),
      promptRepeatCount: clampInt(sess.promptRepeatCount, 0, 9999, 0),
      lastRequestId: safeStr(sess.lastRequestId),
      lastReplyStep: safeStr(sess.lastReplyStep)
    }
  });
});

// Error shield
app.use((err, req, res, _next) => {
  const headerSid = safeStr(req.headers["x-session-id"]);
  const bodySid = safeStr(req.body?.sessionId);
  const clientSid = safeStr(req.body?.meta?.sessionId) || bodySid || headerSid;

  const key = clientSid || null;
  const sess = key ? SESS.get(key) : { currentLane: "music_history", laneDetail: { chart: DEFAULT_CHART }, step: STEPS.MUSIC_START };

  console.error("[Nyx][ERR]", err && err.stack ? err.stack : err);
  return sendStableError(res, key, sess, "server_error", "Backend hiccup (HTTP 500). Try again in a moment.");
});

// Start server + warm KB worker
app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`);
  startKbWorker();
});
