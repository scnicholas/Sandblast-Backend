// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.6 (Micro-tuned)
// - Modes: OFFLINE / ONLINE / AUTO
// - Admin access: safe debug fields for you only
// - Enforces "always advance" but with more natural cadence
// - Quiet 429 behavior (no scary banners)
// - Preserves Music Knowledge Layer v1 (offline-first)
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");

// Optional require helper (prevents crash if a module is missing)
function optionalRequire(path, fallback) {
  try {
    return require(path);
  } catch {
    return fallback;
  }
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

// Make model configurable to avoid hard failures
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const BUILD_TAG = "nyx-broadcast-ready-v1.6-2025-12-14";

// Micro-tuned offline fallback (calm, confident, no apology)
const OFFLINE_FALLBACK = "I’m here. What’s the goal?";

// ---------------------------------------------------------
// MODE + ACCESS NORMALIZATION
// ---------------------------------------------------------
function cleanMeta(incoming) {
  const m = incoming || {};
  const modeRaw = String(m.mode || "auto").toLowerCase();
  const accessRaw = String(m.access || "public").toLowerCase();

  const mode = modeRaw === "offline" || modeRaw === "online" ? modeRaw : "auto";
  const access = accessRaw === "admin" ? "admin" : "public";

  return {
    sessionId: m.sessionId || "public",
    stepIndex: Number(m.stepIndex || 0),
    lastDomain: m.lastDomain || "general",
    lastIntent: m.lastIntent || "statement",
    currentLane: m.currentLane || "general",
    laneDetail: m.laneDetail || {},
    laneAge: Number(m.laneAge || 0),
    mode,      // auto | offline | online
    access     // public | admin
  };
}

function shouldUseOpenAI(meta) {
  if (meta.mode === "offline") return false;
  if (meta.mode === "online") return !!openai;
  // auto
  return !!openai;
}

// ---------------------------------------------------------
// UNIVERSAL "ALWAYS ADVANCE" ENFORCEMENT (Micro-tuned)
// - Keeps deterministic Next step in music_history when required
// - Uses natural follow-up rotation elsewhere to avoid robotic repetition
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
    "Where would you like to take this next?",
    "What should we look at next?",
    "Tell me how you’d like to continue."
  ];
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

function appendNextStep(reply, domain, laneDetail) {
  const base = String(reply || "").trim();
  if (!base) return base;

  // If it's already got a question or next step, do nothing.
  if (hasNextStepOrQuestion(base)) return base;

  // Domain-aware: music_history stays explicit when needed (prevents ambiguity loops)
  if (domain === "music_history") {
    const chart = laneDetail?.chart || "Billboard Hot 100";
    const artist = laneDetail?.artist ? String(laneDetail.artist).toUpperCase() : null;
    const year = laneDetail?.year ? String(laneDetail.year) : null;

    if (artist && year) {
      return (
        base +
        `\n\nNext step: tell me the song title for ${artist} in ${year}, or ask “what was #1 that week?” (default chart: ${chart}).`
      );
    }
    if (artist && !year) {
      return base + `\n\nNext step: give me a year (e.g., 1984) or a song title and I’ll anchor one ${chart} moment.`;
    }
    return base + `\n\nNext step: give me an artist + year (or a specific week/date) and I’ll anchor the ${chart} moment.`;
  }

  // General lane: natural follow-up (micro-tuned)
  return base + "\n\n" + pickNaturalFollowup(base);
}

