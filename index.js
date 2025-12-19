// === SNIPPED HEADER FOR BREVITY — BUILD TAG UPDATED ===
/**
 * index.js — Nyx Broadcast Backend (Bulletproof LOCKED)
 * Build: nyx-bulletproof-v1.61-2025-12-18
 */

"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));

app.use(cors({ origin: true }));
app.options("*", cors());

const musicKB = require("./Utils/musicKnowledge");

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-bulletproof-v1.61-2025-12-18";
const DEFAULT_CHART = "Billboard Hot 100";

// ---------------- SESSION ----------------
const SESS = new Map();

function sid() {
  try { return crypto.randomUUID(); }
  catch { return "sid_" + Date.now(); }
}

// ---------------- SEND (FIXED) ----------------
function send(res, sid, sess, step, reply, advance = false) {
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
      sessionId: sid,
      build: BUILD_TAG,
      serverTime: new Date().toISOString()
    }
  });
}

// ---------------- MAIN ----------------
app.post("/api/sandblast-gpt", (req, res) => {
  const text = String(req.body?.message || "").trim();
  let sess = SESS.get(req.body?.meta?.sessionId);

  if (!sess) {
    sess = {
      id: sid(),
      greeted: false,
      currentLane: "music_history",
      laneDetail: { chart: DEFAULT_CHART }
    };
    SESS.set(sess.id, sess);
  }

  // ---- GREETING (guaranteed once) ----
  if (!sess.greeted) {
    sess.greeted = true;
    return send(
      res,
      sess.id,
      sess,
      "greet",
      "Hi — I’m Nyx. You can ask me about music history right away. Try an artist, song, or year.",
      false
    );
  }

  // ---- MUSIC ONLY (hard lock) ----
  const year = musicKB.extractYear?.(text);
  if (year) sess.laneDetail.year = year;

  if (!sess.laneDetail.artist) {
    sess.laneDetail.artist =
      musicKB.detectArtist?.(text) || text;
  }

  const best = musicKB.pickBestMoment(null, sess.laneDetail);

  if (best) {
    return send(
      res,
      sess.id,
      sess,
      "music_answer",
      `${best.artist} — "${best.title}" (${best.year})\nChart: ${best.chart || DEFAULT_CHART}`,
      true
    );
  }

  // ---- SLOT PROMPT (NO ADVANCE) ----
  if (!sess.laneDetail.year) {
    return send(
      res,
      sess.id,
      sess,
      "music_need_year",
      `I have ${sess.laneDetail.artist}. What year should I check?`,
      false
    );
  }

  return send(
    res,
    sess.id,
    sess,
    "music_not_found",
    `I didn’t find that exact match yet. Try:\nArtist - Title (optional year)`,
    false
  );
});

// ----------------
app.get("/api/health", (_, res) =>
  res.json({ ok: true, build: BUILD_TAG })
);

app.listen(PORT, () =>
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG})`)
);
