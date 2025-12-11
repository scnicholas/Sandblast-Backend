//----------------------------------------------------------
// Sandblast Nyx Backend — Hybrid Hybrid Brain
// OpenAI + Local Fallback + Lane Memory + Dynamic Detail
// Suggestive Intelligence + Emotional Layer + Profiles
//----------------------------------------------------------

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const NYX_VOICE_ID = process.env.NYX_VOICE_ID;

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
      currentLane: null,      // tv, radio, sponsors, ai_help, tech_support, etc.
      laneDetail: {},         // mood, businessType, audience, etc.
      lastSuggestionStep: 0,  // 0, 1, or 2 (suggestive intelligence state)
      moodState: "steady",    // steady, overwhelmed, frustrated, excited, tired
      laneAge: 0,             // how many turns in the current lane
      presetMode: null,       // e.g. sponsor_pitch, tv_grid, ai_jobseekers
      stepPhase: null,        // high-level stage label, per-lane
      saveHintShown: false    // to avoid repeating "save this" hook
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
    saveHintShown: !!meta.saveHintShown
  };
}

function isAdminMessage(body) {
  if (!body || typeof body !== "object") return false;
  const { adminToken, message } = body;
  if (adminToken && adminToken === process.env.ADMIN_SECRET) return true;
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
    "i can't handle",
    "this is a lot"
  ];
  const excitedWords = [
    "excited",
    "hyped",
    "let's go",
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
    "business_support"
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

  // High-value preset phrases
  if (text.includes("sponsor pitch helper") || text.includes("sponsor pitch")) {
    return "sponsors";
  }
  if (text.includes("tv grid tuner") || text.includes("tv grid")) {
    return "tv";
  }
  if (text.includes("ai for job seekers") || text.includes("ai for job-seekers")) {
    return "ai_help";
  }

  if (isLaneDomain || wantsSwitch) {
    return domain;
  }

  if (domain === "general" && meta.currentLane && meta.currentLane !== "general") {
    return meta.currentLane;
  }

  return domain;
}

