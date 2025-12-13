// ----------------------------------------------------------
// Sandblast Nyx Backend — Music Foundation Stabilized
// + 429 fallback
// + Music Knowledge Layer v1 (INLINE, offline-first, no extra files)
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality"); // kept

// BUILD TAG
const BUILD_TAG = "nyx-music-foundation-stable-2025-12-14f";

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
    t.includes("rpm") ||
    t.includes("official charts")
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
// MUSIC KNOWLEDGE LAYER v1 (INLINE)
// Offline-first: answers common moments without OpenAI.
// Broadcast spec: one chart fact, one cultural note, one next action.
// ---------------------------------------------------------
const MUSIC_KNOWLEDGE_V1 = {
  defaultChart: "Billboard Hot 100",
  moments: [
    {
      key: "madonna_like_a_virgin_1984",
      artist: "madonna",
      title: "like a virgin",
      year: 1984,
      chart: "Billboard Hot 100",
      fact: "In late 1984, Madonna hit #1 with “Like a Virgin.”",
      culture: "It became a defining MTV-era breakthrough moment and reset the rules for pop stardom.",
      next: "Want the exact chart week/date, or Madonna’s full #1 timeline?"
    },
    {
      key: "mj_billie_jean_1983",
      artist: "michael jackson",
      title: "billie jean",
      year: 1983,
      chart: "Billboard Hot 100",
      fact: "In 1983, “Billie Jean” reached #1 and helped cement Michael Jackson’s peak-era dominance.",
      culture: "Music became visual-first at scale; MTV-era exposure amplified hits into cultural events.",
      next: "Do you want the exact #1 chart date or the wider Thriller run context?"
    },
    {
      key: "whitney_iwalu_1992",
      artist: "whitney houston",
      title: "i will always love you",
      year: 1992,
      chart: "Billboard Hot 100",
      fact: "In 1992, Whitney Houston’s “I Will Always Love You” became a signature #1-era moment.",
      culture: "Soundtracks turned into chart engines—film, radio, and retail moved in lockstep.",
      next: "Want the chart date it hit #1, or other defining #1s from that year?"
    },
    {
      key: "beatles_iwtthy_1964",
      artist: "the beatles",
      title: "i want to hold your hand",
      year: 1964,
      chart: "Billboard Hot 100",
      fact: "In 1964, The Beatles’ Hot 100 surge marked the mainstream explosion of Beatlemania.",
      culture: "Youth culture became a mass-market force—pop shifted into a global identity machine.",
      next: "Want the exact chart week, or a quick timeline of their #1 run?"
    }
  ]
};

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function looksMusicHistoryQuery(text) {
  const t = norm(text);
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("top 40") ||
    t.includes("chart") ||
    t.includes("charts") ||
    t.includes("#1") ||
    t.includes("# 1") ||
    t.includes("no 1") ||
    t.includes("no. 1") ||
    t.includes("number 1") ||
    t.includes("number one") ||
    t.includes("weeks at") ||
    t.includes("peak")
  );
}

function findMoment({ text, laneDetail }) {
  const t = norm(text);
  const year = extractYear(text) || (laneDetail && laneDetail.year ? Number(laneDetail.year) : null);

  // artist/title hints (v1 minimal)
  const hasMadonna = t.includes("madonna");
  const hasMJ = t.includes("michael jackson") || t.includes("mj");
  const hasWhitney = t.includes("whitney");
  const hasBeatles = t.includes("beatles");

  const momentTitleHints = {
    "like a virgin": t.includes("like a virgin"),
    "billie jean": t.includes("billie jean"),
    "i will always love you": t.includes("i will always love you"),
    "i want to hold your hand": t.includes("i want to hold your hand")
  };

  // Exact-ish match pass
  for (const m of MUSIC_KNOWLEDGE_V1.moments) {
    const artistOk =
      (hasMadonna && m.artist === "madonna") ||
      (hasMJ && m.artist === "michael jackson") ||
      (hasWhitney && m.artist === "whitney houston") ||
      (hasBeatles && m.artist === "the beatles");

    const titleOk = momentTitleHints[m.title] === true;

    if (titleOk && (!year || Number(m.year) === year)) return m;
    if (artistOk && year && Number(m.year) === year) return m;
    if (titleOk) return m;
  }

  return null;
}

