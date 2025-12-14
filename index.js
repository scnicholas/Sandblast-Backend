// ----------------------------------------------------------
// Sandblast Nyx Backend — Music Foundation v1.3
// - Music Knowledge Layer v1 (INLINE, offline-first)
// - Auto-promotion into music_history (pre/post OpenAI)
// - v1.1 Fix: year-only follow-up auto-promotion when awaiting year
// - v1.2 Polish: suppress scary 429 banner (quiet offline mode)
// - v1.2 Fix: persist artist context across turns so "1984" resolves correctly
// - v1.3 Fix: artist-only input ("Lionel Richie") auto-promotes (no loop / no "tell me what to do next")
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

const {
  getSession,
  upsertSession,
  appendTurn
} = optionalRequire("./Utils/sessionStore", {
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

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const BUILD_TAG = "nyx-music-foundation-v1.3-2025-12-13";

// ---------------------------------------------------------
// MUSIC KNOWLEDGE LAYER v1 (INLINE)
// Offline-first: answers known moments without OpenAI.
// Broadcast spec: one chart fact, one cultural note, one next action.
// ---------------------------------------------------------
const MUSIC_KNOWLEDGE_V1 = {
  defaultChart: "Billboard Hot 100",
  moments: [
    // --- Original 4 moments ---
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

    // --- Expanded moments (keep as-is from v1.2) ---
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
      key: "mj_beat_it_1983",
      artist: "michael jackson",
      title: "beat it",
      year: 1983,
      chart: "Billboard Hot 100",
      fact: "In 1983, Michael Jackson reached #1 with “Beat It.”",
      culture: "Pop + rock crossover went mainstream—genre borders got softer, audiences got bigger.",
      next: "Want the chart-week/date or the Thriller-era chart timeline?"
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

// v1.3: artist-only heuristic (works even if artist isn't in moments yet)
function looksLikeArtistOnly(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (isYearOnlyMessage(raw)) return false;

  // Only letters/spaces (allow apostrophes & hyphens lightly)
  const ok = /^[a-zA-Z\s'\-\.]{3,50}$/.test(raw);
  if (!ok) return false;

  const t = norm(raw);
  if (looksMusicHistoryQuery(t)) return false;
  if (looksLikeChartName(t)) return false;

  // Avoid catching generic words
  const banned = ["music", "radio", "chart", "charts", "billboard", "top", "song", "songs", "album", "albums"];
  if (banned.some((w) => t === w || t.includes(w + " "))) return false;

  // At least one space suggests a name (Lionel Richie / Taylor Swift)
  return t.includes(" ");
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

// Unambiguous artist+year inference (auto-map without clarification)
function inferMomentByArtistAndYear({ text, laneDetail }) {
  const t = norm(text);
  const year = extractYear(text) || Number(laneDetail?.year);
  if (!year) return null;

  // Determine which artists are explicitly mentioned
  const mentionedArtists = new Set();
  for (const m of MUSIC_KNOWLEDGE_V1.moments) {
    const a = norm(m.artist);
    if (a && t.includes(a)) mentionedArtists.add(a);
  }

  // If no artist mentioned, use persisted laneDetail.artist
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

// v1.3: broadcaster-style prompt for artist-only (no loop)
function formatArtistLookupReply(artistName, laneDetail) {
  const chart = laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  const pretty = String(artistName || "").trim();
  return (
    `Got it — ${pretty}. I can anchor this on the ${chart}.\n` +
    `Pick one:\n` +
    `1) “${pretty} #1 hits”\n` +
    `2) “${pretty} 1984” (year focus)\n` +
    `3) “${pretty} biggest song”\n` +
    `4) “${pretty} peak chart position”\n` +
    `Next step: reply with a year or a song title and I’ll pin a specific chart moment.`
  );
}

/**
 * Offline-first answerer for music_history.
 * Returns { handled: true, reply, metaPatch } or { handled: false }
 */
function answerMusicHistoryOffline(message, laneDetail) {
  const t = norm(message);

  const looksLikeMusic = looksMusicHistoryQuery(message);
  const mentionsKnownArtist =
    MUSIC_KNOWLEDGE_V1.moments.some((m) => t.includes(norm(m.artist))) || !!laneDetail?.artist;

  // v1.3: if user typed only an artist name in music lane, handle it immediately
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

  // Auto-map: artist + year -> moment (if unambiguous)
  const inferred = inferMomentByArtistAndYear({ text: message, laneDetail });
  if (inferred) {
    return {
      handled: true,
      reply: formatMomentReply(inferred, laneDetail),
      metaPatch: { chart: inferred.chart || MUSIC_KNOWLEDGE_V1.defaultChart }
    };
  }

  // If we have Madonna context but no year, ask once (and persist artist)
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
    // v1.3: if we have an artist stored but no match, stay professional and ask for one detail
    if (laneDetail?.artist && !year) {
      const pretty = String(laneDetail.artist || "").toUpperCase();
      return {
        handled: true,
        reply:
          `I’ve got ${pretty} in focus. Give me a year OR a song title and I’ll anchor one chart moment on the ${laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart}.\n` +
          `Next step: reply with a year (e.g., 1984) or a song title.`,
        metaPatch: { chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart, awaiting: "year_or_title" }
      };
    }

    return {
      handled: true,
      reply:
        "I can anchor this, but I need one detail: a year OR a song title OR which chart (Billboard Hot 100 / UK Top 40 / Canada RPM).\nNext step: reply with a year (e.g., 1984) or a song title.",
      metaPatch: { chart: laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart }
    };
  }

  return {
    handled: true,
    reply: formatMomentReply(moment, laneDetail),
    metaPatch: { chart: moment.chart || MUSIC_KNOWLEDGE_V1.defaultChart }
  };
}

// Quiet offline fallback (no scary banner)
function localMusicFallback(message, laneDetail) {
  const year = laneDetail?.year;
  const chart = laneDetail?.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
  const artist = laneDetail?.artist;
  const t = norm(message);

  // If we have artist but not enough detail, prompt cleanly
  if (artist && !year && looksLikeArtistOnly(message)) {
    return formatArtistLookupReply(String(message || "").trim(), laneDetail);
  }

  // If we have artist+year but no KB moment, keep it professional and actionable
  if (artist && year) {
    return `For ${artist.toUpperCase()} in ${year}, I can anchor the ${chart} moment — I just need the song title (or say “the #1 of that week”).\nNext step: tell me the song title, or ask “what was #1 on [date]?”`;
  }

  if (year) {
    return `For ${year}, I can anchor a chart moment on the ${chart}. Give me the artist + song (or say “#1 of the week”) and I’ll pin it down.\nNext step: which artist/song are we tracking?`;
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

    // initial domain from classifier
    let domain = resolveLaneDomain(raw, meta);

    // Common detectors
    const openaiPresent = !!openai;
    const messageLooksLikeMusic = looksMusicHistoryQuery(clean);
    const mentionsKnownArtist = !!detectArtistFromText(clean);
    const isYearOnly = isYearOnlyMessage(clean);
    const artistOnly = looksLikeArtistOnly(clean);

    // v1.1/v1.2: if we were awaiting year in music_history, treat year-only reply as music_history
    const wasAwaitingYear =
      meta.currentLane === "music_history" &&
      meta.laneDetail?.awaiting === "year_or_date";

    // Force lane for year-only follow-up in music flow
    if (isYearOnly && wasAwaitingYear) {
      domain = "music_history";
    }

    // -------------------------------------------------
    // AUTO-PROMOTION (pre-OpenAI)
    // If OpenAI missing and message indicates music history OR artist-only in music flow,
    // force music_history so offline layer can answer.
    // -------------------------------------------------
    if (
      !openaiPresent &&
      (messageLooksLikeMusic || mentionsKnownArtist || artistOnly || (isYearOnly && wasAwaitingYear) || meta.currentLane === "music_history")
    ) {
      domain = "music_history";
    }

    // ------------------------------
    // MUSIC HISTORY DETAIL HANDLING
    // ------------------------------
    let laneDetail = { ...(meta.laneDetail || {}) };

    if (domain === "music_history") {
      // Persist artist hint if present in this message (known artists)
      const detectedArtist = detectArtistFromText(clean);
      if (detectedArtist) laneDetail.artist = detectedArtist;

      // v1.3: persist artist even if not in moments (artist-only input)
      if (artistOnly) {
        laneDetail.artist = norm(clean);
        laneDetail = setAwaiting(laneDetail, laneDetail.awaiting || "year_or_title");
      }

      // Capture year-only replies
      if (isYearOnly) {
        laneDetail.year = clean.trim();
        laneDetail = clearAwaiting(laneDetail);
      }

      // Capture chart names
      if (looksLikeChartName(clean)) {
        laneDetail.chart = clean.trim();
        laneDetail = clearAwaiting(laneDetail);
      }

      // OFFLINE-FIRST: Knowledge Layer v1
      const kb = answerMusicHistoryOffline(clean, laneDetail);
      if (kb?.handled) {
        if (kb.metaPatch && typeof kb.metaPatch === "object") {
          laneDetail = { ...(laneDetail || {}), ...kb.metaPatch };
        }

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

      // One-time clarifier (only if we truly have nothing)
      if (!laneDetail.year && laneDetail.awaiting !== "year_or_date" && !laneDetail.artist) {
        laneDetail = setAwaiting(laneDetail, "year_or_date");

        return res.json({
          ok: true,
          reply: "Quick check — what year (or week/date) are we talking, and should I default to the Billboard Hot 100?",
          domain: "music_history",
          intent: "music_history",
          meta: {
            ...meta,
            currentLane: "music_history",
            laneDetail,
            laneAge: meta.laneAge + 1
          }
        });
      }

      // No loop
      if (!laneDetail.year && laneDetail.awaiting === "year_or_date") {
        laneDetail = clearAwaiting(laneDetail);
        laneDetail.chart = laneDetail.chart || MUSIC_KNOWLEDGE_V1.defaultChart;
      }
    }

    // -------------------------------------------------
    // BRAIN RESPONSE (OpenAI)
    // -------------------------------------------------
    let reply = "";
    let openaiUnavailableReason = "";

    if (openai) {
      try {
        const systemPrompt =
          domain === "music_history"
            ? "You are Nyx, a broadcast music historian. Provide exactly: one chart fact, one cultural note, one next action. If missing required info, ask one precise clarifying question."
            : "You are Nyx, Sandblast’s AI brain.";

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
    // AUTO-PROMOTION (post-OpenAI)
    // If OpenAI 429 and this is music flow, answer quietly offline.
    // -------------------------------------------------
    if (!reply && openaiUnavailableReason === "OPENAI_429_QUOTA") {
      const shouldTreatAsMusic =
        domain === "music_history" ||
        messageLooksLikeMusic ||
        mentionsKnownArtist ||
        artistOnly ||
        (isYearOnly && wasAwaitingYear) ||
        meta.currentLane === "music_history";

      if (shouldTreatAsMusic) {
        domain = "music_history";

        // Refresh laneDetail and persist artist/year/chart if detected
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
        if (kb?.handled) {
          if (kb.metaPatch && typeof kb.metaPatch === "object") {
            laneDetail = { ...(laneDetail || {}), ...kb.metaPatch };
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
            reply: kb.reply, // ✅ quiet offline mode (no banner)
            domain: "music_history",
            intent: raw.intent,
            meta: updatedMeta
          });
        }

        // Quiet fallback if KB didn’t match
        reply = localMusicFallback(clean, laneDetail);
      }
    }

    // -------------------------------------------------
    // FINAL FALLBACKS (quiet + professional)
    // -------------------------------------------------
    if (!reply) {
      if (domain === "music_history") {
        reply = localMusicFallback(clean, laneDetail); // ✅ no scary banner
      } else if (openaiUnavailableReason === "OPENAI_429_QUOTA") {
        reply = "I’m here — tell me what you want to do next and I’ll guide you.";
      } else {
        reply = "Tell me how you’d like to proceed.";
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
app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

app.listen(PORT, () => {
  console.log(`[Nyx] Music foundation v1.3 on port ${PORT} | build=${BUILD_TAG}`);
});
