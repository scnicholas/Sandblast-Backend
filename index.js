//----------------------------------------------------------
// Sandblast Nyx Backend — Hybrid Brain (Crash-Proof Patch)
// OpenAI (Responses API) + Local Fallback + Lane Memory + Dynamic Detail
// + PUBLIC vs ADMIN system prompts (same brain, different allowances)
// + RAG retrieval (public/admin partitions) [optional / safe-degrade]
// + Session memory (summary + open loops + recent turns; in-memory fallback)
// + Tools scaffolding (deterministic builders) [optional / safe-degrade]
//----------------------------------------------------------

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios"); // kept (you may still use it elsewhere)
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality");

// ---------------------------------------------------------
// OPTIONAL MODULES (do NOT crash if missing)
// ---------------------------------------------------------
function optionalRequire(path, fallback) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (e) {
    console.warn(`[Nyx] Optional module missing: ${path} (safe-degrade)`);
    return fallback;
  }
}

// RAG
const ragMod = optionalRequire("./Utils/ragStore", {
  searchIndex: () => []
});
const { searchIndex } = ragMod;

// Session memory
const sessionMod = optionalRequire("./Utils/sessionStore", {
  getSession: () => ({ summary: "", openLoops: [], turns: [] }),
  upsertSession: () => {},
  appendTurn: () => {}
});
const { getSession, upsertSession, appendTurn } = sessionMod;

// Deterministic tools
const toolsMod = optionalRequire("./Utils/tools", {
  buildSponsorPackage: () =>
    "Sponsor Package (fallback): Tell me sponsor type + budget tier, and I’ll generate a clean test offer.",
  buildTvBlock: () =>
    "TV Block (fallback): Tell me the mood + time slot + decade (optional), and I’ll generate a tight block.",
  formatNewsCanada: () =>
    "News Canada Format (fallback): Tell me whether this is for TV blocks, radio mentions, or web highlights."
});
const { buildSponsorPackage, buildTvBlock, formatNewsCanada } = toolsMod;

const app = express();

// Body + CORS hardening
app.use(express.json({ limit: "1mb" }));

