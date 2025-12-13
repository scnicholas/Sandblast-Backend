//----------------------------------------------------------
// Sandblast Nyx Backend — Hybrid Brain
// OpenAI (Responses API) + Local Fallback + Lane Memory + Dynamic Detail
// Suggestive Intelligence + Emotional Layer + Site Links
// + Uses: history/clientContext/resolutionHint + public/admin + closing state
//----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality");

const app = express();

// Body + CORS hardening
app.use(express.json({ limit: "1mb" }));

const corsOptions = {
  origin: true, // reflect origin
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
};
app.use(cors(corsOptions));

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const NYX_VOICE_ID = process.env.NYX_VOICE_ID;

// Model selection (override in Render if you want)
const NYX_MODEL = process.env.NYX_MODEL || "gpt-5.2";

// OpenAI client (Responses API)
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

//----------------------------------------------------------
// META HELPERS
//----------------------------------------------------------
function cleanMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return {
      stepIndex: 0,
      lastDomain: "general",
      lastIntent: "statement",
      lastGoal: null,
      sessionId: "nyx-" + Date.now(),
      currentLane: null,
      laneDetail: {},
      lastSuggestionStep: 0,
      moodState: "steady",
      laneAge: 0,
      presetMode: null,
      stepPhase: null,
      saveHintShown: false,

      // widget fields
      access: "public", // "public" | "admin" (tactical mode, not secret auth)
      conversationState: "active" // "active" | "closing" | "closed"
    };
  }

  return {
    stepIndex: typeof meta.stepIndex === "number" ? meta.stepIndex : 0,
    lastDomain: meta.lastDomain || "general",
    lastIntent: meta.lastIntent || "statement",
    lastGoal: meta.lastGoal || null,
    sessionId: meta.sessionId || "nyx-" + Date.now(),
    currentLane: typeof meta.currentLane === "string" ? meta.currentLane : null,
    laneDetail:
      typeof meta.laneDetail === "object" && meta.laneDetail !== null
        ? meta.laneDetail
        : {},
    lastSuggestionStep:
      typeof meta.lastSuggestionStep === "number" ? meta.lastSuggestionStep : 0,
    moodState: meta.moodState || "steady",
    laneAge: typeof meta.laneAge === "number" ? meta.laneAge : 0,
    presetMode: meta.presetMode || null,
    stepPhase: meta.stepPhase || null,
    saveHintShown: !!meta.saveHintShown,

    access: meta.access === "admin" ? "admin" : "public",
    conversationState:
      meta.conversationState === "closing" || meta.conversationState === "closed"
        ? meta.conversationState
        : "active"
  };
}

function isAdminMessage(body) {
  if (!body || typeof body !== "object") return false;
  const { adminToken, message } = body;
  if (adminToken && process.env.ADMIN_SECRET && adminToken === process.env.ADMIN_SECRET) return true;
  if (typeof message === "string" && message.trim().startsWith("::admin")) return true;
  return false;
}

//----------------------------------------------------------
// EMOTIONAL / MOOD DETECTION
//----------------------------------------------------------
function detectMoodState(message) {
  const text = (message || "").trim().toLowerCase();
  if (!text) return "steady";

  const frustratedWords = [
    "annoyed",
    "upset",
    "angry",
    "pissed",
    "fed up",
    "this is not working",
    "why is this",
    "frustrated",
    "bug",
    "broken"
  ];
  const overwhelmedWords = [
    "overwhelmed",
    "too much",
    "too many",
    "i can't keep up",
    "i cant keep up",
    "i can't handle",
    "i cant handle",
    "this is a lot"
  ];
  const excitedWords = [
    "excited",
    "hyped",
    "let's go",
    "lets go",
    "this is great",
    "this is amazing",
    "love this"
  ];
  const tiredWords = [
    "tired",
    "exhausted",
    "drained",
    "worn out",
    "need rest",
    "need a break"
  ];

  if (frustratedWords.some((w) => text.includes(w))) return "frustrated";
  if (overwhelmedWords.some((w) => text.includes(w))) return "overwhelmed";
  if (excitedWords.some((w) => text.includes(w))) return "excited";
  if (tiredWords.some((w) => text.includes(w))) return "tired";

  return "steady";
}

