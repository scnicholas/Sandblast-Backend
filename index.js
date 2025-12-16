// ----------------------------------------------------------
// Sandblast Nyx Backend — Broadcast-Ready v1.18 (Alias Resolution + Music Slot-Fill Pass)
// Includes:
// - Quiet 429/offline behavior (no scary banners)
// - Greeting discipline (robust “Hi Nyx” handling)
// - Small-talk / check-in handler (How are you? -> human reply, then pivot)
// - Music Knowledge Layer LOCK (year → chart → moment → next step) using Utils/musicKnowledge (v2)
// - Slot-filling follow-up fix: Artist + #1 intent -> ask ONLY for missing (year or title)
// - NEW: Artist alias resolution (e.g., "Whitney" -> "Whitney Houston") so shorthand works on-air
// - Sponsor Package Mode v1 (deterministic fast-path)
// - Sponsor Mode v1.1: tier + brand -> pitch email + one-page proposal + close question
// ----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");

// Music KB v2 loader (merged v1+v2 JSON)
const musicKB = require("./Utils/musicKnowledge");
let MUSIC_DB = null;
let MUSIC_ARTISTS = [];
let MUSIC_TITLES = [];

function loadMusicDbOnce() {
  try {
    MUSIC_DB = musicKB.loadDb();
    const moments = (MUSIC_DB && MUSIC_DB.moments) || [];
    const artistSet = new Set();
    const titleSet = new Set();
    for (const m of moments) {
      if (m?.artist) artistSet.add(m.artist);
      if (m?.title) titleSet.add(m.title);
    }
    MUSIC_ARTISTS = Array.from(artistSet);
    MUSIC_TITLES = Array.from(titleSet);
  } catch {
    MUSIC_DB = { moments: [] };
    MUSIC_ARTISTS = [];
    MUSIC_TITLES = [];
  }
}
loadMusicDbOnce();

// Optional session store (safe fallback if missing)
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

const BUILD_TAG = "nyx-broadcast-ready-v1.18-2025-12-16";

// Micro-tuned offline fallback (calm, confident, no apology)
const OFFLINE_FALLBACK = "I’m here. What’s the goal?";

// ---------------------------------------------------------
// META NORMALIZATION
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
    hasEntered: m.hasEntered === true,
    lastDomain: m.lastDomain || "general",
    lastIntent: m.lastIntent || "statement",
    currentLane: m.currentLane || "general",
    laneDetail: m.laneDetail || {},
    laneAge: Number(m.laneAge || 0),
    mode,
    access,
    conversationState: m.conversationState || "active"
  };
}

function shouldUseOpenAI(meta) {
  if (meta.mode === "offline") return false;
  if (meta.mode === "online") return !!openai;
  return !!openai; // auto
}

// ---------------------------------------------------------
// TEXT HELPERS
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

// STRICT: pure greetings (baseline)
function isPureGreeting(text) {
  const t = norm(text);
  if (!t) return false;
  const full = new Set([
    "hi", "hello", "hey", "yo",
    "hi nyx", "hello nyx", "hey nyx",
    "good morning", "good afternoon", "good evening",
    "good morning nyx", "good afternoon nyx", "good evening nyx"
  ]);
  if (full.has(t)) return true;
  if (t === "nyx") return true;
  return false;
}

// ROBUST: greeting-like (fixes “Hi Nyx” -> OFFLINE_FALLBACK)
function isGreetingLike(text) {
  const t = norm(text);
  if (!t) return false;
  const patterns = [
    /^hi\b/, /^hello\b/, /^hey\b/, /^yo\b/,
    /^good morning\b/, /^good afternoon\b/, /^good evening\b/
  ];
  if (patterns.some((p) => p.test(t))) {
    if (t === "hi nyx" || t === "hey nyx" || t === "hello nyx") return true;
    if (t.includes(" nyx")) return true;
    if (t.split(" ").length <= 5) return true; // “hi there nyx pls”
  }
  return false;
}

