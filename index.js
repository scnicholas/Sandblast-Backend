// index.js
// Main backend entry point for Sandblast GPT / Nyx
// Key-free version: no external TTS/OpenAI required, safe for current Webflow widget.

const express = require("express");
const cors = require("cors");

// Nyx personality + boundaries + tone
const nyxPersonality = require("./Utils/nyxPersonality");

// Intent classifier (your custom logic in Utils/intentClassifier.js)
const intentClassifier = require("./Utils/intentClassifier");

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Use Render's port or default to 3000 locally
const PORT = process.env.PORT || 3000;

// ---------------------------------------------
// Health check routes
// ---------------------------------------------

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Sandblast Backend",
    message: "Backend is running.",
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------
// Utility helpers
// ---------------------------------------------

function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

// Lightweight logging helper
function logRouteEvent(route, details = {}) {
  try {
    const payload = {
      route,
      ts: new Date().toISOString(),
      ...details,
    };
    console.log("[Sandblast]", JSON.stringify(payload));
  } catch (e) {
    console.log("[Sandblast] logRouteEvent error:", e.message);
  }
}

// ---------------------------------------------
// CORE BRAIN: Intent + Domain Routing
// ---------------------------------------------

function mapIntentToDomain(intent) {
  const label = safeString(intent).toLowerCase();

  if (!label) return "general";

  if (label.includes("tv")) return "tv";
  if (label.includes("radio")) return "radio";
  if (label.includes("news")) return "news_canada";
  if (label.includes("consult")) return "consulting";
  if (label.includes("pd") || label.includes("public_domain")) return "public_domain";
  if (label.includes("internal")) return "internal";

  return "general";
}

/**
 * Map topicHint (from the front-end widget) to domain + intent.
 * Expected topicHint values from Webflow:
 *   - "tv_streaming"
 *   - "radio_live"
 *   - "ai_consulting"
 *   - "overview"
 *   - "general"
 */
function mapTopicHintToDomainIntent(topicHintRaw, isInternal) {
  const topic = safeString(topicHintRaw).toLowerCase();
  if (!topic) return null;

  const strong = 0.99; // treat widget hints as high-confidence

  if (topic === "tv_streaming") {
    return {
      domain: "tv",
      intent: isInternal ? "sandblast_tv_internal" : "sandblast_tv_public",
      confidence: strong,
    };
  }

  if (topic === "radio_live") {
    return {
      domain: "radio",
      intent: isInternal ? "sandblast_radio_internal" : "sandblast_radio_public",
      confidence: strong,
    };
  }

  if (topic === "ai_consulting") {
    return {
      domain: "consulting",
      intent: isInternal ? "ai_consulting_internal" : "ai_consulting_public",
      confidence: strong,
    };
  }

  if (topic === "overview") {
    return {
      domain: "general",
      intent: "welcome",
      confidence: strong,
    };
  }

  // Fallback: treat unknown hints as general but still a hint
  return {
    domain: "general",
    intent: "general",
    confidence: 0.7,
  };
}