//----------------------------------------------------------
// LANE RESOLUTION
//----------------------------------------------------------
function resolveLaneDomain(classification, meta, message) {
  const text = (message || "").trim().toLowerCase();
  let domain = classification?.domain || "general";

  const laneDomains = [
    "tv",
    "radio",
    "nova",
    "sponsors",
    "ai_help",
    "ai_consulting",
    "tech_support",
    "business_support",
    "news",
    "news_canada"
  ];

  const isLaneDomain = laneDomains.includes(domain);

  const wantsSwitch =
    text.includes("switch to tv") ||
    text.includes("switch to radio") ||
    text.includes("switch to nova") ||
    text.includes("switch to sponsor") ||
    text.includes("switch to sponsors") ||
    text.includes("switch to ai") ||
    text.includes("switch to tech") ||
    text.includes("switch to technical") ||
    text.includes("now tv") ||
    text.includes("now radio") ||
    text.includes("now nova") ||
    text.includes("now sponsors") ||
    text.includes("now ai") ||
    text.includes("now tech");

  if (text.includes("sponsor pitch helper") || text.includes("sponsor pitch")) return "sponsors";
  if (text.includes("tv grid tuner") || text.includes("tv grid")) return "tv";
  if (text.includes("ai for job seekers") || text.includes("ai for job-seekers")) return "ai_help";
  if (text.includes("news canada")) return "news_canada";

  if (isLaneDomain || wantsSwitch) return domain;

  if (domain === "general" && meta.currentLane && meta.currentLane !== "general") {
    return meta.currentLane;
  }

  return domain;
}

