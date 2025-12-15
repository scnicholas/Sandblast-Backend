// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.11
// Adds:
// - Farewell/closing detection with rotating sign-offs
// - MATURITY patch v1 (calm, decisive phrasing + greeting discipline)
// - Skips "always advance" enforcement on true farewells
// Keeps:
// - Modes: OFFLINE / ONLINE / AUTO
// - Admin access: safe debug fields
// - Quiet 429 behavior (no scary banners)
// - Music Knowledge Layer v1 (offline-first)
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");

function optionalRequire(path, fallback) {
  try { return require(path); } catch { return fallback; }
}

const { getSession, upsertSession, appendTurn } = optionalRequire("./Utils/sessionStore", {
  getSession: () => ({ summary: "", openLoops: [], turns: [] }),
  upsertSession: () => {},
  appendTurn: () => {}
});

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const BUILD_TAG = "nyx-broadcast-ready-v1.11-2025-12-14";

// Micro-tuned offline fallback (calm, confident, no apology)
const OFFLINE_FALLBACK = "I’m here. What’s the goal?";

// ---------------------------------------------------------
// MODE + ACCESS NORMALIZATION
// ---------------------------------------------------------
function cleanMeta(incoming) {
  const m = incoming || {};
  const modeRaw = String(m.mode || "auto").toLowerCase();
  const accessRaw = String(m.access || "public").toLowerCase();

  const mode = (modeRaw === "offline" || modeRaw === "online") ? modeRaw : "auto";
  const access = (accessRaw === "admin") ? "admin" : "public";

  return {
    sessionId: m.sessionId || "public",
    stepIndex: Number(m.stepIndex || 0),
    lastDomain: m.lastDomain || "general",
    lastIntent: m.lastIntent || "statement",
    currentLane: m.currentLane || "general",
    laneDetail: m.laneDetail || {},
    laneAge: Number(m.laneAge || 0),
    mode,
    access,
    conversationState: m.conversationState || "active" // active | ended
  };
}

function shouldUseOpenAI(meta) {
  if (meta.mode === "offline") return false;
  if (meta.mode === "online") return !!openai;
  return !!openai; // auto
}

// ---------------------------------------------------------
// TEXT / SIGNAL HELPERS
// ---------------------------------------------------------
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashPick(seed, arr) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function isYearOnlyMessage(text) {
  return /^\s*(19\d{2}|20\d{2})\s*$/.test(text || "");
}

function looksMusicHistoryQuery(text) {
  const t = norm(text);
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("top 40") ||
    t.includes("top40weekly") ||
    t.includes("top 40 weekly") ||
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

function looksLikeChartName(text) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("uk") ||
    t.includes("top 40") ||
    t.includes("canada") ||
    t.includes("rpm") ||
    t.includes("official charts") ||
    t.includes("top40weekly") ||
    t.includes("top 40 weekly")
  );
}

function isGreetingOrFiller(text) {
  const t = norm(text);
  if (!t) return true;
  const fillers = new Set([
    "hi", "hello", "hey", "yo",
    "ok", "okay", "k",
    "cool", "nice", "great", "good",
    "sounds good",
    "test", "testing"
  ]);
  return fillers.has(t) || t.length <= 2;
}

// Strict greeting detector (used to keep greetings out of domain logic)
function isPureGreeting(text) {
  const t = norm(text);
  if (!t) return false;
  const starters = ["hi", "hello", "hey", "yo"];
  const full = new Set([
    "hi", "hello", "hey", "yo",
    "hi nyx", "hello nyx", "hey nyx",
    "good morning", "good afternoon", "good evening"
  ]);
  if (full.has(t)) return true;
  return starters.some(s => t === s || t.startsWith(s + " "));
}

