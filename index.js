// ----------------------------------------------------------
// Sandblast Nyx Backend — Music Foundation Stabilized (+ 429 fallback)
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality"); // kept (even if not used in this minimal build)

// BUILD TAG
const BUILD_TAG = "nyx-music-foundation-stable-2025-12-14d";

// ---------------------------------------------------------
// OPTIONAL MODULES (safe-degrade)
// ---------------------------------------------------------
function optionalRequire(path, fallback) {
  try {
    return require(path);
  } catch {
    return fallback;
  }
}

const { searchIndex } = optionalRequire("./Utils/ragStore", { searchIndex: () => [] });

const {
  getSession,
  upsertSession,
  appendTurn
} = optionalRequire("./Utils/sessionStore", {
  getSession: () => ({ summary: "", openLoops: [], turns: [] }),
  upsertSession: () => {},
  appendTurn: () => {}
});

// ---------------------------------------------------------
// APP
// ---------------------------------------------------------
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ---------------------------------------------------------
// HELPERS — MUSIC FOUNDATION
// ---------------------------------------------------------
function isYearOnlyMessage(text) {
  return /^\s*(19\d{2}|20\d{2})\s*$/.test(text || "");
}

function looksLikeChartName(text) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("uk") ||
    t.includes("top 40") ||
    t.includes("canada") ||
    t.includes("rpm")
  );
}

function setAwaiting(detail, value) {
  return { ...(detail || {}), awaiting: value };
}

function clearAwaiting(detail) {
  const d = { ...(detail || {}) };
  delete d.awaiting;
  return d;
}

// Local fallback for music history (when OpenAI is down / quota exceeded)
function localMusicFallback(message, laneDetail) {
  const year = laneDetail?.year;
  const chart = laneDetail?.chart || "Billboard Hot 100";
  const t = (message || "").toLowerCase();

  // If user is clearly asking for Madonna and provided a year
  if (t.includes("madonna") && year === "1984") {
    return `In 1984, Madonna earned her first ${chart} #1 with “Like a Virgin.” Cultural note: it was a defining MTV-era breakout moment. Next step: want the exact #1 week (chart date) or her full list of #1s?`;
  }

  // Generic but useful fallback (broadcast-style)
  if (year) {
    return `For ${year}, I can anchor a chart moment on the ${chart}. Give me the artist + song (or say “#1 of the week”) and I’ll pin it down to a specific chart week. Next step: which artist/song are we tracking?`;
  }

  // If no year yet, the clarifier logic elsewhere should handle the first ask.
  return `Tell me the year (or a specific week/date) and I’ll anchor the ${chart} chart moment with one chart fact, one cultural note, and one next action.`;
}

// ---------------------------------------------------------
// META NORMALIZATION
// ---------------------------------------------------------
function cleanMeta(incoming) {
  const m = incoming || {};
  return {
    sessionId: m.sessionId || "public",
    stepIndex: Number(m.stepIndex || 0),
    lastDomain: m.lastDomain || "general",
    lastIntent: m.lastIntent || "statement",
    currentLane: m.currentLane || "general",
    laneDetail: m.laneDetail || {},
    laneAge: Number(m.laneAge || 0),
    access: "public"
  };
}

// ---------------------------------------------------------
// DOMAIN RESOLUTION
// ---------------------------------------------------------
function resolveLaneDomain(raw, meta) {
  if (raw.domain === "music_history" || raw.intent === "music_history") {
    return "music_history";
  }
  return raw.domain || meta.currentLane || "general";
}