//----------------------------------------------------------
// LANE DETAIL EXTRACTION
//----------------------------------------------------------
function extractLaneDetail(domain, text, prevDetail = {}) {
  const detail = { ...prevDetail };
  const lower = (text || "").toLowerCase();

  function matchMap(map, field) {
    for (const key in map) {
      const patterns = map[key];
      if (patterns.some((p) => lower.includes(p))) {
        detail[field] = key;
        break;
      }
    }
  }

  if (domain === "tv") {
    matchMap(
      {
        detective: ["detective", "crime", "cop show", "police drama"],
        western: ["western", "cowboy"],
        family: ["family", "family night", "family-friendly", "family friendly"],
        comedy: ["sitcom", "comedy"],
        scifi: ["sci-fi", "science fiction", "space"],
        horror: ["horror", "thriller"],
        kids: ["kids", "cartoon", "children"]
      },
      "mood"
    );

    matchMap(
      {
        "late-night": ["late-night", "late night"],
        weeknight: ["weeknight"],
        weekend: ["weekend"],
        saturday: ["saturday"],
        sunday: ["sunday"],
        morning: ["morning"],
        afternoon: ["afternoon"],
        evening: ["evening", "prime time", "primetime"]
      },
      "timeOfDay"
    );

    const timeMatch = lower.match(/(\b\d{1,2}\s?(am|pm)\b)/);
    if (timeMatch) detail.startTime = timeMatch[1];

    matchMap(
      {
        "slow-burn": ["slow burn", "slow-burn", "slow pace"],
        "fast-cut": ["fast cut", "fast-cut", "high energy", "fast paced", "fast-paced"]
      },
      "pace"
    );

    matchMap(
      {
        "50s": ["1950s", "50s", "50's"],
        "60s": ["1960s", "60s", "60's"],
        "70s": ["1970s", "70s", "70's"],
        "80s": ["1980s", "80s", "80's"],
        "90s": ["1990s", "90s", "90's"]
      },
      "decade"
    );

    matchMap(
      { kids: ["kids", "children"], family: ["family"], adults: ["adults", "grown-ups", "grown ups"] },
      "targetAge"
    );
  }

  if (domain === "radio" || domain === "nova") {
    matchMap(
      {
        "late-night": ["late-night", "late night"],
        gospel: ["gospel"],
        "retro party": ["retro party", "party set", "party vibe"],
        chill: ["chill", "smooth", "laid back"],
        "quiet storm": ["quiet storm", "slow jam", "slow jams"],
        "90s": ["90s", "90's"],
        "80s": ["80s", "80's"],
        rnb: ["r&b", "rnb"],
        jazz: ["jazz"],
        soul: ["soul"]
      },
      "mood"
    );

    const lenMatch = lower.match(/(\d+)\s?(hour|hours|hr|hrs|minute|minutes|min)/);
    if (lenMatch) detail.length = lenMatch[0];
    if (lower.includes("half hour") || lower.includes("half-hour")) detail.length = "30 minutes";

    matchMap(
      {
        "more-music": ["mostly music", "more music", "just music"],
        balanced: ["mix of talk", "some talk", "bit of talk"],
        "talk-heavy": ["more talk", "mostly talk", "talk show"]
      },
      "talkRatio"
    );

    matchMap(
      {
        "soft-curve": ["slow build", "start soft"],
        "high-energy": ["high energy", "upbeat", "hype"],
        "drop-then-rise": ["drop off", "wind down then up"]
      },
      "energyCurve"
    );
  }

  if (domain === "sponsors") {
    matchMap(
      {
        restaurant: ["restaurant", "diner", "cafe", "coffee shop", "eatery"],
        gym: ["gym", "fitness", "training center"],
        church: ["church", "ministry"],
        grocery: ["grocery", "supermarket"],
        salon: ["salon", "barbershop", "barber"],
        clinic: ["clinic", "pharmacy", "medical"],
        auto: ["car dealer", "auto shop", "mechanic", "dealership"]
      },
      "businessType"
    );

    matchMap(
      {
        low: ["small budget", "low budget", "starter", "test budget"],
        medium: ["mid budget", "medium budget"],
        high: ["big budget", "large budget", "premium"]
      },
      "budgetTier"
    );

    matchMap(
      { serious: ["serious", "professional", "formal"], playful: ["fun", "playful", "light"], community: ["community", "local roots"] },
      "brandTone"
    );
  }

  if (domain === "ai_help" || domain === "ai_consulting") {
    matchMap(
      {
        "job-seekers": ["job seeker", "job-seeker", "resume", "cv", "cover letter"],
        "small-business": ["small business", "small-business", "local business"],
        sponsors: ["sponsor", "sponsors", "advertiser", "client"],
        students: ["student", "students", "school", "college", "university"]
      },
      "audience"
    );
  }

  if (domain === "tech_support") {
    matchMap(
      {
        webflow: ["webflow"],
        render: ["render", "onrender.com"],
        backend: ["backend", "server", "index.js", "express"],
        api: ["api", "endpoint", "cannot get", "404", "500"],
        tts: ["tts", "elevenlabs", "voice", "audio"]
      },
      "area"
    );
  }

  if (domain === "business_support") {
    matchMap(
      {
        grant: ["grant", "funding", "proposal"],
        pitch: ["pitch", "deck", "presentation"],
        store: ["store", "grocery", "retail"],
        consulting: ["consulting", "client work", "service package"]
      },
      "projectType"
    );
  }

  return detail;
}

//----------------------------------------------------------
// HESITATION DETECTION
//----------------------------------------------------------
function isHesitationMessage(message) {
  const text = (message || "").trim().toLowerCase();
  if (!text) return true;

  const veryShort = text.length <= 4;
  const onlyPunct = /^[\.\?\!\s]+$/.test(text);

  const patterns = [
    "idk",
    "i dont know",
    "i don't know",
    "not sure",
    "you pick",
    "you choose",
    "up to you",
    "whatever",
    "any",
    "continue",
    "go on",
    "what next",
    "next?",
    "hmm",
    "hm",
    "ok",
    "okay"
  ];

  if (veryShort || onlyPunct) return true;
  if (patterns.some((p) => text.includes(p))) return true;

  return false;
}

