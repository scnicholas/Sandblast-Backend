/**
 * index.js — Nyx Broadcast Backend (Bulletproof LOCKED)
 * Build: nyx-bulletproof-v1.66-2025-12-20
 *
 * Fixes:
 * - Persistent KB Worker (loads musicKnowledge ONCE, stays warm)
 * - Hard timeout per request (never stalls widget)
 * - If worker hangs: terminate + auto-restart
 * - Loop-proof timeout messaging (no "repeat same input" bait)
 * - Stable response shape on errors
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
    const laneDetail = (msg && msg.laneDetail && typeof msg.laneDetail === "object") ? msg.laneDetail : {};

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
// MAIN THREAD (Express server)
// =======================================================

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));
app.options("*", cors());

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-bulletproof-v1.66-2025-12-20";
const DEFAULT_CHART = "Billboard Hot 100";

// Keep this reasonable. With the persistent worker, 900–1500ms is fine.
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 1200);

// ---------------- SESSION ----------------
const SESS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const CLEANUP_EVERY_MS = 1000 * 60 * 10;   // 10 minutes

function sid() {
  try { return crypto.randomUUID(); }
  catch { return "sid_" + Date.now() + "_" + Math.random().toString(36).slice(2); }
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

// ---------------- SEND (CANON) ----------------
function send(res, sessionId, sess, step, reply, advance = false) {
  res.status(200).json({
    ok: true,
    reply,
    state: {
      mode: sess.currentLane,
      step,
      advance,
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
  res.status(200).json({
    ok: true,
    reply,
    state: {
      mode: sess?.currentLane || "music_history",
      step,
      advance: false,
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
  const clientSid = safeStr(req.body?.meta?.sessionId);
  const key = clientSid || sid();

  let sess = SESS.get(key);
  if (!sess) {
    sess = {
      id: key,
      currentLane: "music_history",
      laneDetail: { chart: DEFAULT_CHART },
      lastSeen: Date.now()
    };
    SESS.set(key, sess);
  } else {
    touch(sess);
  }

  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";

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
    // Ready signal
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
    // Fail all pending quickly
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

    // Fail all pending
    for (const [id, p] of PENDING.entries()) {
      clearTimeout(p.timer);
      p.resolve({ id, ok: false, error: "KB_WORKER_EXIT" });
    }
    PENDING.clear();

    // Auto-restart
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
      // Hard timeout: prevent widget stall
      PENDING.delete(id);

      // If the worker is hanging, restart it (this is the bulletproof part)
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
  const { key, sess } = resolveSession(req);

  // Empty input: stable prompt
  if (!text) {
    touch(sess);
    return send(
      res,
      key,
      sess,
      "empty",
      "Give me an artist + year (or a song title) and I’ll anchor the moment.",
      false
    );
  }

  // MUSIC LOCK
  sess.currentLane = "music_history";

  // Query persistent worker
  const kbResult = await kbQuery(text, sess.laneDetail, KB_TIMEOUT_MS);

  if (!kbResult.ok) {
    touch(sess);

    if (kbResult.timedOut) {
      // Loop-proof: clear volatile slots, keep chart
      const keepChart = safeStr(sess.laneDetail?.chart) || DEFAULT_CHART;
      sess.laneDetail = { chart: keepChart };

      // IMPORTANT: do NOT ask user to repeat the same input immediately
      return send(
        res,
        key,
        sess,
        "kb_timeout",
        "I’m loading the music library. Try again in a few seconds, or send just a year (example: 1979) and I’ll narrow it down.",
        false
      );
    }

    return sendStableError(
      res,
      key,
      sess,
      "kb_error",
      "Backend hiccup (music library). Try again in a moment."
    );
  }

  // Worker result
  const out = kbResult.out || {};

  // Merge slot updates
  if (out.year) sess.laneDetail.year = out.year;
  if (!sess.laneDetail.artist && out.artist) sess.laneDetail.artist = out.artist;
  if (!sess.laneDetail.title && out.title) sess.laneDetail.title = out.title;
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;

  const best = out.best;

  if (best) {
    touch(sess);

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

  // Slot prompting
  if (!sess.laneDetail.year) {
    touch(sess);
    return send(
      res,
      key,
      sess,
      "music_need_year",
      `What year should I check for ${sess.laneDetail.artist || "that artist"}?`,
      false
    );
  }

  touch(sess);
  return send(
    res,
    key,
    sess,
    "music_not_found",
    "I didn’t find that exact match yet. Try: Artist - Title (optional year).",
    false
  );
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
      lastSeen: sess.lastSeen,
      slots: sess.laneDetail || {}
    }
  });
});

// Global error shield
app.use((err, req, res, _next) => {
  const clientSid = safeStr(req.body?.meta?.sessionId);
  const key = clientSid || null;
  const sess = key
    ? SESS.get(key)
    : { currentLane: "music_history", laneDetail: { chart: DEFAULT_CHART } };

  console.error("[Nyx][ERR]", err && err.stack ? err.stack : err);

  return sendStableError(
    res,
    key,
    sess,
    "server_error",
    "Backend hiccup (HTTP 500). Try again in a moment."
  );
});

// Start server + start KB worker immediately (warm it up)
app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`);
  startKbWorker();
});
