// index.js
// Sandblast Backend – Core Server + Intent Routing + Nyx Personality Engine (inlined) + TTS

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const { classifyIntent } = require("./Utils/intentClassifier");

// --------------------------------------------
// Nyx Personality Engine (INLINED)
// --------------------------------------------

function getFrontDoorResponse(userMessage) {
  const text = String(userMessage || "");
  const normalized = text.trim().toLowerCase();

  if (text === undefined || text === null) {
    return null;
  }

  const isAskingHowNyxIs =
    /\b(how are you(?: doing| feeling)?|how's it going|hows it going)\b/i.test(
      text
    );

  const isInitialGreeting =
    normalized === "" ||
    /^(hello|hi|hey|greetings|good morning|good afternoon|good evening)\b/.test(
      normalized
    );

  const isGreetingResponse =
    /^(i'm fine|im fine|i am fine|doing well|doing good|i'm good|im good|pretty good|not bad|okay|ok|fine, thanks|fine thank you)/i.test(
      text.trim()
    );

  const isThankYou =
    /\b(thank you|thanks a lot|thanks|appreciate it|really appreciate)\b/i.test(
      text
    );

  const isFeelingLow =
    /\b(tired|exhausted|burnt out|burned out|stressed|overwhelmed|frustrated|drained|worn out|stuck)\b/i.test(
      text
    );

  const isGoalStatement =
    /\b(my goal is|i want to|i'm trying to|im trying to|i am trying to|i'm planning to|im planning to|i plan to|i'm working on|im working on)\b/i.test(
      normalized
    );

  const greetingVariants = [
    "Hello! I’m Nyx, your Sandblast guide. I’m glad you dropped by—how are you doing today?",
    "Hi there, I’m Nyx with Sandblast. You’re in the right place; let’s make things easier (and a little smarter) together. How are you today?",
    "Hey, I’m Nyx from Sandblast. I’m here to help you move things forward—how are you feeling today?"
  ];

  if (isAskingHowNyxIs) {
    return {
      intent: "nyx_feeling",
      category: "small_talk",
      echo: text,
      message:
        "I’m doing well, thank you. Systems are calm, signal is clear. How can I help you today?"
    };
  }

  if (isInitialGreeting) {
    const message =
      greetingVariants[Math.floor(Math.random() * greetingVariants.length)];
    return {
      intent: "welcome",
      category: "welcome",
      echo: text,
      message
    };
  }

  if (isGreetingResponse) {
    return {
      intent: "welcome_response",
      category: "welcome_response",
      echo: text,
      message:
        "Love hearing that. I’m Nyx, here to work alongside you—not just talk at you. What do you want to tackle first—Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting?"
    };
  }

  if (isThankYou) {
    return {
      intent: "nyx_thanks",
      category: "small_talk",
      echo: text,
      message:
        "You’re very welcome. I like when things click. If you want to tweak, test, or push Sandblast a little further, I’m right here with you."
    };
  }

  if (isFeelingLow) {
    return {
      intent: "nyx_support",
      category: "small_talk",
      echo: text,
      message:
        "That sounds heavy, and it’s okay to say it. You’re not doing this solo—I’m here in your corner. We don’t have to fix everything at once; let’s pick one small win and move that forward. What feels like the next doable step?"
    };
  }

  if (isGoalStatement) {
    return {
      intent: "nyx_goal",
      category: "small_talk",
      echo: text,
      message:
        "That’s a strong direction. Ambitious looks good on you. Tell me a bit more about what you’re trying to build or improve, and I’ll help you map the next steps with Sandblast."
    };
  }

  return null;
}

function enrichDomainResponse(userMessage, payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const key = String(
    (payload.intent || payload.category || "general").toLowerCase()
  );

  let message = payload.message || "";
  const spacer = message ? "\n\n" : "";

  if (key.includes("music") || key.includes("radio")) {
    message =
      message +
      spacer +
      "If you’d like, I can help you tune into more shows or segments that match the energy you’re going for.";
  } else if (key.includes("tv") || key.includes("video")) {
    message =
      message +
      spacer +
      "If you tell me what kind of viewer you’re trying to attract, I can help shape a smarter Sandblast TV experience around that.";
  } else if (key.includes("news")) {
    message =
      message +
      spacer +
      "If you want, we can also connect this News Canada angle back to your wider Sandblast programming or sponsors.";
  } else if (key.includes("advertising") || key.includes("ad")) {
    message =
      message +
      spacer +
      "If you share your budget and target audience, I can help outline a clear, no-fluff Sandblast ad play that actually makes sense.";
  } else if (key.includes("ai_consulting") || key.includes("consulting")) {
    message =
      message +
      spacer +
      "If you walk me through where you are right now—tools, team, bottlenecks—I’ll help you design a lean, realistic AI play instead of hype.";
  } else if (!key || key === "general") {
    message =
      message +
      spacer +
      "If you’re not sure where to start, tell me what you’re trying to move forward—audience, revenue, or operations—and we’ll pick a smart first move.";
  }

  return {
    ...payload,
    message
  };
}

// --------------------------------------------
// Import response modules
// --------------------------------------------
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

  // 1) Nyx Personality Engine handles greetings / small talk / support / goals
  const frontDoor = getFrontDoorResponse(userMessage);
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

    payload.intent = payload.intent || intent || "general";
    payload.category = payload.category || intent || "general";
    payload.echo = payload.echo || userMessage;

    payload = enrichDomainResponse(userMessage, payload);

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
    process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

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