//----------------------------------------------------------
// BUILD LANE-AWARE SUGGESTION
//----------------------------------------------------------
function buildLaneSuggestion(domain, laneDetail, step) {
  if (step >= 2) return null;

  const detail = laneDetail || {};

  if (step === 0) {
    switch (domain) {
      case "tv":
        return detail.mood
          ? `If you want, we can choose one ${detail.mood} show that fits the block and shape around it.`
          : `If you want, we can pick the next part — the mood, the shows, or the timing. One piece is enough.`;

      case "radio":
      case "nova":
        return detail.mood
          ? `If you want, we can choose one anchor track or transition that holds that ${detail.mood} vibe.`
          : `If you want, we can set one anchor track or transition to carry the mood for this block.`;

      case "sponsors":
        return detail.businessType
          ? `If you want, we can shape one simple offer for a ${detail.businessType} — like a short test run or a few on-air mentions.`
          : `If you want, we can define one simple sponsor offer around a block — nothing complicated.`;

      case "ai_help":
      case "ai_consulting":
        return detail.audience
          ? `If you want, we can start with one small AI task that helps ${detail.audience} — writing, summarizing, or outlining.`
          : `If you want, we can pick one small AI task — writing, summarizing, or outlining something you already have.`;

      case "tech_support":
        return detail.area
          ? `If you want, we can fix one small piece of the ${detail.area} issue first — just pick where to start.`
          : `If you want, we can tackle one part of the tech first — backend, widget, or endpoint.`;

      case "business_support":
        return detail.projectType
          ? `If you want, we can set one clear next step for this ${detail.projectType} so it feels less heavy.`
          : `If you want, we can choose one project and give it a single clear next step.`;

      default:
        return `If you want, we can take one small step — just tell me what you feel like shaping first.`;
    }
  }

  return `We can keep this simple… one small next step is enough when you’re ready.`;
}

//----------------------------------------------------------
// STEP PHASE HELPER
//----------------------------------------------------------
function computeStepPhase(domain, laneDetail) {
  if (domain === "tv") {
    if (!laneDetail.mood) return "tv:vibe";
    if (!laneDetail.startTime && !laneDetail.timeOfDay) return "tv:timing";
    return "tv:refine";
  }

  if (domain === "radio" || domain === "nova") {
    if (!laneDetail.mood) return "radio:vibe";
    if (!laneDetail.length) return "radio:length";
    return "radio:refine";
  }

  if (domain === "sponsors") {
    if (!laneDetail.businessType) return "sponsors:type";
    if (!laneDetail.budgetTier) return "sponsors:budget";
    return "sponsors:offer";
  }

  return null;
}

//----------------------------------------------------------
// UI LINK BUILDER
//----------------------------------------------------------
function buildUiLinks(domain) {
  const links = [];

  if (domain === "tv") {
    links.push({ label: "TV overview (sandblast.channel)", url: "https://www.sandblast.channel#tv" });
    links.push({ label: "TV portal (sandblastchannel.com)", url: "https://www.sandblastchannel.com" });
  } else if (domain === "radio" || domain === "nova") {
    links.push({ label: "Radio on sandblast.channel", url: "https://www.sandblast.channel#radio" });
    links.push({ label: "Live radio / stream portal", url: "https://www.sandblastchannel.com" });
  } else if (domain === "news" || domain === "news_canada") {
    links.push({ label: "News Canada hub", url: "https://www.sandblastchannel.com" });
    links.push({ label: "News Canada on sandblast.channel", url: "https://www.sandblast.channel#news-canada" });
  } else if (domain === "sponsors" || domain === "business_support") {
    links.push({ label: "Ad Space overview (sandblast.channel)", url: "https://www.sandblast.channel#ad-space" });
    links.push({ label: "Sandblast portal (sandblastchannel.com)", url: "https://www.sandblastchannel.com" });
  } else {
    links.push({ label: "Main site (sandblast.channel)", url: "https://www.sandblast.channel" });
    links.push({ label: "Broadcast portal (sandblastchannel.com)", url: "https://www.sandblastchannel.com" });
  }

  return links;
}