//----------------------------------------------------------
// LANE DETAIL EXTRACTION (dynamic memory + deeper profiles)
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
    const moodMap = {
      detective: ["detective", "crime", "cop show", "police drama"],
      western: ["western", "cowboy"],
      family: ["family", "family night", "family-friendly", "family friendly"],
      comedy: ["sitcom", "comedy"],
      scifi: ["sci-fi", "science fiction", "space"],
      horror: ["horror", "thriller"],
      kids: ["kids", "cartoon", "children"]
    };
    matchMap(moodMap, "mood");

    const timeMap = {
      "late-night": ["late-night", "late night"],
      weeknight: ["weeknight"],
      weekend: ["weekend"],
      saturday: ["saturday"],
      sunday: ["sunday"],
      morning: ["morning"],
      afternoon: ["afternoon"],
      evening: ["evening", "prime time", "primetime"]
    };
    matchMap(timeMap, "timeOfDay");

    const timeMatch = lower.match(/(\b\d{1,2}\s?(am|pm)\b)/);
    if (timeMatch) {
      detail.startTime = timeMatch[1];
    }

    const paceMap = {
      "slow-burn": ["slow burn", "slow-burn", "slow pace"],
      "fast-cut": ["fast cut", "fast-cut", "high energy", "fast paced", "fast-paced"]
    };
    matchMap(paceMap, "pace");

    const decadeMap = {
      "50s": ["1950s", "50s", "50's"],
      "60s": ["1960s", "60s", "60's"],
      "70s": ["1970s", "70s", "70's"],
      "80s": ["1980s", "80s", "80's"],
      "90s": ["1990s", "90s", "90's"]
    };
    matchMap(decadeMap, "decade");

    const ageMap = {
      "kids": ["kids", "children"],
      "family": ["family"],
      "adults": ["adults", "grown-ups", "grown ups"]
    };
    matchMap(ageMap, "targetAge");
  }

  if (domain === "radio" || domain === "nova") {
    const moodMap = {
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
    };
    matchMap(moodMap, "mood");

    const lenMatch = lower.match(/(\d+)\s?(hour|hours|hr|hrs|minute|minutes|min)/);
    if (lenMatch) {
      detail.length = lenMatch[0];
    }
    if (lower.includes("half hour") || lower.includes("half-hour")) {
      detail.length = "30 minutes";
    }

    const talkMap = {
      "more-music": ["mostly music", "more music", "just music"],
      "balanced": ["mix of talk", "some talk", "bit of talk"],
      "talk-heavy": ["more talk", "mostly talk", "talk show"]
    };
    matchMap(talkMap, "talkRatio");

    const energyMap = {
      "soft-curve": ["slow build", "start soft"],
      "high-energy": ["high energy", "upbeat", "hype"],
      "drop-then-rise": ["drop off", "wind down then up"]
    };
    matchMap(energyMap, "energyCurve");
  }

  if (domain === "sponsors") {
    const bizMap = {
      restaurant: ["restaurant", "diner", "cafe", "coffee shop", "eatery"],
      gym: ["gym", "fitness", "training center"],
      church: ["church", "ministry"],
      grocery: ["grocery", "supermarket"],
      salon: ["salon", "barbershop", "barber"],
      clinic: ["clinic", "pharmacy", "medical"],
      auto: ["car dealer", "auto shop", "mechanic", "dealership"]
    };
    matchMap(bizMap, "businessType");

    const budgetMap = {
      "low": ["small budget", "low budget", "starter", "test budget"],
      "medium": ["mid budget", "medium budget"],
      "high": ["big budget", "large budget", "premium"]
    };
    matchMap(budgetMap, "budgetTier");

    const toneMap = {
      "serious": ["serious", "professional", "formal"],
      "playful": ["fun", "playful", "light"],
      "community": ["community", "local roots"]
    };
    matchMap(toneMap, "brandTone");
  }

  if (domain === "ai_help" || domain === "ai_consulting") {
    const audienceMap = {
      "job-seekers": ["job seeker", "job-seeker", "resume", "cv", "cover letter"],
      "small-business": ["small business", "small-business", "local business"],
      sponsors: ["sponsor", "sponsors", "advertiser", "client"],
      students: ["student", "students", "school", "college", "university"]
    };
    matchMap(audienceMap, "audience");
  }

  if (domain === "tech_support") {
    const areaMap = {
      webflow: ["webflow"],
      render: ["render", "onrender.com"],
      backend: ["backend", "server", "index.js", "express"],
      api: ["api", "endpoint", "cannot get", "404", "500"],
      tts: ["tts", "elevenlabs", "voice", "audio"]
    };
    matchMap(areaMap, "area");
  }

  if (domain === "business_support") {
    const projMap = {
      grant: ["grant", "funding", "proposal"],
      pitch: ["pitch", "deck", "presentation"],
      store: ["store", "grocery", "retail"],
      consulting: ["consulting", "client work", "service package"]
    };
    matchMap(projMap, "projectType");
  }

  return detail;
}

//----------------------------------------------------------
// HESITATION DETECTION (for Suggestive Intelligence)
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
  if (step >= 2) return null; // 0 and 1 only

  const detail = laneDetail || {};

  if (step === 0) {
    switch (domain) {
      case "tv": {
        const mood = detail.mood;
        if (mood) {
          return `If you want, we can choose one ${mood} show that fits the block and shape around it.`;
        }
        return `If you want, we can pick the next part — the mood, the shows, or the timing. One piece is enough.`;
      }

      case "radio":
      case "nova": {
        const mood = detail.mood;
        if (mood) {
          return `If you want, we can choose one anchor track or transition that holds that ${mood} vibe.`;
        }
        return `If you want, we can set one anchor track or transition to carry the mood for this block.`;
      }

      case "sponsors": {
        const biz = detail.businessType;
        if (biz) {
          return `If you want, we can shape one simple offer for a ${biz} — like a short test run or a few on-air mentions.`;
        }
        return `If you want, we can define one simple sponsor offer around a block — nothing complicated.`;
      }

      case "ai_help":
      case "ai_consulting": {
        const audience = detail.audience;
        if (audience) {
          return `If you want, we can start with one small AI task that helps ${audience} — writing, summarizing, or outlining.`;
        }
        return `If you want, we can pick one small AI task — writing, summarizing, or outlining something you already have.`;
      }

      case "tech_support": {
        const area = detail.area;
        if (area) {
          return `If you want, we can fix one small piece of the ${area} issue first — just pick where to start.`;
        }
        return `If you want, we can tackle one part of the tech first — backend, widget, or endpoint.`;
      }

      case "business_support": {
        const projectType = detail.projectType;
        if (projectType) {
          return `If you want, we can set one clear next step for this ${projectType} so it feels less heavy.`;
        }
        return `If you want, we can choose one project and give it a single clear next step.`;
      }

      default:
        return `If you want, we can take one small step — just tell me what you feel like shaping first.`;
    }
  }

  // step === 1 → softer fallback
  return `We can keep this simple… one small next step is enough when you’re ready.`;
}