// More forgiving greeting detector (catches “hi nyx!”, “hi, Nyx”, etc.)
function isGreetingLike(text) {
  const t = norm(text);
  if (!t) return false;
  // Allow “good morning nyx”, “hey there nyx”, etc.
  if (/^(hi|hello|hey|yo)(\s+(there|ya|nyx))?$/i.test(t)) return true;
  if (/^good\s+(morning|afternoon|evening)(\s+nyx)?$/i.test(t)) return true;
  // If message starts with a greeting and contains “nyx” anywhere, treat as greeting.
  if (/^(hi|hello|hey|yo)\b/i.test(t) && t.includes("nyx")) return true;
  return false;
}

// Farewell / closing detection (this is the new piece)
function detectClosingIntent(text) {
  const t = norm(text);

  const hardFarewells = [
    "bye", "goodbye", "see you", "see ya", "later", "take care",
    "good night", "goodnight", "gn", "talk soon", "catch you later",
    "have a good one", "have a good day", "have a good evening"
  ];

  const gratitude = [
    "thanks", "thank you", "thx", "appreciate it", "much appreciated"
  ];

  const isHard = hardFarewells.some((p) => t === p || t.includes(p));
  const isThanks = gratitude.some((p) => t === p || t.includes(p));

  // If message is ONLY thanks (no new question), treat as “soft close”
  // If message includes bye/goodnight/etc, treat as “hard close”
  if (isHard) return { type: "hard" };
  if (isThanks && !looksMusicHistoryQuery(text) && !t.includes("?")) return { type: "soft" };
  return { type: "none" };
}

function farewellReply(meta, closingType) {
  const hard = [
    "All set. Take care — and come back anytime.",
    "Goodnight. Whenever you’re ready, we’ll pick up cleanly from here.",
    "Sounds good. See you next time — we’ll keep it smooth and steady.",
    "Take care. When you return, tell me what you want to explore first."
  ];

  const soft = [
    "You’re welcome. Anytime.",
    "My pleasure. Want to keep going, or are we wrapping here?",
    "Glad to help. If you want one more quick thing, tell me the goal in a sentence.",
    "Anytime. If you’re done for now, have a great one."
  ];

  const set = (closingType === "hard") ? hard : soft;
  const seed = `${meta.sessionId}|${meta.stepIndex}|${closingType}`;
  return hashPick(seed, set);
}

// ---------------------------------------------------------
// UNIVERSAL "ALWAYS ADVANCE" ENFORCEMENT (Micro-tuned)
// - Skips for hard farewells
// ---------------------------------------------------------
function hasNextStepOrQuestion(reply) {
  const t = String(reply || "").toLowerCase();
  return (
    t.includes("next step:") ||
    t.includes("next steps:") ||
    t.includes("pick one:") ||
    t.includes("reply with") ||
    t.includes("quick check") ||
    t.includes("?")
  );
}

function pickNaturalFollowup(seed) {
  const variants = [
    "Tell me what you want to do next.",
    "What should we tackle next?",
    "How would you like to continue?"
  ];
  return hashPick(seed, variants);
}

function appendNextStep(reply, domain, laneDetail, closing) {
  const base = String(reply || "").trim();
  if (!base) return base;

  // NEW: do not force follow-up if this is a hard farewell
  if (closing?.type === "hard") return base;

  if (hasNextStepOrQuestion(base)) return base;

  if (domain === "music_history") {
    const chart = laneDetail?.chart || "Billboard Hot 100";
    const artist = laneDetail?.artist ? String(laneDetail.artist).toUpperCase() : null;
    const year = laneDetail?.year ? String(laneDetail.year) : null;

    if (artist && year) {
      return base + `\n\nNext step: tell me the song title for ${artist} in ${year}, or ask “what was #1 that week?” (default chart: ${chart}).`;
    }
    if (artist && !year) {
      return base + `\n\nNext step: give me a year (e.g., 1984) or a song title and I’ll anchor one ${chart} moment.`;
    }
    return base + `\n\nNext step: give me an artist + year (or a specific week/date) and I’ll anchor the ${chart} moment.`;
  }

  return base + "\n\nNext step: " + pickNaturalFollowup(base);
}