// Prefer musicKB detector, but keep local logic as a backstop
function looksMusicHistoryQuery(text) {
  const t = norm(text);
  if (musicKB?.looksLikeMusicHistory && musicKB.looksLikeMusicHistory(t)) return true;
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

// MUSIC FLOW LOCK: resolve chart explicitly from text
function resolveChartFromText(text) {
  const t = norm(text);
  if (t.includes("uk") || t.includes("official charts")) return "UK Singles Chart";
  if (t.includes("canada") || t.includes("rpm")) return "Canada RPM";
  if (t.includes("top40weekly") || t.includes("top 40 weekly") || t.includes("top 40")) return "Top40Weekly";
  if (t.includes("hot 100") || t.includes("billboard")) return "Billboard Hot 100";
  return null;
}

// MUSIC FLOW LOCK: detect question type (#1 / peak / weeks / when / anchor)
function detectMusicQuestionType(text) {
  const t = norm(text);
  if (t.includes("#1") || t.includes("number 1") || t.includes("no 1") || t.includes("no. 1")) return "number_one";
  if (t.includes("peak")) return "peak";
  if (t.includes("weeks at") || /\bweeks\b/.test(t)) return "weeks";
  if (t.includes("when was") || t.includes("what year")) return "when";
  return "anchor";
}

function hasNumberOneIntent(text) {
  const t = norm(text);
  return (
    t.includes("#1") || t.includes("# 1") ||
    t.includes("no 1") || t.includes("no. 1") ||
    t.includes("number 1") || t.includes("number one")
  );
}

// NEW: conservative artist alias resolver (shorthand -> canonical artist)
// Designed to avoid fuzzy guessing; only expands known broadcast-safe aliases.
function resolveArtistAlias(text) {
  const t = norm(text);

  // IMPORTANT: use word-boundary checks so "whitney #1" and "whitney" both match
  if (/\bwhitney\b/.test(t)) return "Whitney Houston";
  if (/\bmadonna\b/.test(t)) return "Madonna";
  if (/\bprince\b/.test(t)) return "Prince";
  if (/\bmj\b/.test(t)) return "Michael Jackson";
  if (/\bmichael jackson\b/.test(t)) return "Michael Jackson";

  return null;
}

// ---------------------------------------------------------
// SMALL TALK / CHECK-IN (keeps dialog natural; does not hijack real asks)
// ---------------------------------------------------------
function isSmallTalkCheckIn(text) {
  const t = norm(text);
  if (!t) return false;

  // Avoid hijacking real asks (sponsors, music, news, tv, etc.)
  if (
    looksMusicHistoryQuery(t) ||
    looksLikeSponsorPackageAsk(t) ||
    t.includes("news") ||
    t.includes("tv") ||
    t.includes("radio") ||
    t.includes("sponsor") ||
    t.includes("package")
  ) return false;

  const patterns = [
    /^how are you\b/,
    /^how r u\b/,
    /^how you doing\b/,
    /^how's it going\b/,
    /^hows it going\b/,
    /^what's up\b/,
    /^whats up\b/,
    /^how are things\b/,
    /^how is your day\b/,
    /^how's your day\b/,
    /^hows your day\b/
  ];

  return patterns.some((p) => p.test(t));
}

// ---------------------------------------------------------
// CLOSING / FAREWELL
// ---------------------------------------------------------
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
// TONE & FOLLOW-UP GUARANTEE
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
  if (closing?.type === "hard") return base;
  if (hasNextStepOrQuestion(base)) return base;

  if (domain === "music_history") {
    const chart = laneDetail?.chart || "Billboard Hot 100";
    const artist = laneDetail?.artist ? String(laneDetail.artist).toUpperCase() : null;
    const year = laneDetail?.year ? String(laneDetail.year) : null;

    if (artist && year) {
      return base + `\n\nNext step: tell me the song title for ${artist} in ${year}, or ask “was it #1?” If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${chart}).`;
    }
    if (artist && !year) {
      return base + `\n\nNext step: give me a year (e.g., 1992) or a song title. If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${chart}).`;
    }
    return base + `\n\nNext step: give me an artist + year (or a song title). If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${chart}).`;
  }

  return base + "\n\nNext step: " + pickNaturalFollowup(base);
}

function matureTone(reply) {
  let r = String(reply || "");
  r = r.replace(/!!+/g, "!");
  return r.trim();
}