async function runCoreLogic(userMessage, boundaryContext, meta = {}) {
  const text = safeString(userMessage);
  const lower = text.toLowerCase();
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  // Pull topicHint/persona from meta if provided
  const topicHintRaw =
    meta && meta.topicHint ? safeString(meta.topicHint).toLowerCase() : "";
  const hasTopicHint = !!topicHintRaw;

  // ------------------------------------------------------------------
  // STEP 1: Classifier-based intent / domain detection
  // ------------------------------------------------------------------

  let intent = "general";
  let domain = "general";

  let classified = null;
  let confidence = null;

  try {
    classified = await intentClassifier.classifyIntent(text);

    if (classified && typeof classified.intent === "string") {
      intent = safeString(classified.intent, "general");
    }

    if (classified && typeof classified.domain === "string") {
      domain = safeString(classified.domain, "general");
    } else {
      domain = mapIntentToDomain(intent);
    }

    if (classified && typeof classified.confidence === "number") {
      confidence = classified.confidence;
    }
  } catch (err) {
    console.error("Intent classifier error:", err);
    // If classifier fails, we fall back to heuristics below.
  }

  // If the front-end passed a topicHint, let that overwrite domain/intent
  if (hasTopicHint) {
    const mapped = mapTopicHintToDomainIntent(topicHintRaw, isInternal);
    if (mapped) {
      domain = mapped.domain;
      intent = mapped.intent;
      confidence = mapped.confidence;
    }
  }

  // If the classifier (or topicHint) didn’t provide a meaningful confidence, treat it as weak
  const classifierStrongEnough =
    typeof confidence === "number" ? confidence >= 0.6 : false;

  // ------------------------------------------------------------------
  // STEP 2: Fallback heuristics if classifier is weak/unsure
  // ------------------------------------------------------------------

  if (!classifierStrongEnough || domain === "general") {
    if (
      lower.includes("tv") ||
      lower.includes("television") ||
      lower.includes("channel") ||
      lower.includes("roku")
    ) {
      domain = "tv";
      intent = "sandblast_tv";
    } else if (
      lower.includes("radio") ||
      lower.includes("audio stream") ||
      lower.includes("sandblast radio")
    ) {
      domain = "radio";
      intent = "sandblast_radio";
    } else if (
      lower.includes("news canada") ||
      lower.includes("news content")
    ) {
      domain = "news_canada";
      intent = "news_canada";
    } else if (
      lower.includes("consulting") ||
      lower.includes("ai strategy") ||
      lower.includes("ai consulting") ||
      lower.includes("prompt engineering")
    ) {
      domain = "consulting";
      intent = "ai_consulting";
    } else if (
      lower.includes("public domain") ||
      lower.includes("archive.org") ||
      lower.includes("pd check")
    ) {
      domain = "public_domain";
      intent = "pd_verification";
    } else if (isInternal) {
      domain = "internal";
      intent = "internal_ops";
    } else {
      domain = domain || "general";
      intent = intent || "general";
    }
  }

  logRouteEvent("coreLogic", {
    actor: boundaryContext.actor,
    role: boundaryContext.role,
    domain,
    intent,
    confidence,
    isInternal,
    topicHint: topicHintRaw || null,
  });

  // ------------------------------------------------------------------
  // STEP 3: Route to Domain Handlers (pure logic, no external APIs)
// ------------------------------------------------------------------

  let corePayload;

  try {
    switch (domain) {
      case "tv":
        corePayload = await handleTvDomain(userMessage, boundaryContext, meta);
        break;

      case "radio":
        corePayload = await handleRadioDomain(
          userMessage,
          boundaryContext,
          meta
        );
        break;

      case "news_canada":
        corePayload = await handleNewsCanadaDomain(
          userMessage,
          boundaryContext,
          meta
        );
        break;

      case "consulting":
        corePayload = await handleConsultingDomain(
          userMessage,
          boundaryContext,
          meta
        );
        break;

      case "public_domain":
        corePayload = await handlePublicDomain(
          userMessage,
          boundaryContext,
          meta
        );
        break;

      case "internal":
        corePayload = await handleInternalDomain(
          userMessage,
          boundaryContext,
          meta
        );
        break;

      default:
        corePayload = {
          intent,
          category: isInternal ? "internal" : "public",
          message:
            "I’ve registered your request, but it didn’t map cleanly to a specific Sandblast area yet. " +
            "You can ask about Sandblast TV, radio, streaming, News Canada, advertising, AI consulting, or public-domain verification.",
          domain: "general",
        };
        break;
    }
  } catch (err) {
    console.error("Domain handler error:", err);
    corePayload = {
      intent: "handler_error",
      category: isInternal ? "internal" : "public",
      message:
        "I hit an internal error while routing that request. The backend is still running, but that specific branch needs a check.",
      domain: "general",
    };
  }

  corePayload = corePayload || {};
  corePayload.intent = corePayload.intent || intent || "general";
  corePayload.category =
    corePayload.category || (isInternal ? "internal" : "public");

  // Expose domain explicitly so nyxPersonality can shape tone by area
  corePayload.domain = corePayload.domain || domain || "general";

  // Ensure we never return a payload without a message
  if (!corePayload.message || !String(corePayload.message).trim()) {
    corePayload.message =
      "I received your request but didn’t generate a clear response. Try asking about Sandblast TV, radio, streaming, News Canada, advertising, AI consulting, or public-domain checks.";
  }

  return corePayload;
}

// ---------------------------------------------
// DOMAIN HANDLERS (TV / Radio / News / Consulting / PD / Internal)
// Pure logic – no external APIs
// ---------------------------------------------

