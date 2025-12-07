// index.js
// Sandblast / Nyx Backend
// - Nyx personality + tone wrapper integration
// - /api/sandblast-gpt for chat
// - /api/tts for voice (ElevenLabs)

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
  console.warn("[Nyx] Warning: OPENAI_API_KEY is not set. /api/sandblast-gpt will fail.");
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ElevenLabs config
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID =
  process.env.NYX_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || "";

// ---------------------------------------------
// Health check
// ---------------------------------------------
app.get("/", (req, res) => {
  res.send("Sandblast Nyx backend is live. ✅");
});

// ---------------------------------------------
// Helper: build system messages for OpenAI
// ---------------------------------------------
function buildNyxSystemMessages(boundaryContext, emotion) {
  const systemMessages = [];

  // Core persona
  systemMessages.push({
    role: "system",
    content: nyxPersonality.NYX_SYSTEM_PERSONA.trim()
  });

  // Boundary / channel context
  if (boundaryContext) {
    const { actor, role, boundary } = boundaryContext;
    systemMessages.push({
      role: "system",
      content:
        `Context: You are responding as Nyx for Sandblast Channel.\n` +
        `Actor: ${actor}\n` +
        `Role: ${role}\n` +
        `Boundary: ${boundary.description}`
    });
  }

  // Emotional context
  if (emotion) {
    systemMessages.push({
      role: "system",
      content: `User emotional state: ${emotion}. Adjust your tone accordingly, while staying calm, clear, and practical.`
    });
  }

  return systemMessages;
}

// ---------------------------------------------
// /api/sandblast-gpt
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
      actorName = "Guest"
    } = req.body || {};

    const userMessage = (message || "").toString().trim();

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in request body." });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server." });
    }

    // Determine boundary / role (public, internal, admin)
    const boundaryContext = nyxPersonality.resolveBoundaryContext({
      actorName,
      channel,
      persona
    });

    // Detect emotional state from current message
    const currentEmotion = nyxPersonality.detectEmotionalState(userMessage);

    // Front-door handling (greetings, how-are-you, help, etc.)
    const frontDoor = nyxPersonality.handleNyxFrontDoor(userMessage);

    const meta = {
      stepIndex: Number(stepIndex) || 0,
      lastDomain: lastDomain || topic || "general",
      lastEmotion: lastEmotion || "neutral",
      topic: topic || "general",
      userEmotion: currentEmotion
    };

    // If this is a pure greeting / small-talk, we can reply without calling OpenAI
    if (frontDoor && !/internal/i.test(channel)) {
      const wrappedFrontDoor = nyxPersonality.wrapWithNyxTone(
        frontDoor,
        userMessage,
        meta
      );

      return res.json({
        reply: wrappedFrontDoor.message,
        meta: {
          stepIndex: (meta.stepIndex || 0) + 1,
          lastDomain: wrappedFrontDoor.domain || frontDoor.domain || "general",
          lastEmotion: currentEmotion,
          role: boundaryContext.role,
          topic: meta.topic
        }
      });
    }

    // Build system messages for Nyx
    const systemMessages = buildNyxSystemMessages(boundaryContext, currentEmotion);

    // OpenAI call
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        ...systemMessages,
        {
          role: "user",
          content: userMessage
        }
      ],
      temperature: 0.4,
      max_tokens: 700
    });

    const modelText =
      completion?.choices?.[0]?.message?.content ||
      "I’m here, but something in the response didn’t come through clearly. Try asking that again in a simpler way.";

    // Base payload before Nyx tone wrapping
    const basePayload = {
      intent: "model_reply",
      category: boundaryContext.role === "public" ? "public" : "internal",
      domain: topic || "general",
      message: modelText.toString().trim()
    };

    // Let Nyx wrap and enforce realism + proof point + next action
    const wrapped = nyxPersonality.wrapWithNyxTone(basePayload, userMessage, {
      stepIndex: Number(stepIndex) || 0,
      lastDomain: lastDomain || topic || "general",
      lastEmotion: lastEmotion || "neutral",
      userEmotion: currentEmotion,
      topic: topic || "general"
    });

    return res.json({
      reply: wrapped.message,
      meta: {
        stepIndex: (Number(stepIndex) || 0) + 1,
        lastDomain: wrapped.domain || basePayload.domain || topic || "general",
        lastEmotion: currentEmotion,
        role: boundaryContext.role,
        topic: topic || "general"
      }
    });
  } catch (err) {
    console.error("[Nyx] /api/sandblast-gpt error:", err);
    return res.status(500).json({
      error: "Nyx encountered an error while processing your request."
    });
  }
});

// ---------------------------------------------
// /api/tts (ElevenLabs)
// ---------------------------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    const trimmedText = (text || "").toString().trim();

    if (!trimmedText) {
      return res.status(400).json({ error: "Missing 'text' in request body." });
    }

    if (!ELEVENLABS_API_KEY) {
      console.warn("[Nyx] ELEVENLABS_API_KEY is not set.");
      return res.status(500).json({ error: "TTS is not configured on the server." });
    }

    if (!ELEVENLABS_VOICE_ID) {
      console.warn("[Nyx] NYX_VOICE_ID / ELEVENLABS_VOICE_ID is not set.");
      return res.status(500).json({ error: "TTS voice ID is not configured on the server." });
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: trimmedText,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[Nyx] ElevenLabs error:", response.status, errorBody);
      return res.status(500).json({
        error: "TTS request to ElevenLabs failed.",
        details: errorBody
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.set("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (err) {
    console.error("[Nyx] /api/tts error:", err);
    return res.status(500).json({
      error: "Nyx encountered an error while generating audio."
    });
  }
});

// ---------------------------------------------
// Start server
// ---------------------------------------------
app.listen(PORT, () => {
  console.log(`Nyx backend listening on port ${PORT}`);
});
