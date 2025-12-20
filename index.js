// === NYX BROADCAST BACKEND (BULLETPROOF LOCKED) ===
/**
 * index.js — Nyx Broadcast Backend (Bulletproof LOCKED)
 * Build: nyx-bulletproof-v1.62-2025-12-19
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
const BUILD_TAG = "nyx-bulletproof-v1.62-2025-12-19";
const DEFAULT_CHART = "Billboard Hot 100";

// CORS: keep permissive (as you had), but allow preflight + JSON cleanly
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));
app.options("*", cors());

// ---------------- KB ----------------
const musicKB = require("./Utils/musicKnowledge");

// ---------------- SESSION ----------------
// In-memory session store (Render dyno memory). Add TTL cleanup to prevent growth.
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

// ---------------- SESSION RESOLUTION (FIXED) ----------------
// Key fix: store and retrieve sessions by the SAME sessionId (client or server).
function resolveSession(req) {
  const clientSid = String(req.body?.meta?.sessionId || "").trim();
  const key = clientSid || sid();

  let sess = SESS.get(key);
  if (!sess) {
    sess = {
      id: key, // IMPORTANT: id == key
      greeted: false,
      currentLane: "music_history",
      laneDetail: { chart: DEFAULT_CHART },
      lastSeen: Date.now()
    };
    SESS.set(key, sess);
  } else {
    touch(sess);
  }

  // Normalize laneDetail always
  sess.laneDetail = sess.laneDetail && typeof sess.laneDetail === "object" ? sess.laneDetail : {};
  sess.laneDetail.chart = sess.laneDetail.chart || DEFAULT_CHART;

  // Normalize lane
  sess.currentLane = sess.currentLane || "music_history";

  return { key, sess };
}

// ---------------- MAIN ----------------
app.post("/api/sandblast-gpt", (req, res) => {
  const text = String(req.body?.message || "").trim();
  const { key, sess } = resolveSession(req);

  // ---- GREETING (guaranteed once per session) ----
  if (!sess.greeted) {
    sess.greeted = true;
    touch(sess);
    return send(
      res,
      key,
      sess,
      "greet",
      "Hi — I’m Nyx. You can ask me about music history right away. Try an artist, song, or year.",
      false
    );
  }

  // If empty input after greeting, prompt without advancing
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
  const year = musicKB.extractYear?.(text);
  if (year) sess.laneDetail.year = year;

  // Prefer explicit artist detection; fallback to raw text only if nothing else
  const detectedArtist = musicKB.detectArtist?.(text);
  if (!sess.laneDetail.artist && detectedArtist) {
    sess.laneDetail.artist = detectedArtist;
  } else if (!sess.laneDetail.artist && !year) {
    // If user typed something and we didn't extract a year,
    // treat it as artist/title seed, but do not overwrite later.
    sess.laneDetail.artist = text;
  }

  // Optional: if your KB has extractTitle, store it (safe no-op if missing)
  const detectedTitle = musicKB.extractTitle?.(text);
  if (detectedTitle && !sess.laneDetail.title) sess.laneDetail.title = detectedTitle;

  // Pick best moment using your KB
  const best = musicKB.pickBestMoment?.(null, sess.laneDetail);

  if (best) {
    touch(sess);

    // If KB returns richer fields, include them (keeps cohesion with your enriched moments)
    const culture = best.culture ? `\n\n${best.culture}` : "";
    const fact = best.fact ? `\nFact: ${best.fact}` : "";
    const next = best.next ? `\nNext: ${best.next}` : "";

    return send(
      res,
      key,
      sess,
      "music_answer",
      `${best.artist} — "${best.title}" (${best.year})\nChart: ${best.chart || DEFAULT_CHART}${fact}${culture}${next}`,
      true
    );
  }

  // ---- SLOT PROMPT (NO ADVANCE) ----
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
  const id = String(req.params.id || "").trim();
  const sess = SESS.get(id);
  if (!sess) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

  res.json({
    ok: true,
    meta: { sessionId: id, build: BUILD_TAG, serverTime: nowIso() },
    state: {
      mode: sess.currentLane,
      greeted: !!sess.greeted,
      lastSeen: sess.lastSeen,
      slots: sess.laneDetail || {}
    }
  });
});

// ---------------- START ----------------
app.listen(PORT, () =>
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG})`)
);