//----------------------------------------------------------
// STEP PHASE HELPER (micro transitions)
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
// LOCAL BRAIN – GREETING / SMALL-TALK + DOMAIN RULES
//----------------------------------------------------------
function localBrainReply(message, classification, meta) {
  const domain = classification?.domain || "general";
  const intent = classification?.intent || "statement";
  const detail = meta?.laneDetail || {};
  const moodState = meta.moodState || "steady";

  // Emotional shading on generic responses
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
    return (
      moodPrefix +
      `Hey, I’m here. How’s your day going? What do you want to dive into — TV, radio, sponsors, or AI?`
    );
  }

  if (intent === "smalltalk") {
    return (
      moodPrefix +
      `I’m good on my end. What’s on your mind? If you want, we can tune TV, radio, sponsors, or AI — just tell me the lane.`
    );
  }

  switch (domain) {
    case "tv": {
      const mood = detail.mood;
      const timeOfDay = detail.timeOfDay;
      let intro = moodPrefix + "Let’s shape one TV block together.\n\n";
      if (mood || timeOfDay) {
        intro =
          moodPrefix +
          `Alright… we’ll keep building around that ` +
          `${mood ? mood + " " : ""}${timeOfDay ? timeOfDay + " " : ""}block.\n\n`;
      }
      return (
        intro +
        `Pick a lane like weeknight detectives, Saturday westerns, or a family night. ` +
        `Tell me the vibe and rough time slot, and we’ll build a simple block around it.`
      );
    }

    case "radio":
    case "nova": {
      const mood = detail.mood;
      const length = detail.length;
      let intro = moodPrefix + "Let’s build a clean radio mood block.\n\n";
      if (mood || length) {
        intro =
          moodPrefix +
          `Alright… we’ll keep tuning that ` +
          `${mood ? mood + " " : ""}${length ? "(" + length + ") " : ""}vibe.\n\n`;
      }
      return (
        intro +
        `Choose the feeling — late-night smooth, Gospel Sunday, or retro party. ` +
        `Tell me the mood and how long you want it to run, and we’ll map a light flow for Nova to carry.`
      );
    }

    case "sponsors": {
      const biz = detail.businessType;
      let intro = moodPrefix + "We can keep sponsor offers simple.\n\n";
      if (biz) {
        intro =
          moodPrefix + `Alright… let’s shape something that fits a ${biz}.\n\n`;
      }
      return (
        intro +
        `Think in terms of a short test run — a few TV spots plus a couple of on-air mentions ` +
        `around one strong block. Tell me which sponsor you have in mind and we’ll sketch a small, clear package for them.`
      );
    }

    case "ai_help":
    case "ai_consulting": {
      const audience = detail.audience;
      let intro = moodPrefix + "Let’s pick a few AI tasks that actually help you.\n\n";
      if (audience) {
        intro =
          moodPrefix + `Alright… let’s keep this useful for ${audience}.\n\n`;
      }
      return (
        intro +
        `For example, drafting outreach, summarizing content, or writing show and social copy. ` +
        `Tell me who you want to help first — yourself, job-seekers, or a sponsor — and we’ll choose two or three practical use cases.`
      );
    }

    case "tech_support": {
      const area = detail.area;
      let intro = moodPrefix + "We can tackle the tech one step at a time.\n\n";
      if (area) {
        intro =
          moodPrefix + `Alright… let’s work through the ${area} side first.\n\n`;
      }
      return (
        intro +
        `Tell me whether the issue is on Webflow, Render, or inside the code, and I’ll walk with you through the next small fix.`
      );
    }

    case "business_support": {
      const projectType = detail.projectType;
      let intro = moodPrefix + "Let’s give one project a clear push.\n\n";
      if (projectType) {
        intro =
          moodPrefix +
          `Alright… let’s give this ${projectType} a cleaner direction.\n\n`;
      }
      return (
        intro +
        `Tell me which project you want to focus on and what you’d like to see in the next 90 days, ` +
        `and we’ll set a simple direction you can move on each week.`
      );
    }

    default:
      return (
        moodPrefix +
        `I’m with you.\n\n` +
        `Tell me whether you’re thinking about TV, radio, streaming, sponsors, News Canada, or AI, and we’ll take the next step there.`
      );
  }
}

