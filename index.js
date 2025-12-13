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
const axios = require("axios"); // kept (if you use elsewhere)
const OpenAI = require("openai");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality");

// ✅ BUILD STAMP (confirm you’re hitting the correct Render deploy)
const BUILD_TAG = "nyx-music-history-fix-2025-12-13c";

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

// RAG (optional)
const ragMod = optionalRequire("./Utils/ragStore", { searchIndex: () => [] });
const { searchIndex } = ragMod;

// Session memory (optional)
const sessionMod = optionalRequire("./Utils/sessionStore", {
  getSession: () => ({ summary: "", openLoops: [], turns: [] }),
  upsertSession: () => {},
  appendTurn: () => {}
});
const { getSession, upsertSession, appendTurn } = sessionMod;

// Deterministic tools (optional)
const toolsMod = optionalRequire("./Utils/tools", {
  buildSponsorPackage: () =>
    "Sponsor Package (fallback): Tell me sponsor type + budget tier, and I’ll generate a clean test offer.",
  buildTvBlock: () =>
    "TV Block (fallback): Tell me the mood + time slot + decade (optional), and I’ll generate a tight block.",
  formatNewsCanada: () =>
    "News Canada Format (fallback): Tell me whether this is for TV blocks, radio mentions, or web highlights."
});
const { buildSponsorPackage, buildTvBlock, formatNewsCanada } = toolsMod;

// ---------------------------------------------------------
// APP + MIDDLEWARE
// ---------------------------------------------------------
const app = express();
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

const NYX_MODEL = process.env.NYX_MODEL || "gpt-5.2";
const NYX_EMBED_MODEL = process.env.NYX_EMBED_MODEL || "text-embedding-3-large";

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ---------------------------------------------------------
// PROMPTS
// ---------------------------------------------------------
const PUBLIC_SYSTEM_PROMPT = `
You are Nyx, Sandblast’s AI brain.
You are concise, broadcast-clear, and action-oriented.

Hard rules:
- Give 1 proof point + 1 next action when possible.
- Keep answers practical for a growing channel (not a giant network).
- If unsure, ask one precise clarifying question.
`.trim();

const ADMIN_SYSTEM_PROMPT = `
You are Nyx (Admin). You can discuss implementation details, code-level fixes, and internal operations.
Keep it clean, deterministic, and safe.
`.trim();

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------
function cleanMeta(incoming) {
  const m = incoming && typeof incoming === "object" ? incoming : {};
  return {
    sessionId: String(m.sessionId || "public"),
    stepIndex: Number.isFinite(m.stepIndex) ? m.stepIndex : 0,
    lastDomain: String(m.lastDomain || "general"),
    lastIntent: String(m.lastIntent || "statement"),
    currentLane: String(m.currentLane || "general"),
    laneDetail: m.laneDetail && typeof m.laneDetail === "object" ? m.laneDetail : {},
    lastSuggestionStep: Number.isFinite(m.lastSuggestionStep) ? m.lastSuggestionStep : 0,
    moodState: String(m.moodState || "steady"),
    laneAge: Number.isFinite(m.laneAge) ? m.laneAge : 0,
    stepPhase: m.stepPhase || null,
    saveHintShown: !!m.saveHintShown,
    presetMode: m.presetMode || null,
    access: m.access === "admin" ? "admin" : "public",
    conversationState: String(m.conversationState || "active")
  };
}

function isAdminMessage(body) {
  // Keep simple: only allow admin if explicitly passed AND you decide to enforce it later.
  // For now: never auto-admin.
  return body && body.meta && body.meta.access === "admin";
}

function detectMoodState(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("frustrated") || t.includes("annoyed") || t.includes("pissed")) return "frustrated";
  if (t.includes("overwhelmed") || t.includes("too much") || t.includes("stressed")) return "overwhelmed";
  if (t.includes("tired") || t.includes("exhausted")) return "tired";
  if (t.includes("let's go") || t.includes("excited") || t.includes("pump")) return "excited";
  return "steady";
}

