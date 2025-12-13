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
//-------------------------------------------