// ---------------------------------------------------------
// MUSIC KNOWLEDGE LAYER v1 (INLINE)
// Offline-first: answers known moments without OpenAI.
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
    },
    {
      key: "prince_when_doves_cry_1984",
      artist: "prince",
      title: "when doves cry",
      year: 1984,
      chart: "Billboard Hot 100",
      fact: "In 1984, Prince hit #1 with “When Doves Cry.”",
      culture: "It pushed pop into a sharper, more experimental lane—minimalist, bold, and unmistakably Prince.",
      next: "Want the chart week/date, or the top pop rivals around that same week?"
    },
    {
      key: "aha_take_on_me_1985",
      artist: "a-ha",
      title: "take on me",
      year: 1985,
      chart: "Billboard Hot 100",
      fact: "In 1985, a-ha reached #1 with “Take On Me.”",
      culture: "The video era turned catchy hooks into global events—visual identity became part of the hit formula.",
      next: "Want the exact week/date or a quick list of other major 1985 #1s?"
    },
    {
      key: "rick_astley_never_gonna_1987",
      artist: "rick astley",
      title: "never gonna give you up",
      year: 1987,
      chart: "Billboard Hot 100",
      fact: "In 1987, Rick Astley hit #1 with “Never Gonna Give You Up.”",
      culture: "A perfect example of polished late-’80s pop—studio sheen, big choruses, and mass-radio appeal.",
      next: "Want the chart date it hit #1 or other standout #1s from 1987?"
    },
    {
      key: "queen_another_one_bites_1980",
      artist: "queen",
      title: "another one bites the dust",
      year: 1980,
      chart: "Billboard Hot 100",
      fact: "In 1980, Queen hit #1 with “Another One Bites the Dust.”",
      culture: "A rock band leaning into groove/funk showed how flexible chart dominance could be.",
      next: "Want the exact #1 week or a quick comparison to Queen’s other U.S. peaks?"
    },
    {
      key: "eagles_hotel_california_1977",
      artist: "eagles",
      title: "hotel california",
      year: 1977,
      chart: "Billboard Hot 100",
      fact: "In 1977, the Eagles reached #1 with “Hotel California.”",
      culture: "Storytelling rock hit its peak—lyrics became cinematic, and radio loved the drama.",
      next: "Want the chart date it hit #1 or the top rock crossovers from that year?"
    },
    {
      key: "bee_gees_night_fever_1978",
      artist: "bee gees",
      title: "night fever",
      year: 1978,
      chart: "Billboard Hot 100",
      fact: "In 1978, the Bee Gees hit #1 with “Night Fever.”",
      culture: "Disco wasn’t a trend—it was an engine. Clubs, radio, and fashion moved together.",
      next: "Want the exact week/date or the 1978 disco-dominant #1 run highlights?"
    },
    {
      key: "bon_jovi_livin_on_a_prayer_1987",
      artist: "bon jovi",
      title: "livin on a prayer",
      year: 1987,
      chart: "Billboard Hot 100",
      fact: "In 1987, Bon Jovi hit #1 with “Livin on a Prayer.”",
      culture: "Arena rock became pop’s best friend—mass singalongs were basically a business model.",
      next: "Want the chart date it peaked, or other 1987 rock-pop crossovers?"
    },
    {
      key: "gnr_sweet_child_1988",
      artist: "guns n roses",
      title: "sweet child o mine",
      year: 1988,
      chart: "Billboard Hot 100",
      fact: "In 1988, Guns N’ Roses reached #1 with “Sweet Child o Mine.”",
      culture: "Hard rock broke through to the mainstream—rawer edges still sold big on pop radio.",
      next: "Want the exact week/date or the late-’80s rock takeover timeline?"
    },
    {
      key: "los_del_rio_macarena_1996",
      artist: "los del rio",
      title: "macarena",
      year: 1996,
      chart: "Billboard Hot 100",
      fact: "In 1996, “Macarena” became a defining #1-era chart moment.",
      culture: "Dance crazes proved music could be participatory—hits became social rituals, not just songs.",
      next: "Want the chart date it hit #1 or the other biggest crossover hits of 1996?"
    },
    {
      key: "mariah_fantasy_1995",
      artist: "mariah carey",
      title: "fantasy",
      year: 1995,
      chart: "Billboard Hot 100",
      fact: "In 1995, Mariah Carey hit #1 with “Fantasy.”",
      culture: "Pop and hip-hop hooks started blending into a single mainstream language.",
      next: "Want the chart-week/date or Mariah’s #1 streak highlights in the ’90s?"
    },
    {
      key: "spice_girls_wannabe_1997",
      artist: "spice girls",
      title: "wannabe",
      year: 1997,
      chart: "Billboard Hot 100",
      fact: "In 1997, the Spice Girls hit #1 with “Wannabe.”",
      culture: "Pop became personality-forward—branding and attitude were part of the chart formula.",
      next: "Want the exact chart week/date or the biggest teen-pop waves that followed?"
    },
    {
      key: "celine_my_heart_1998",
      artist: "celine dion",
      title: "my heart will go on",
      year: 1998,
      chart: "Billboard Hot 100",
      fact: "In 1998, Celine Dion reached #1 with “My Heart Will Go On.”",
      culture: "Movie soundtracks could launch global mega-hits—cinema + radio became a superhighway.",
      next: "Want the exact chart date or other soundtrack-driven #1 moments?"
    },
    {
      key: "adele_rolling_in_the_deep_2011",
      artist: "adele",
      title: "rolling in the deep",
      year: 2011,
      chart: "Billboard Hot 100",
      fact: "In 2011, Adele hit #1 with “Rolling in the Deep.”",
      culture: "Big-voice soul-pop re-centered emotion on the charts—less gloss, more punch.",
      next: "Want the chart-week/date or Adele’s album-era timeline on the Hot 100?"
    },
    {
      key: "adele_hello_2015",
      artist: "adele",
      title: "hello",
      year: 2015,
      chart: "Billboard Hot 100",
      fact: "In 2015, Adele hit #1 with “Hello.”",
      culture: "The streaming era still made room for massive appointment-listening moments.",
      next: "Want the exact #1 week/date or the biggest #1 debuts from the 2010s?"
    }
  ]
};

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
    "thanks", "thank you", "thx",
    "cool", "nice", "great", "good",
    "sounds good",
    "test", "testing"
  ]);
  return fillers.has(t) || t.length <= 2;
}