// ---------------------------------------------------------
// OFFLINE DOMAIN FALLBACKS (no front-door repetition mid-thread)
// ---------------------------------------------------------
function offlineDomainFallback(domain, laneDetail, userMessage) {
  const d = String(domain || "general").toLowerCase();
  const seed = `${d}|${norm(userMessage || "")}|${laneDetail?.chart || ""}`;

  const variants = {
    sponsors: [
      "Sponsor package — got it. Quick check: is this for Sandblast TV, Radio, Web, or a bundle? And what budget range should I build around?",
      "Understood. For the sponsor package: what category (food, telecom, retail, etc.) and do you want on-air spots, web placement, or both?",
      "Got it. Sponsor package next: do you want a one-pager offer or a full deck, and who’s the target sponsor?"
    ],
    general: [
      "Understood. What’s the goal — and what does success look like in one sentence?",
      "Got it. What are we trying to accomplish right now?"
    ]
  };

  const pickFrom = variants[d] || variants.general;
  return hashPick(seed, pickFrom);
}

// ---------------------------------------------------------
// SPONSOR MODE v1 + v1.1 DELIVERABLES
// ---------------------------------------------------------
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

function looksLikeSponsorPackageAsk(text = "") {
  const t = norm(text);
  return (
    t.includes("sponsor package") ||
    t.includes("sponsorship package") ||
    t.includes("media kit") ||
    t.includes("rate card") ||
    t.includes("advertise") ||
    t.includes("advertising") ||
    t.includes("sponsor") ||
    t.includes("partnership") ||
    t.includes("partner") ||
    t.includes("pricing") ||
    t.includes("rates")
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

function buildSponsorDeliverables(tier, brand) {
  const T = String(tier || "").toLowerCase();
  const B = String(brand || "").trim();

  const baseClose = `\n\nWho should this be addressed to (name & email), or should I keep it generic for now?`;

  if (T === "starter") {
    return (
`**Email Pitch (Starter — ${B})**

Subject: ${B} x Sandblast Starter Sponsorship Opportunity

Hi [Contact Name],

I’m reaching out from Sandblast Channel — a Canada-wide platform blending culture, music, news, and community storytelling across **website, radio, and TV-style blocks**.

We’d love to feature ${B} as a **Starter Tier sponsor**:
• Website logo placement + short blurb  
• 1 sponsored mention on Sandblast Radio  
• 1 community highlight (when applicable)

This is a cost-effective way to boost visibility and align with engaged audiences.

Best,  
[Your Name/Role]  
Sandblast Channel  
[Phone] | [Email] | https://sandblast.channel

---

**One-Page Proposal — Starter (${B})**

**Sponsor:** ${B}  
**Tier:** Starter ($100–$300)

**Objective**
Drive brand visibility and recognition across Sandblast web + radio + TV-style blocks.

**Deliverables**
• Website logo + short blurb  
• 1 sponsored radio mention  
• 1 community highlight (when applicable)

**Next Steps**
• Confirm start date  
• Provide branding assets (logo + tagline)  
• Confirm approvals/workflow${baseClose}`
    );
  }

  if (T === "growth") {
    return (
`**Email Pitch (Growth — ${B})**

Subject: ${B} x Sandblast Growth Sponsorship (Multi-Platform)

Hi [Contact Name],

Sandblast Channel is a Canada-wide digital media platform blending culture, music, and community storytelling across **website, radio, and TV-style blocks**. We’re opening a **Growth Tier** sponsorship slot for ${B}.

Growth Tier includes:
• Priority website sponsor placement  
• Multiple sponsored mentions on Sandblast Radio  
• A sponsored segment/feature placement  
• Optional short branded message read by host

If you share your campaign goal (awareness vs. traffic vs. conversion), I’ll tailor the exact deliverables and schedule.

Best,  
[Your Name/Role]  
Sandblast Channel  

---

**One-Page Proposal — Growth (${B})**

**Sponsor:** ${B}  
**Tier:** Growth ($500–$1,500)

**Objective**
Boost brand recall through repeated exposure across multi-platform Sandblast inventory.

**Deliverables**
• Priority website placement  
• Multiple radio mentions  
• Sponsored segment/feature  
• Optional host-read branded message

**Next Steps**
• Confirm target goal + run dates  
• Provide assets + brand guidelines  
• Approvals/workflow${baseClose}`
    );
  }

  // Premium
  return (
`**Email Pitch (Premium — ${B})**

Subject: ${B} x Sandblast Premium Sponsorship (Featured + Branded Segment)

Hi [Contact Name],

We’re inviting ${B} to become a **Premium Sponsor** on Sandblast Channel — Canada-wide visibility across **web, radio, and TV-style blocks**, with a featured presence and branded integration.

Premium includes:
• Featured website placement (hero/featured sponsor)  
• Recurring radio sponsorship block  
• TV-style block integration or branded segment  
• Custom campaign alignment with Sandblast programming

If you confirm your preferred theme (culture, lifestyle, community, music) and timeline, I’ll draft the full premium concept and placements.

Best,  
[Your Name/Role]  
Sandblast Channel  

---

**One-Page Proposal — Premium (${B})**

**Sponsor:** ${B}  
**Tier:** Premium ($2,000+)

**Objective**
Establish category authority through featured placements + branded integration.

**Deliverables**
• Hero/featured website placement  
• Recurring radio sponsorship block  
• TV-style branded integration/segment  
• Custom campaign alignment

**Next Steps**
• Confirm theme + run dates  
• Provide assets + brand guidelines  
• Approvals/workflow${baseClose}`
  );
}

// ---------------------------------------------------------
// MUSIC LANE (using musicKnowledge v2)
// ---------------------------------------------------------
const MUSIC_DEFAULT_CHART = "Billboard Hot 100";

function detectArtistFromDb(text) {
  const t = norm(text);
  if (!t || !MUSIC_ARTISTS.length) return null;

  // conservative: match full artist phrase (normalized)
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

  const ok = /^[a-zA-Z\s'\-\.&]{3,60}$/.test(raw);
  if (!ok) return false;

  const t = norm(raw);
  if (looksMusicHistoryQuery(t)) return false;
  if (looksLikeChartName(t)) return false;
  if (isGreetingOrFiller(t)) return false;

  const banned = ["music", "radio", "chart", "charts", "billboard", "top", "song", "songs", "album", "albums"];
  if (banned.some((w) => t === w || t.includes(w + " "))) return false;

  return true;
}

function momentFields(m) {
  // supports both v1-style (fact/culture/next) and v2-style (chart_fact/cultural_moment/next_step)
  const fact = m?.chart_fact || m?.fact || "";
  const culture = m?.cultural_moment || m?.culture || "";
  const next = m?.next_step || m?.next || "";
  return { fact, culture, next };
}

function answerMusicHistoryOffline(message, laneDetail) {
  const detail = laneDetail || {};
  const year = musicKB?.extractYear ? musicKB.extractYear(message) : extractYear(message);

  // Year-only anchoring
  if (year) {
    if (detail.artist) {
      return {
        handled: true,
        reply: `Locked: ${String(detail.artist).toUpperCase()} in ${year}. Give me a song title, or ask “Was it #1?” and I’ll anchor the chart moment.`,
        metaPatch: { ...detail, year }
      };
    }
    return { handled: true, reply: `Noted: ${year}. Which artist are we anchoring?`, metaPatch: { ...detail, year } };
  }

  // Artist-only anchoring
  if (looksLikeArtistOnly(message)) {
    const artistGuess = detail.artist || detectArtistFromDb(message) || resolveArtistAlias(message) || message.trim();
    return {
      handled: true,
      reply: `Got it — ${String(artistGuess).toUpperCase()}. Pick a year (e.g., 1992) or give me a song title and I’ll anchor the chart moment.`,
      metaPatch: { ...detail, artist: artistGuess }
    };
  }

  // Best moment selection from DB
  const artist = detail.artist || detectArtistFromDb(message) || resolveArtistAlias(message);
  const title = detail.title || detectTitleFromDb(message);
  const chart = detail.chart || MUSIC_DEFAULT_CHART;

  const best = musicKB?.pickBestMoment
    ? musicKB.pickBestMoment(MUSIC_DB, { artist, title, year: detail.year, chart })
    : null;

  if (!best) {
    return { handled: true, reply: "To anchor the moment, give me an artist + year (or a song title).", metaPatch: detail };
  }

  const f = momentFields(best);
  const chartName = chart || best.chart || MUSIC_DEFAULT_CHART;

  return {
    handled: true,
    reply:
      `Chart fact: ${f.fact || "Anchor found."} (${chartName})` +
      `\nCultural thread: ${f.culture || "This was a defining radio-era moment for its sound and reach."}` +
      `\nNext step: ${f.next || "Want the exact chart week/date, or a fuller #1 timeline?"}`,
    metaPatch: {
      ...detail,
      artist: best.artist,
      title: best.title,
      year: best.year
    }
  };
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

    const isFirstTurn = !meta.hasEntered && meta.stepIndex === 0;
    if (!meta.hasEntered) meta.hasEntered = true;

    // 1) Greeting handler (robust)
    if (isPureGreeting(clean) || isGreetingLike(clean) || (isFirstTurn && isGreetingOrFiller(clean))) {
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
        hasEntered: true
      };

      appendTurn(meta.sessionId, { role: "user", content: clean });
      appendTurn(meta.sessionId, { role: "assistant", content: reply });
      upsertSession(meta.sessionId, session);

      return res.json({ ok: true, reply, domain: "general", intent: "greeting", meta: updatedMeta });
    }

    // 2) Closing handler
    const closing = detectClosingIntent(clean);
    if (closing.type !== "none") {
      const reply = farewellReply(meta, closing.type);

      const updatedMeta = {
        ...meta,
        stepIndex: meta.stepIndex + 1,
        lastDomain: meta.currentLane || "general",
        lastIntent: "closing",
        conversationState: (closing.type === "hard") ? "ended" : "active",
        hasEntered: true
      };

      appendTurn(meta.sessionId, { role: "user", content: clean });
      appendTurn(meta.sessionId, { role: "assistant", content: reply });
      upsertSession(meta.sessionId, session);

      return res.json({ ok: true, reply, domain: updatedMeta.lastDomain, intent: "closing", meta: updatedMeta });
    }

    // 2.5) Small-talk / check-in handler (human beat, then pivot)
    if (isSmallTalkCheckIn(clean)) {
      const replyRaw =
        "I’m doing well — thanks for asking. What would you like to explore today? (Music history, Sandblast TV, News Canada, or Sponsors)";
      const reply = matureTone(replyRaw);

      const updatedMeta = {
        ...meta,
        stepIndex: meta.stepIndex + 1,
        lastDomain: "general",
        lastIntent: "smalltalk",
        currentLane: "general",
        laneDetail: meta.laneDetail || {},
        laneAge: meta.laneAge || 0,
        conversationState: "active",
        hasEntered: true
      };

      appendTurn(meta.sessionId, { role: "user", content: clean });
      appendTurn(meta.sessionId, { role: "assistant", content: reply });
      upsertSession(meta.sessionId, session);

      const payload = { ok: true, reply, domain: "general", intent: "smalltalk", meta: updatedMeta };
      if (meta.access === "admin") payload.debug = { build: BUILD_TAG, mode: meta.mode, smalltalk: true };
      return res.json(payload);
    }

    const raw = classifyIntent(clean);

    let domain =
      (raw.domain === "music_history" || raw.intent === "music_history") ? "music_history"
      : (raw.domain || meta.currentLane || "general");

    const messageLooksLikeMusic = looksMusicHistoryQuery(clean);
    const detectedArtist = detectArtistFromDb(clean);
    const detectedTitle = detectTitleFromDb(clean);
    const isYearOnly = isYearOnlyMessage(clean);
    const artistOnly = looksLikeArtistOnly(clean);

    if (messageLooksLikeMusic || detectedArtist || detectedTitle || artistOnly || meta.currentLane === "music_history") {
      domain = "music_history";
    }

    let laneDetail = { ...(meta.laneDetail || {}) };

    // Sponsor fast-path (deterministic)
    if (domain === "sponsors" || meta.currentLane === "sponsors" || looksLikeSponsorPackageAsk(clean)) {
      const tier = extractSponsorTier(clean);
      const brand = extractSponsorBrand(clean);

      let reply = "";
      if (tier && brand) reply = matureTone(buildSponsorDeliverables(tier, brand));
      else reply = matureTone(buildSponsorPackageV1());

      const updatedMeta = {
        ...meta,
        stepIndex: meta.stepIndex + 1,
        lastDomain: "sponsors",
        lastIntent: raw.intent || "sponsors",
        currentLane: "sponsors",
        laneDetail: { tier, brand },
        laneAge: meta.laneAge + 1,
        hasEntered: true
      };

      appendTurn(meta.sessionId, { role: "user", content: clean });
      appendTurn(meta.sessionId, { role: "assistant", content: reply });
      upsertSession(meta.sessionId, session);

      return res.json({ ok: true, reply, domain: "sponsors", intent: raw.intent || "sponsors", meta: updatedMeta });
    }

    // Music lane (offline-first; LOCKED FLOW)
    if (domain === "music_history") {
      // Chart resolution (explicit from message wins)
      const inferredChart = resolveChartFromText(clean);
      if (inferredChart) laneDetail.chart = inferredChart;
      if (!laneDetail.chart) laneDetail.chart = MUSIC_DEFAULT_CHART;

      // Question type (stored for future expansion)
      laneDetail.questionType = detectMusicQuestionType(clean);

      // NEW: Alias resolution BEFORE slot filling
      const aliasArtist = resolveArtistAlias(clean);
      if (aliasArtist && !laneDetail.artist) laneDetail.artist = aliasArtist;

      // Save detected artist/title when present
      if (detectedArtist) laneDetail.artist = detectedArtist;
      if (detectedTitle) laneDetail.title = detectedTitle;
      if (artistOnly) laneDetail.artist = clean.trim();
      if (isYearOnly) laneDetail.year = extractYear(clean);

      // ---- SLOT-FILLING FIX (P2) ----
      // If user already gave artist + #1 intent but missing year and title, ask ONLY for year or title.
      const hasArtist = !!laneDetail.artist;
      const hasTitle = !!laneDetail.title;
      const hasYear = !!laneDetail.year;
      if (hasArtist && hasNumberOneIntent(clean) && !hasTitle && !hasYear) {
        const reply = matureTone(
          `Got it — ${String(laneDetail.artist).toUpperCase()} #1. Give me a year (e.g., 1992) or a song title and I’ll anchor the chart moment.`
        );

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

        return res.json({ ok: true, reply, domain: "music_history", intent: raw.intent, meta: updatedMeta });
      }

      const kb = answerMusicHistoryOffline(clean, laneDetail);
      if (kb?.handled) {
        if (kb.metaPatch && typeof kb.metaPatch === "object") laneDetail = { ...laneDetail, ...kb.metaPatch };

        let reply = matureTone(kb.reply);
        reply = appendNextStep(reply, "music_history", laneDetail, closing);
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

        return res.json({ ok: true, reply, domain: "music_history", intent: raw.intent, meta: updatedMeta });
      }
    }

    // OpenAI path (quiet failure)
    const useOpenAI = shouldUseOpenAI(meta);
    let reply = "";
    if (useOpenAI) {
      try {
        const systemPrompt =
          (domain === "music_history")
            ? "You are Nyx — calm, concise, and broadcast-professional. Provide: one chart fact, one cultural note, and one natural follow-up. If missing required info, ask one precise clarifying question."
            : "You are Nyx — calm, concise, and broadcast-professional. Answer clearly, then guide forward with one natural follow-up.";

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

    // Quiet fallback
    if (!reply) {
      if (domain === "music_history") {
        reply = "Tell me an artist + year (or a song title) and I’ll anchor the chart moment.";
      } else {
        reply = isFirstTurn ? OFFLINE_FALLBACK : offlineDomainFallback(domain, laneDetail, clean);
      }
    }

    reply = matureTone(reply);
    reply = appendNextStep(reply, domain, laneDetail, closing);
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

    return res.json({ ok: true, reply, domain, intent: raw.intent, meta: updatedMeta });

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
  console.log(`[Nyx] Broadcast-ready v1.18 on port ${PORT} | build=${BUILD_TAG}`);
});