function computeStepPhase(domain) {
  if (domain === "music_history") return "music_history:context";
  if (domain === "tv") return "tv:refine";
  if (domain === "radio" || domain === "nova") return "radio:refine";
  if (domain === "sponsors") return "sponsors:offer";
  if (domain === "news" || domain === "news_canada") return "news:format";
  return null;
}

function buildUiLinks(domain) {
  const links = [];

  if (domain === "tv") {
    links.push({ label: "TV overview (sandblast.channel)", url: "https://www.sandblast.channel#tv" });
    links.push({ label: "TV portal (sandblastchannel.com)", url: "https://www.sandblastchannel.com" });
  } else if (domain === "radio" || domain === "nova" || domain === "music_history") {
    links.push({ label: "Radio on sandblast.channel", url: "https://www.sandblast.channel#radio" });
    links.push({ label: "Sandblast portal (sandblastchannel.com)", url: "https://www.sandblastchannel.com" });
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

// Lane domain resolver (keeps lane stable)
function resolveLaneDomain(rawClassification, meta, message) {
  const text = (message || "").trim().toLowerCase();
  let domain = rawClassification?.domain || "general";

  const laneDomains = [
    "tv",
    "radio",
    "nova",
    "sponsors",
    "music_history",
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

  // Explicit routing hints
  if (text.includes("news canada")) return "news_canada";
  if (text.includes("music history") || text.includes("billboard hot 100") || text.includes("hot 100")) return "music_history";

  if (isLaneDomain || wantsSwitch) return domain;

  // If general but we already have a lane, keep it
  if (domain === "general" && meta.currentLane && meta.currentLane !== "general") {
    return meta.currentLane;
  }

  return domain;
}

function extractLaneDetail(domain, text, prevDetail = {}) {
  const detail = { ...(prevDetail || {}) };
  const lower = (text || "").toLowerCase();

  if (domain === "news_canada" && lower.includes("news canada")) detail.source = "news_canada";
  if (domain === "tech_support" && (lower.includes("webflow") || lower.includes("render"))) detail.area = "platform";

  // Music history: capture year/date hints
  if (domain === "music_history") {
    const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) detail.year = yearMatch[1];

    // If user typed only a year (e.g., "1984"), mark it as ready-to-answer
    if (/^\s*(19\d{2}|20\d{2})\s*$/.test(lower)) detail.yearOnly = true;
  }

  return detail;
}

// FIX: hesitation lane-aware so music_history doesn't get overridden
function isHesitationMessage(message, classification) {
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

function buildLaneSuggestion(domain, laneDetail, step) {
  // Keep suggestions light; never spam them
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
        return detail.year
          ? `If you want, say the artist (or song) you’re tracking in ${detail.year} and I’ll anchor it to a specific chart week.`
          : `If you want, give me a year (or a specific week/date) and I’ll tell you what was #1 — plus one quick cultural note.`;
      default:
        return `If you want, tell me what “done” looks like, and we’ll take one small step.`;
    }
  }

  return `We can keep this simple — one small next step is enough.`;
}

// ---------------------------------------------------------
// LOCAL BRAIN (fallback)
// ---------------------------------------------------------
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
    return moodPrefix + "Hey, I’m here. TV, radio, music history, sponsors, News Canada, or AI?";
  if (intent === "smalltalk")
    return moodPrefix + "I’m good. What do you want to tune — TV, radio, music history, sponsors, News Canada, or AI?";

  // Music history fallback: do NOT loop. If year is present, ask for artist/song or chart.
  if (domain === "music_history") {
    const lower = (message || "").toLowerCase();
    const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      const y = yearMatch[1];
      return (
        moodPrefix +
        `Got it: ${y}. Which chart do you want (Billboard Hot 100, UK Top 40, etc.) and are we tracking an artist/song or the #1 of the week?`
      );
    }
    return (
      moodPrefix +
      "Give me a year (or a week/date) and I’ll tell you what was #1 — plus one quick cultural note and a next step."
    );
  }

  if (domain === "tv") return moodPrefix + "Tell me the vibe + time slot, and I’ll shape a TV block.";
  if (domain === "radio" || domain === "nova") return moodPrefix + "Tell me the mood + length, and I’ll map a clean radio flow.";
  if (domain === "sponsors") return moodPrefix + "Tell me sponsor type + budget tier, and I’ll sketch a simple package.";
  if (domain === "news" || domain === "news_canada") return moodPrefix + "Tell me: TV blocks, radio mentions, or web highlights?";

  return (
    moodPrefix +
    "Tell me whether you’re thinking TV, radio, music history, sponsors, News Canada, or AI — and what “done” looks like."
  );
}

