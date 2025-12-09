// index.js
// Sandblast / Nyx Backend
// - Nyx personality + tone wrapper integration
// - /api/sandblast-gpt for chat (online + offline mode)
// - /api/tts using OpenAI GPT-4o TTS
// -----------------------------------------------------

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const nyxPersonality = require("./Utils/nyxPersonality");
// NEW: intent classifier (TV / Radio / Sponsors / Streaming / News Canada / AI Consulting)
const { classifyIntent } = require("./Utils/intentClassifier");

const app = express();

// ---------------------------------------------
// Middleware
// ---------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------
// Config
// ---------------------------------------------
const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// Offline toggle: set NYX_OFFLINE_MODE=true in Render env vars
const NYX_OFFLINE_MODE = process.env.NYX_OFFLINE_MODE === "true";

if (!OPENAI_API_KEY) {
  console.warn("[Nyx] Warning: OPENAI_API_KEY is not set. GPT will not work.");
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ---------------------------------------------
// Helper: Map topic (mode chip) -> domain
// ---------------------------------------------
function mapTopicToDomain(topic) {
  const t = (topic || "general").toString().toLowerCase();
  switch (t) {
    case "tv":
      return "tv";
    case "radio":
      return "radio";
    case "streaming":
      // treat streaming as TV-side for now
      return "tv";
    case "sponsors":
      return "advertising";
    case "news_canada":
      return "news_canada";
    case "consulting":
      return "consulting";
    default:
      return "general";
  }
}

// ---------------------------------------------
// Helper: lane-specific greeting text
// ---------------------------------------------
function buildLaneGreeting(topic) {
  const lane = (topic || "general").toLowerCase();

  switch (lane) {
    case "tv":
      return "Hi — you’re on the TV lane. Want to tune a nightly block, pick shows for a slot, or test a new lineup?";
    case "radio":
      return "Hi — we’re in the radio lane. Do you want to shape a show, build a segment, or plan a sponsor block on air?";
    case "streaming":
      return "Hi — you’re in the streaming lane. Want to talk binge-night themes, on-demand picks, or how this fits with Sandblast TV?";
    case "sponsors":
      return "Hi — this is the sponsors lane. Are you thinking about a 4-week test, a specific brand, or where to place them in the schedule?";
    case "news_canada":
      return "Hi — you’re in the News Canada lane. Want to plug in specific stories, match them to shows, or plan where they sit in the grid?";
    case "consulting":
      return "Hi — this is the AI consulting lane. Do you want help with strategy, workflows, or a concrete AI pilot you can run first?";
    case "general":
    default:
      return "Hi — good to see you here. What do you want to tune in on: TV, radio, streaming, sponsors, or something else?";
  }
}

// ---------------------------------------------
// Root route
// ---------------------------------------------
app.get("/", (req, res) => {
  res.send("Sandblast Nyx backend is live. GPT + TTS / Offline mode ready. ✅");
});

// ---------------------------------------------
// Helper: Build system messages for GPT
// ---------------------------------------------
function buildNyxSystemMessages(boundaryContext, emotion, topic) {
  const systemMessages = [];

  // Nyx persona definition
  if (nyxPersonality.NYX_SYSTEM_PERSONA) {
    systemMessages.push({
      role: "system",
      content: nyxPersonality.NYX_SYSTEM_PERSONA.trim(),
    });
  }

  // Core Sandblast realism + sponsor guidance
  systemMessages.push({
    role: "system",
    content:
      "You are Nyx, the AI brain for Sandblast Channel — a growing, resource-aware media platform, not a giant global network. " +
      "Keep all recommendations realistic for a small but expanding channel. " +
      "When the user is asking about sponsors, advertisers, or campaigns, always include exactly one proof point (e.g., engagement, audience fit, or realistic expected outcome) " +
      "and one concrete next action (for example, 'test this with a four-week sponsor block on one show' or 'run a small pilot campaign first').",
  });

  // Boundary / role information
  if (boundaryContext) {
    const { actor, role, boundary } = boundaryContext;
    systemMessages.push({
      role: "system",
      content:
        `Context: You are responding as Nyx.\n` +
        `Actor: ${actor}\n` +
        `Role: ${role}\n` +
        `Boundary: ${boundary.description}`,
    });
  }

  // Emotional state
  if (emotion) {
    systemMessages.push({
      role: "system",
      content: `User emotional state: ${emotion}. Adjust tone accordingly.`,
    });
  }

  // Current UI mode (chip) context
  if (topic) {
    systemMessages.push({
      role: "system",
      content:
        `Current interaction mode (from UI chips): ${topic}. ` +
        "Bias your framing towards this lane (TV, Radio, Streaming, Sponsors, News Canada, AI Consulting), " +
        "while still answering the user’s actual question.",
    });
  }

  return systemMessages;
}

// ---------------------------------------------
// Helper: Offline Nyx brain (no OpenAI calls)
// ---------------------------------------------
function handleOfflineNyx(userMessage, boundaryContext, meta) {
  const role = boundaryContext?.role || "public";

  // Intent + toneHint from classifier (TV / Radio / Sponsors / etc.)
  const intentData = classifyIntent(userMessage || "");
  meta.intent = intentData.intent;
  meta.toneHint = intentData.toneHint;

  const laneGreeting = buildLaneGreeting(meta.topic || "general");

  // Front door greeting (public only)
  const isGreeting =
    typeof nyxPersonality.isFrontDoorGreeting === "function"
      ? nyxPersonality.isFrontDoorGreeting(userMessage)
      : /^(hi|hello|hey)\b/i.test(userMessage || "");

  if (isGreeting && role === "public") {
    const frontPayload = {
      intent: "front_door",
      category: "public",
      domain: mapTopicToDomain(meta.topic || "general"),
      message: laneGreeting,
    };

    const wrappedFront = nyxPersonality.wrapWithNyxTone(
      frontPayload,
      userMessage,
      meta
    );
    return wrappedFront;
  }

  // 2) TV micro-scripts (rule-based)
  const tvIntent =
    typeof nyxPersonality.detectTvShowIntent === "function"
      ? nyxPersonality.detectTvShowIntent(userMessage, meta, intentData)
      : null;

  if (tvIntent && typeof nyxPersonality.buildTvShowMicroScript === "function") {
    const tvPayload = nyxPersonality.buildTvShowMicroScript(
      tvIntent,
      boundaryContext,
      meta
    );
    const wrappedTv = nyxPersonality.wrapWithNyxTone(
      tvPayload,
      userMessage,
      meta
    );
    return wrappedTv;
  }

  // 3) Sponsor lane (4-week tests, rule-based)
  const sponsorIntent =
    typeof nyxPersonality.detectSponsorIntent === "function"
      ? nyxPersonality.detectSponsorIntent(userMessage, meta, intentData)
      : null;

  if (
    sponsorIntent &&
    typeof nyxPersonality.buildSponsorLaneResponse === "function"
  ) {
    const sponsorPayload = nyxPersonality.buildSponsorLaneResponse(
      sponsorIntent,
      boundaryContext,
      meta
    );
    const wrappedSponsor = nyxPersonality.wrapWithNyxTone(
      sponsorPayload,
      userMessage,
      meta
    );
    return wrappedSponsor;
  }

  // 4) Fallback: offline explainer
  const fallbackPayload = {
    intent: "offline_fallback",
    category: role === "public" ? "public" : "internal",
    domain: mapTopicToDomain(meta.topic || "general"),
    message:
      role === "public"
        ? "Nyx’s online model is in offline mode right now, but I can still help you think through Sandblast TV blocks or sponsor tests. Tell me the show, night, or sponsor idea you’re working on."
        : "Nyx’s external model is offline for now, but the builder lane is still live. Tell me the block you’re tuning—patrol night, westerns, or a sponsor concept—and I’ll help you structure it in a clean, realistic way.",
  };

  const wrappedFallback = nyxPersonality.wrapWithNyxTone(
    fallbackPayload,
    userMessage,
    meta
  );
  return wrappedFallback;
}

// ---------------------------------------------
// /api/sandblast-gpt — Nyx primary brain
// ---------------------------------------------
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const {
      message,
      channel = "public",
      persona = "nyx",
      topic = "general",
      stepIndex = 0,
      lastDomain = "general",
      lastEmotion = "neutral",
      actorName = "Visitor",
    } = req.body || {};

    const userMessage = (message || "").toString().trim();
    if (!userMessage) {
      return res
        .status(400)
        .json({ error: "Missing 'message' in request body." });
    }

    const normalizedTopic = (topic || "general").toString().toLowerCase();
    const domainFromTopic = mapTopicToDomain(normalizedTopic);

    // Boundary / role
    const boundaryContext = nyxPersonality.resolveBoundaryContext({
      actorName,
      channel,
      persona,
    });

    // Emotion detection
    const currentEmotion = nyxPersonality.detectEmotionalState(userMessage);

    // Intent + tone from classifier (used for persona shaping)
    const intentData = classifyIntent(userMessage);
    const { intent, toneHint, confidence } = intentData;

    const meta = {
      stepIndex: Number(stepIndex) || 0,
      lastDomain: lastDomain || domainFromTopic || "general",
      lastEmotion: lastEmotion || "neutral",
      userEmotion: currentEmotion,
      topic: normalizedTopic,
      intent,
      toneHint,
      intentConfidence: confidence,
    };

    // -----------------------------------------
    // OFFLINE MODE (no OpenAI calls)
// -----------------------------------------
    if (NYX_OFFLINE_MODE || !OPENAI_API_KEY) {
      const offline = handleOfflineNyx(userMessage, boundaryContext, meta);

      return res.json({
        reply: offline.message,
        meta: {
          stepIndex: (meta.stepIndex || 0) + 1,
          lastDomain: offline.domain || domainFromTopic || "general",
          lastEmotion: currentEmotion,
          role: boundaryContext.role,
          topic: normalizedTopic,
          intent,
          toneHint,
          intentConfidence: confidence,
        },
      });
    }

    // -----------------------------------------
    // ONLINE MODE (OpenAI GPT)
// -----------------------------------------

    const laneGreeting = buildLaneGreeting(normalizedTopic);

    // Quick greeting/intro logic when online (public only)
    const isGreeting =
      typeof nyxPersonality.isFrontDoorGreeting === "function"
        ? nyxPersonality.isFrontDoorGreeting(userMessage)
        : /^(hi|hello|hey)\b/i.test(userMessage || "");

    if (isGreeting && boundaryContext.role === "public") {
      const frontPayload = {
        intent: "front_door",
        category: "public",
        domain: domainFromTopic,
        message: laneGreeting,
      };

      const wrapped = nyxPersonality.wrapWithNyxTone(
        frontPayload,
        userMessage,
        meta
      );

      return res.json({
        reply: wrapped.message,
        meta: {
          stepIndex: (meta.stepIndex || 0) + 1,
          lastDomain:
            wrapped.domain ||
            frontPayload.domain ||
            domainFromTopic ||
            "general",
          lastEmotion: currentEmotion,
          role: boundaryContext.role,
          topic: normalizedTopic,
          intent,
          toneHint,
          intentConfidence: confidence,
        },
      });
    }

    if (!OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY not configured." });
    }

    // GPT CALL
    const systemMessages = buildNyxSystemMessages(
      boundaryContext,
      currentEmotion,
      normalizedTopic
    );

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [...systemMessages, { role: "user", content: userMessage }],
      temperature: 0.4,
      max_tokens: 700,
    });

    const modelText =
      completion?.choices?.[0]?.message?.content ||
      "Nyx here. I didn’t quite catch that — could you phrase it another way?";

    const basePayload = {
      intent: intent || "model_reply",
      category: boundaryContext.role === "public" ? "public" : "internal",
      domain: domainFromTopic,
      message: modelText.toString().trim(),
    };

    // Wrap with Nyx tone + realism
    const wrapped = nyxPersonality.wrapWithNyxTone(
      basePayload,
      userMessage,
      meta
    );

    res.json({
      reply: wrapped.message,
      meta: {
        stepIndex: (Number(stepIndex) || 0) + 1,
        lastDomain:
          wrapped.domain || basePayload.domain || domainFromTopic || "general",
        lastEmotion: currentEmotion,
        role: boundaryContext.role,
        topic: normalizedTopic,
        intent,
        toneHint,
        intentConfidence: confidence,
      },
    });
  } catch (err) {
    console.error("[Nyx] /api/sandblast-gpt error:", err);

    let details = "Unknown error";
    if (err) {
      if (err.message) {
        details = err.message;
      } else {
        try {
          details = JSON.stringify(err);
        } catch (_) {
          details = String(err);
        }
      }
    }

    res.status(500).json({
      error: "Nyx encountered an error while processing your request.",
      details,
    });
  }
});

// ---------------------------------------------
// /api/tts — GPT-4o TTS (still online-only)
// ---------------------------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    const trimmed = (text || "").toString().trim();

    if (!trimmed) {
      return res
        .status(400)
        .json({ error: "Missing 'text' in request body." });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "TTS not configured: OPENAI_API_KEY missing.",
      });
    }

    // GPT-4o TTS call
    const audioResponse = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy", // Options: alloy, verse, nova
      input: trimmed,
    });

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    console.error("[Nyx] /api/tts error:", err);

    let details = "Unknown error";
    if (err) {
      if (err.message) {
        details = err.message;
      } else {
        try {
          details = JSON.stringify(err);
        } catch (_) {
          details = String(err);
        }
      }
    }

    res.status(500).json({
      error: "Nyx encountered an error while generating audio.",
      details,
    });
  }
});

// ---------------------------------------------
// Start server
// ---------------------------------------------
app.listen(PORT, () => {
  console.log(
    `Nyx backend listening on port ${PORT} — GPT + TTS + Offline mode`
  );
});
