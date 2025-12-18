// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.30 (FINAL)
// Loop-Proof, State-Locked, Forward-Only
// ----------------------------------------------------------

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { classifyIntent } = require("./Utils/intentClassifier");
const musicKB = require("./Utils/musicKnowledge");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-broadcast-ready-v1.30-final";
const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

// ----------------------------------------------------------
// Health
// ----------------------------------------------------------
app.get("/health", (_, res) => res.json({ ok: true, build: BUILD_TAG }));
app.get("/api/health", (_, res) => res.json({ ok: true, build: BUILD_TAG }));

// ----------------------------------------------------------
// Session memory
// ----------------------------------------------------------
const SESS = new Map();
const TTL = 6 * 60 * 60 * 1000;

function now() { return Date.now(); }
setInterval(() => {
  const cutoff = now() - TTL;
  for (const [k, v] of SESS.entries()) {
    if (!v || v.updatedAt < cutoff) SESS.delete(k);
  }
}, 15 * 60 * 1000).unref?.();

// ----------------------------------------------------------
// Music DB
// ----------------------------------------------------------
let MUSIC_DB = { moments: [] };
try { MUSIC_DB = musicKB.loadDb(); } catch (_) {}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------
const norm = s => String(s || "").toLowerCase().replace(/[^\w\s#]/g, " ").replace(/\s+/g, " ").trim();
const extractYear = t => (t.match(/\b(19\d{2}|20\d{2})\b/) || [])[1] ? Number(RegExp.$1) : null;
const hasNumberOneIntent = t => /#1|number one|no\.?\s?1/.test(norm(t));

function sessionKey(req, meta) {
  return meta?.sessionId || `fallback:${req.ip}|${req.headers["user-agent"]}`;
}

// ----------------------------------------------------------
// Core responder
// ----------------------------------------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const { message, meta: inMeta = {} } = req.body;
  const clean = String(message || "").trim();

  const skey = sessionKey(req, inMeta);
  const sess = SESS.get(skey) || {};

  const meta = {
    ...sess,
    ...inMeta,
    laneDetail: { ...(sess.laneDetail || {}), ...(inMeta.laneDetail || {}) },
    mem: { ...(sess.mem || {}), ...(inMeta.mem || {}) }
  };

  let laneDetail = meta.laneDetail;
  let step = meta._lastStepName || "";

  // --------------------------------------------------------
  // Force music lane if obvious
  // --------------------------------------------------------
  if (!meta.currentLane || meta.currentLane === "general") {
    if (/music|chart|billboard|#1|hot 100/i.test(clean)) {
      meta.currentLane = "music_history";
    }
  }

  // --------------------------------------------------------
  // MUSIC HISTORY (FINAL LOGIC)
  // --------------------------------------------------------
  if (meta.currentLane === "music_history") {
    // Lock chart
    laneDetail.chart ||= MUSIC_DEFAULT_CHART;

    // Lock year
    const y = extractYear(clean);
    if (y) {
      laneDetail.year = y;
      meta.mem.musicYear = y;
    }

    // Lock artist / title (only once)
    if (!laneDetail.artist) {
      laneDetail.artist = musicKB.detectArtist?.(clean) || null;
    }
    if (!laneDetail.title) {
      laneDetail.title = musicKB.detectTitle?.(clean) || null;
    }

    // ------------------------------------------------------
    // 🔒 ABSOLUTE LOOP BREAKER
    // ------------------------------------------------------
    if (
      laneDetail.artist &&
      laneDetail.year &&
      !laneDetail.title &&
      step === "awaiting_title_or_intent"
    ) {
      const best = musicKB.pickBestMoment(MUSIC_DB, {
        artist: laneDetail.artist,
        year: laneDetail.year
      });

      const reply =
        `Chart anchor: ${best?.fact || `${laneDetail.artist} in ${laneDetail.year}`} (${laneDetail.chart})\n` +
        `Cultural thread: ${best?.culture || "This era marked a major radio moment."}\n` +
        `Next step: ask for the #1 week, biggest hit, or give the song title.`;

      meta._lastStepName = "forced_anchor_without_title";
      meta.updatedAt = now();

      SESS.set(skey, meta);

      return res.json({
        ok: true,
        reply,
        state: {
          step: meta._lastStepName,
          advance: true,
          slots: laneDetail
        },
        meta
      });
    }

    // ------------------------------------------------------
    // First request for title
    // ------------------------------------------------------
    if (laneDetail.artist && laneDetail.year && !laneDetail.title) {
      meta._lastStepName = "awaiting_title_or_intent";
      meta.updatedAt = now();
      SESS.set(skey, meta);

      return res.json({
        ok: true,
        reply:
          `Locked: ${laneDetail.artist} (${laneDetail.year}). ` +
          `Give me the song title or ask “Was it #1?”`,
        state: {
          step: meta._lastStepName,
          advance: true,
          slots: laneDetail
        },
        meta
      });
    }

    // ------------------------------------------------------
    // Full anchor
    // ------------------------------------------------------
    const best = musicKB.pickBestMoment(MUSIC_DB, {
      artist: laneDetail.artist,
      title: laneDetail.title,
      year: laneDetail.year
    });

    if (best) {
      meta._lastStepName = "moment_anchored";
      meta.updatedAt = now();
      SESS.set(skey, meta);

      return res.json({
        ok: true,
        reply:
          `Chart fact: ${best.fact}\n` +
          `Cultural moment: ${best.culture}\n` +
          `Next step: ${best.next || "Want more detail?"}`,
        state: {
          step: meta._lastStepName,
          advance: true,
          slots: laneDetail
        },
        meta
      });
    }

    // Fallback
    meta._lastStepName = "awaiting_anchor";
    meta.updatedAt = now();
    SESS.set(skey, meta);

    return res.json({
      ok: true,
      reply: "Give me an artist + year or a song title to anchor the chart moment.",
      state: { step: meta._lastStepName, advance: false, slots: laneDetail },
      meta
    });
  }

  // --------------------------------------------------------
  // General fallback
  // --------------------------------------------------------
  meta._lastStepName = "general";
  meta.updatedAt = now();
  SESS.set(skey, meta);

  res.json({
    ok: true,
    reply: "What would you like to explore next?",
    state: { step: "general", advance: false },
    meta
  });
});

// ----------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on ${PORT}`);
});