//----------------------------------------------------------
// LOCAL BRAIN
//----------------------------------------------------------
function localBrainReply(message, classification, meta) {
  const domain = classification?.domain || "general";
  const intent = classification?.intent || "statement";
  const detail = meta?.laneDetail || {};
  const moodState = meta.moodState || "steady";

  const moodPrefix =
    moodState === "frustrated"
      ? "I hear you. Let’s keep this light and clear.\n\n"
      : moodState === "overwhelmed"
      ? "We’ll take this one small step at a time.\n\n"
      : moodState === "tired"
      ? "We can keep this simple so it doesn’t drain you.\n\n"
      : moodState === "excited"
      ? "I love that energy — let’s use it well.\n\n"
      : "";

  if (intent === "greeting") {
    return moodPrefix + "Hey, I’m here. How’s your day going? TV, radio, sponsors, News Canada, or AI?";
  }

  if (intent === "smalltalk") {
    return moodPrefix + "I’m good. What do you want to tune — TV, radio, sponsors, News Canada, or AI?";
  }

  if (domain === "tv") {
    return (
      moodPrefix +
      `Let’s shape one TV block.\n\n` +
      `Tell me the vibe (detective, western, family, etc.) and the rough time slot, and we’ll build around it.`
    );
  }

  if (domain === "radio" || domain === "nova") {
    return (
      moodPrefix +
      `Let’s build a clean radio block.\n\n` +
      `Tell me the mood (late-night, Gospel Sunday, retro party) and the length, and I’ll map a light flow.`
    );
  }

  if (domain === "sponsors") {
    const biz = detail.businessType;
    return (
      moodPrefix +
      `We can keep sponsor offers simple.\n\n` +
      (biz ? `Tell me the sponsor (${biz}) and we’ll sketch a small test package.\n` : `Tell me the sponsor type and budget tier.\n`) +
      `Next action: pick one block to sponsor and run a 4-week test.`
    );
  }

  if (domain === "news" || domain === "news_canada") {
    return (
      moodPrefix +
      `Let’s make News Canada useful inside Sandblast.\n\n` +
      `Tell me: do you want it to feed TV blocks, radio mentions, or web highlights?`
    );
  }

  return (
    moodPrefix +
    `I’m with you.\n\n` +
    `Tell me whether you’re thinking TV, radio, sponsors, News Canada, or AI — and what “done” looks like.`
  );
}

//----------------------------------------------------------
// OPENAI BRAIN (Responses API)
//----------------------------------------------------------
function normalizeHistoryItems(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-12)
    .map((h) => {
      const role = h && h.role === "assistant" ? "assistant" : "user";
      const content = String(h && h.content ? h.content : "").slice(0, 2400);
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

function buildDeveloperContext(meta, classification, clientContext, resolutionHint) {
  const access = meta.access || "public";
  const state = meta.conversationState || "active";

  return (
    `Context:\n` +
    `- access: ${access}\n` +
    `- conversationState: ${state}\n` +
    `- domain: ${classification.domain}\n` +
    `- intent: ${classification.intent}\n` +
    `- confidence: ${classification.confidence}\n` +
    `- sessionId: ${meta.sessionId}\n` +
    `- moodState: ${meta.moodState}\n` +
    `- laneAge: ${meta.laneAge}\n` +
    `- laneDetail: ${JSON.stringify(meta.laneDetail || {})}\n` +
    `- stepPhase: ${meta.stepPhase}\n` +
    `- presetMode: ${meta.presetMode}\n` +
    `- pageUrl: ${String(clientContext?.pageUrl || "")}\n` +
    `- referrer: ${String(clientContext?.referrer || "")}\n` +
    `- timestamp: ${String(clientContext?.timestamp || "")}\n` +
    `- resolutionStyle: ${String(resolutionHint?.resolutionStyle || "Answer clearly. Confirm resolved. One next action.")}\n`
  );
}

function buildSystemPrompt() {
  return (
    `You are Nyx — the AI broadcast brain for Sandblast.\n` +
    `Tone: warm, supportive, concise, collaborative, steady, and forward-moving.\n` +
    `Sandblast is a growing channel, not a giant network — keep advice realistic.\n` +
    `Avoid lectures; focus on the next step.\n\n` +
    `Required behavior:\n` +
    `1) Answer directly with practical steps.\n` +
    `2) Resolution pattern: answer → confirm resolved (or ask ONE tight follow-up) → ONE next action.\n` +
    `3) If conversationState is "closing": DO NOT include a farewell line (the widget appends it). Just give a 1-line wrap-up.\n\n` +
    `Routing by domain:\n` +
    `- tv: programming blocks, timing, show flow, catalog framing.\n` +
    `- radio/nova: music blocks, talk ratio, transitions, DJ Nova scripting.\n` +
    `- sponsors: packages, proof points, test runs, next actions.\n` +
    `- news_canada/news: story placement, segmenting, integration on Sandblast sites.\n` +
    `- ai_help/ai_consulting: workflows, practical AI use.\n` +
    `- tech_support: Webflow/Render/backend/API/TTS troubleshooting.\n\n` +
    `Be TTS-friendly: short sentences. Natural cadence.`
  );
}

async function callBrain({ message, classification, meta, history, clientContext, resolutionHint }) {
  if (classification.intent === "greeting" || classification.intent === "smalltalk") {
    return localBrainReply(message, classification, meta);
  }

  if (!openai) {
    console.warn("[Nyx] No OPENAI_API_KEY set — using local brain.");
    return localBrainReply(message, classification, meta);
  }

  const systemPrompt = buildSystemPrompt();
  const developerContext = buildDeveloperContext(meta, classification, clientContext, resolutionHint);
  const historyItems = normalizeHistoryItems(history);

  const userPrompt = `User message: "${message}".\nUse lane detail + mood state if helpful. Keep it concise.`;

  try {
    const response = await openai.responses.create({
      model: NYX_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "developer", content: developerContext },
        ...historyItems,
        { role: "user", content: userPrompt }
      ]
    });

    const reply = (response.output_text || "").trim();
    return reply || localBrainReply(message, classification, meta);
  } catch (err) {
    console.error("[Nyx] OpenAI error, using local brain:", err?.message || err);
    return localBrainReply(message, classification, meta);
  }
}

