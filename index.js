// index.js
// Sandblast / Nyx Backend v2.1
// - Nyx personality + tone wrapper integration
// - TV Micro-Script Engine Routing
// - Sponsor-lane routing (advertising / revenue)
// - /api/sandblast-gpt for chat
// - /api/tts using GPT-4o TTS
// -----------------------------------------------------

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const nyxPersonality = require("./Utils/nyxPersonality");

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

if (!OPENAI_API_KEY) {
  console.warn("[Nyx] Warning: OPENAI_API_KEY is not set. GPT will not work.");
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ---------------------------------------------
// Root route
// ---------------------------------------------
app.get("/", (req, res) => {
  res.send("Sandblast Nyx backend is live. GPT + TTS active. ✅");
});

// ---------------------------------------------
// Helper: Build system messages for GPT
// ---------------------------------------------
function buildNyxSystemMessages(boundaryContext, emotion) {
  const systemMessages = [];

  if (nyxPersonality.NYX_SYSTEM_PERSONA) {
    systemMessages.push({
      role: "system",
      content: nyxPersonality.NYX_SYSTEM_PERSONA.trim(),
    });
  }

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

  if (emotion) {
    systemMessages.push({
      role: "system",
      content: `User emotional state: ${emotion}. Adjust tone accordingly.`,
    });
  }

  return systemMessages;
}

// ------------------------------------------------------
// Primary: /api/sandblast-gpt
// ------------------------------------------------------
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
      showName,
      episode,
    } = req.body || {};

    const userMessage = (message || "").toString().trim();
    if (!userMessage) {
      return res
        .status(400)
        .json({ error: "Missing 'message' in request body." });
    }

    if (!OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY missing." });
    }

    // Boundary context (public/internal/admin)
    const boundaryContext = nyxPersonality.resolveBoundaryContext({
      actorName,
      channel,
      persona,
    });

    const internalMode = boundaryContext.role !== "public";

    // Emotional detection
    const currentEmotion = nyxPersonality.detectEmotionalState(userMessage);

    // Metadata for tone wrapper + continuity
    const meta = {
      stepIndex: Number(stepIndex) || 0,
      lastDomain: lastDomain || topic || "general",
      lastEmotion: lastEmotion || "neutral",
      userEmotion: currentEmotion,
      topic: topic || "general",
    };

    // -----------------------------------------
    // 1. Front-door logic (small talk, greeting)
    // -----------------------------------------
    const frontDoor = nyxPersonality.handleNyxFrontDoor(userMessage);
    if (frontDoor && boundaryContext.role === "public") {
      const wrapped = nyxPersonality.wrapWithNyxTone(
        frontDoor,
        userMessage,
        meta
      );

      return res.json({
        reply: wrapped.message,
        meta: {
          stepIndex: meta.stepIndex + 1,
          lastDomain: wrapped.domain || "general",
          lastEmotion: currentEmotion,
          role: boundaryContext.role,
          topic,
        },
      });
    }

    // -----------------------------------------
    // 2. TV-SHOW MICRO-SCRIPT ROUTING
    // -----------------------------------------
    const tvIntent = nyxPersonality.detectTvShowIntent(userMessage);
    if (tvIntent || topic === "tv-show") {
      const extractedShow =
        showName ||
        (userMessage.split("for")[1] || "").trim() ||
        "This Show";

      const extractedEp = episode || null;

      const microScript = nyxPersonality.buildTvShowMicroScript(
        extractedShow,
        extractedEp,
        internalMode
      );

      const payload = {
        intent: "tv_show_micro",
        category: internalMode ? "internal" : "public",
        domain: "tv-show",
        message: microScript,
      };

      const wrapped = nyxPersonality.wrapWithNyxTone(
        payload,
        userMessage,
        meta
      );

      return res.json({
        reply: wrapped.message,
        meta: {
          stepIndex: meta.stepIndex + 1,
          lastDomain: "tv-show",
          lastEmotion: currentEmotion,
          role: boundaryContext.role,
          topic: "tv-show",
        },
      });
    }

    // -----------------------------------------
    // 3. SPONSOR / ADVERTISING LANE ROUTING
    // -----------------------------------------
    const sponsorIntent = nyxPersonality.detectSponsorIntent(userMessage);
    if (sponsorIntent || topic === "advertising") {
      const sponsorMessage = nyxPersonality.buildSponsorLaneResponse(
        userMessage,
        topic,
        internalMode
      );

      const payload = {
        intent: "sponsor_lane",
        category: internalMode ? "internal" : "public",
        domain: "advertising",
        message: sponsorMessage,
      };

      const wrapped = nyxPersonality.wrapWithNyxTone(
        payload,
        userMessage,
        meta
      );

      return res.json({
        reply: wrapped.message,
        meta: {
          stepIndex: meta.stepIndex + 1,
          lastDomain: "advertising",
          lastEmotion: currentEmotion,
          role: boundaryContext.role,
          topic: "advertising",
        },
      });
    }

    // -----------------------------------------
    // 4. Default → GPT Completion
    // -----------------------------------------
    const systemMessages = buildNyxSystemMessages(
      boundaryContext,
      currentEmotion
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
      intent: "model_reply",
      category: internalMode ? "internal" : "public",
      domain: topic || "general",
      message: modelText.trim(),
    };

    const wrapped = nyxPersonality.wrapWithNyxTone(
      basePayload,
      userMessage,
      meta
    );

    res.json({
      reply: wrapped.message,
      meta: {
        stepIndex: meta.stepIndex + 1,
        lastDomain: basePayload.domain,
        lastEmotion: currentEmotion,
        role: boundaryContext.role,
        topic,
      },
    });
  } catch (err) {
    console.error("[Nyx] /api/sandblast-gpt error:", err);
    res.status(500).json({
      error: "Nyx encountered an error while processing your request.",
    });
  }
});

// ------------------------------------------------------
// /api/tts — GPT-4o Mini TTS
// ------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    const trimmed = (text || "").toString().trim();

    if (!trimmed) {
      return res.status(400).json({ error: "Missing 'text' in request body." });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "TTS not configured: OPENAI_API_KEY missing.",
      });
    }

    const audioResponse = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: trimmed,
    });

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    console.error("[Nyx] /api/tts error:", err);
    res.status(500).json({
      error: "Nyx encountered an error while generating audio.",
      details: String(err),
    });
  }
});

// ------------------------------------------------------
// Start server
// ------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Nyx backend listening on port ${PORT} — GPT + TTS active`);
});