// ---------------------------------------------------------
// OPENAI BRAIN (Responses API) + optional RAG + Session Memory
// ---------------------------------------------------------
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
  let base = meta && meta.access === "admin" ? ADMIN_SYSTEM_PROMPT : PUBLIC_SYSTEM_PROMPT;

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

function buildDeveloperContext(meta, classification, clientContext, resolutionHint, session) {
  const access = meta.access || "public";
  const state = meta.conversationState || "active";

  const sessionSummary = session?.summary ? String(session.summary).slice(0, 1200) : "";
  const openLoops = Array.isArray(session?.openLoops) ? session.openLoops.slice(0, 8) : [];

  return (
    `Context:\n` +
    `- build: ${BUILD_TAG}\n` +
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
    `- resolutionStyle: ${String(resolutionHint?.resolutionStyle || "Answer clearly. Confirm resolved. One next action.")}\n` +
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
    (t.includes("package") || t.includes("offer") || t.includes("pricing") || t.includes("rate"))
  )
    return "sponsor_package";
  if (domain === "tv" && (t.includes("block") || t.includes("grid") || t.includes("schedule") || t.includes("time slot")))
    return "tv_block";
  if (domain === "news_canada" && (t.includes("format") || t.includes("rewrite") || t.includes("headline")))
    return "news_format";
  return null;
}

async function openaiBrainReply(message, classification, metaForBrain, historyItems, clientContext, resolutionHint, session) {
  if (!openai) return localBrainReply(message, classification, metaForBrain);

  try {
    // Optional: RAG context
    let ragContext = "";
    try {
      const queryVec = await embedQuery(message);
      const hits = searchIndex(queryVec, { topK: 4 }) || [];
      if (Array.isArray(hits) && hits.length) {
        ragContext = hits
          .map((h, i) => `RAG[${i + 1}]: ${String(h.text || "").slice(0, 600)}`)
          .join("\n");
      }
    } catch (e) {
      // safe-degrade
    }

    // Optional deterministic tool usage
    const tool = shouldUseTool(classification.domain, message);
    let toolOutput = "";
    if (tool === "sponsor_package") toolOutput = buildSponsorPackage(message);
    if (tool === "tv_block") toolOutput = buildTvBlock(message);
    if (tool === "news_format") toolOutput = formatNewsCanada(message);

    const sys = buildSystemPrompt(metaForBrain);
    const dev = buildDeveloperContext(metaForBrain, classification, clientContext, resolutionHint, session);

    const userPrompt =
      (toolOutput ? `Tool output:\n${toolOutput}\n\n` : "") +
      (ragContext ? `Reference context:\n${ragContext}\n\n` : "") +
      message;

    const response = await openai.responses.create({
      model: NYX_MODEL,
      input: [
        { role: "system", content: sys },
        { role: "developer", content: dev },
        ...historyItems,
        { role: "user", content: userPrompt }
      ]
    });

    const reply = (response.output_text || "").trim();
    return reply || localBrainReply(message, classification, metaForBrain);
  } catch (err) {
    console.error("[Nyx] OpenAI error, using local brain:", err?.message || err);
    return localBrainReply(message, classification, metaForBrain);
  }
}

// ---------------------------------------------------------
// ROUTES
// ---------------------------------------------------------
app.get("/", (req, res) => res.send("Sandblast Nyx backend is running."));
app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "sandblast-nyx-backend", build: BUILD_TAG })
);

