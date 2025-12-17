// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.21 (2025-12-16)
// Fixes (NEW):
// - LANE LOCK PRECEDENCE: meta.currentLane/meta.lastDomain overrides classifier
// - Explicit lane-select phrases: "Music history", "TV", "News Canada", "Sponsors"
// - Prevents "Understood..." generic fallback when lane is locked to music
// Includes (from v1.20):
// - Calm broadcast tone + always-advance follow-up logic
// - Robust greeting + small-talk handling
// - Sponsors: package + tier/brand deliverables
// - Music Knowledge Layer LOCK (year → chart → moment → next step)
// - Slot filling: artist + #1 -> ask only missing (year or title)
// - Artist alias resolution
// - ERA/GENRE reset guard
// - Artist-only follow-up advances correctly
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");
const musicKB = require("./Utils/musicKnowledge");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 3000;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const BUILD_TAG = "nyx-broadcast-ready-v1.21-2025-12-16";
const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

// -------------------------
// DB LOAD (music moments v1+v2 merged by Utils/musicKnowledge v2 loader)
// -------------------------
let MUSIC_DB = { moments: [] };
let MUSIC_ARTISTS = [];
let MUSIC_TITLES = [];

function loadMusicDbOnce() {
  try {
    MUSIC_DB = musicKB.loadDb();
    const moments = (MUSIC_DB && MUSIC_DB.moments) || [];

    const aSet = new Set();
    const tSet = new Set();

    for (const m of moments) {
      if (m?.artist) aSet.add(String(m.artist));
      if (m?.title) tSet.add(String(m.title));
    }
    MUSIC_ARTISTS = Array.from(aSet);
    MUSIC_TITLES = Array.from(tSet);
  } catch {
    MUSIC_DB = { moments: [] };
    MUSIC_ARTISTS = [];
    MUSIC_TITLES = [];
  }
}
loadMusicDbOnce();