// ---------------------------------------------------------
// MATURITY PATCH (v1)
// - Removes "needy" phrasing
// - Keeps replies short, calm, and forward-moving
// ---------------------------------------------------------
function matureTone(reply) {
  let r = String(reply || "");

  // Replace common "needy" patterns with calm, decisive language
  r = r.replace(/I can anchor this, but I need one detail:/gi, "To lock this in, pick one detail:");
  r = r.replace(/I need one detail:/gi, "To lock this in, pick one detail:");
  r = r.replace(/I need a year OR a song title/gi, "Pick one: a year or a song title");
  r = r.replace(/reply with a year \(e\.g\.,\s*1984\) or a song title/gi, "reply with a year or a song title");

  // Keep broadcast-professional punctuation
  r = r.replace(/!!+/g, "!");
  return r.trim();
}


// ---------------------------------------------------------
// SIGNATURE MOMENT (v1) — "The Cultural Thread" (Balanced)
// - Triggers only on completed music answers (artist + (year or title))
// - Fires ~1 in 5 completions (deterministic via hashPick)
// - When fired, we intentionally DO NOT stack a "Next step" on the same turn.
// ---------------------------------------------------------
function isExitish(text) {
  const t = norm(text);
  return (
    t.includes("bye") || t.includes("goodnight") || t.includes("good night") ||
    t.includes("later") || t.includes("talk soon") || t.includes("thanks") || t.includes("thank you")
  );
}

function stripTrailingNextStep(reply) {
  // Remove a trailing "Next step: ..." block so the signature line can land cleanly.
  // This expects the last paragraph to start with "Next step:".
  return String(reply || "").replace(/\n\nNext step:[\s\S]*$/i, "").trim();
}

function shouldTriggerSignature(meta, domain, laneDetail, userMessage, reply, closing) {
  if (closing?.type && closing.type !== "none") return false;
  if (domain !== "music_history") return false;

  const artist = laneDetail?.artist;
  const year = laneDetail?.year;
  const title = laneDetail?.title;

  // Must be a "completed" answer: artist + (year or title)
  if (!artist) return false;
  if (!year && !title) return false;

  // Do not fire if we're still awaiting details or if the reply is a clarifier/question.
  if (laneDetail?.awaiting) return false;
  if (String(reply || "").includes("?")) return false;
  if (/quick check\b/i.test(reply)) return false;

  // Do not fire on obvious exit/closing tones.
  if (isExitish(userMessage)) return false;

  // Do not fire on greetings/filler.
  if (isGreetingOrFiller(userMessage)) return false;

  // Frequency control: ~1 in 5 completions, deterministic per session/step/moment.
  const seed = `${meta.sessionId}|${meta.stepIndex}|sig|${norm(artist)}|${year || ""}|${title || ""}`;
  return hashPick(seed, ["0","1","2","3","4"]) === "0";
}

function pickSignatureLine(meta, laneDetail) {
  const lines = [
    "That moment didn’t just top the charts — it helped define how the era sounded.",
    "Songs like that become cultural timestamps, not just hits.",
    "That was one of those moments where pop culture quietly shifted.",
    "For a lot of listeners, that track marks a specific time and place.",
    "Moments like that are why chart history still matters."
  ];
  const seed = `${meta.sessionId}|${meta.stepIndex}|sigline|${norm(laneDetail?.artist || "")}|${laneDetail?.year || ""}|${laneDetail?.title || ""}`;
  return hashPick(seed, lines);
}

function maybeApplySignatureMoment(meta, domain, laneDetail, userMessage, reply, closing) {
  if (!shouldTriggerSignature(meta, domain, laneDetail, userMessage, reply, closing)) {
    return { fired: false, reply: String(reply || "").trim() };
  }
  const base = stripTrailingNextStep(reply);
  const sig = pickSignatureLine(meta, laneDetail);
  return { fired: true, reply: (base + "\n\n" + sig).trim() };
}

