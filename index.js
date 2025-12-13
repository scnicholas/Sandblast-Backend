// ----------------------------------------------------------
// Sandblast Nyx Backend — Music Foundation Stabilized
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality");

// BUILD TAG
const BUILD_TAG = "nyx-music-foundation-stable-2025-12-14";

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

    if (openai) {
      const response = await openai.responses.create({
        model: "gpt-5.2",
        input: [
          {
            role: "system",
            content:
              domain === "music_history"
                ? "You are Nyx, a broadcast music historian. One chart fact, one cultural note, one next action."
                : "You are Nyx, Sandblast’s AI brain."
          },
          ...(history || []),
          { role: "user", content: clean }
        ]
      });

      reply = response.output_text?.trim();
    }

    if (!reply) {
      reply =
        domain === "music_history"
          ? `Chart records indicate that in ${laneDetail.year}, Madonna reached #1 on the Billboard Hot 100. Want the exact week or the full Top 10 from that chart run?`
          : "Tell me how you’d like to proceed.";
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
  console.log(`[Nyx] Music foundation stable on port ${PORT}`);
});