// MAIN BRAIN ENDPOINT
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, mode, history, clientContext, resolutionHint } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: "EMPTY_MESSAGE" });

    const clean = message.trim();
    let meta = cleanMeta(incomingMeta);

    // Access split (kept conservative)
    if (isAdminMessage(req.body)) meta.access = "admin";
    else meta.access = meta.access === "admin" ? "admin" : "public";

    const sessionId = meta.sessionId;
    const session = getSession(sessionId);

    const moodState = detectMoodState(clean);

    // Classification
    const rawClassification = classifyIntent(clean);
    const effectiveDomain = resolveLaneDomain(rawClassification, meta, clean);

    const classification = {
      ...rawClassification,
      domain: effectiveDomain
    };

    // ✅ HARD OVERRIDE: if classifier says music_history, it wins
    if (rawClassification?.domain === "music_history" || rawClassification?.intent === "music_history") {
      classification.domain = "music_history";
      classification.intent = "music_history";
    }

    const newLaneDetail = extractLaneDetail(classification.domain, clean, meta.laneDetail);
    const stepPhase = computeStepPhase(classification.domain);

    // Lane age
    let laneAge = meta.laneAge || 0;
    laneAge = classification.domain && classification.domain === meta.currentLane ? laneAge + 1 : 1;

    // Personality hooks (kept)
    let frontDoor = null;
    if (nyxPersonality.getFrontDoorResponse) {
      frontDoor = nyxPersonality.getFrontDoorResponse(clean, meta, classification);
    }

    let domainPayload = {};
    if (nyxPersonality.enrichDomainResponse) {
      domainPayload = nyxPersonality.enrichDomainResponse(clean, meta, classification, mode);
    }

    // IMPORTANT: set currentLane BEFORE brain call so system prompt can inject lane rules
    const effectiveLane =
      classification.domain && classification.domain !== "general" ? classification.domain : meta.currentLane;

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

    // Prevent “hesitation” from hijacking real music_history flow
    const hesitation = isHesitationMessage(clean, classification);

    const historyItems = normalizeHistoryItems(history);

    // If hesitation, nudge; else answer
    let finalReply = "";
    if (hesitation) {
      finalReply = localBrainReply(clean, classification, metaForBrain);
    } else {
      finalReply = await openaiBrainReply(
        clean,
        classification,
        metaForBrain,
        historyItems,
        clientContext,
        resolutionHint,
        session
      );
    }

    // Suggestions (limited)
    const newSuggestionStep = (meta.lastSuggestionStep || 0) + 1;
    const suggestion = buildLaneSuggestion(classification.domain, newLaneDetail, meta.lastSuggestionStep || 0);
    if (suggestion && !finalReply.toLowerCase().includes(suggestion.toLowerCase().slice(0, 18))) {
      finalReply += `\n\n${suggestion}`;
    }

    // “Save hint” (one-time)
    let saveHintShown = !!meta.saveHintShown;
    if (!saveHintShown && ["tv", "radio", "sponsors", "news_canada", "music_history"].includes(classification.domain)) {
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

    // Session memory update (safe + lightweight)
    appendTurn(sessionId, { role: "user", content: clean });
    appendTurn(sessionId, { role: "assistant", content: finalReply });
    upsertSession(sessionId, { summary: session?.summary || "", openLoops: session?.openLoops || [] });

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

// ---------------------------------------------------------
// TTS ENDPOINT (ELEVENLABS) — safe-degrade placeholder
// ---------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "EMPTY_TEXT" });

    if (!ELEVENLABS_API_KEY || !NYX_VOICE_ID) {
      return res.status(500).json({
        error: "TTS_NOT_CONFIGURED",
        message: "Missing ELEVENLABS_API_KEY or NYX_VOICE_ID"
      });
    }

    // Keep your existing ElevenLabs call here if you already have it.
    return res.status(501).json({ error: "TTS_NOT_IMPLEMENTED_IN_THIS_PATCH" });
  } catch (err) {
    console.error("[Nyx] /api/tts error:", err.message);
    res.status(500).json({ ok: false, error: "TTS_FAILURE", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Nyx] Server running on port ${PORT} | build=${BUILD_TAG}`);
});
