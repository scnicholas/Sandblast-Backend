// index.js
// Main backend entry point for Sandblast GPT / Nyx

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
// Utility: safe string extraction
// ---------------------------------------------
function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
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

async function runCoreLogic(userMessage, boundaryContext, meta = {}) {
  const text = safeString(userMessage);
  const lower = text.toLowerCase();
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  // ------------------------------------------------------------------
  // STEP 1: Classifier-based intent / domain detection
  // ------------------------------------------------------------------

  let intent = "general";
  let domain = "general";

  let classified = null;

  try {
    // If your classifier is synchronous, remove "await" and "async" here and on function definition.
    classified = await intentClassifier.classifyIntent(text);

    if (classified) {
      if (classified.intent) {
        intent = safeString(classified.intent, "general");
      }
      if (classified.domain) {
        domain = safeString(classified.domain, "general");
      } else {
        domain = mapIntentToDomain(intent);
      }
    }
  } catch (err) {
    console.error("Intent classifier error:", err);
    // If classifier fails, we fall back to heuristics below.
  }

  const confidence =
    classified && typeof classified.confidence === "number"
      ? classified.confidence
      : null;

  const classifierStrongEnough = confidence === null || confidence >= 0.6;

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

  // ------------------------------------------------------------------
  // STEP 3: Route to Domain Handlers
  // ------------------------------------------------------------------

  let corePayload;

  switch (domain) {
    case "tv":
      corePayload = await handleTvDomain(userMessage, boundaryContext, meta);
      break;

    case "radio":
      corePayload = await handleRadioDomain(userMessage, boundaryContext, meta);
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
      corePayload = await handlePublicDomain(userMessage, boundaryContext, meta);
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
          `I’ve registered your request, but it didn’t map cleanly to a specific Sandblast area yet. ` +
          `You can ask about Sandblast TV, radio, streaming, News Canada, advertising, AI consulting, or public-domain verification.`,
      };
      break;
  }

  corePayload = corePayload || {};
  corePayload.intent = corePayload.intent || intent || "general";
  corePayload.category =
    corePayload.category || (isInternal ? "internal" : "public");

  return corePayload;
}

// ------------------------------------------------------------------
// DOMAIN HANDLERS (stubs to be upgraded with real logic)
// ------------------------------------------------------------------

async function handleTvDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  if (isInternal) {
    return {
      intent: "sandblast_tv_internal",
      category: "internal",
      message:
        "You’re asking about Sandblast TV / Roku / OTT. Internally, I can help you outline channel structure, scheduling, ad slots, and platform positioning. Tell me whether you want strategy, tech integration, or programming planning.",
    };
  }

  return {
    intent: "sandblast_tv_public",
    category: "public",
    message:
      "You’re asking about Sandblast TV. I can walk you through what’s available on the channel, how Roku fits in, and how viewers can access the platform.",
  };
}

async function handleRadioDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  if (isInternal) {
    return {
      intent: "sandblast_radio_internal",
      category: "internal",
      message:
        "This is about Sandblast Radio or live audio. Internally, I can help with show blocks, ad inventory, automation flow, and integration with the TV/streaming layers.",
    };
  }

  return {
    intent: "sandblast_radio_public",
    category: "public",
    message:
      "You’re asking about Sandblast Radio. I can help explain what shows are available, how to listen, and how it connects to the rest of Sandblast.",
  };
}

async function handleNewsCanadaDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  if (isInternal) {
    return {
      intent: "news_canada_internal",
      category: "internal",
      message:
        "You’re asking about News Canada content. Internally, I can help with content selection, placement on the site, performance tracking, and how it supports Sandblast’s authority and ad strategy.",
    };
  }

  return {
    intent: "news_canada_public",
    category: "public",
    message:
      "You’re asking about News Canada on Sandblast. I can help you understand what that content is, how it appears across the platform, and why it’s part of the ecosystem.",
  };
}

async function handleConsultingDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  if (isInternal) {
    return {
      intent: "ai_consulting_internal",
      category: "internal",
      message:
        "You’re touching the AI consulting side. Internally, I can help you refine offers, structure packages, outline case studies, or draft outreach copy for LinkedIn and partners.",
    };
  }

  return {
    intent: "ai_consulting_public",
    category: "public",
    message:
      "You’re asking about Sandblast AI consulting. I can outline what kind of AI help is available, who it’s for, and how it can support growth, marketing, and operations.",
  };
}

async function handlePublicDomain(userMessage, boundaryContext, meta) {
  const isInternal = nyxPersonality.isInternalContext(boundaryContext);

  if (isInternal) {
    return {
      intent: "pd_verification_internal",
      category: "internal",
      message:
        "This sounds like a public-domain / Archive.org / PD verification question. Internally, I can help you run through the Sandblast PD Kit steps and document proof for uploads.",
    };
  }

  return {
    intent: "pd_verification_public",
    category: "public",
    message:
      "You’re asking about public-domain content. I can explain how Sandblast approaches public-domain verification and why it matters for TV and streaming.",
  };
}

async function handleInternalDomain(userMessage, boundaryContext, meta) {
  return {
    intent: "internal_ops",
    category: "internal",
    message:
      "You’re in internal mode. I can help you with platform planning, debugging, workflow mapping, or content decisions. Tell me whether you’re working on TV, radio, News Canada, consulting, or backend/frontend issues.",
  };
}

// ---------------------------------------------
// Core API: Sandblast GPT / Nyx endpoint
// ---------------------------------------------
//
// Expected POST body shape:
//
// {
//   "message": "user message",
//   "actorName": "Mac" | "Jess" | "Nick",
//   "channel": "public" | "admin" | "internal",
//   "meta": {...}
// }
//

app.post("/api/sandblast-gpt", async (req, res) => {
  const startTime = Date.now();

  try {
    const body = req.body || {};

    const userMessage = safeString(body.message).trim();
    const actorName = safeString(body.actorName).trim(); // e.g. "Mac", "Jess", "Nick"
    const channel = safeString(body.channel || "public").trim().toLowerCase();
    const meta = body.meta || {};

    if (!userMessage) {
      return res.status(400).json({
        ok: false,
        error: "Missing 'message' in request body.",
      });
    }

    // 1) Resolve boundary context (who is speaking?)
    const boundaryContext = nyxPersonality.resolveBoundaryContext({
      actorName,
      channel,
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
      details:
        process.env.NODE_ENV === "production"
          ? undefined
          : safeString(err && err.message, "Unknown error"),
    });
  }
});

// ---------------------------------------------
// Start server
// ---------------------------------------------

app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});