function formatMomentReply(moment, laneDetail) {
  const chart = (laneDetail && laneDetail.chart) || moment.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  // Keep it broadcast-tight
  return `${moment.fact} (${chart})\nCultural note: ${moment.culture}\nNext step: ${moment.next}`;
}

/**
 * Offline-first answerer for music_history.
 * Returns { handled: true, reply, metaPatch } or { handled: false }
 */
function answerMusicHistoryOffline(message, laneDetail) {
  const t = norm(message);

  // If it doesn't look like music history at all, don't intercept.
  if (!looksMusicHistoryQuery(message) && !t.includes("madonna") && !t.includes("beatles") && !t.includes("whitney") && !t.includes("michael jackson") && !t.includes("mj")) {
    return { handled: false };
  }

  const year = extractYear(message) || (laneDetail && laneDetail.year ? Number(laneDetail.year) : null);

  // If user asks "When was Madonna #1" without year/title, ask once (awaiting guard in laneDetail)
  if (t.includes("madonna") && !year && !t.includes("like a virgin")) {
    return {
      handled: true,
      reply:
        "Quick check — which year (or song title) for Madonna’s #1 are you asking about? I can default to Billboard Hot 100.",
      metaPatch: { chart: (laneDetail && laneDetail.chart) || MUSIC_KNOWLEDGE_V1.defaultChart, awaiting: "year_or_date" }
    };
  }

  const moment = findMoment({ text: message, laneDetail });

  if (!moment) {
    return {
      handled: true,
      reply:
        `I can anchor this, but I need one detail: a year OR a song title OR which chart (Billboard Hot 100 / UK Top 40 / Canada RPM).\nNext step: reply with a year (e.g., 1984) or a song title.`,
      metaPatch: { chart: (laneDetail && laneDetail.chart) || MUSIC_KNOWLEDGE_V1.defaultChart }
    };
  }

  return {
    handled: true,
    reply: formatMomentReply(moment, laneDetail),
    metaPatch: { chart: moment.chart || MUSIC_KNOWLEDGE_V1.defaultChart }
  };
}

// ---------------------------------------------------------
// Local fallback for music history (when OpenAI is down / quota exceeded)
// ---------------------------------------------------------
function localMusicFallback(message, laneDetail) {
  const year = laneDetail?.year;
  const chart = laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  const t = (message || "").toLowerCase();

  if (t.includes("madonna") && year === "1984") {
    return `In 1984, Madonna earned her first ${chart} #1 with “Like a Virgin.” Cultural note: it was a defining MTV-era breakout moment. Next step: want the exact #1 week (chart date) or her full list of #1s?`;
  }

  if (year) {
    return `For ${year}, I can anchor a chart moment on the ${chart}. Give me the artist + song (or say “#1 of the week”) and I’ll pin it down to a specific chart week. Next step: which artist/song are we tracking?`;
  }

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

      // ✅ OFFLINE-FIRST: Knowledge Layer v1
      const kb = answerMusicHistoryOffline(clean, laneDetail);
      if (kb && kb.handled) {
        if (kb.metaPatch && typeof kb.metaPatch === "object") {
          laneDetail = { ...(laneDetail || {}), ...kb.metaPatch };
        }

        // If we answered, we should not keep awaiting active
        if (laneDetail.awaiting && (laneDetail.year || laneDetail.chart)) {
          laneDetail = clearAwaiting(laneDetail);
        }

        const updatedMeta = {
          ...meta,
          stepIndex: meta.stepIndex + 1,
          lastDomain: "music_history",
          lastIntent: raw.intent,
          currentLane: "music_history",
          laneDetail,
          laneAge: meta.laneAge + 1
        };

        appendTurn(meta.sessionId, { role: "user", content: clean });
        appendTurn(meta.sessionId, { role: "assistant", content: kb.reply });
        upsertSession(meta.sessionId, session);

        return res.json({
          ok: true,
          reply: kb.reply,
          domain: "music_history",
          intent: raw.intent,
          meta: updatedMeta
        });
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
        laneDetail.chart = laneDetail.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
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
            `I’m temporarily rate-limited on the AI brain, so I’m running in offline music mode.\n\n` +
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
