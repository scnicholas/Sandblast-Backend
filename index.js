/**
 * index.js — Nyx Broadcast Backend (Bulletproof LOCKED)
 * Build: nyx-bulletproof-v1.69-2025-12-20
 *
 * Updates vs v1.68:
 * - Stop repetitiveness:
 *   - Slot-aware followups (ask for missing artist/year/title)
 *   - Fuse prompts so repeated steps vary and then present a menu
 *   - Avoid repeating the same generic "not found" line
 * - Fix out-of-order inputs:
 *   - If slots change (e.g., year then artist), re-attempt resolution immediately
 * - Keep v1.68 improvements:
 *   - clientGreeted support (no double greeting)
 *   - requestId dedupe
 *   - persistent KB worker + timeout restart
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
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  function handleJob(msg) {
    const id = msg && msg.id;
    const text = String(msg && msg.text ? msg.text : "").trim();
    const laneDetail =
      msg && msg.laneDetail && typeof msg.laneDetail === "object" ? msg.laneDetail : {};

    if (!id) return;

    try {
      if (!musicKB) {
        // Load ONCE per worker lifetime
        musicKB = require("./Utils/musicKnowledge");
      }

      const out = {
        year: safe(() => musicKB.extractYear?.(text), null),
        artist: safe(() => musicKB.detectArtist?.(text), null),
        title: safe(() => musicKB.extractTitle?.(text), null),
        best: null,
      };

      const slots = { ...laneDetail };
      if (out.year) slots.year = out.year;
      if (out.artist && !slots.artist) slots.artist = out.artist;
      if (out.title && !slots.title) slots.title = out.title;

      // pickBestMoment should be able to resolve purely from slots
      out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);

      parentPort.postMessage({ id, ok: true, out });
    } catch (e) {
      parentPort.postMessage({
        id,
        ok: false,
        error: String(e && e.message ? e.message : e),
      });
    }
  }

  parentPort.on("message", handleJob);
  parentPort.postMessage({ ok: true, ready: true });

  return;
}

// =======================================================
// MAIN THREAD (Express server)
// =======================================================

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));
app.options("*", cors());

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-bulletproof-v1.69-2025-12-20";
const DEFAULT_CHART = "Billboard Hot 100";

// Keep this reasonable. With the persistent worker, 900–1500ms is fine.
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 1200);

// ---------------- SESSION ----------------
const SESS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const CLEANUP_EVERY_MS = 1000 * 60 * 10; // 10 minutes

function sid() {
  try {
    return crypto.randomUUID();
  } catch {
    return "sid_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function safeStr(x) {
  return String(x == null ? "" : x).trim();
}

function safeObj(x) {
  return x && typeof x === "object" ? x : {};
}

function touch(sess) {
  sess.lastSeen = Date.now();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of SESS.entries()) {
    if (!s || !s.lastSeen) continue;
    if (now - s.lastSeen > SESSION_TTL_MS) SESS.delete(k);
  }
}, CLEANUP_EVERY_MS).unref?.();

// ---------------- HELPERS ----------------
function isGreeting(text) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;
  return (
    t === "hi" ||
    t === "hello" ||
    t === "hey" ||
    t === "yo" ||
    t.startsWith("hi ") ||
    t.startsWith("hello ") ||
    t.startsWith("hey ")
  );
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function bumpPromptFuse(sess, step) {
  const prev = safeStr(sess.lastPromptStep);
  if (prev === step) {
    sess.promptRepeatCount = clampInt(sess.promptRepeatCount, 0, 9999, 0) + 1;
  } else {
    sess.lastPromptStep = step;
    sess.promptRepeatCount = 1;
  }
  return sess.promptRepeatCount;
}

// Provide a rotated message sequence for a given step
function pickVariant(repeatCount, variants) {
  if (!Array.isArray(variants) || variants.length === 0) return "";
  const idx = Math.min(variants.length - 1, Math.max(0, repeatCount - 1));
  return variants[idx];
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

// ---------------- SEND (CANON) ----------------
function send(res, sessionId, sess, step, reply, advance = false) {
  // Persist last response for dedupe safety
  sess.lastReply = reply;
  sess.lastReplyStep = step;

  res.status(200).json({
    ok: true,
    reply,
    state: {
      mode: sess.currentLane,
      step,
      advance,
      slots: sess.laneDetail || {},
    },
    meta: {
      sessionId,
      build: BUILD_TAG,
      serverTime: nowIso(),
    },
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
      slots: sess?.laneDetail || {},
    },
    meta: {
      sessionId: sessionId || null,
      build: BUILD_TAG,
      serverTime: nowIso(),
    },
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

      // loop/fuse controls
      greeted: false,
      lastPromptStep: "",
      promptRepeatCount: 0,

      // dedupe controls
      lastRequestId: "",
      lastReply: "",
      lastReplyStep: "",

      lastSeen: Date.now(),
    };
    SESS.set(key, sess);
  } else {
    touch(sess);
  }

  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";

  sess.greeted = !!sess.greeted;
  sess.lastPromptStep = safeStr(sess.lastPromptStep);
  sess.promptRepeatCount = clampInt(sess.promptRepeatCount, 0, 9999, 0);
  sess.lastRequestId = safeStr(sess.lastRequestId);
  sess.lastReply = safeStr(sess.lastReply);
  sess.lastReplyStep = safeStr(sess.lastReplyStep);

  return { key, sess };
}

// =======================================================
// PERSISTENT KB WORKER (singleton)
// =======================================================

let KB_WORKER = null;
let KB_READY = false;
const PENDING = new Map(); // id -> { resolve, timer }

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
    } catch (e) {
      clearTimeout(timer);
      PENDING.delete(id);
      resolve({ ok: false, error: "KB_POST_FAILED" });
    }
  });
}

// =======================================================
// ROUTES
// =======================================================

app.post("/api/sandblast-gpt", async (req, res) => {
  const text = safeStr(req.body?.message);
  const requestId = safeStr(req.body?.meta?.requestId || req.body?.requestId);

  // Widget can tell server "I already greeted the user"
  const clientGreeted = !!req.body?.meta?.clientGreeted;

  const { key, sess } = resolveSession(req);

  // If client already greeted, mark session greeted to prevent server greeting
  if (clientGreeted && !sess.greeted) {
    sess.greeted = true;
  }

  // ---------------- DEDUPE ----------------
  if (requestId && sess.lastRequestId === requestId && sess.lastReply) {
    touch(sess);
    return send(res, key, sess, sess.lastReplyStep || "dedupe", sess.lastReply, false);
  }
  if (requestId) sess.lastRequestId = requestId;

  // ---------------- Greeting (server-side, only if needed) ----------------
  if (!sess.greeted && !clientGreeted && isGreeting(text)) {
    sess.greeted = true;
    touch(sess);
    return send(
      res,
      key,
      sess,
      "greet",
      "Hi — I’m Nyx. Welcome to Sandblast. Tell me what you’re tuning today: TV, Radio, Sponsors, or Music.",
      false
    );
  }

  // Empty input
  if (!text) {
    touch(sess);

    if (!sess.greeted && !clientGreeted) {
      sess.greeted = true;
      return send(
        res,
        key,
        sess,
        "greet_empty",
        "Welcome to Sandblast — I’m Nyx. Say hi, or tell me what you want: TV, Radio, Sponsors, or Music.",
        false
      );
    }

    return send(
      res,
      key,
      sess,
      "empty",
      "Give me an artist + year (or a song title) and I’ll anchor the moment.",
      false
    );
  }

  // MUSIC LOCK (for now)
  sess.currentLane = "music_history";

  // Query worker with current text
  const kbResult = await kbQuery(text, sess.laneDetail, KB_TIMEOUT_MS);

  if (!kbResult.ok) {
    touch(sess);

    if (kbResult.timedOut) {
      const keepChart = safeStr(sess.laneDetail?.chart) || DEFAULT_CHART;
      sess.laneDetail = { chart: keepChart };

      const repeats = bumpPromptFuse(sess, "kb_timeout");
      const msg = pickVariant(repeats, [
        "I’m loading the music library. Try again in a few seconds, or send just a year (example: 1979).",
        "Still warming up the music library — send a year (e.g., 1996) or an Artist - Title and I’ll lock it in.",
        "No stress — the music library is catching up. Try: 1990–2000, or Artist - Title.",
      ]);

      return send(res, key, sess, "kb_timeout", msg, false);
    }

    return sendStableError(res, key, sess, "kb_error", "Backend hiccup (music library). Try again in a moment.");
  }

  // Worker result
  const out = kbResult.out || {};

  // Merge slot updates with change tracking
  let slotChanged = false;
  const prevArtist = safeStr(sess.laneDetail.artist);
  const prevTitle = safeStr(sess.laneDetail.title);
  const prevYear = sess.laneDetail.year;

  if (out.year && prevYear !== out.year) {
    sess.laneDetail.year = out.year;
    slotChanged = true;
  }
  if (!sess.laneDetail.artist && out.artist) {
    sess.laneDetail.artist = out.artist;
    slotChanged = true;
  }
  if (!sess.laneDetail.title && out.title) {
    sess.laneDetail.title = out.title;
    slotChanged = true;
  }

  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;

  // Best result from initial query
  let best = out.best || null;

  // 🔁 Reconciliation: if slots changed, re-attempt resolution immediately
  // This fixes "year first then artist" and stops repetitive fallback.
  if (!best && slotChanged) {
    const retry = await kbQuery("", sess.laneDetail, KB_TIMEOUT_MS);
    best = retry?.ok ? retry?.out?.best || null : null;
  }

  if (best) {
    touch(sess);

    // Reset prompt fuse when we successfully answer
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

  // ---------------- Slot-aware follow-ups (anti-repetition) ----------------

  // Missing artist
  if (!sess.laneDetail.artist) {
    touch(sess);
    const repeats = bumpPromptFuse(sess, "music_need_artist");
    const msg = pickVariant(repeats, [
      "Who’s the artist? (Example: Styx, Madonna, Prince)",
      "Drop the artist name and I’ll do the rest. If you have it: Artist - Title is perfect.",
      "Pick one:\n1) Send an artist\n2) Send Artist - Title\n3) Say “random 90s” and I’ll pull a strong moment.",
    ]);
    return send(res, key, sess, repeats >= 3 ? "music_need_artist_fused" : "music_need_artist", msg, false);
  }

  // Missing year
  if (!sess.laneDetail.year) {
    touch(sess);

    const repeats = bumpPromptFuse(sess, "music_need_year");
    const msg = pickVariant(repeats, [
      `What year should I check for ${sess.laneDetail.artist}?`,
      "Quick anchor: drop a year (example: 1996) — or send a song title and I’ll infer the year.",
      "No worries — I won’t loop on this. Pick one:\n1) Send a year (1990–2000)\n2) Send a song title\n3) Say “random 90s” and I’ll pull a strong moment.",
    ]);
    return send(res, key, sess, repeats >= 3 ? "music_need_year_fused" : "music_need_year", msg, false);
  }

  // Have artist + year but still no best:
  // Ask for title to disambiguate instead of repeating "not found".
  if (sess.laneDetail.artist && sess.laneDetail.year && !sess.laneDetail.title) {
    touch(sess);
    const repeats = bumpPromptFuse(sess, "music_need_title");
    const msg = pickVariant(repeats, [
      `Got it: ${sess.laneDetail.artist} in ${sess.laneDetail.year}. What song title should I check?`,
      `If you’re not sure, send any title you remember — or type “random ${sess.laneDetail.year}” and I’ll pick a strong moment.`,
      "Pick one:\n1) Send the song title\n2) Send Artist - Title\n3) Say “random 90s” for a curated pull.",
    ]);
    return send(res, key, sess, repeats >= 3 ? "music_need_title_fused" : "music_need_title", msg, false);
  }

  // True not-found case: vary response and show what Nyx currently has
  touch(sess);
  const repeats = bumpPromptFuse(sess, "music_not_found");
  const msg = pickVariant(repeats, [
    "I didn’t find that exact match yet. Try: Artist - Title (optional year).",
    `Still not an exact hit. What I have so far: ${slotSummary(sess.laneDetail)}.\nTry: Artist - Title, or change the year.`,
    "Let’s stop the spin. Pick one:\n1) Artist - Title\n2) Change year\n3) Say “random 90s” and I’ll pull a strong moment.",
  ]);
  return send(res, key, sess, repeats >= 3 ? "music_not_found_fused" : "music_not_found", msg, false);
});

// Health
app.get("/api/health", (_, res) =>
  res.json({
    ok: true,
    build: BUILD_TAG,
    serverTime: nowIso(),
    kbTimeoutMs: KB_TIMEOUT_MS,
    kbWorkerReady: KB_READY,
  })
);

// Debug session by id
app.get("/api/debug/session/:id", (req, res) => {
  const id = safeStr(req.params.id);
  const sess = SESS.get(id);
  if (!sess) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

  res.json({
    ok: true,
    meta: { sessionId: id, build: BUILD_TAG, serverTime: nowIso() },
    state: {
      mode: sess.currentLane,
      lastSeen: sess.lastSeen,
      slots: sess.laneDetail || {},
      greeted: !!sess.greeted,
      lastPromptStep: safeStr(sess.lastPromptStep),
      promptRepeatCount: clampInt(sess.promptRepeatCount, 0, 9999, 0),
      lastRequestId: safeStr(sess.lastRequestId),
      lastReplyStep: safeStr(sess.lastReplyStep),
    },
  });
});

// Debug last active session
app.get("/api/debug/last", (_req, res) => {
  let bestKey = null;
  let bestSess = null;

  for (const [k, s] of SESS.entries()) {
    if (!s || !s.lastSeen) continue;
    if (!bestSess || s.lastSeen > bestSess.lastSeen) {
      bestSess = s;
      bestKey = k;
    }
  }

  if (!bestSess) return res.status(404).json({ ok: false, error: "NO_SESSIONS" });

  res.json({
    ok: true,
    meta: { sessionId: bestKey, build: BUILD_TAG, serverTime: nowIso() },
    state: {
      mode: bestSess.currentLane,
      lastSeen: bestSess.lastSeen,
      slots: bestSess.laneDetail || {},
      greeted: !!bestSess.greeted,
      lastPromptStep: safeStr(bestSess.lastPromptStep),
      promptRepeatCount: clampInt(bestSess.promptRepeatCount, 0, 9999, 0),
      lastRequestId: safeStr(bestSess.lastRequestId),
      lastReplyStep: safeStr(bestSess.lastReplyStep),
      lastReply: safeStr(bestSess.lastReply).slice(0, 500),
    },
  });
});

// Global error shield
app.use((err, req, res, _next) => {
  const headerSid = safeStr(req.headers["x-session-id"]);
  const bodySid = safeStr(req.body?.sessionId);
  const clientSid = safeStr(req.body?.meta?.sessionId) || bodySid || headerSid;

  const key = clientSid || null;
  const sess = key
    ? SESS.get(key)
    : { currentLane: "music_history", laneDetail: { chart: DEFAULT_CHART } };

  console.error("[Nyx][ERR]", err && err.stack ? err.stack : err);

  return sendStableError(res, key, sess, "server_error", "Backend hiccup (HTTP 500). Try again in a moment.");
});

// Start server + start KB worker immediately (warm it up)
app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`);
  startKbWorker();
});
