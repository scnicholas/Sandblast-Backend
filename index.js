/**
 * index.js — Nyx Broadcast Backend (Bulletproof LOCKED)
 * Build: nyx-bulletproof-v1.63-2025-12-20
 *
 * Key updates:
 * - NO greeting (Nyx responds only to user messages)
 * - Session cohesion: store/retrieve by SAME sessionId
 * - TTL cleanup to prevent memory growth
 * - Hard 500-shield: try/catch around KB calls + safe fallbacks
 * - Consistent response shape for widget cohesion
 */

"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", true);

// ---------------- CONFIG ----------------
const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-bulletproof-v1.63-2025-12-20";
const DEFAULT_CHART = "Billboard Hot 100";

// CORS + JSON
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));
app.options("*", cors());

// ---------------- KB ----------------
const musicKB = require("./Utils/musicKnowledge");

// ---------------- SESSION ----------------
// In-memory session store (Render dyno memory).
// Add TTL cleanup to prevent growth.
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

function touch(sess) {
  sess.lastSeen = Date.now();
}

function safeStr(x) {
  return String(x == null ? "" : x).trim();
}

function safeObj(x) {
  return x && typeof x === "object" ? x : {};
}

// Periodic cleanup: prevents unbounded memory growth
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

function sendErr(res, sessionId, sess, step, reply, httpCode = 200) {
  // Keep widget stable: still return {ok:true,...} unless truly necessary.
  // If you want strict error codes, set httpCode=500 etc.
  res.status(httpCode).json({
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

// ---------------- SESSION RESOLUTION (FIXED) ----------------
// Store and retrieve sessions by the SAME sessionId (client or server).
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

  // Normalize laneDetail always
  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;

  // Normalize lane
  sess.currentLane = safeStr(sess.currentLane) || "music_history";

  return { key, sess };
}

// ---------------- SAFE KB WRAPPERS ----------------
function kbExtractYear(text) {
  try {
    return musicKB.extractYear?.(text) || null;
  } catch {
    return null;
  }
}

function kbDetectArtist(text) {
  try {
    return musicKB.detectArtist?.(text) || null;
  } catch {
    return null;
  }
}

function kbExtractTitle(text) {
  try {
    return musicKB.extractTitle?.(text) || null;
  } catch {
    return null;
  }
}

function kbPickBestMoment(context, laneDetail) {
  try {
    return musicKB.pickBestMoment?.(context, laneDetail) || null;
  } catch {
    return null;
  }
}

// ---------------- MAIN ----------------
app.post("/api/sandblast-gpt", (req, res) => {
  const text = safeStr(req.body?.message);
  const { key, sess } = resolveSession(req);

  // If empty input, prompt without advancing
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

  // ---- MUSIC ONLY (hard lock) ----
  // Update slots from text
  const year = kbExtractYear(text);
  if (year) sess.laneDetail.year = year;

  // Prefer explicit artist detection
  const detectedArtist = kbDetectArtist(text);

  // Only set artist if empty — do not overwrite
  if (!sess.laneDetail.artist && detectedArtist) {
    sess.laneDetail.artist = detectedArtist;
  } else if (!sess.laneDetail.artist && !year) {
    // If user typed something and we didn't extract a year,
    // treat it as an artist/title seed without overwriting later.
    sess.laneDetail.artist = text;
  }

  // Optional title extraction (safe no-op if missing)
  const detectedTitle = kbExtractTitle(text);
  if (detectedTitle && !sess.laneDetail.title) sess.laneDetail.title = detectedTitle;

  // Pick best moment (shielded)
  const best = kbPickBestMoment(null, sess.laneDetail);

  if (best) {
    touch(sess);

    // Include richer fields if present
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

  // If KB failed silently or no match, keep slot-filling prompts stable
  if (!sess.laneDetail.year) {
    touch(sess);
    return send(
      res,
      key,
      sess,
      "music_need_year",
      `I have ${sess.laneDetail.artist || "that artist/title"}. What year should I check?`,
      false
    );
  }

  // If we have year but no match, suggest format
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
  res.json({ ok: true, build: BUILD_TAG, serverTime: nowIso() })
);

// ---------------- DEBUG (SAFE) ----------------
// Useful for confirming session cohesion during widget testing.
// Does not expose user content beyond slots.
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
// Prevent Express from sending raw 500 HTML that confuses the widget.
app.use((err, req, res, _next) => {
  const clientSid = safeStr(req.body?.meta?.sessionId);
  const key = clientSid || null;
  const sess = key ? SESS.get(key) : null;

  console.error("[Nyx][ERR]", err && err.stack ? err.stack : err);

  // Keep response shape stable for the widget
  return sendErr(
    res,
    key,
    sess || { currentLane: "music_history", laneDetail: { chart: DEFAULT_CHART } },
    "server_error",
    "Backend hiccup (HTTP 500). Try again in a moment.",
    200
  );
});

// ---------------- START ----------------
app.listen(PORT, () =>
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG})`)
);
