// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.32
// Fixes: "mismatch loop" by adding executable resolution paths
// - command handlers: clear title/year, keep year, use title year, switch year to ####
// - title-only lookup proposes likely year for the title
// - prevents repeating title_year_mismatch endlessly
// ----------------------------------------------------------

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const musicKB = require("./Utils/musicKnowledge");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-broadcast-ready-v1.32-2025-12-17";
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

function sessionKey(req, meta) {
  return meta?.sessionId || `fallback:${req.ip}|${req.headers["user-agent"]}`;
}

// ----------------------------------------------------------
// Music DB
// ----------------------------------------------------------
let MUSIC_DB = { moments: [] };
try { MUSIC_DB = musicKB.loadDb(); } catch (_) { MUSIC_DB = { moments: [] }; }

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

function stripLeadingLabel(text, label) {
  const s = String(text || "").trim();
  if (!s) return "";
  const r = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:?\\s*", "i");
  return s.replace(r, "").trim();
}
function sanitizeFact(fact) {
  let s = String(fact || "").trim();
  s = stripLeadingLabel(s, "chart fact");
  s = stripLeadingLabel(s, "chart anchor");
  s = stripLeadingLabel(s, "fact");
  return s.trim();
}
function sanitizeCulture(culture) {
  let s = String(culture || "").trim();
  s = stripLeadingLabel(s, "cultural thread");
  s = stripLeadingLabel(s, "culture");
  return s.trim();
}

function pickBest(fields) {
  try {
    return musicKB.pickBestMoment(MUSIC_DB, fields);
  } catch (_) {
    return null;
  }
}

function pickByTitleOnly(title) {
  if (!title) return null;
  return pickBest({ title });
}

function pickByArtistYear(artist, year) {
  if (!artist || !year) return null;
  return pickBest({ artist, year });
}

function parseCommand(text) {
  const t = norm(text);

  // Clear commands
  if (t === "clear title" || t === "reset title") return { cmd: "clear_title" };
  if (t === "clear year" || t === "reset year") return { cmd: "clear_year" };
  if (t === "clear artist" || t === "reset artist") return { cmd: "clear_artist" };

  // Keep year (drop title)
  if (t === "keep year" || t === "keep the year") return { cmd: "keep_year" };

  // Use title's likely year (we’ll compute from DB)
  if (t === "use title year" || t === "use the title year") return { cmd: "use_title_year" };

  // Switch year explicitly
  const m = t.match(/^(switch year to|set year to|use year)\s+(19\d{2}|20\d{2})$/);
  if (m) return { cmd: "set_year", year: Number(m[2]) };

  return { cmd: null };
}

