/**
 * index.js — Nyx Broadcast Backend (Bulletproof LOCKED)
 * Build: nyx-bulletproof-v1.64-2025-12-20
 *
 * Adds:
 * - /api/sandblast-gpt HARD timeout guard via Worker Thread
 *   (prevents slow/sync KB calls from stalling the widget)
 * - NO greeting (Nyx responds only to user messages)
 * - Session cohesion fixed (store/retrieve by the same sessionId)
 * - TTL cleanup
 * - Stable response shape even on backend errors
 */

"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

// =======================================================
// WORKER MODE
// =======================================================
if (!isMainThread) {
  // Worker does ONLY the KB work so it can be killed on timeout.
  (async () => {
    try {
      const musicKB = require("./Utils/musicKnowledge");

      const text = String(workerData?.text || "").trim();
      const laneDetail = workerData?.laneDetail && typeof workerData.laneDetail === "object"
        ? workerData.laneDetail
        : {};

      // Safe wrappers (do not throw back to parent)
      const extractYear = () => {
        try { return musicKB.extractYear?.(text) || null; } catch { return null; }
      };
      const detectArtist = () => {
        try { return musicKB.detectArtist?.(text) || null; } catch { return null; }
      };
      const extractTitle = () => {
        try { return musicKB.extractTitle?.(text) || null; } catch { return null; }
      };
      const pickBestMoment = (ctx, slots) => {
        try { return musicKB.pickBestMoment?.(ctx, slots) || null; } catch { return null; }
      };

      const out = {
        year: extractYear(),
        artist: detectArtist(),
        title: extractTitle(),
        best: null
      };

      // Only pick if we have enough to try (artist or title or year)
      const slots = { ...laneDetail };
      if (out.year) slots.year = out.year;
      if (out.artist && !slots.artist) slots.artist = out.artist;
      if (out.title && !slots.title) slots.title = out.title;

      out.best = pickBestMoment(null, slots);

      parentPort.postMessage({ ok: true, out });
    } catch (e) {
      parentPort.postMessage({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();

  return; // IMPORTANT: do not run Express server in worker
}

// =======================================================
// MAIN THREAD (SERVER)
// =======================================================

const app = express();
app.set("trust proxy", true);

// ---------------- CONFIG ----------------
const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-bulletproof-v1.64-2025-12-20";
const DEFAULT_CHART = "Billboard Hot 100";

// Hard timeout for the KB work (ms).
// Keep this low to protect UX under load.
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 1200);

// CORS + JSON
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));
app.options("*", cors());

// ---------------- SESSION ----------------
const SESS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const CLEANUP_EVERY_MS = 1000 * 60 * 10;   // 10 minutes

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

// ---------------- SEND (CANON) ----------------
function send(res, sessionId, sess, step, reply, advance = false) {
  res.json({
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
  // Always return 200 with stable JSON to keep the widget calm.
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
      id: key, // IMPORTANT: id == key
      currentLane: "music_history",
      laneDetail: { chart: DEFAULT_CHART },
      lastSeen: Date.now()
    };
    SESS.set(key, sess);
  } else {
    touch(sess);
  }

  // Normalize
  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";

  return { key, sess };
}

// ---------------- HARD TIMEOUT GUARD ----------------
function runKbInWorkerWithTimeout(payload, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;

    const worker = new Worker(__filename, {
      workerData: payload
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Kill worker to stop any CPU runaway
      worker.terminate().catch(() => {});
      resolve({ ok: false, timedOut: true });
    }, timeoutMs);

    worker.on("message", (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Clean exit
      worker.terminate().catch(() => {});
      resolve({ ok: true, msg });
    });

    worker.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      resolve({ ok: false, error: String(err && err.message ? err.message : err) });
    });

    worker.on("exit", () => {
      // If it exits before sending message, treat as failure
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: "WORKER_EXITED" });
    });
  });
}

// ---------------- MAIN ----------------
app.post("/api/sandblast-gpt", async (req, res) => {
  const text = safeStr(req.body?.message);
  const { key, sess } = resolveSession(req);

  // Empty input: stable prompt, no advance
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

  // MUSIC LOCK (as requested in your current phase)
  // Keep lane stable unless you intentionally change it later.
  sess.currentLane = "music_history";

  // Run KB work in worker with hard timeout
  const kbResult = await runKbInWorkerWithTimeout(
    { text, laneDetail: sess.laneDetail },
    KB_TIMEOUT_MS
  );

  if (!kbResult.ok) {
    touch(sess);

    if (kbResult.timedOut) {
      // Fast fail: never stall widget
      return send(
        res,
        key,
        sess,
        "kb_timeout",
        "I’m running a little hot right now. Try: Artist + Year (example: “Styx 1979”) and I’ll lock it in.",
        false
      );
    }

    // Other worker errors
    return sendStableError(
      res,
      key,
      sess,
      "kb_worker_error",
      "Backend hiccup (KB). Try again in a moment."
    );
  }

  const msg = kbResult.msg || {};
  const out = msg.out || {};

  // Merge safe slot updates from worker
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
    `I didn’t find that exact match yet. Try:\nArtist - Title (optional year)`,
    false
  );
});

// ---------------- HEALTH ----------------
app.get("/api/health", (_, res) =>
  res.json({ ok: true, build: BUILD_TAG, serverTime: nowIso(), kbTimeoutMs: KB_TIMEOUT_MS })
);

// ---------------- DEBUG (SAFE) ----------------
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

// ---------------- GLOBAL ERROR SHIELD ----------------
app.use((err, req, res, _next) => {
  const clientSid = safeStr(req.body?.meta?.sessionId);
  const key = clientSid || null;
  const sess = key ? SESS.get(key) : { currentLane: "music_history", laneDetail: { chart: DEFAULT_CHART } };

  console.error("[Nyx][ERR]", err && err.stack ? err.stack : err);

  return sendStableError(
    res,
    key,
    sess,
    "server_error",
    "Backend hiccup (HTTP 500). Try again in a moment."
  );
});

// ---------------- START ----------------
app.listen(PORT, () =>
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`)
);