// Artist-only heuristic
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
  if (tokens.length === 1) {
    return /^[a-z]{3,}$/.test(tokens[0]) && !banned.includes(tokens[0]);
  }
  return true;
}

function setAwaiting(detail, value) {
  return { ...(detail || {}), awaiting: value };
}

function clearAwaiting(detail) {
  const d = { ...(detail || {}) };
  delete d.awaiting;
  return d;
}

// Detect known artist in current message (returns normalized artist or null)
function detectArtistFromText(text) {
  const t = norm(text);
  for (const m of MUSIC_KNOWLEDGE_V1.moments) {
    const a = norm(m.artist);
    if (a && t.includes(a)) return a;
  }
  return null;
}

// ---------------------------------------------------------
// MUSIC RESOLUTION
// ---------------------------------------------------------
function findMoment({ text, laneDetail }) {
  const t = norm(text);
  const year = extractYear(text) || (laneDetail?.year ? Number(laneDetail.year) : null);
  const artistHint = laneDetail?.artist ? norm(laneDetail.artist) : null;

  // 1) direct title match
  for (const m of MUSIC_KNOWLEDGE_V1.moments) {
    if (m.title && t.includes(norm(m.title))) {
      if (!year || Number(m.year) === year) return m;
    }
  }

  // 2) artist in text + (optional) year
  for (const m of MUSIC_KNOWLEDGE_V1.moments) {
    const artistMentioned = m.artist && t.includes(norm(m.artist));
    const yearMatch = !year || Number(m.year) === year;
    if (artistMentioned && yearMatch) return m;
  }

  // 3) artist carried in laneDetail + year
  if (artistHint && year) {
    const possible = MUSIC_KNOWLEDGE_V1.moments.filter(
      (m) => norm(m.artist) === artistHint && Number(m.year) === year
    );
    if (possible.length === 1) return possible[0];
  }

  return null;
}

