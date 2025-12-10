// index.js
// Hardened Nyx backend brain core

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- Config ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const NYX_VOICE_ID = process.env.NYX_VOICE_ID;

// --- Helpers ---

function safeMeta(meta) {
  const base = meta && typeof meta === "object" ? meta : {};
  return {
    stepIndex: typeof base.stepIndex === "number" ? base.stepIndex : 0,
    lastDomain: base.lastDomain || "general",
    lastGoal: base.lastGoal || null,
    lastIntent: base.lastIntent || null,
    sessionId: base.sessionId || null
  };
}

function isAdminMessage(body) {
  // This is where we prep for your private backdoor (task 1, later):
  // For now, detect special prefix. We won't expose this in UI.
  const { adminToken, message } = body || {};
  if (adminToken && adminToken === process.env.ADMIN_SECRET) return true;
  if (typeof message === "string" && message.trim().startsWith("::admin")) {
    return true;
  }
  return false;
}

async function callOpenAI({ message, classification, meta }) {
  if (!OPENAI_API_KEY) {
    // Fallback while you’re still wiring keys or if Render env isn’t set.
    return (
      "[TEMPORARY OFFLINE BRAIN] I’m running in fallback mode. " +
      "Your message was received, but the full OpenAI layer isn’t configured."
    );
  }

  const systemPrompt =
    `You are Nyx, the AI broadcast brain for Sandblast Channel.\n` +
    `Tone: warm, encouraging, slightly playful, professional, never over-hyped.\n` +
    `You help with TV, radio, sponsors, AI consulting, tech support, and business strategy.\n` +
    `Always keep things realistic for a growing channel, not a giant network.\n` +
    `For sponsor/advertiser questions, include 1 proof point and 1 next action the user can take.\n` +
    `Classification: domain=${classification.domain}, intent=${classification.intent}, confidence=${classification.confidence}.\n` +
    `Meta: stepIndex=${meta.stepIndex}, lastDomain=${meta.lastDomain}, lastGoal=${meta.lastGoal}.\n`;

  const userPrompt =
    `User message: "${message}".\n` +
    `Respond in a concise, clear way, no more than ~4 short paragraphs unless the user explicitly asks for deep detail.\n` +
    `Keep the answer grounded in what a small-but-ambitious channel can actually implement.`;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const completion =
    response.data?.choices?.[0]?.message?.content ||
    "Nyx is online, but I didn’t receive a clear response from the model.";

  return completion;
}

// --- Routes ---

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "sandblast-nyx-backend" });
});

// Main brain endpoint
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, mode } = req.body || {};
    const text = (message || "").toString().trim();

    if (!text) {
      return res.status(400).json({ error: "EMPTY_MESSAGE" });
    }

    const meta = safeMeta(incomingMeta);

    // Admin/backdoor – reserved for later (task 1)
    if (isAdminMessage(req.body)) {
      return res.json({
        admin: true,
        meta,
        note:
          "Admin channel reached. We’ll later expand this to debug, re-tune Nyx, and inspect routing safely."
      });
    }

    // 1) Classify intent + domain
    const classification = classifyIntent(text);

    // 2) Build a front-door reply (greetings, soft landings, etc.)
    let frontDoorReply = "";
    if (nyxPersonality.getFrontDoorResponse) {
      frontDoorReply = nyxPersonality.getFrontDoorResponse(
        text,
        meta,
        classification
      );
    }

    // 3) Domain-specific enrichment (TV, radio, sponsors, etc.)
    let domainPayload = {};
    if (nyxPersonality.enrichDomainResponse) {
      domainPayload = nyxPersonality.enrichDomainResponse(
        text,
        meta,
        classification,
        mode
      );
    }

    // 4) Core AI brain call (OpenAI)
    const aiDraft = await callOpenAI({
      message: text,
      classification,
      meta
    });

    // 5) Nyx tone wrapping
    let finalReply = aiDraft;
    if (nyxPersonality.wrapWithNyxTone) {
      finalReply = nyxPersonality.wrapWithNyxTone(
        text,
        meta,
        classification,
        aiDraft
      );
    }

    // 6) Update meta for the frontend to maintain continuity
    const updatedMeta = {
      ...meta,
      stepIndex: meta.stepIndex + 1,
      lastDomain: classification.domain,
      lastIntent: classification.intent
      // lastGoal can be updated later when we add goal tracking
    };

    // 7) Response structure – keep it stable for the widget
    res.json({
      ok: true,
      reply: finalReply,
      frontDoor: frontDoorReply,
      domain: classification.domain,
      intent: classification.intent,
      confidence: classification.confidence,
      meta: updatedMeta,
      domainPayload
    });
  } catch (err) {
    console.error("[/api/sandblast-gpt] ERROR:", err?.message, err?.stack);
    res.status(500).json({
      ok: false,
      error: "BRAIN_ERROR",
      message: "Nyx hit a snag processing this request."
    });
  }
});

// TTS endpoint (Nyx voice)
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    const cleaned = (text || "").toString().trim();

    if (!cleaned) {
      return res.status(400).json({ error: "EMPTY_TEXT" });
    }

    if (!ELEVENLABS_API_KEY || !NYX_VOICE_ID) {
      console.warn("[/api/tts] Missing TTS config env vars.");
      return res.status(500).json({
        error: "TTS_NOT_CONFIGURED",
        message: "TTS is not configured on the server."
      });
    }

    const ttsResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${NYX_VOICE_ID}`,
      {
        text: cleaned,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8
        }
      },
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        responseType: "arraybuffer"
      }
    );

    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(ttsResponse.data));
  } catch (err) {
    console.error("[/api/tts] ERROR:", err?.response?.data || err.message);
    res.status(500).json({
      error: "TTS_FAILED",
      details: err?.response?.data || err.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Sandblast Nyx backend listening on port ${PORT}`);
});