const corsOptions = {
  origin: true,
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

// Embeddings model (override if you want)
const NYX_EMBED_MODEL = process.env.NYX_EMBED_MODEL || "text-embedding-3-large";

// Hard switch to skip RAG if quota is an issue
const DISABLE_RAG = String(process.env.DISABLE_RAG || "").toLowerCase() === "true";

// OpenAI client (Responses API)
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

//----------------------------------------------------------
// SYSTEM PROMPTS — PUBLIC vs ADMIN
//----------------------------------------------------------
const PUBLIC_SYSTEM_PROMPT = `
You are Nyx — the AI broadcast assistant for Sandblast.

Audience: public visitors.
Role: helpful, informative, welcoming, and realistic.

Rules:
- Do NOT assume internal access, private plans, or unpublished deals.
- Keep guidance high-level, safe, and visitor-appropriate.
- Never imply ownership, internal authority, or private decision-making.
- Avoid internal metrics, revenue numbers, or operational secrets.
- Frame suggestions as examples or possibilities.

Behavior:
- Answer clearly and concisely.
- If unsure, ask ONE simple clarifying question.
- End with ONE gentle next action.

Tone:
Warm. Professional. Encouraging. Broadcast-ready.

If conversationState is "closing":
- Provide a one-line wrap-up only.
- Do NOT include a farewell (the widget handles it).
`.trim();

const ADMIN_SYSTEM_PROMPT = `
You are Nyx — the AI operational brain for Sandblast.

Audience: Mac (owner/operator).
Role: strategic, tactical, and execution-focused.

Rules:
- You may discuss internal strategy, workflows, systems, and decisions.
- You may reference Sandblast operations, tooling, and architecture.
- You may suggest concrete next steps, tests, and implementation details.
- You may call out risks, gaps, or inefficiencies directly.
- Stay realistic: Sandblast is growing, not a massive network.

Behavior:
- Answer directly with actionable steps.
- Follow the resolution pattern:
  answer → confirm resolved (or ask ONE tight follow-up) → ONE next action.
- Prefer clarity over politeness.

Tone:
Calm. Confident. Supportive. Precise.

If conversationState is "closing":
- Provide a one-line wrap-up only.
- Do NOT include a farewell (the widget handles it).
`.trim();

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

      access: "public",
      conversationState: "active"
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

  // token-based admin
  if (
    adminToken &&
    process.env.ADMIN_SECRET &&
    adminToken === process.env.ADMIN_SECRET
  )
    return true;

  // prefix-based admin (handy for testing)
  if (typeof message === "string" && message.trim().startsWith("::admin"))
    return true;

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
// LANE RESOLUTION (same logic style as your current file)
//----------------------------------------------------------
function resolveLaneDomain(classification, meta, message) {
  const text = (message || "").trim().toLowerCase();
  let domain = classification?.domain || "general";

  const laneDomains = [
    "tv",
    "radio",
    "nova",
    "sponsors",
    "music_history", // NEW
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
    text.includes("switch to music") ||
    text.includes("switch to music history") ||
    text.includes("switch to charts") ||
    text.includes("switch to ai") ||
    text.includes("switch to tech") ||
    text.includes("switch to technical") ||
    text.includes("now tv") ||
    text.includes("now radio") ||
    text.includes("now nova") ||
    text.includes("now sponsors") ||
    text.includes("now music") ||
    text.includes("now music history") ||
    text.includes("now charts") ||
    text.includes("now ai") ||
    text.includes("now tech");

  if (text.includes("sponsor pitch helper") || text.includes("sponsor pitch"))
    return "sponsors";
  if (text.includes("tv grid tuner") || text.includes("tv grid")) return "tv";
  if (text.includes("ai for job seekers") || text.includes("ai for job-seekers"))
    return "ai_help";
  if (text.includes("news canada")) return "news_canada";

  // explicit music lane hints
  if (
    text.includes("music history") ||
    text.includes("billboard hot 100") ||
    text.includes("hot 100")
  )
    return "music_history";

  if (isLaneDomain || wantsSwitch) return domain;

  if (
    domain === "general" &&
    meta.currentLane &&
    meta.currentLane !== "general"
  ) {
    return meta.currentLane;
  }

  return domain;
}

//----------------------------------------------------------
// LANE DETAIL EXTRACTION (placeholder-safe)
// If your full version is already in your file, keep yours.
//----------------------------------------------------------
function extractLaneDetail(domain, text, prevDetail = {}) {
  // Minimal safe version (won’t break). You can paste your full extractor over this.
  const detail = { ...prevDetail };
  const lower = (text || "").toLowerCase();

  if (domain === "news_canada" && lower.includes("news canada"))
    detail.source = "news_canada";
  if (
    domain === "tech_support" &&
    (lower.includes("webflow") || lower.includes("render"))
  )
    detail.area = "platform";

  // Music history: try to capture year if present
  if (domain === "music_history") {
    const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) detail.year = yearMatch[1];
  }

  return detail;
}

//----------------------------------------------------------
// HESITATION DETECTION
//----------------------------------------------------------
// FIX: make hesitation lane-aware so music_history questions don't get overridden
function isHesitationMessage(message, classification) {
  // Never treat valid music history queries as hesitation
  if (classification?.domain === "music_history") return false;

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
// BUILD LANE-AWARE SUGGESTION (simple safe version)
//----------------------------------------------------------
function buildLaneSuggestion(domain, laneDetail, step) {
  if (step >= 2) return null;
  const detail = laneDetail || {};

  if (step === 0) {
    switch (domain) {
      case "tv":
        return detail.mood
          ? `If you want, we can pick one ${detail.mood} show and build the block around it.`
          : `If you want, pick just one: mood, shows, or timing. One piece is enough.`;
      case "sponsors":
        return detail.businessType
          ? `If you want, I’ll draft a simple test offer for a ${detail.businessType}.`
          : `If you want, tell me the sponsor type and I’ll shape a clean starter offer.`;
      case "news_canada":
      case "news":
        return `If you want, tell me: TV blocks, radio mentions, or web highlights — and I’ll format it cleanly.`;
      case "music_history":
        return `If you want, give me a year (or a specific week/date) and I’ll tell you what was #1 — plus one quick cultural note.`;
      default:
        return `If you want, tell me what “done” looks like, and we’ll take one small step.`;
    }
  }

  return `We can keep this simple — one small next step is enough.`;
}

//----------------------------------------------------------
// STEP PHASE HELPER (minimal safe)
//----------------------------------------------------------
function computeStepPhase(domain, laneDetail) {
  if (domain === "music_history") return "music_history:context";
  if (domain === "tv") return "tv:refine";
  if (domain === "radio" || domain === "nova") return "radio:refine";
  if (domain === "sponsors") return "sponsors:offer";
  return null;
}

//----------------------------------------------------------
// UI LINK BUILDER
//----------------------------------------------------------
function buildUiLinks(domain) {
  const links = [];
  if (domain === "tv") {
    links.push({
      label: "TV overview (sandblast.channel)",
      url: "https://www.sandblast.channel#tv"
    });
    links.push({
      label: "TV portal (sandblastchannel.com)",
      url: "https://www.sandblastchannel.com"
    });
  } else if (domain === "radio" || domain === "nova") {
    links.push({
      label: "Radio on sandblast.channel",
      url: "https://www.sandblast.channel#radio"
    });
    links.push({
      label: "Live radio / stream portal",
      url: "https://www.sandblastchannel.com"
    });
  } else if (domain === "music_history") {
    links.push({
      label: "Radio on sandblast.channel",
      url: "https://www.sandblast.channel#radio"
    });
    links.push({
      label: "Sandblast portal (sandblastchannel.com)",
      url: "https://www.sandblastchannel.com"
    });
  } else if (domain === "news" || domain === "news_canada") {
    links.push({
      label: "News Canada hub",
      url: "https://www.sandblastchannel.com"
    });
    links.push({
      label: "News Canada on sandblast.channel",
      url: "https://www.sandblast.channel#news-canada"
    });
  } else if (domain === "sponsors" || domain === "business_support") {
    links.push({
      label: "Ad Space overview (sandblast.channel)",
      url: "https://www.sandblast.channel#ad-space"
    });
    links.push({
      label: "Sandblast portal (sandblastchannel.com)",
      url: "https://www.sandblastchannel.com"
    });
  } else {
    links.push({
      label: "Main site (sandblast.channel)",
      url: "https://www.sandblast.channel"
    });
    links.push({
      label: "Broadcast portal (sandblastchannel.com)",
      url: "https://www.sandblastchannel.com"
    });
  }
  return links;
}

//----------------------------------------------------------
// LOCAL BRAIN (fallback)
//----------------------------------------------------------
function localBrainReply(message, classification, meta) {
  const domain = classification?.domain || "general";
  const intent = classification?.intent || "statement";
  const moodState = meta.moodState || "steady";

  const moodPrefix =
    moodState === "frustrated"
      ? "I hear you. Let’s keep this light and clear.\n\n"
      : moodState === "overwhelmed"
      ? "We’ll take this one small step at a time.\n\n"
      : moodState === "tired"
      ? "We can keep this simple so it doesn’t drain you.\n\n"
      : moodState === "excited"
      ? "Good energy — let’s use it well.\n\n"
      : "";

  if (intent === "greeting")
    return (
      moodPrefix +
      "Hey, I’m here. TV, radio, music history, sponsors, News Canada, or AI?"
    );
  if (intent === "smalltalk")
    return (
      moodPrefix +
      "I’m good. What do you want to tune — TV, radio, music history, sponsors, News Canada, or AI?"
    );

  if (domain === "music_history")
    return (
      moodPrefix +
      "Give me a year (or a week/date) and I’ll tell you what was #1 — plus one quick cultural note and a next step."
    );

  if (domain === "tv")
    return moodPrefix + "Tell me the vibe + time slot, and I’ll shape a TV block.";
  if (domain === "radio" || domain === "nova")
    return moodPrefix + "Tell me the mood + length, and I’ll map a clean radio flow.";
  if (domain === "sponsors")
    return moodPrefix + "Tell me sponsor type + budget tier, and I’ll sketch a simple package.";
  if (domain === "news" || domain === "news_canada")
    return moodPrefix + "Tell me: TV blocks, radio mentions, or web highlights?";

  return (
    moodPrefix +
    "Tell me whether you’re thinking TV, radio, music history, sponsors, News Canada, or AI — and what “done” looks like."
  );
}

//----------------------------------------------------------
// OPENAI BRAIN (Responses API) + optional RAG + Session Memory
//----------------------------------------------------------
function normalizeHistoryItems(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-10)
    .map((h) => {
      const role = h && h.role === "assistant" ? "assistant" : "user";
      const content = String(h && h.content ? h.content : "").slice(0, 2400);
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

function buildSystemPrompt(meta) {
  let base =
    meta && meta.access === "admin" ? ADMIN_SYSTEM_PROMPT : PUBLIC_SYSTEM_PROMPT;

  // Inject music historian rules when in music_history lane
  if (meta && meta.currentLane === "music_history") {
    base += `

Additional Role — Music History Mode:
You are Nyx, Sandblast’s broadcast music historian.

Rules:
- Anchor every answer in a specific week, date, or year.
- Provide exactly ONE chart fact (rank, peak, weeks, debut, etc.).
- Provide exactly ONE cultural or industry insight.
- Close with ONE listener-friendly next action.
- Keep responses concise, broadcast-ready, and conversational.
- If uncertain, say "Chart records indicate…" and avoid absolutes.
`;
  }

  return base.trim();
}

function buildDeveloperContext(
  meta,
  classification,
  clientContext,
  resolutionHint,
  session
) {
  const access = meta.access || "public";
  const state = meta.conversationState || "active";

  const sessionSummary = session?.summary
    ? String(session.summary).slice(0, 1200)
    : "";
  const openLoops = Array.isArray(session?.openLoops)
    ? session.openLoops.slice(0, 8)
    : [];

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
    `- resolutionStyle: ${String(
      resolutionHint?.resolutionStyle ||
        "Answer clearly. Confirm resolved. One next action."
    )}\n` +
    (sessionSummary ? `- sessionSummary: ${sessionSummary}\n` : "") +
    (openLoops.length ? `- openLoops: ${JSON.stringify(openLoops)}\n` : "")
  );
}

async function embedQuery(text) {
  if (!openai) throw new Error("OPENAI_NOT_CONFIGURED");
  const r = await openai.embeddings.create({
    model: NYX_EMBED_MODEL,
    input: text
  });
  return r.data[0].embedding;
}

function shouldUseTool(domain, message) {
  const t = (message || "").toLowerCase();
  if (
    domain === "sponsors" &&
    (t.includes("package") ||
      t.includes("offer") ||
      t.includes("pricing") ||
      t.includes("rate"))
  )
    return "sponsor_package";
  if (
    domain === "tv" &&
    (t.includes("block") ||
      t.includes("grid") ||
      t.includes("schedule") ||
      t.includes("time slot"))
  )
    return "tv_block";
  if (
    (domain === "news" || domain === "news_canada") &&
    (t.includes("format") ||
      t.includes("post") ||
      t.includes("segment") ||
      t.includes("placement"))
  )
    return "news_format";
  return null;
}

async function callBrain({
  message,
  classification,
  meta,
  history,
  clientContext,
  resolutionHint,
  session
}) {
  // Tool-first deterministic outputs
  const tool = shouldUseTool(classification.domain, message);
  if (tool) {
    if (tool === "sponsor_package")
      return buildSponsorPackage(
        meta.laneDetail?.businessType,
        meta.laneDetail?.budgetTier
      );
    if (tool === "tv_block")
      return buildTvBlock(
        meta.laneDetail?.mood,
        meta.laneDetail?.timeOfDay,
        meta.laneDetail?.decade
      );
    if (tool === "news_format") return formatNewsCanada(message, meta.access);
  }

  // greetings stay fast
  if (classification.intent === "greeting" || classification.intent === "smalltalk") {
    return localBrainReply(message, classification, meta);
  }

  if (!openai) {
    console.warn("[Nyx] No OPENAI_API_KEY set — using local brain.");
    return localBrainReply(message, classification, meta);
  }

  const systemPrompt = buildSystemPrompt(meta);

  // RAG retrieval (public/admin partitions)
  let ragContext = "";
  if (!DISABLE_RAG) {
    try {
      const qEmb = await embedQuery(message);
      const access = meta.access === "admin" ? "admin" : "public";
      const hits = searchIndex(qEmb, access, 5);

      if (hits && hits.length) {
        ragContext =
          "Sandblast Knowledge (retrieved):\n" +
          hits
            .map(
              (h) =>
                `- [${h.access}:${h.source}#${h.chunkIndex}] ${String(h.text).slice(
                  0,
                  900
                )}`
            )
            .join("\n\n");
      }
    } catch (e) {
      // Quota / missing index => safe degrade
      console.warn("[RAG] skipped:", e?.message || e);
    }
  }

  const developerContext = buildDeveloperContext(
    meta,
    classification,
    clientContext,
    resolutionHint,
    session
  );
  const historyItems = normalizeHistoryItems(history);

  const userPrompt =
    `User message: "${message}".\n` +
    `Use lane detail + mood state if helpful. Keep it concise.\n` +
    `If conversationState is "closing", do NOT output a farewell.`;

  try {
    const response = await openai.responses.create({
      model: NYX_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "developer", content: developerContext },
        ...(ragContext ? [{ role: "developer", content: ragContext }] : []),
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
app.get("/", (req, res) => res.send("Sandblast Nyx backend is running."));
app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "sandblast-nyx-backend" })
);

// MAIN BRAIN ENDPOINT
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, mode, history, clientContext, resolutionHint } =
      req.body || {};
    if (!message || !message.trim())
      return res.status(400).json({ error: "EMPTY_MESSAGE" });

    const clean = message.trim();
    let meta = cleanMeta(incomingMeta);

    // PUBLIC vs ADMIN split (same brain, different allowances)
    if (isAdminMessage(req.body)) meta.access = "admin";
    else meta.access = meta.access === "admin" ? "admin" : "public";

    // Session memory (server-side)
    const sessionId = meta.sessionId;
    const session = getSession(sessionId);

    // Mood
    const moodState = detectMoodState(clean);

    // Classification
    const rawClassification = classifyIntent(clean);
    const effectiveDomain = resolveLaneDomain(rawClassification, meta, clean);
    const classification = { ...rawClassification, domain: effectiveDomain };

    // Lane detail
    const newLaneDetail = extractLaneDetail(
      classification.domain,
      clean,
      meta.laneDetail
    );

    // Step phase
    const stepPhase = computeStepPhase(classification.domain, newLaneDetail);

    // Lane age
    let laneAge = meta.laneAge || 0;
    laneAge =
      classification.domain && classification.domain === meta.currentLane
        ? laneAge + 1
        : 1;

    // Personality hooks (kept)
    let frontDoor = null;
    if (nyxPersonality.getFrontDoorResponse) {
      frontDoor = nyxPersonality.getFrontDoorResponse(clean, meta, classification);
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

    // IMPORTANT: set currentLane BEFORE brain call so buildSystemPrompt() can inject lane rules
    const effectiveLane =
      classification.domain && classification.domain !== "general"
        ? classification.domain
        : meta.currentLane;

    const metaForBrain = {
      ...meta,
      currentLane: effectiveLane,
      laneDetail: newLaneDetail,
      moodState,
      stepPhase,
      laneAge,
      access: meta.access,
      conversationState: meta.conversationState || "active"
    };

    const rawReply = await callBrain({
      message: clean,
      classification,
      meta: metaForBrain,
      history,
      clientContext,
      resolutionHint,
      session
    });

    let finalReply = rawReply;

    if (nyxPersonality.wrapWithNyxTone) {
      finalReply = nyxPersonality.wrapWithNyxTone(
        clean,
        metaForBrain,
        classification,
        finalReply
      );
    }

    // Suggestive Intelligence
    let newSuggestionStep = meta.lastSuggestionStep || 0;

    // FIX: pass classification so hesitation can be lane-aware
    if (isHesitationMessage(clean, classification)) {
      const suggestion = buildLaneSuggestion(
        classification.domain,
        newLaneDetail,
        newSuggestionStep
      );
      if (suggestion) {
        finalReply = suggestion;
        newSuggestionStep = Math.min(newSuggestionStep + 1, 2);
      }
    } else {
      newSuggestionStep = 0;
    }

    if (laneAge >= 7) {
      finalReply += `\n\nIf you want, we can reset this lane or switch to another — TV, radio, music history, sponsors, News Canada, or AI.`;
    }

    let saveHintShown = meta.saveHintShown || false;
    if (
      !saveHintShown &&
      laneAge >= 4 &&
      ["tv", "radio", "nova", "sponsors", "music_history"].includes(
        classification.domain
      )
    ) {
      finalReply += `\n\nIf this starts to feel right, we can treat it as a working template for Sandblast.`;
      saveHintShown = true;
    }

    const updatedMeta = {
      ...meta,
      stepIndex: meta.stepIndex + 1,
      lastDomain: classification.domain,
      lastIntent: classification.intent,
      currentLane: effectiveLane,
      laneDetail: newLaneDetail,
      lastSuggestionStep: newSuggestionStep,
      moodState,
      laneAge,
      stepPhase,
      saveHintShown,
      access: metaForBrain.access,
      conversationState: metaForBrain.conversationState
    };

    const uiLinks = buildUiLinks(classification.domain);

    // Update session memory (safe + lightweight)
    appendTurn(sessionId, { role: "user", content: clean });
    appendTurn(sessionId, { role: "assistant", content: finalReply });
    upsertSession(sessionId, {
      summary: session?.summary || "",
      openLoops: session?.openLoops || []
    });

    res.json({
      ok: true,
      reply: finalReply,
      frontDoor,
      domain: classification.domain,
      intent: classification.intent,
      confidence: classification.confidence,
      domainPayload,
      meta: updatedMeta,
      uiLinks,
      links: uiLinks
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
// TTS ENDPOINT (ELEVENLABS) — unchanged pattern
//----------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim())
      return res.status(400).json({ error: "EMPTY_TEXT" });

    if (!ELEVENLABS_API_KEY || !NYX_VOICE_ID) {
      return res.status(500).json({
        error: "TTS_NOT_CONFIGURED",
        message: "Missing ELEVENLABS_API_KEY or NYX_VOICE_ID"
      });
    }

    // (Keep your existing ElevenLabs call here if you already have it.
    // This placeholder prevents crashes.)
    return res.status(501).json({ error: "TTS_NOT_IMPLEMENTED_IN_THIS_PATCH" });
  } catch (err) {
    console.error("[Nyx] /api/tts error:", err.message);
    res.status(500).json({ ok: false, error: "TTS_FAILURE", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Nyx] Server running on port ${PORT}`);
});