function inferMomentByArtistAndYear({ text, laneDetail }) {
  const t = norm(text);
  const year = extractYear(text) || Number(laneDetail?.year);
  if (!year) return null;

  const mentionedArtists = new Set();
  for (const m of MUSIC_KNOWLEDGE_V1.moments) {
    const a = norm(m.artist);
    if (a && t.includes(a)) mentionedArtists.add(a);
  }

  if (mentionedArtists.size === 0 && laneDetail?.artist) {
    mentionedArtists.add(norm(laneDetail.artist));
  }
  if (mentionedArtists.size === 0) return null;

  const possible = MUSIC_KNOWLEDGE_V1.moments.filter((m) => {
    const a = norm(m.artist);
    return mentionedArtists.has(a) && Number(m.year) === year;
  });

  return possible.length === 1 ? possible[0] : null;
}

function formatMomentReply(moment, laneDetail) {
  const chart = laneDetail?.chart || moment.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  return `${moment.fact} (${chart})\nCultural note: ${moment.culture}\nNext step: ${moment.next}`;
}

function formatArtistLookupReply(artistName, laneDetail) {
  const chart = laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  const pretty = String(artistName || "").trim();
  return (
    `Locked in — ${pretty}. I’ll anchor this on the ${chart}.\n` +
    `Pick one:\n` +
    `1) “${pretty} #1 hits”\n` +
    `2) “${pretty} 1984” (year focus)\n` +
    `3) “${pretty} biggest song”\n` +
    `4) “${pretty} peak chart position”\n` +
    `Next step: reply with a year or a song title and I’ll pin a specific chart moment.`
  );
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

/**
 * Offline-first answerer for music_history.
 * Returns { handled: true, reply, metaPatch } or { handled: false }
 */
function answerMusicHistoryOffline(message, laneDetail) {
  const t = norm(message);

  if (isGreetingOrFiller(message)) {
    return {
      handled: true,
      reply: formatMusicLaneFollowupPrompt(laneDetail),
      metaPatch: {
        chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart,
        awaiting: laneDetail?.awaiting || (laneDetail?.artist ? "year_or_title" : "artist_year_or_title")
      }
    };
  }

  const looksLikeMusic = looksMusicHistoryQuery(message);
  const mentionsKnownArtist =
    MUSIC_KNOWLEDGE_V1.moments.some((m) => t.includes(norm(m.artist))) || !!laneDetail?.artist;

  if (looksLikeArtistOnly(message)) {
    const artist = String(message || "").trim();
    return {
      handled: true,
      reply: formatArtistLookupReply(artist, laneDetail),
      metaPatch: {
        chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart,
        artist: norm(artist),
        awaiting: "year_or_title"
      }
    };
  }

  if (!looksLikeMusic && !mentionsKnownArtist) {
    return { handled: false };
  }

  const year = extractYear(message) || (laneDetail?.year ? Number(laneDetail.year) : null);

  const inferred = inferMomentByArtistAndYear({ text: message, laneDetail });
  if (inferred) {
    return {
      handled: true,
      reply: formatMomentReply(inferred, laneDetail),
      metaPatch: { chart: inferred.chart || MUSIC_KNOWLEDGE_V1.defaultChart }
    };
  }

  if ((t.includes("madonna") || laneDetail?.artist === "madonna") && !year) {
    return {
      handled: true,
      reply: "Quick check — which year are you asking about for Madonna’s #1? I can default to Billboard Hot 100.",
      metaPatch: {
        chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart,
        awaiting: "year_or_date",
        artist: "madonna"
      }
    };
  }

  const moment = findMoment({ text: message, laneDetail });

  if (!moment) {
    if (laneDetail?.artist && !year) {
      return {
        handled: true,
        reply:
          `I can anchor this. I just need one detail: a year OR a song title (default chart: ${laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart}).\n` +
          `Next step: reply with a year (e.g., 1984) or a song title.`,
        metaPatch: { chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart, awaiting: "year_or_title" }
      };
    }

    return {
      handled: true,
      reply:
        "I can anchor this, but I need one detail: a year OR a song title OR which chart (Billboard Hot 100 / UK Top 40 / Canada RPM).\nNext step: reply with a year (e.g., 1984) or a song title.",
      metaPatch: { chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart, awaiting: "artist_year_or_title" }
    };
  }

  return {
    handled: true,
    reply: formatMomentReply(moment, laneDetail),
    metaPatch: { chart: moment.chart || MUSIC_KNOWLEDGE_V1.defaultChart }
  };
}

function localMusicFallback(message, laneDetail) {
  if (isGreetingOrFiller(message)) return formatMusicLaneFollowupPrompt(laneDetail);

  const year = laneDetail?.year;
  const chart = laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  const artist = laneDetail?.artist;

  if (artist && year) {
    return `For ${artist.toUpperCase()} in ${year}, I can anchor the ${chart} moment — I just need the song title (or say “the #1 of that week”).\nNext step: tell me the song title, or ask “what was #1 on [date]?”`;
  }
  if (artist && !year) {
    return `Got it — ${artist.toUpperCase()}. Give me a year (e.g., 1984) or a song title and I’ll anchor one ${chart} moment.\nNext step: which year or song are we tracking?`;
  }
  if (year) {
    return `For ${year}, I can anchor a chart moment on the ${chart}. Give me the artist + song (or say “#1 of the week”) and I’ll pin it down.\nNext step: which artist/song are we tracking?`;
  }
  return `Tell me the year (or a specific week/date) and I’ll anchor the ${chart} chart moment with one chart fact, one cultural note, and one next action.\nNext step: artist + year, or a week/date.`;
}

// ---------------------------------------------------------
// LANE RESOLUTION
// ---------------------------------------------------------
function resolveLaneDomain(raw, meta) {
  if (raw.domain === "music_history" || raw.intent === "music_history") return "music_history";
  return raw.domain || meta.currentLane || "general";
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

    const raw = classifyIntent(clean);

    let domain = resolveLaneDomain(raw, meta);

    // Common detectors
    const messageLooksLikeMusic = looksMusicHistoryQuery(clean);
    const mentionsKnownArtist = !!detectArtistFromText(clean);
    const isYearOnly = isYearOnlyMessage(clean);
    const artistOnly = looksLikeArtistOnly(clean);

    // If we were awaiting year in music_history, treat year-only reply as music_history
    const wasAwaitingYear =
      meta.currentLane === "music_history" && meta.laneDetail?.awaiting === "year_or_date";

    if (isYearOnly && wasAwaitingYear) domain = "music_history";

    // -------------------------------------------------
    // MODE: OFFLINE / ONLINE / AUTO
    // -------------------------------------------------
    const useOpenAI = shouldUseOpenAI(meta);

    // Pre-OpenAI auto-promotion (still applies in offline mode)
    if (
      (messageLooksLikeMusic ||
        mentionsKnownArtist ||
        artistOnly ||
        (isYearOnly && wasAwaitingYear) ||
        meta.currentLane === "music_history")
    ) {
      // If it looks like music, treat as music lane.
      domain = "music_history";
    }

    // ------------------------------
    // MUSIC HISTORY DETAIL HANDLING
    // ------------------------------
    let laneDetail = { ...(meta.laneDetail || {}) };

    if (domain === "music_history") {
      const detectedArtist = detectArtistFromText(clean);
      if (detectedArtist) laneDetail.artist = detectedArtist;

      if (artistOnly) {
        laneDetail.artist = norm(clean);
        laneDetail = setAwaiting(laneDetail, laneDetail.awaiting || "year_or_title");
      }

      if (isYearOnly) {
        laneDetail.year = clean.trim();
        laneDetail = clearAwaiting(laneDetail);
      }

      if (looksLikeChartName(clean)) {
        laneDetail.chart = clean.trim();
        laneDetail = clearAwaiting(laneDetail);
      }

      // OFFLINE-FIRST (always try)
      const kb = answerMusicHistoryOffline(clean, laneDetail);
      if (kb?.handled) {
        if (kb.metaPatch && typeof kb.metaPatch === "object") {
          laneDetail = { ...(laneDetail || {}), ...kb.metaPatch };
        }

        let reply = kb.reply;
        reply = appendNextStep(reply, "music_history", laneDetail);

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

        const payload = {
          ok: true,
          reply,
          domain: "music_history",
          intent: raw.intent,
          meta: updatedMeta
        };

        // Admin: add safe debug fields
        if (meta.access === "admin") {
          payload.debug = {
            build: BUILD_TAG,
            mode: meta.mode,
            useOpenAI,
            classifier: raw
          };
        }

        return res.json(payload);
      }

      // If OFFLINE mode and KB didn't handle it, fall back quietly in lane
      if (!useOpenAI) {
        let reply = localMusicFallback(clean, laneDetail);
        reply = appendNextStep(reply, "music_history", laneDetail);

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

        const payload = {
          ok: true,
          reply,
          domain: "music_history",
          intent: raw.intent,
          meta: updatedMeta
        };

        if (meta.access === "admin") {
          payload.debug = {
            build: BUILD_TAG,
            mode: meta.mode,
            useOpenAI,
            classifier: raw,
            fallback: "music_offline_fallback"
          };
        }

        return res.json(payload);
      }
    }

    // -------------------------------------------------
    // BRAIN RESPONSE (OpenAI) — with quiet failure
    // -------------------------------------------------
    let reply = "";
    let openaiUnavailableReason = "";

    if (useOpenAI) {
      try {
        const systemPrompt =
          domain === "music_history"
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

    // -------------------------------------------------
    // QUIET OFFLINE MODE ON 429 / ERRORS (no banners)
    // -------------------------------------------------
    if (!reply) {
      const shouldTreatAsMusic =
        domain === "music_history" ||
        messageLooksLikeMusic ||
        mentionsKnownArtist ||
        artistOnly ||
        (isYearOnly && wasAwaitingYear) ||
        meta.currentLane === "music_history";

      if (shouldTreatAsMusic) {
        domain = "music_history";

        const detectedArtist = detectArtistFromText(clean);
        if (detectedArtist) laneDetail.artist = detectedArtist;

        if (artistOnly) {
          laneDetail.artist = norm(clean);
          laneDetail = setAwaiting(laneDetail, laneDetail.awaiting || "year_or_title");
        }

        if (isYearOnly) {
          laneDetail.year = clean.trim();
          laneDetail = clearAwaiting(laneDetail);
        }

        if (looksLikeChartName(clean)) {
          laneDetail.chart = clean.trim();
          laneDetail = clearAwaiting(laneDetail);
        }

        const kb = answerMusicHistoryOffline(clean, laneDetail);
        reply = kb?.handled ? kb.reply : localMusicFallback(clean, laneDetail);

      } else {
        reply = OFFLINE_FALLBACK;
      }
    }

    // Enforce follow-up on everything (including OpenAI and fallbacks)
    reply = appendNextStep(reply, domain, laneDetail);

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

    const payload = {
      ok: true,
      reply,
      domain,
      intent: raw.intent,
      meta: updatedMeta
    };

    if (meta.access === "admin") {
      payload.debug = {
        build: BUILD_TAG,
        mode: meta.mode,
        useOpenAI,
        openaiUnavailableReason,
        classifier: raw
      };
    }

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: "Nyx hit a backend error, but we can continue. Try again with a shorter message."
    });
  }
});

// ---------------------------------------------------------
app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

app.listen(PORT, () => {
  console.log(`[Nyx] Broadcast-ready v1.6 on port ${PORT} | build=${BUILD_TAG}`);
});