// ----------------------------------------------------------
// Core responder
// ----------------------------------------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const { message, meta: inMeta = {} } = req.body || {};
  const clean = String(message || "").trim();
  const skey = sessionKey(req, inMeta);

  const sess = SESS.get(skey) || {};

  // Merge (session -> incoming)
  const meta = {
    ...sess,
    ...inMeta,
    laneDetail: { ...(sess.laneDetail || {}), ...(inMeta.laneDetail || {}) },
    mem: { ...(sess.mem || {}), ...(inMeta.mem || {}) }
  };

  meta.currentLane ||= "general";
  meta._lastStepName ||= "";
  meta._mismatchCount ||= 0;

  const laneDetail = meta.laneDetail;
  laneDetail.chart ||= MUSIC_DEFAULT_CHART;

  // Force music lane if obvious
  if (meta.currentLane === "general") {
    if (/music|chart|billboard|#1|hot 100/i.test(clean)) meta.currentLane = "music_history";
  }

  // --------------------------------------------------------
  // MUSIC HISTORY
  // --------------------------------------------------------
  if (meta.currentLane === "music_history") {
    // 1) Apply commands
    const cmd = parseCommand(clean);
    if (cmd.cmd === "clear_title") {
      laneDetail.title = null;
      meta._lastStepName = "cleared_title";
      meta._mismatchCount = 0;
    } else if (cmd.cmd === "clear_year") {
      laneDetail.year = null;
      meta.mem.musicYear = null;
      meta._lastStepName = "cleared_year";
      meta._mismatchCount = 0;
    } else if (cmd.cmd === "clear_artist") {
      laneDetail.artist = null;
      meta._lastStepName = "cleared_artist";
      meta._mismatchCount = 0;
    } else if (cmd.cmd === "keep_year") {
      laneDetail.title = null;
      meta._lastStepName = "kept_year_dropped_title";
      meta._mismatchCount = 0;
    } else if (cmd.cmd === "set_year" && cmd.year) {
      laneDetail.year = cmd.year;
      meta.mem.musicYear = cmd.year;
      meta._lastStepName = "set_year_explicit";
      meta._mismatchCount = 0;
    } else if (cmd.cmd === "use_title_year") {
      const byTitle = pickByTitleOnly(laneDetail.title);
      if (byTitle?.year) {
        laneDetail.year = Number(byTitle.year);
        meta.mem.musicYear = laneDetail.year;
        meta._lastStepName = "used_title_year";
        meta._mismatchCount = 0;
      }
    }

    // 2) Lock year if present in message
    const y = extractYear(clean);
    if (y) {
      laneDetail.year = y;
      meta.mem.musicYear = y;
    } else if (!laneDetail.year && meta.mem.musicYear) {
      laneDetail.year = Number(meta.mem.musicYear) || laneDetail.year;
    }

    // 3) Detect artist/title if missing
    if (!laneDetail.artist) laneDetail.artist = musicKB.detectArtist?.(clean) || laneDetail.artist || null;
    if (!laneDetail.title) laneDetail.title = musicKB.detectTitle?.(clean) || laneDetail.title || null;

    // 4) Try full anchor
    const bestFull = pickBest({
      artist: laneDetail.artist,
      title: laneDetail.title,
      year: laneDetail.year
    });

    if (bestFull) {
      meta._lastStepName = "moment_anchored";
      meta._mismatchCount = 0;
      meta.updatedAt = now();
      SESS.set(skey, meta);

      const fact = sanitizeFact(bestFull.fact);
      const culture = sanitizeCulture(bestFull.culture);
      const next = String(bestFull.next || "Want the exact chart week/date, or the full #1 timeline?").trim();

      return res.json({
        ok: true,
        reply:
          `Chart fact: ${fact || "Anchor found."}\n` +
          `Cultural thread: ${culture || "This was a defining radio-era moment."}\n` +
          `Next step: ${next}`,
        state: { step: meta._lastStepName, advance: true, slots: laneDetail },
        meta
      });
    }

    // 5) Title/year mismatch: make it executable and non-repeating
    if (laneDetail.artist && laneDetail.year && laneDetail.title && !bestFull) {
      meta._mismatchCount = Number(meta._mismatchCount || 0) + 1;

      // Find likely year for the provided title (title-only lookup)
      const byTitle = pickByTitleOnly(laneDetail.title);
      const suggestedYear = byTitle?.year ? Number(byTitle.year) : null;

      // If mismatch repeats, STOP repeating the same mismatch prompt
      if (meta._mismatchCount >= 2) {
        // Force progress: anchor by artist+year and offer a decisive switch prompt
        const bestAY = pickByArtistYear(laneDetail.artist, laneDetail.year);

        const fact = sanitizeFact(bestAY?.fact || `Locked: ${laneDetail.artist} (${laneDetail.year}).`);
        const culture = sanitizeCulture(bestAY?.culture || `This was a defining era pocket for ${laneDetail.artist}.`);

        const switchLine = suggestedYear
          ? `If you meant “${laneDetail.title}”, I can switch the year to ${suggestedYear} — say: "switch year to ${suggestedYear}".`
          : `If you meant “${laneDetail.title}”, tell me the correct year (or say "clear title").`;

        meta._lastStepName = "forced_anchor_after_mismatch";
        meta.updatedAt = now();
        SESS.set(skey, meta);

        return res.json({
          ok: true,
          reply:
            `Chart anchor: ${fact} (${laneDetail.chart})\n` +
            `Cultural thread: ${culture}\n` +
            `Next step: ${switchLine} Or keep ${laneDetail.year} and give me the correct title for that year.`,
          state: { step: meta._lastStepName, advance: true, slots: laneDetail },
          meta
        });
      }

      // First mismatch: present choices with a suggested year (if we have one)
      meta._lastStepName = "title_year_mismatch";
      meta.updatedAt = now();
      SESS.set(skey, meta);

      return res.json({
        ok: true,
        reply:
          `I have ${laneDetail.artist} + ${laneDetail.year} locked, and I captured “${laneDetail.title}”.\n` +
          `In this dataset, that title doesn’t match the ${laneDetail.year} anchor.\n\n` +
          `Next step (pick one):\n` +
          `1) Keep ${laneDetail.year} → give me the correct title for that year\n` +
          (suggestedYear ? `2) Use title’s likely year (${suggestedYear}) → say "switch year to ${suggestedYear}"\n` : "") +
          `3) Say "clear title" to reset the title slot`,
        state: { step: meta._lastStepName, advance: true, slots: laneDetail },
        meta
      });
    }

    // 6) Absolute loop-breaker for missing title (unchanged)
    if (laneDetail.artist && laneDetail.year && !laneDetail.title && meta._lastStepName === "awaiting_title_or_intent") {
      const bestAY = pickByArtistYear(laneDetail.artist, laneDetail.year);

      const fact = sanitizeFact(bestAY?.fact || `${laneDetail.artist} in ${laneDetail.year}`);
      const culture = sanitizeCulture(bestAY?.culture || "This era marked a major radio moment.");

      meta._lastStepName = "forced_anchor_without_title";
      meta._mismatchCount = 0;
      meta.updatedAt = now();
      SESS.set(skey, meta);

      return res.json({
        ok: true,
        reply:
          `Chart anchor: ${fact} (${laneDetail.chart})\n` +
          `Cultural thread: ${culture}\n` +
          `Next step: ask for the #1 week, biggest hit, or give the song title.`,
        state: { step: meta._lastStepName, advance: true, slots: laneDetail },
        meta
      });
    }

    // 7) First request for title if artist+year known
    if (laneDetail.artist && laneDetail.year && !laneDetail.title) {
      meta._lastStepName = "awaiting_title_or_intent";
      meta._mismatchCount = 0;
      meta.updatedAt = now();
      SESS.set(skey, meta);

      return res.json({
        ok: true,
        reply:
          `Locked: ${laneDetail.artist} (${laneDetail.year}). Next step: give me the song title (or ask “Was it #1?”).`,
        state: { step: meta._lastStepName, advance: true, slots: laneDetail },
        meta
      });
    }

    // 8) General music fallback
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

  return res.json({
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