// -------------------------
// Helpers
// -------------------------
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(text) {
  if (musicKB?.extractYear) return musicKB.extractYear(text);
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function isYearOnlyMessage(text) {
  return /^\s*(19\d{2}|20\d{2})\s*$/.test(String(text || ""));
}

function hasNumberOneIntent(text) {
  const t = norm(text);
  return (
    t.includes("#1") || t.includes("# 1") ||
    t.includes("no 1") || t.includes("no. 1") ||
    t.includes("number 1") || t.includes("number one")
  );
}

function isGreetingLike(text) {
  const t = norm(text);
  if (!t) return false;
  return (
    t === "hi" || t === "hello" || t === "hey" || t === "yo" ||
    t === "hi nyx" || t === "hello nyx" || t === "hey nyx" ||
    t.startsWith("good morning") || t.startsWith("good afternoon") || t.startsWith("good evening") ||
    t === "nyx"
  );
}

function isSmallTalkCheckIn(text) {
  const t = norm(text);
  if (!t) return false;
  const patterns = [
    /^how are you\b/, /^how r u\b/, /^how you doing\b/,
    /^how's it going\b/, /^hows it going\b/,
    /^what's up\b/, /^whats up\b/,
    /^how is your day\b/, /^how's your day\b/, /^hows your day\b/
  ];
  return patterns.some(p => p.test(t));
}

function resolveArtistAlias(text) {
  const t = norm(text);
  if (/\bwhitney\b/.test(t)) return "Whitney Houston";
  if (/\bmadonna\b/.test(t)) return "Madonna";
  if (/\bprince\b/.test(t)) return "Prince";
  if (/\bmj\b/.test(t)) return "Michael Jackson";
  return null;
}

function containsEraOrGenreCue(text) {
  const t = norm(text);
  const cues = [
    "motown", "british invasion", "disco", "new wave",
    "grunge", "hip hop", "hip-hop", "r&b", "soul",
    "punk", "metal", "country", "soundtrack"
  ];
  return cues.some(c => t.includes(c));
}

function looksLikeChartName(text) {
  const t = norm(text);
  return (
    t.includes("billboard") ||
    t.includes("hot 100") ||
    t.includes("uk") ||
    t.includes("official charts") ||
    t.includes("canada") ||
    t.includes("rpm") ||
    t.includes("top40weekly") ||
    t.includes("top 40 weekly") ||
    t.includes("top 40")
  );
}

function resolveChartFromText(text) {
  const t = norm(text);
  if (t.includes("uk") || t.includes("official charts")) return "UK Singles Chart";
  if (t.includes("canada") || t.includes("rpm")) return "Canada RPM";
  if (t.includes("top40weekly") || t.includes("top 40 weekly") || t.includes("top 40")) return "Top40Weekly";
  if (t.includes("hot 100") || t.includes("billboard")) return "Billboard Hot 100";
  return null;
}

function looksMusicHistoryQuery(text) {
  const t = norm(text);
  if (musicKB?.looksLikeMusicHistory && musicKB.looksLikeMusicHistory(t)) return true;
  return (
    t.includes("billboard") || t.includes("hot 100") || t.includes("chart") || t.includes("charts") ||
    t.includes("#1") || t.includes("number one") || t.includes("no. 1") || t.includes("peak") ||
    t.includes("weeks at") || t.includes("top 40") || t.includes("top40weekly")
  );
}

function detectArtistFromDb(text) {
  const t = norm(text);
  if (!t || !MUSIC_ARTISTS.length) return null;

  for (const a of MUSIC_ARTISTS) {
    const na = norm(a);
    if (!na) continue;
    if (t === na) return a;
    if (t.includes(na)) return a;
  }
  return null;
}

function detectTitleFromDb(text) {
  const t = norm(text);
  if (!t || !MUSIC_TITLES.length) return null;

  for (const s of MUSIC_TITLES) {
    const ns = norm(s);
    if (!ns) continue;
    if (t === ns) return s;
    if (t.includes(ns)) return s;
  }
  return null;
}

function looksLikeArtistOnly(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (isYearOnlyMessage(raw)) return false;
  if (!/^[a-zA-Z\s'\-\.&]{3,60}$/.test(raw)) return false;

  const t = norm(raw);
  if (looksMusicHistoryQuery(t)) return false;
  if (looksLikeChartName(t)) return false;
  if (containsEraOrGenreCue(t)) return false;

  const banned = ["music", "radio", "chart", "charts", "billboard", "top", "song", "songs", "album", "albums"];
  if (banned.some(w => t === w || t.startsWith(w + " "))) return false;

  return true;
}

function momentFields(m) {
  return {
    fact: m?.chart_fact || m?.fact || "",
    culture: m?.cultural_moment || m?.culture || "",
    next: m?.next_step || m?.next || ""
  };
}

function matureTone(reply) {
  let r = String(reply || "");
  r = r.replace(/!!+/g, "!");
  return r.trim();
}

function hasNextStepOrQuestion(reply) {
  const t = String(reply || "").toLowerCase();
  return t.includes("next step:") || t.includes("next steps:") || t.includes("?") || t.includes("pick one:");
}

function appendNextStep(reply, laneDetail) {
  const base = matureTone(reply);
  if (!base) return base;
  if (hasNextStepOrQuestion(base)) return base;

  const chart = laneDetail?.chart || MUSIC_DEFAULT_CHART;
  const artist = laneDetail?.artist ? String(laneDetail.artist).toUpperCase() : null;
  const year = laneDetail?.year ? String(laneDetail.year) : null;

  if (artist && year) {
    return base + `\n\nNext step: give me a song title, or ask “was it #1?” If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${chart}).`;
  }
  if (artist && !year) {
    return base + `\n\nNext step: give me a year (e.g., 1992) or a song title. If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${chart}).`;
  }
  return base + `\n\nNext step: give me an artist + year (or a song title). If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${chart}).`;
}

// -------------------------
// Lane select phrases (NEW)
// -------------------------
function resolveLaneSelect(text) {
  const t = norm(text);
  if (t === "music" || t === "music history" || t === "music_history") return "music_history";
  if (t === "tv" || t === "sandblast tv" || t === "sandblasttv") return "tv";
  if (t === "news" || t === "news canada" || t === "news_canada") return "news_canada";
  if (t === "sponsors" || t === "sponsor" || t === "sponsorship") return "sponsors";
  return null;
}

// -------------------------
// Sponsors
// -------------------------
function looksLikeSponsorPackageAsk(text = "") {
  const t = norm(text);
  return (
    t.includes("sponsor package") || t.includes("sponsorship package") || t.includes("media kit") ||
    t.includes("rate card") || t.includes("advertise") || t.includes("advertising") ||
    t.includes("sponsor") || t.includes("sponsorship") || t.includes("partnership") ||
    t.includes("pricing") || t.includes("rates")
  );
}

function extractSponsorTier(text = "") {
  const m = String(text).match(/\b(starter|growth|premium)\b/i);
  return m ? m[1].toLowerCase() : null;
}

function extractSponsorBrand(text = "") {
  let s = String(text || "").trim();
  if (!s) return null;
  s = s.replace(/\b(starter|growth|premium)\b/ig, "").trim();
  s = s.replace(/\b(tier|package|sponsorship|sponsor|for|to|with|and)\b/ig, " ").trim();
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}

function buildSponsorPackageV1() {
  return (
`**Sandblast Sponsor Package (Canada-Wide) — v1**

**Positioning**
Sandblast Channel blends culture, music, news, and community storytelling across **website + radio + TV-style blocks**. Sponsors don’t just place ads — they join the cultural conversation.

**Tiers**
**Starter — $100–$300**
• Website sponsor placement (logo + short blurb)  
• 1 sponsored mention on Sandblast Radio  
• 1 community highlight (when applicable)

**Growth — $500–$1,500**
• Priority website sponsor placement  
• Multiple Sandblast Radio mentions  
• Sponsored segment/feature placement  
• Optional short branded message read by host

**Premium — $2,000+**
• Featured website placement (hero/featured sponsor)  
• Recurring radio sponsorship block  
• TV-style block integration or branded segment  
• Custom campaign alignment with Sandblast programming

**Proof point**
Sandblast is building a multi-platform broadcast ecosystem designed for brands that want cultural relevance, not just impressions.

**Next action**
Pick a tier (Starter/Growth/Premium) and tell me the sponsor brand/industry — I’ll generate a ready-to-send pitch email and a one-page proposal.`
  );
}

// -------------------------
// Music answer (offline knowledge layer)
// -------------------------
function answerMusicHistoryOffline(message, laneDetail) {
  const detail = laneDetail || {};
  const msg = String(message || "").trim();

  // Year-only locking
  const yr = extractYear(msg);
  if (yr && isYearOnlyMessage(msg)) {
    if (detail.artist) {
      return {
        handled: true,
        reply: `Locked: ${String(detail.artist).toUpperCase()} in ${yr}. Give me a song title, or ask “Was it #1?” and I’ll anchor the chart moment.`,
        patch: { year: yr }
      };
    }
    return { handled: true, reply: `Noted: ${yr}. Which artist are we anchoring?`, patch: { year: yr } };
  }

  // Artist-only anchoring
  if (looksLikeArtistOnly(msg)) {
    const artistGuess = detail.artist || detectArtistFromDb(msg) || resolveArtistAlias(msg) || msg;
    return {
      handled: true,
      reply: `Got it — ${String(artistGuess).toUpperCase()}. Pick a year (e.g., 1992) or give me a song title and I’ll anchor the chart moment.`,
      patch: { artist: artistGuess }
    };
  }

  // If we have artist/title/year, try to pick best moment
  const artist = detail.artist || detectArtistFromDb(msg) || resolveArtistAlias(msg);
  const title = detail.title || detectTitleFromDb(msg);
  const year = detail.year || yr || null;

  const best = musicKB?.pickBestMoment
    ? musicKB.pickBestMoment(MUSIC_DB, { artist, title, year })
    : null;

  if (!best) {
    return { handled: true, reply: "To anchor the moment, give me an artist + year (or a song title).", patch: {} };
  }

  const f = momentFields(best);
  const chartName = detail.chart || best.chart || MUSIC_DEFAULT_CHART;

  return {
    handled: true,
    reply:
      `Chart fact: ${f.fact || "Anchor found."} (${chartName})` +
      `\nCultural thread: ${f.culture || "This was a defining radio-era moment for its sound and reach."}` +
      `\nNext step: ${f.next || "Want the exact chart week/date, or a fuller #1 timeline?"}`,
    patch: { artist: best.artist, title: best.title, year: best.year }
  };
}

// -------------------------
// Main endpoint
// -------------------------
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, history } = req.body || {};
    const clean = String(message || "").trim();
    if (!clean) return res.status(400).json({ ok: false, error: "EMPTY_MESSAGE" });

    const meta = incomingMeta || {};
    let laneDetail = { ...(meta.laneDetail || {}) };
    const stepIndex = Number(meta.stepIndex || 0);

    // ---- Greetings
    if (isGreetingLike(clean)) {
      const reply = matureTone("I’m doing well — thanks for asking. What would you like to explore today? (Music history, Sandblast TV, News Canada, or Sponsors)");
      return res.json({
        ok: true,
        reply,
        domain: "general",
        intent: "greeting",
        meta: { ...meta, stepIndex: stepIndex + 1, lastDomain: "general", laneDetail: meta.laneDetail || {} }
      });
    }

    // ---- Small talk
    if (isSmallTalkCheckIn(clean)) {
      const reply = matureTone("I’m doing well — thanks for asking. What would you like to explore today? (Music history, Sandblast TV, News Canada, or Sponsors)");
      return res.json({
        ok: true,
        reply,
        domain: "general",
        intent: "smalltalk",
        meta: { ...meta, stepIndex: stepIndex + 1, lastDomain: "general", laneDetail: meta.laneDetail || {} }
      });
    }

    // ---- Explicit lane select (NEW)
    const laneSelect = resolveLaneSelect(clean);
    if (laneSelect) {
      const reply =
        laneSelect === "music_history"
          ? "Music history locked. Give me an artist + year (or a song title)."
          : laneSelect === "tv"
          ? "Sandblast TV locked. What are we tuning: grid, shows, or a specific program?"
          : laneSelect === "news_canada"
          ? "News Canada locked. What topic or story angle are we building?"
          : "Sponsors locked. Say “sponsor package” or tell me brand + tier.";

      // Seed chart default if music
      if (laneSelect === "music_history") {
        laneDetail = laneDetail || {};
        if (!laneDetail.chart) laneDetail.chart = MUSIC_DEFAULT_CHART;
      }

      return res.json({
        ok: true,
        reply: matureTone(reply),
        domain: laneSelect,
        intent: "lane_select",
        meta: { ...meta, stepIndex: stepIndex + 1, currentLane: laneSelect, lastDomain: laneSelect, laneDetail }
      });
    }

    // ---- Sponsors fast path
    if (looksLikeSponsorPackageAsk(clean)) {
      const tier = extractSponsorTier(clean);
      const brand = extractSponsorBrand(clean);

      let reply = "";
      if (tier && brand) {
        reply = matureTone(
          `Got it — ${tier.toUpperCase()} tier for ${brand}.\n\nNext step: tell me the contact name + email (or say “keep it generic”) and I’ll generate the pitch + one-page proposal.`
        );
      } else {
        reply = matureTone(buildSponsorPackageV1());
      }

      return res.json({
        ok: true,
        reply,
        domain: "sponsors",
        intent: "sponsors",
        meta: { ...meta, stepIndex: stepIndex + 1, currentLane: "sponsors", lastDomain: "sponsors", laneDetail: { tier, brand } }
      });
    }

    // ---- Intent classify (classifier is advisory; lane lock wins) (NEW)
    const raw = classifyIntent(clean);

    let domain = (meta.currentLane || meta.lastDomain || "general");
    if (domain === "general") {
      if (raw?.domain) domain = raw.domain;
      else if (raw?.intent && typeof raw.intent === "string") domain = raw.intent;
      else domain = "general";
    }

    // ---- Music lane activation (still useful when no lane lock)
    const messageLooksMusic = looksMusicHistoryQuery(clean);
    const detectedArtist = detectArtistFromDb(clean);
    const detectedTitle = detectTitleFromDb(clean);
    const artistOnly = looksLikeArtistOnly(clean);
    const year = extractYear(clean);
    const inferredChart = resolveChartFromText(clean);

    if (domain === "general" && (messageLooksMusic || detectedArtist || detectedTitle || artistOnly)) {
      domain = "music_history";
    }

    // ---- Music lane logic (locked or inferred)
    if (domain === "music_history") {
      if (inferredChart) laneDetail.chart = inferredChart;
      if (!laneDetail.chart) laneDetail.chart = MUSIC_DEFAULT_CHART;

      if (containsEraOrGenreCue(clean)) {
        laneDetail = { chart: laneDetail.chart || MUSIC_DEFAULT_CHART };
        laneDetail.era = "era_genre";
      }

      const alias = resolveArtistAlias(clean);
      if (alias && !laneDetail.artist) laneDetail.artist = alias;

      if (detectedArtist) laneDetail.artist = detectedArtist;
      if (detectedTitle) laneDetail.title = detectedTitle;
      if (artistOnly && !laneDetail.artist) laneDetail.artist = clean.trim();
      if (year) laneDetail.year = year;

      if (containsEraOrGenreCue(clean) && year && !laneDetail.artist) {
        const reply = matureTone(
          `${year} Motown is a defining era. Pick an artist (The Supremes, Marvin Gaye, The Temptations) and I’ll anchor the chart moment.`
        );
        return res.json({
          ok: true,
          reply,
          domain: "music_history",
          intent: raw.intent,
          meta: { ...meta, stepIndex: stepIndex + 1, currentLane: "music_history", lastDomain: "music_history", laneDetail }
        });
      }

      if (laneDetail.artist && hasNumberOneIntent(clean) && !laneDetail.year && !laneDetail.title) {
        const reply = matureTone(
          `Got it — ${String(laneDetail.artist).toUpperCase()} #1. Give me a year (e.g., 1992) or a song title and I’ll anchor the chart moment.`
        );
        return res.json({
          ok: true,
          reply,
          domain: "music_history",
          intent: raw.intent,
          meta: { ...meta, stepIndex: stepIndex + 1, currentLane: "music_history", lastDomain: "music_history", laneDetail }
        });
      }

      const kb = answerMusicHistoryOffline(clean, laneDetail);
      if (kb?.handled) {
        if (kb.patch && typeof kb.patch === "object") {
          laneDetail = { ...laneDetail, ...kb.patch };
        }
        let reply = matureTone(kb.reply);
        reply = appendNextStep(reply, laneDetail);
        reply = matureTone(reply);

        return res.json({
          ok: true,
          reply,
          domain: "music_history",
          intent: raw.intent,
          meta: { ...meta, stepIndex: stepIndex + 1, currentLane: "music_history", lastDomain: "music_history", laneDetail }
        });
      }
    }

    // ---- Optional OpenAI path
    let reply = "";
    if (openai) {
      try {
        const systemPrompt =
          domain === "music_history"
            ? "You are Nyx — calm, concise, and broadcast-professional. Provide: one chart fact, one cultural note, and one next action. If missing info, ask one precise question."
            : "You are Nyx — calm, concise, and broadcast-professional. Answer clearly, then ask one natural next question.";

        const response = await openai.responses.create({
          model: OPENAI_MODEL,
          input: [
            { role: "system", content: systemPrompt },
            ...(Array.isArray(history) ? history : []),
            { role: "user", content: clean }
          ]
        });

        reply = response.output_text?.trim() || "";
      } catch {
        reply = "";
      }
    }

    // Calm fallback, but only if we're truly general
    if (!reply) {
      reply = (domain === "general")
        ? "Understood. What would you like to do next?"
        : "To anchor the moment, give me an artist + year (or a song title).";
    }

    reply = matureTone(reply);

    return res.json({
      ok: true,
      reply,
      domain,
      intent: raw.intent,
      meta: { ...meta, stepIndex: stepIndex + 1, lastDomain: domain, laneDetail }
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: "Nyx hit a backend error. Try again with a shorter message."
    });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", build: BUILD_TAG }));

app.listen(PORT, () => {
  console.log(`[Nyx] ${BUILD_TAG} running on port ${PORT}`);
});
