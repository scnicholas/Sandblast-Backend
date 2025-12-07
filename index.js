// index.js
// Sandblast / Nyx Backend
// - Nyx personality + tone wrapper integration
// - /api/sandblast-gpt for chat
// - /api/tts using OpenAI GPT-4o TTS
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

  // Nyx persona definition
  if (nyxPersonality.NYX_SYSTEM_PERSONA) {
    systemMessages.push({
      role: "system",
      content: nyxPersonality.NYX_SYSTEM_PERSONA.trim(),
    });
  }

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

  return systemMessages;
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

    if (!OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY not configured." });
    }

    // Boundary / role
    const boundaryContext = nyxPersonality.resolveBoundaryContext({
      actorName,
      channel,
      persona,
    });

    // Emotion detection
    const currentEmotion =
      nyxPersonality.detectEmotionalState(userMessage);

    // Quick greeting/intro logic
    const frontDoor = nyxPersonality.handleNyxFrontDoor(userMessage);

    const meta = {
      stepIndex: Number(stepIndex) || 0,
      lastDomain: lastDomain || topic || "general",
      lastEmotion: lastEmotion || "neutral",
      userEmotion: currentEmotion,
      topic: topic || "general",
    };

    // Use front-door without calling GPT if appropriate
    if (frontDoor && boundaryContext.role === "public") {
      const wrapped = nyxPersonality.wrapWithNyxTone(
        frontDoor,
        userMessage,
        meta
      );

      return res.json({
        reply: wrapped.message,
        meta: {
          stepIndex: (meta.stepIndex || 0) + 1,
          lastDomain: wrapped.domain || frontDoor.domain || "general",
          lastEmotion: currentEmotion,
          role: boundaryContext.role,
          topic,
        },
      });
    }

    // -------------------------
    // GPT CALL
    // -------------------------
    const systemMessages = buildNyxSystemMessages(
      boundaryContext,
      currentEmotion
    );

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        ...systemMessages,
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      max_tokens: 700,
    });

    const modelText =
      completion?.choices?.[0]?.message?.content ||
      "Nyx here. I didn’t quite catch that — could you phrase it another way?";

    const basePayload = {
      intent: "model_reply",
      category:
        boundaryContext.role === "public" ? "public" : "internal",
      domain: topic || "general",
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
          wrapped.domain || basePayload.domain || "general",
        lastEmotion: currentEmotion,
        role: boundaryContext.role,
        topic,
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
// /api/tts — GPT-4o TTS
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

    const audioBuffer = Buffer.from(
      await audioResponse.arrayBuffer()
    );

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
    `Nyx backend listening on port ${PORT} — GPT + TTS active`
  );
});