// ---------------------------------------------------------
// MAIN ENDPOINT
// ---------------------------------------------------------
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, history } = req.body || {};
    if (!message) return res.status(400).json({ error: "EMPTY_MESSAGE" });

    const clean = message.trim();
    let meta = cleanMeta(incomingMeta);
    const session = getSession(meta.sessionId);

    const raw = classifyIntent(clean);
    const domain = resolveLaneDomain(raw, meta);

    // ------------------------------
    // MUSIC HISTORY DETAIL HANDLING
    // ------------------------------
    let laneDetail = { ...(meta.laneDetail || {}) };

    if (domain === "music_history") {
      // Capture year-only replies
      if (isYearOnlyMessage(clean)) {
        laneDetail.year = clean.trim();
        laneDetail = clearAwaiting(laneDetail);
      }

      // Capture chart names
      if (looksLikeChartName(clean)) {
        laneDetail.chart = clean.trim();
        laneDetail = clearAwaiting(laneDetail);
      }

      // If we still lack year AND haven't asked yet, ask once
      if (!laneDetail.year && laneDetail.awaiting !== "year_or_date") {
        laneDetail = setAwaiting(laneDetail, "year_or_date");

        return res.json({
          ok: true,
          reply:
            "Quick check — what year (or week/date) are we talking, and should I default to the Billboard Hot 100?",
          domain,
          intent: "music_history",
          meta: {
            ...meta,
            currentLane: "music_history",
            laneDetail,
            laneAge: meta.laneAge + 1
          }
        });
      }

      // If we already asked, DO NOT LOOP — proceed with defaults
      if (!laneDetail.year && laneDetail.awaiting === "year_or_date") {
        laneDetail = clearAwaiting(laneDetail);
        laneDetail.chart = laneDetail.chart || "Billboard Hot 100";
      }
    }

    // -------------------------------------------------
    // BRAIN RESPONSE
    // -------------------------------------------------
    let reply = "";
    let openaiUnavailableReason = "";

    if (openai) {
      try {
        const response = await openai.responses.create({
          model: "gpt-5.2",
          input: [
            {
              role: "system",
              content:
                domain === "music_history"
                  ? "You are Nyx, a broadcast music historian. Provide exactly: one chart fact, one cultural note, one next action. If missing required info, ask one precise clarifying question."
                  : "You are Nyx, Sandblast’s AI brain."
            },
            ...(Array.isArray(history) ? history : []),
            { role: "user", content: clean }
          ]
        });

        reply = response.output_text?.trim() || "";
      } catch (e) {
        // Handle OpenAI quota/rate limit cleanly
        const msg = String(e?.message || "");
        const status = e?.status || e?.response?.status;

        if (status === 429 || msg.includes("429")) {
          openaiUnavailableReason = "OPENAI_429_QUOTA";
        } else {
          openaiUnavailableReason = "OPENAI_ERROR";
        }
      }
    } else {
      openaiUnavailableReason = "OPENAI_NOT_CONFIGURED";
    }

    // -------------------------------------------------
    // FALLBACKS (keep Nyx useful even if OpenAI is down)
    // -------------------------------------------------
    if (!reply) {
      if (domain === "music_history") {
        reply = localMusicFallback(clean, laneDetail);
        if (openaiUnavailableReason === "OPENAI_429_QUOTA") {
          reply =
            `I’m temporarily rate-limited on the AI brain, so I’m running in fallback mode.\n\n` +
            reply;
        }
      } else {
        reply =
          openaiUnavailableReason === "OPENAI_429_QUOTA"
            ? "Nyx is temporarily rate-limited on the AI brain. Try again shortly, or tell me your next action and I’ll guide you in fallback mode."
            : "Tell me how you’d like to proceed.";
      }
    }

    // -------------------------------------------------
    // FINAL META
    // -------------------------------------------------
    const updatedMeta = {
      ...meta,
      stepIndex: meta.stepIndex + 1,
      lastDomain: domain,
      lastIntent: raw.intent,
      currentLane: domain,
      laneDetail,
      laneAge: meta.laneAge + 1
    };

    appendTurn(meta.sessionId, { role: "user", content: clean });
    appendTurn(meta.sessionId, { role: "assistant", content: reply });
    upsertSession(meta.sessionId, session);

    res.json({
      ok: true,
      reply,
      domain,
      intent: raw.intent,
      meta: updatedMeta
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------
app.get("/health", (_, res) =>
  res.json({ status: "ok", build: BUILD_TAG })
);

app.listen(PORT, () => {
  console.log(`[Nyx] Music foundation stable on port ${PORT} | build=${BUILD_TAG}`);
});
