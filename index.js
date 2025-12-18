// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.31
// Recent Updates: label sanitization + title/year mismatch nudge
// Base: v1.30-final
// ----------------------------------------------------------

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { classifyIntent } = require("./Utils/intentClassifier"); // retained for future lanes
const musicKB = require("./Utils/musicKnowledge");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-broadcast-ready-v1.31-2025-12-17";
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
const norm = s =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractYear = t => {
  const m = String(t || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
};

const hasNumberOneIntent = t => /#1|number one|no\.?\s?1/.test(norm(t));

function sessionKey(req, meta) {
  return meta?.sessionId || `fallback:${req.ip}|${req.headers["user-agent"]}`;
}

// Strips duplicated or prefixed labels coming from DB content
function stripLeadingLabel(text, label) {
  const s = String(text || "").trim();
  if (!s) return "";
  const r = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:?\\s*", "i");
  return s.replace(r, "").trim();
}

function sanitizeCulture(culture) {
  // Remove any “cultural thread:” / “culture:” prefixes if present
  let s = String(culture || "").trim();
  s = stripLeadingLabel(s, "cultural thread");
  s = stripLeadingLabel(s, "culture");
  return s.trim();
}

function sanitizeFact(fact) {
  // Remove any “chart fact:” / “chart anchor:” prefixes if present
  let s = String(fact || "").trim();
  s = stripLeadingLabel(s, "chart fact");
  s = stripLeadingLabel(s, "chart anchor");
  s = stripLeadingLabel(s, "fact");
  return s.trim();
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
  // MUSIC HISTORY (Loop-proof)
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
    // Attempt full anchor (artist + title + year)
    // ------------------------------------------------------
    const bestFull = musicKB.pickBestMoment(MUSIC_DB, {
      artist: laneDetail.artist,
      title: laneDetail.title,
      year: laneDetail.year
    });

    if (bestFull) {
      meta._lastStepName = "moment_anchored";
      meta.updatedAt = now();
      SESS.set(skey, meta);

      const fact = sanitizeFact(bestFull.fact);
      const culture = sanitizeCulture(bestFull.culture);
      const next = String(bestFull.next || "Want more detail?").trim();

      return res.json({
        ok: true,
        reply:
          `Chart fact: ${fact || "Anchor found."}\n` +
          `Cultural thread: ${culture || "This was a defining radio-era moment."}\n` +
          `Next step: ${next}`,
        state: {
          step: meta._lastStepName,
          advance: true,
          slots: laneDetail
        },
        meta
      });
    }

    // ------------------------------------------------------
    // NEW: Title/year mismatch nudge
    // If user provides a title but it doesn't match the locked year in your dataset,
    // don’t stall—offer actionable choices.
    // ------------------------------------------------------
    if (laneDetail.artist && laneDetail.year && laneDetail.title && !bestFull) {
      // Avoid repeating this exact nudge endlessly
      if (step !== "title_year_mismatch") {
        meta._lastStepName = "title_year_mismatch";
        meta.updatedAt = now();
        SESS.set(skey, meta);

        return res.json({
          ok: true,
          reply:
            `I have ${laneDetail.artist} + ${laneDetail.year} locked, and I also captured “${laneDetail.title}”.\n` +
            `In this dataset, that title doesn’t match the ${laneDetail.year} anchor.\n\n` +
            `Next step (pick one):\n` +
            `1) Keep ${laneDetail.year} and give me the correct title for that year\n` +
            `2) Keep “${laneDetail.title}” and give me the correct year\n` +
            `3) Say “clear title” to reset the title slot`,
          state: { step: meta._lastStepName, advance: true, slots: laneDetail },
          meta
        });
      }
      // If they keep sending same mismatch, we fall through to other logic safely.
    }

    // ------------------------------------------------------
    // 🔒 ABSOLUTE LOOP BREAKER (unchanged, but copy polished + sanitized)
    // If artist+year are locked and title is missing AND we already asked once,
    // do NOT ask again. Advance with forced anchor.
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

      const factRaw = best?.fact || `${laneDetail.artist} in ${laneDetail.year}`;
      const cultureRaw = best?.culture || "This era marked a major radio moment.";

      const fact = sanitizeFact(factRaw);
      const culture = sanitizeCulture(cultureRaw);

      const reply =
        `Chart anchor: ${fact} (${laneDetail.chart})\n` +
        `Cultural thread: ${culture}\n` +
        `Next step: ask for the #1 week, biggest hit, or give the song title.`;

      meta._lastStepName = "forced_anchor_without_title";
      meta.updatedAt = now();
      SESS.set(skey, meta);

      return res.json({
        ok: true,
        reply,
        state: { step: meta._lastStepName, advance: true, slots: laneDetail },
        meta
      });
    }

    // ------------------------------------------------------
    // First request for title (copy tightened slightly)
    // ------------------------------------------------------
    if (laneDetail.artist && laneDetail.year && !laneDetail.title) {
      meta._lastStepName = "awaiting_title_or_intent";
      meta.updatedAt = now();
      SESS.set(skey, meta);

      return res.json({
        ok: true,
        reply:
          `Locked: ${laneDetail.artist} (${laneDetail.year}). ` +
          `Next step: give me the song title (or ask “Was it #1?”).`,
        state: { step: meta._lastStepName, advance: true, slots: laneDetail },
        meta
      });
    }

    // ------------------------------------------------------
    // Fallback
    // ------------------------------------------------------
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