async function handleTvDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);
  const lower = safeString(userMessage).toLowerCase();

  const mentionsTtDash =
    lower.includes("ttdash") ||
    lower.includes("tt dash") ||
    lower.includes("tt-dash");
  const mentionsRoku = lower.includes("roku");

  let intent;
  let category;
  let message;

  if (isInternal) {
    intent = "sandblast_tv_internal";
    category = "internal";

    message =
      "You’re asking about Sandblast TV. Internally, I can help you align the TV layer with the rest of the Sandblast stack: content blocks, channel flow, ad windows, and how it all connects back to your core offers.";

    if (mentionsTtDash || mentionsRoku) {
      message =
        "You’re asking about the Sandblast TV layer in relation to TT Dash and Roku.\n\n" +
        "Here’s how I can support you internally:\n" +
        "1) Platform mapping – how TT Dash acts as the OTT backbone and how the Roku channel sits on top as the viewer-facing endpoint.\n" +
        "2) Channel structure – defining Sandblast TV layout: flagship blocks, classic content, News Canada segments, and ad windows.\n" +
        "3) Ad + inventory logic – where ad breaks fit inside TT Dash streams and how that turns into sellable inventory on Roku.\n" +
        "4) Meeting prep – talking points and questions for TT Dash / Roku so you can speak clearly about stability, discoverability, monetization, and scaling.\n\n" +
        "Tell me what you want to focus on first: platform architecture, programming layout, ad strategy, or meeting prep.";
    }
  } else {
    intent = "sandblast_tv_public";
    category = "public";

    message =
      "You’re asking about Sandblast TV. It’s the television side of the Sandblast ecosystem—curated programming, classic content, and feature blocks delivered as a streaming channel.";

    if (mentionsRoku || mentionsTtDash) {
      message +=
        " You’ll be able to access Sandblast TV through supported streaming platforms like Roku, with OTT delivery handled behind the scenes. I can walk you through how to watch, what to expect, and how it connects to Sandblast radio, News Canada, and our AI tools.";
    } else {
      message +=
        " If you’d like, I can walk you through what’s on the channel, how to watch it, and how it ties into Sandblast Radio, News Canada content, and AI-powered tools.";
    }
  }

  return {
    intent,
    category,
    message,
    domain: "tv",
  };
}

async function handleRadioDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  let intent;
  let category;
  let message;

  if (isInternal) {
    intent = "sandblast_radio_internal";
    category = "internal";
    message =
      "This is about Sandblast Radio or live audio. Internally, I can help with show blocks, ad inventory, automation flow, and integration with the TV/streaming layers.";
  } else {
    intent = "sandblast_radio_public";
    category = "public";
    message =
      "You’re asking about Sandblast Radio. I can explain what shows are available, how to listen, and how it connects to the rest of Sandblast.";
  }

  return {
    intent,
    category,
    message,
    domain: "radio",
  };
}

async function handleNewsCanadaDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  let intent;
  let category;
  let message;

  if (isInternal) {
    intent = "news_canada_internal";
    category = "internal";
    message =
      "You’re asking about News Canada content. Internally, I can help with content selection, placement on the site, performance tracking, and how it supports Sandblast’s authority and ad strategy.";
  } else {
    intent = "news_canada_public";
    category = "public";
    message =
      "You’re asking about News Canada on Sandblast. I can help you understand what that content is, how it appears across the platform, and why it’s part of the ecosystem.";
  }

  return {
    intent,
    category,
    message,
    domain: "news_canada",
  };
}

async function handleConsultingDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  let intent;
  let category;
  let message;

  if (isInternal) {
    intent = "ai_consulting_internal";
    category = "internal";
    message =
      "You’re touching the AI consulting side. Internally, I can help you refine offers, structure packages, outline case studies, or draft outreach copy for LinkedIn and partners.";
  } else {
    intent = "ai_consulting_public";
    category = "public";
    message =
      "You’re asking about Sandblast AI consulting. I can outline what kind of AI help is available, who it’s for, and how it can support growth, marketing, and operations.";
  }

  return {
    intent,
    category,
    message,
    domain: "consulting",
  };
}

async function handlePublicDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  let intent;
  let category;
  let message;

  if (isInternal) {
    intent = "pd_verification_internal";
    category = "internal";
    message =
      "This sounds like a public-domain / Archive.org / PD verification question. Internally, I can help you run through the Sandblast PD Kit steps and document proof for uploads.";
  } else {
    intent = "pd_verification_public";
    category = "public";
    message =
      "You’re asking about public-domain content. I can explain how Sandblast approaches public-domain verification and why it matters for TV and streaming.";
  }

  return {
    intent,
    category,
    message,
    domain: "public_domain",
  };
}

async function handleInternalDomain(userMessage, boundaryContext, meta) {
  const intent = "internal_ops";
  const category = "internal";

  const message =
    "You’re in internal mode. I can help with platform planning, debugging, workflow mapping, or content decisions. Tell me whether you’re working on TV, radio, News Canada, consulting, or backend/frontend issues.";

  return {
    intent,
    category,
    message,
    domain: "internal",
  };
}