// ---------------------------------------------------------
// MUSIC KNOWLEDGE LAYER v1 (INLINE, offline-first)
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
    }
    // (Keep the rest of your moments list as-is; omitted here for brevity if you already have it.)
  ]
};

function setAwaiting(detail, value) {
  return { ...(detail || {}), awaiting: value };
}
function clearAwaiting(detail) {
  const d = { ...(detail || {}) };
  delete d.awaiting;
  return d;
}

function detectArtistFromText(text) {
  const t = norm(text);
  for (const m of MUSIC_KNOWLEDGE_V1.moments) {
    const a = norm(m.artist);
    if (a && t.includes(a)) return a;
  }
  return null;
}

// Try to detect a song title by matching known moments (lets title-only replies advance)
function detectTitleFromText(text) {
  const t = norm(text);
  for (const m of MUSIC_KNOWLEDGE_V1.moments) {
    const title = norm(m.title);
    if (title && (t === title || t.includes(title))) return title;
  }
  return null;
}


function looksLikeArtistOnly(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (isYearOnlyMessage(raw)) return false;

  const ok = /^[a-zA-Z\s'\-\.]{3,50}$/.test(raw);
  if (!ok) return false;

  const t = norm(raw);
  if (looksMusicHistoryQuery(t)) return false;
  if (looksLikeChartName(t)) return false;
  if (isGreetingOrFiller(t)) return false;

  const banned = ["music", "radio", "chart", "charts", "billboard", "top", "song", "songs", "album", "albums"];
  if (banned.some((w) => t === w || t.includes(w + " "))) return false;

  const tokens = t.split(" ").filter(Boolean);
  if (tokens.length === 1) return /^[a-z]{3,}$/.test(tokens[0]) && !banned.includes(tokens[0]);
  return true;
}

function formatMomentReply(moment, laneDetail) {
  const chart = laneDetail?.chart || moment.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  return `${moment.fact} (${chart})\nCultural note: ${moment.culture}\nNext step: ${moment.next}`;
}

function formatMusicLaneFollowupPrompt(laneDetail) {
  const chart = laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  const artist = laneDetail?.artist ? laneDetail.artist.toUpperCase() : null;

  if (artist && laneDetail?.year) {
    return `Got it — ${artist}, ${laneDetail.year}. Tell me the song title (or ask “what was #1 that week?”) and I’ll anchor the ${chart} moment.`;
  }
  if (artist && !laneDetail?.year) {
    return `Got it — ${artist}. Give me a year (e.g., 1984) or a song title and I’ll anchor one ${chart} moment.`;
  }
  return `Tell me an artist + year (or a specific week/date) and I’ll anchor the ${chart} chart moment with one chart fact, one cultural note, and one next action.`;
}

function answerMusicHistoryOffline(message, laneDetail) {
  if (isGreetingOrFiller(message)) {
    // If the user is just greeting / filler and we have no music context yet, keep it light.
    const hasContext = !!(laneDetail?.artist || laneDetail?.year || laneDetail?.chart);
    return {
      handled: true,
      reply: hasContext
        ? formatMusicLaneFollowupPrompt(laneDetail)
        : "Hi — I’m Nyx. If you want music history, give me an artist + year (or a song title) and I’ll anchor a chart moment.",
      metaPatch: {
        chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart,
        awaiting: laneDetail?.awaiting || (laneDetail?.artist ? "year_or_title" : "artist_year_or_title")
      }
    };
  }

  const t = norm(message);
  const looksLikeMusic = looksMusicHistoryQuery(message);
  const mentionsKnownArtist = !!detectArtistFromText(message) || !!laneDetail?.artist;
  const year = extractYear(message) || (laneDetail?.year ? Number(laneDetail.year) : null);

  if (!looksLikeMusic && !mentionsKnownArtist) return { handled: false };

  // Minimal example: Madonna prompt
  if ((t.includes("madonna") || laneDetail?.artist === "madonna") && !year) {
    return {
      handled: true,
      reply: "Quick check — which year are you asking about for Madonna’s #1? I can default to Billboard Hot 100.",
      metaPatch: { chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart, awaiting: "year_or_date", artist: "madonna" }
    };
  }

  // Try known moment match
    // Continuity-aware moment match:
  // - If the user replies with only a year or only a title, use remembered laneDetail.artist/title.
  const rememberedArtist = laneDetail?.artist ? norm(laneDetail.artist) : null;
  const rememberedTitle = laneDetail?.title ? norm(laneDetail.title) : null;
  const detectedTitle = detectTitleFromText(message);
  const title = detectedTitle || rememberedTitle;

  // 1) Prefer matching by remembered artist (+ optional year)
  let m = MUSIC_KNOWLEDGE_V1.moments.find(x => {
    const ax = norm(x.artist);
    const tx = norm(x.title);
    const artistMatch = rememberedArtist ? (ax === rememberedArtist) : t.includes(ax);
    const yearMatch = !year || x.year === year;
    const titleMatch = title ? (tx === title || t.includes(tx)) : true;
    return artistMatch && yearMatch && titleMatch;
  });

  // 2) If no artist match but we do have a title, match by title (+ optional year) and infer artist
  if (!m && title) {
    m = MUSIC_KNOWLEDGE_V1.moments.find(x => {
      const tx = norm(x.title);
      const yearMatch = !year || x.year === year;
      return (tx === title || t.includes(tx)) && yearMatch;
    });
    if (m && !laneDetail?.artist) {
      // infer remembered artist for downstream continuity
      laneDetail.artist = norm(m.artist);
    }
  }

  if (!m) {
    // If we already have artist + year, do NOT ask for year again. Ask for title/week intent.
    if (rememberedArtist && year) {
      return {
        handled: true,
        reply: `Got it — ${rememberedArtist.toUpperCase()}, ${year}. Which song title — or do you mean her first #1 vs any #1?`,
        metaPatch: { chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart, awaiting: "title_or_first_vs_any" }
      };
    }

    // If we have artist but no year, ask only for year/title.
    if (rememberedArtist && !year) {
      return {
        handled: true,
        reply: `Got it — ${rememberedArtist.toUpperCase()}. Pick one: a year (e.g., 1984) or a song title.`,
        metaPatch: { chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart, awaiting: "year_or_title" }
      };
    }

    return {
      handled: true,
      reply: "To lock this in, pick one detail: a year (e.g., 1984) or a song title.",
      metaPatch: { chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart, awaiting: "artist_year_or_title" }
    };
  }

  // If we matched via title, persist it for continuity
  if (title) laneDetail.title = title;

  return { handled: true, reply: formatMomentReply(m, laneDetail), metaPatch: { chart: m.chart || MUSIC_KNOWLEDGE_V1.defaultChart } };
}

function localMusicFallback(message, laneDetail) {
  if (isGreetingOrFiller(message)) return formatMusicLaneFollowupPrompt(laneDetail);
  const chart = laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  return `Tell me an artist + year (or a specific week/date) and I’ll anchor the ${chart} moment.\nNext step: artist + year, or a week/date.`;
}

// ---------------------------------------------------------
// MAIN ENDPOINT
// ---------------------------------------------------------
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, history } = req.body || {};
    if (!message) return res.status(400).json({ error: "EMPTY_MESSAGE" });

    const clean = String(message).trim();
    let meta = cleanMeta(incomingMeta);
    const session = getSession(meta.sessionId);

    // MATURITY: greetings stay in GENERAL lane (never force music prompts)
    if (isGreetingLike(clean) || isPureGreeting(clean) || (isFirstTurn && isGreetingOrFiller(clean))) {
      const replyRaw = "Hi — I’m Nyx. What would you like to explore today? (Music history, Sandblast TV, News Canada, or Sponsors)";
      const reply = matureTone(replyRaw);

      const updatedMeta = {
        ...meta,
        stepIndex: meta.stepIndex + 1,
        lastDomain: "general",
        lastIntent: "greeting",
        currentLane: "general",
        laneDetail: {},
        laneAge: 0,
        conversationState: "active"
      };

      appendTurn(meta.sessionId, { role: "user", content: clean });
      appendTurn(meta.sessionId, { role: "assistant", content: reply });
      upsertSession(meta.sessionId, session);

      const payload = { ok: true, reply, domain: "general", intent: "greeting", meta: updatedMeta };
      if (meta.access === "admin") payload.debug = { build: BUILD_TAG, mode: meta.mode, greeting: true };
      return res.json(payload);
    }

    // NEW: closing intent check first (so we can end cleanly)
    const closing = detectClosingIntent(clean);
    if (closing.type !== "none") {
      const reply = farewellReply(meta, closing.type);

      const updatedMeta = {
        ...meta,
        stepIndex: meta.stepIndex + 1,
        lastDomain: meta.currentLane || "general",
        lastIntent: "closing",
        conversationState: (closing.type === "hard") ? "ended" : "active"
      };

      appendTurn(meta.sessionId, { role: "user", content: clean });
      appendTurn(meta.sessionId, { role: "assistant", content: reply });
      upsertSession(meta.sessionId, session);

      const payload = { ok: true, reply, domain: updatedMeta.lastDomain, intent: "closing", meta: updatedMeta };
      if (meta.access === "admin") payload.debug = { build: BUILD_TAG, mode: meta.mode, closing };
      return res.json(payload);
    }

    const raw = classifyIntent(clean);

    let domain = (raw.domain === "music_history" || raw.intent === "music_history") ? "music_history"
               : (raw.domain || meta.currentLane || "general");

    const messageLooksLikeMusic = looksMusicHistoryQuery(clean);
    const mentionsKnownArtist = !!detectArtistFromText(clean);
    const isYearOnly = isYearOnlyMessage(clean);
    const artistOnly = looksLikeArtistOnly(clean);

    const wasAwaitingYear =
      meta.currentLane === "music_history" && meta.laneDetail?.awaiting === "year_or_date";

    if (isYearOnly && wasAwaitingYear) domain = "music_history";

    const useOpenAI = shouldUseOpenAI(meta);

    if (messageLooksLikeMusic || mentionsKnownArtist || artistOnly || (isYearOnly && wasAwaitingYear) || meta.currentLane === "music_history") {
      domain = "music_history";
    }

    let laneDetail = { ...(meta.laneDetail || {}) };

    // ------------------------------
    // MUSIC LANE (offline-first)
    // ------------------------------
    if (domain === "music_history") {
      const detectedArtist = detectArtistFromText(clean);
      if (detectedArtist) laneDetail.artist = detectedArtist;

      const detectedTitle = detectTitleFromText(clean);
      if (detectedTitle) {
        laneDetail.title = detectedTitle;
        laneDetail = clearAwaiting(laneDetail);
      }


      if (artistOnly) {
        laneDetail.artist = norm(clean);
        laneDetail = setAwaiting(laneDetail, laneDetail.awaiting || "year_or_title");
      }

      if (isYearOnly) {
        laneDetail.year = clean.trim();
        laneDetail = clearAwaiting(laneDetail);
        if (laneDetail.artist && laneDetail.year) laneDetail.awaiting = "title_or_week";
      }

      if (looksLikeChartName(clean)) {
        laneDetail.chart = clean.trim();
        laneDetail = clearAwaiting(laneDetail);
      }

      const kb = answerMusicHistoryOffline(clean, laneDetail);
      if (kb?.handled) {
        if (kb.metaPatch && typeof kb.metaPatch === "object") laneDetail = { ...laneDetail, ...kb.metaPatch };

        let reply = matureTone(kb.reply);
        const sig = maybeApplySignatureMoment(meta, "music_history", laneDetail, clean, reply, closing);
        reply = sig.reply;
        if (!sig.fired) {
          reply = appendNextStep(reply, "music_history", laneDetail, closing);
        }
        reply = matureTone(reply);

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
        appendTurn(meta.sessionId, { role: "assistant", content: reply });
        upsertSession(meta.sessionId, session);

        const payload = { ok: true, reply, domain: "music_history", intent: raw.intent, meta: updatedMeta };
        if (meta.access === "admin") payload.debug = { build: BUILD_TAG, mode: meta.mode, useOpenAI, classifier: raw };
        return res.json(payload);
      }

      if (!useOpenAI) {
        let reply = matureTone(localMusicFallback(clean, laneDetail));
        const sig = maybeApplySignatureMoment(meta, "music_history", laneDetail, clean, reply, closing);
        reply = sig.reply;
        if (!sig.fired) {
          reply = appendNextStep(reply, "music_history", laneDetail, closing);
        }
        reply = matureTone(reply);

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
        appendTurn(meta.sessionId, { role: "assistant", content: reply });
        upsertSession(meta.sessionId, session);

        const payload = { ok: true, reply, domain: "music_history", intent: raw.intent, meta: updatedMeta };
        if (meta.access === "admin") payload.debug = { build: BUILD_TAG, mode: meta.mode, useOpenAI, classifier: raw, fallback: "music_offline_fallback" };
        return res.json(payload);
      }
    }

    // ------------------------------
    // OpenAI path (quiet failure)
    // ------------------------------
    let reply = "";
    let openaiUnavailableReason = "";

    if (useOpenAI) {
      try {
        const systemPrompt =
          (domain === "music_history")
            ? "You are Nyx — calm, concise, and broadcast-professional. Provide: one chart fact, one cultural note, and one natural follow-up. If missing required info, ask one precise clarifying question."
            : "You are Nyx — calm, concise, and broadcast-professional. Answer clearly, then guide the conversation forward with one natural follow-up. Avoid listing options unless necessary.";

        const response = await openai.responses.create({
          model: OPENAI_MODEL,
          input: [
            { role: "system", content: systemPrompt },
            ...(Array.isArray(history) ? history : []),
            { role: "user", content: clean }
          ]
        });

        reply = response.output_text?.trim() || "";
      } catch (e) {
        const msg = String(e?.message || "");
        const status = e?.status || e?.response?.status;
        if (status === 429 || msg.includes("429")) openaiUnavailableReason = "OPENAI_429_QUOTA";
        else openaiUnavailableReason = "OPENAI_ERROR";
      }
    } else {
      openaiUnavailableReason = "OPENAI_SKIPPED_BY_MODE";
    }

    // Quiet fallback
    if (!reply) {
      if (domain === "music_history" || messageLooksLikeMusic || mentionsKnownArtist || artistOnly || (isYearOnly && wasAwaitingYear) || meta.currentLane === "music_history") {
        domain = "music_history";
        reply = localMusicFallback(clean, laneDetail);
      } else {
        reply = OFFLINE_FALLBACK;
      }
    }

    reply = matureTone(reply);

    if (domain === "music_history") {
      const sig = maybeApplySignatureMoment(meta, "music_history", laneDetail, clean, reply, closing);
      reply = sig.reply;
      if (!sig.fired) {
        reply = appendNextStep(reply, domain, laneDetail, closing);
      }
    } else {
      reply = appendNextStep(reply, domain, laneDetail, closing);
    }
    reply = matureTone(reply);

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

    const payload = { ok: true, reply, domain, intent: raw.intent, meta: updatedMeta };
    if (meta.access === "admin") payload.debug = { build: BUILD_TAG, mode: meta.mode, useOpenAI, openaiUnavailableReason, classifier: raw };
    return res.json(payload);

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: "Nyx hit a backend error, but we can continue. Try again with a shorter message."
    });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

app.listen(PORT, () => {
  console.log(`[Nyx] Broadcast-ready v1.10 on port ${PORT} | build=${BUILD_TAG}`);
});