//----------------------------------------------------------
// ROUTES
//----------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Sandblast Nyx backend is running.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "sandblast-nyx-backend" });
});

// MAIN BRAIN ENDPOINT
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const {
      message,
      meta: incomingMeta,
      mode,
      history,
      clientContext,
      resolutionHint
    } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "EMPTY_MESSAGE" });
    }

    const clean = message.trim();
    let meta = cleanMeta(incomingMeta);

    // Admin backdoor remains intact
    if (isAdminMessage(req.body)) {
      meta.access = "admin";
      return res.json({
        ok: true,
        admin: true,
        message: "Admin backdoor reached. Debug hooks can live here later.",
        meta
      });
    }

    // Mood
    const moodState = detectMoodState(clean);

    // Classification
    const rawClassification = classifyIntent(clean);
    const effectiveDomain = resolveLaneDomain(rawClassification, meta, clean);
    const classification = { ...rawClassification, domain: effectiveDomain };

    // Lane detail
    const newLaneDetail = extractLaneDetail(classification.domain, clean, meta.laneDetail);

    // Step phase
    const stepPhase = computeStepPhase(classification.domain, newLaneDetail);

    // Lane age
    let laneAge = meta.laneAge || 0;
    if (classification.domain && classification.domain === meta.currentLane) {
      laneAge = laneAge + 1;
    } else {
      laneAge = 1;
    }

    // Personality hooks (kept)
    let frontDoor = null;
    if (nyxPersonality.getFrontDoorResponse) {
      frontDoor = nyxPersonality.getFrontDoorResponse(clean, meta, classification);
    }

    let domainPayload = {};
    if (nyxPersonality.enrichDomainResponse) {
      domainPayload = nyxPersonality.enrichDomainResponse(clean, meta, classification, mode);
    }

    const metaForBrain = {
      ...meta,
      laneDetail: newLaneDetail,
      moodState,
      stepPhase,
      laneAge,
      access: meta.access === "admin" ? "admin" : "public",
      conversationState: meta.conversationState || "active"
    };

    const rawReply = await callBrain({
      message: clean,
      classification,
      meta: metaForBrain,
      history,
      clientContext,
      resolutionHint
    });

    // Micro-transition wrapper (kept)
    let transitionPrefix = "";
    if (stepPhase === "tv:timing") transitionPrefix = "We’ve got the vibe. Now let’s narrow the timing.\n\n";
    else if (stepPhase === "tv:refine") transitionPrefix = "We’ve got the core block. Now we can refine it.\n\n";
    else if (stepPhase === "radio:length") transitionPrefix = "We’ve set the mood. Now let’s set the length.\n\n";
    else if (stepPhase === "radio:refine") transitionPrefix = "The mood and length are there. Now we can polish the flow.\n\n";
    else if (stepPhase === "sponsors:budget") transitionPrefix = "We know the sponsor type. Now we can size the budget.\n\n";
    else if (stepPhase === "sponsors:offer") transitionPrefix = "We know who they are. Now we can define one clear offer.\n\n";

    let finalReply = transitionPrefix + rawReply;

    if (nyxPersonality.wrapWithNyxTone) {
      finalReply = nyxPersonality.wrapWithNyxTone(clean, metaForBrain, classification, finalReply);
    }

    // Suggestive Intelligence (kept)
    let newSuggestionStep = meta.lastSuggestionStep || 0;
    if (isHesitationMessage(clean)) {
      const suggestion = buildLaneSuggestion(classification.domain, newLaneDetail, newSuggestionStep);
      if (suggestion) {
        finalReply = suggestion;
        newSuggestionStep = Math.min(newSuggestionStep + 1, 2);
      }
    } else {
      newSuggestionStep = 0;
    }

    if (laneAge >= 7) {
      finalReply += `\n\nIf you want, we can reset this lane or switch to another — TV, radio, sponsors, News Canada, or AI.`;
    }

    let saveHintShown = meta.saveHintShown || false;
    if (!saveHintShown && laneAge >= 4 && ["tv", "radio", "nova", "sponsors"].includes(classification.domain)) {
      finalReply += `\n\nIf this starts to feel right, we can treat it as a working template for Sandblast.`;
      saveHintShown = true;
    }

    const updatedMeta = {
      ...meta,
      stepIndex: meta.stepIndex + 1,
      lastDomain: classification.domain,
      lastIntent: classification.intent,
      currentLane: classification.domain && classification.domain !== "general" ? classification.domain : meta.currentLane,
      laneDetail: newLaneDetail,
      lastSuggestionStep: newSuggestionStep,
      moodState,
      laneAge,
      stepPhase,
      saveHintShown,
      access: metaForBrain.access,
      conversationState: metaForBrain.conversationState
    };

    const uiHints = {
      laneLabel: classification.domain || "general",
      moodLabel: moodState,
      inputHint:
        classification.domain === "tv"
          ? "Ask about mood, shows, or timing."
          : classification.domain === "radio" || classification.domain === "nova"
          ? "Ask about mood, length, or transitions."
          : classification.domain === "sponsors"
          ? "Ask about sponsor type, budget, or offer."
          : classification.domain === "ai_help" || classification.domain === "ai_consulting"
          ? "Ask about tasks, audience, or use cases."
          : classification.domain === "news" || classification.domain === "news_canada"
          ? "Ask how to use News Canada inside Sandblast."
          : "Ask about TV, radio, sponsors, News Canada, or AI."
    };

    const uiLinks = buildUiLinks(classification.domain);

    res.json({
      ok: true,
      reply: finalReply,
      frontDoor,
      domain: classification.domain,
      intent: classification.intent,
      confidence: classification.confidence,
      domainPayload,
      meta: updatedMeta,
      uiHints,
      uiLinks,
      links: uiLinks // alias for widget compatibility
    });
  } catch (err) {
    console.error("[Nyx] /api/sandblast-gpt error:", err.message);
    res.status(500).json({
      ok: false,
      error: "SERVER_FAILURE",
      message: "Nyx hit static inside the server.",
      details: err.message
    });
  }
});

//----------------------------------------------------------
// TTS ENDPOINT (ELEVENLABS)
//----------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "EMPTY_TEXT" });
    }

    if (!ELEVENLABS_API_KEY || !NYX_VOICE_ID) {
      return res.status(500).json({
        error: "TTS_NOT_CONFIGURED",
        message: "Missing ELEVENLABS_API_KEY or NYX_VOICE_ID."
      });
    }

    const ttsRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${NYX_VOICE_ID}`,
      {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.45, similarity_boost: 0.85 }
      },
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        responseType: "arraybuffer"
      }
    );

    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(ttsRes.data));
  } catch (err) {
    console.error("[Nyx] TTS error:", err?.response?.data || err.message);
    res.status(500).json({
      ok: false,
      error: "TTS_FAILED",
      details: err?.response?.data || err.message
    });
  }
});

//----------------------------------------------------------
// START SERVER
//----------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Nyx hybrid backend listening on port ${PORT}`);
});