//----------------------------------------------------------
// HYBRID BRAIN – TRY OPENAI, FALL BACK TO LOCAL
//----------------------------------------------------------
async function callBrain({ message, classification, meta }) {
  if (
    classification.intent === "greeting" ||
    classification.intent === "smalltalk"
  ) {
    return localBrainReply(message, classification, meta);
  }

  if (!OPENAI_API_KEY) {
    console.warn("[Nyx] No OPENAI_API_KEY set — using local brain.");
    return localBrainReply(message, classification, meta);
  }

  const systemPrompt =
    `You are Nyx — the AI broadcast brain for Sandblast Channel.\n` +
    `Tone: warm, supportive, concise, collaborative, steady, and forward-moving.\n` +
    `You help with TV, radio, streaming, sponsors, News Canada, AI consulting, and tech troubleshooting.\n` +
    `Sandblast is a growing channel, not a giant network — keep advice realistic.\n` +
    `Avoid lectures; keep responses short and focused on the next step.\n\n` +
    `Classification: domain=${classification.domain}, intent=${classification.intent}, confidence=${classification.confidence}.\n` +
    `Meta: stepIndex=${meta.stepIndex}, lastDomain=${meta.lastDomain}, currentLane=${meta.currentLane}, lastGoal=${meta.lastGoal}\n` +
    `MoodState: ${meta.moodState}\n` +
    `LaneDetail: ${JSON.stringify(meta.laneDetail || {})}\n` +
    `StepPhase: ${meta.stepPhase}\n` +
    `PresetMode: ${meta.presetMode}\n`;

  const userPrompt =
    `User message: "${message}".\n` +
    `Use the lane detail and mood state if it helps. ` +
    `Give a clear, useful answer in no more than about four short paragraphs, and keep the tone warm, supportive, and collaborative. ` +
    `Write in short, TTS-friendly sentences that sound natural when spoken out loud.`;

  try {
    const apiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply =
      apiRes.data?.choices?.[0]?.message?.content ||
      localBrainReply(message, classification, meta);

    return reply;
  } catch (err) {
    console.error("[Nyx] OpenAI error, using local brain:", err?.response?.data || err.message);
    return localBrainReply(message, classification, meta);
  }
}

//----------------------------------------------------------
// HEALTH
//----------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "sandblast-nyx-backend" });
});