// ---------------------------------------------
// Core API: Sandblast GPT / Nyx endpoint
// ---------------------------------------------
//
// Expected POST body (from Webflow widget):
// {
//   "message": "user message",           // required
//   "actorName": "Mac" | "Jess" | "Nick",// optional
//   "channel": "public" | "admin" | "internal",
//   "persona": "nyx",
//   "topicHint": "tv_streaming" | "radio_live" | "ai_consulting" | "overview" | "general",
//   "meta": {...}
// }
//

app.post("/api/sandblast-gpt", async (req, res) => {
  const startTime = Date.now();

  try {
    const body = req.body || {};

    const userMessage = safeString(body.message).trim();
    const actorName = safeString(body.actorName).trim();
    const channel = safeString(body.channel || "public").trim().toLowerCase();

    // persona + topicHint from front-end
    const persona = safeString(body.persona || "nyx").trim().toLowerCase();
    const topicHint = safeString(body.topicHint).trim().toLowerCase();

    // Meta: keep whatever was passed, then add widget metadata
    const meta =
      body.meta && typeof body.meta === "object" ? { ...body.meta } : {};

    if (topicHint) meta.topicHint = topicHint;
    if (persona) meta.persona = persona;
    if (channel) meta.channel = channel;

    if (!userMessage) {
      return res.status(400).json({
        ok: false,
        error: "Missing 'message' in request body.",
      });
    }

    const boundaryContext = nyxPersonality.resolveBoundaryContext({
      actorName,
      channel,
      persona,
    });

    logRouteEvent("sandblast-gpt", {
      actor: boundaryContext.actor,
      role: boundaryContext.role,
      channel,
      persona,
      topicHint: topicHint || null,
      messagePreview: userMessage.slice(0, 80),
    });

    // 2) Front-door conversational handling (greetings, small talk, quick support)
    const frontDoorPayload = nyxPersonality.handleNyxFrontDoor(userMessage);

    if (frontDoorPayload) {
      const wrapped = nyxPersonality.wrapWithNyxTone(
        frontDoorPayload,
        userMessage
      );

      return res.json({
        ok: true,
        source: "front_door",
        role: boundaryContext.role,
        actor: boundaryContext.actor,
        boundaryDescription: boundaryContext.boundary.description,
        response: wrapped,
        durationMs: Date.now() - startTime,
      });
    }

    // 3) Core brain: classifier + domain routing
    const corePayload = await runCoreLogic(userMessage, boundaryContext, meta);

    // 4) Wrap final payload with Nyx tone & patterns
    const finalPayload = nyxPersonality.wrapWithNyxTone(
      corePayload,
      userMessage
    );

    return res.json({
      ok: true,
      source: "core",
      role: boundaryContext.role,
      actor: boundaryContext.actor,
      boundaryDescription: boundaryContext.boundary.description,
      response: finalPayload,
      meta,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    console.error("Error in /api/sandblast-gpt:", err);

    return res.status(500).json({
      ok: false,
      error: "Internal server error in Sandblast backend.",
    });
  }
});

// ---------------------------------------------
// Text-to-Speech (TTS) endpoint for Nyx / Sandblast
// ---------------------------------------------
//
// NO external TTS provider here.
// This endpoint simply confirms TTS is "disabled" on backend.
// Front-end (Webflow) should use browser TTS (speechSynthesis) or other client-side voice.
// ---------------------------------------------

app.post("/api/tts", async (req, res) => {
  try {
    const body = req.body || {};
    const text = safeString(body.text).trim();

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "Missing 'text' in request body for /api/tts.",
      });
    }

    logRouteEvent("tts_request_disabled", {
      textLength: text.length,
      note: "Backend TTS disabled; use browser/client-side TTS.",
    });

    return res.json({
      ok: true,
      audioBase64: null,
      meta: {
        mode: "disabled",
        reason:
          "Backend TTS not configured. Use browser TTS (speechSynthesis) or another client-side voice system.",
        textLength: text.length,
      },
    });
  } catch (err) {
    console.error("Error in /api/tts:", err);
    // Even on error, do NOT explode – still report disabled
    return res.json({
      ok: true,
      audioBase64: null,
      meta: {
        mode: "disabled",
        reason:
          "Backend TTS hit an internal error but remains in 'disabled' mode. Use client-side TTS.",
      },
    });
  }
});

// ---------------------------------------------
// Start server
// ---------------------------------------------

app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});
