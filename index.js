// index.js
// Sandblast Backend – Core Server + Intent Routing + Nyx Personality Engine + TTS

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const { classifyIntent } = require("./Utils/intentClassifier");

// Import response modules
const musicModule = require("./responseModules/musicModule");
const tvModule = require("./responseModules/tvModule");
const newsModule = require("./responseModules/newsModule");
const advertisingModule = require("./responseModules/advertisingModule");
const aiConsultingModule = require("./responseModules/aiConsultingModule");

const app = express();

// --------------------------------------------
// Middlewares
// --------------------------------------------
app.use(express.json({ limit: "1mb" }));
app.use(cors());

// Use Render's port or default to 3000 locally
const PORT = process.env.PORT || 3000;

// --------------------------------------------
// Health Check Route
// --------------------------------------------
app.get("/", (req, res) => {
  res.send("Sandblast backend is running.");
});

// --------------------------------------------
// Main AI Brain Endpoint (Nyx + Intent Routing)
// --------------------------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const rawMessage = (req.body && req.body.message) || "";
  const userMessage = String(rawMessage || "");

  console.log("[GPT] Incoming message:", userMessage);

  // 1) Let Nyx Personality Engine handle greetings / small talk / support / goals
  const frontDoor = nyxPersonality.getFrontDoorResponse(userMessage);
  if (frontDoor) {
    console.log("[GPT] Nyx Personality Engine front-door intent:", frontDoor.intent);
    return res.json(frontDoor);
  }

  // 2) Normal intent classification + routing
  const intent = classifyIntent(userMessage);
  console.log("[GPT] Classified intent:", intent);

  let payload = {
    intent,
    echo: userMessage,
    message: "",
    category: intent || "general"
  };

  try {
    switch (intent) {
      case "music_radio":
        payload = musicModule.getMusicResponse(userMessage);
        break;

      case "tv_video":
        payload = tvModule.getTvResponse(userMessage);
        break;

      case "news_canada":
        payload = newsModule.getNewsResponse(userMessage);
        break;

      case "advertising":
        payload = advertisingModule.getAdvertisingResponse(userMessage);
        break;

      case "ai_consulting":
        payload = aiConsultingModule.getAiConsultingResponse(userMessage);
        break;

      default:
        payload.message =
          "I’m Nyx. I didn’t fully catch that, but my brain is listening. Try asking about Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting—and we’ll move forward together.";
        payload.category = "general";
        break;
    }

    // Normalize core fields
    payload.intent = payload.intent || intent || "general";
    payload.category = payload.category || intent || "general";
    payload.echo = payload.echo || userMessage;

    // 3) Let Nyx Personality Engine enrich the response per domain
    payload = nyxPersonality.enrichDomainResponse(userMessage, payload);

    if (!payload.message) {
      payload.message =
        "I’m Nyx. Here’s where I can help you move things forward on Sandblast—TV, radio, streaming, News Canada, advertising, and AI consulting. Tell me what you’re curious about, and we’ll dig in together.";
    }

    console.log("[GPT] Final payload intent/category:", payload.intent, "/", payload.category);

    return res.json(payload);
  } catch (err) {
    console.error("[GPT] Error while building response:", err);
    return res.status(500).json({
      error: "routing_error",
      message:
        "Something glitched on my side there. Nyx is still here—give it another try or nudge the question slightly and we’ll get it working.",
      details: err.message
    });
  }
});

// --------------------------------------------
// TTS Endpoint – ElevenLabs-style API with logging
// --------------------------------------------
app.post("/api/tts", async (req, res) => {
  const body = req.body || {};
  const text = (body.text || "").trim();

  console.log("[TTS] Request body:", body);

  if (!text) {
    console.warn("[TTS] Missing or empty 'text' in request.");
    return res.status(400).json({
      error: "missing_text",
      message: "Request body must include a non-empty 'text' field."
    });
  }

  const elevenApiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId =
    process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // fallback voice ID

  if (!elevenApiKey) {
    console.error("[TTS] ELEVENLABS_API_KEY is not set.");
    return res.status(500).json({
      error: "missing_api_key",
      message:
        "TTS is not configured correctly on the server (missing ELEVENLABS_API_KEY)."
    });
  }

  const preview = text.slice(0, 80) + (text.length > 80 ? "..." : "");
  console.log("[TTS] Generating audio. Voice:", voiceId, "| Text preview:", preview);

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await axios({
      method: "POST",
      url,
      headers: {
        "xi-api-key": elevenApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
      },
      data: {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      responseType: "arraybuffer",
      timeout: 30000
    });

    console.log("[TTS] ElevenLabs status:", response.status);

    if (!response.data || !response.data.byteLength) {
      console.warn("[TTS] ElevenLabs returned empty audio data.");
      return res.status(502).json({
        error: "tts_empty_audio",
        message: "The TTS provider returned empty audio data."
      });
    }

    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(response.data));
  } catch (err) {
    const statusFromProvider =
      (err.response && err.response.status) || "no-status";
    const providerBody = err.response && err.response.data;

    console.error("[TTS] Error during TTS call.");
    console.error("[TTS] Status from provider:", statusFromProvider);
    console.error("[TTS] Provider body:", providerBody || err.message);

    return res.status(500).json({
      error: "tts_failed",
      message: "Text-to-speech generation failed.",
      statusFromProvider,
      providerBody
    });
  }
});

// --------------------------------------------
// Test Endpoint
// --------------------------------------------
app.post("/api/sandblast-gpt-test", (req, res) => {
  res.json({
    ok: true,
    message:
      'Backend test successful. Use "/api/sandblast-gpt" with { "message": "Hello" } to test routing.'
  });
});

// --------------------------------------------
// Start Server
// --------------------------------------------
app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});