//----------------------------------------------------------
// MAIN BRAIN ENDPOINT
//----------------------------------------------------------
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, mode } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "EMPTY_MESSAGE" });
    }

    const clean = message.trim();
    let meta = cleanMeta(incomingMeta);

    if (isAdminMessage(req.body)) {
      return res.json({
        ok: true,
        admin: true,
        message: "Admin backdoor reached. Debug hooks can live here later.",
        meta
      });
    }

    // Emotional state
    const moodState = detectMoodState(clean);

    const rawClassification = classifyIntent(clean);
    const effectiveDomain = resolveLaneDomain(rawClassification, meta, clean);
    const classification = { ...rawClassification, domain: effectiveDomain };

    const newLaneDetail = extractLaneDetail(
      classification.domain,
      clean,
      meta.laneDetail
    );

    // Step phase for micro-transitions
    const stepPhase = computeStepPhase(classification.domain, newLaneDetail);

    // Lane age for memory decay / recenter
    let laneAge = meta.laneAge || 0;
    if (classification.domain && classification.domain === meta.currentLane) {
      laneAge = laneAge + 1;
    } else {
      laneAge = 1; // start at 1 for new lane
    }

    let frontDoor = null;
    if (nyxPersonality.getFrontDoorResponse) {
      frontDoor = nyxPersonality.getFrontDoorResponse(
        clean,
        meta,
        classification
      );
    }

    let domainPayload = {};
    if (nyxPersonality.enrichDomainResponse) {
      domainPayload = nyxPersonality.enrichDomainResponse(
        clean,
        meta,
        classification,
        mode
      );
    }

    const metaForBrain = {
      ...meta,
      laneDetail: newLaneDetail,
      moodState,
      stepPhase,
      laneAge
    };

    const rawReply = await callBrain({
      message: clean,
      classification,
      meta: metaForBrain
    });

    // Micro-transition wrapper (short step labels)
    let transitionPrefix = "";
    if (stepPhase === "tv:timing") {
      transitionPrefix = "We’ve got the vibe. Now let’s narrow the timing.\n\n";
    } else if (stepPhase === "tv:refine") {
      transitionPrefix = "We’ve got the core block. Now we can refine it.\n\n";
    } else if (stepPhase === "radio:length") {
      transitionPrefix = "We’ve set the mood. Now let’s set the length.\n\n";
    } else if (stepPhase === "radio:refine") {
      transitionPrefix = "The mood and length are there. Now we can polish the flow.\n\n";
    } else if (stepPhase === "sponsors:budget") {
      transitionPrefix = "We know the sponsor type. Now we can size the budget.\n\n";
    } else if (stepPhase === "sponsors:offer") {
      transitionPrefix = "We know who they are. Now we can define one clear offer.\n\n";
    }

    let finalReply = transitionPrefix + rawReply;
    if (nyxPersonality.wrapWithNyxTone) {
      finalReply = nyxPersonality.wrapWithNyxTone(
        clean,
        metaForBrain,
        classification,
        finalReply
      );
    }

    // Suggestive Intelligence (non-pushy, avoids repetition)
    let newSuggestionStep = meta.lastSuggestionStep || 0;
    if (isHesitationMessage(clean)) {
      const suggestion = buildLaneSuggestion(
        classification.domain,
        newLaneDetail,
        newSuggestionStep
      );
      if (suggestion) {
        finalReply = suggestion; // replace long reply with nudge
        newSuggestionStep = Math.min(newSuggestionStep + 1, 2);
      }
    } else {
      newSuggestionStep = 0;
    }

    // Gentle recenter if laneAge is high
    if (laneAge >= 7) {
      finalReply +=
        `\n\nIf you want, we can reset this lane or switch to another — TV, radio, sponsors, or AI.`;
    }

    // Smart "save this" hook
    let saveHintShown = meta.saveHintShown || false;
    if (
      !saveHintShown &&
      laneAge >= 4 &&
      (classification.domain === "tv" ||
        classification.domain === "radio" ||
        classification.domain === "nova" ||
        classification.domain === "sponsors")
    ) {
      finalReply +=
        `\n\nIf this starts to feel right, we can treat it as a working template for Sandblast.`;
      saveHintShown = true;
    }

    const updatedMeta = {
      ...meta,
      stepIndex: meta.stepIndex + 1,
      lastDomain: classification.domain,
      lastIntent: classification.intent,
      currentLane:
        classification.domain && classification.domain !== "general"
          ? classification.domain
          : meta.currentLane,
      laneDetail: newLaneDetail,
      lastSuggestionStep: newSuggestionStep,
      moodState,
      laneAge,
      stepPhase,
      saveHintShown
    };

    // UI hints for the widget (optional for front-end)
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
          : "Ask about TV, radio, sponsors, News Canada, or AI."
    };

    res.json({
      ok: true,
      reply: finalReply,
      frontDoor,
      domain: classification.domain,
      intent: classification.intent,
      confidence: classification.confidence,
      domainPayload,
      meta: updatedMeta,
      uiHints
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
// TTS ENDPOINT (OPTIONAL – ELEVENLABS)
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
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.85
        }
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
