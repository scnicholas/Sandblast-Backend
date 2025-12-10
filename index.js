//----------------------------------------------------------
// Sandblast Nyx Backend — Final Production Version
//----------------------------------------------------------

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

//----------------------------------------------------------
// ENVIRONMENT VARIABLES
//----------------------------------------------------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const NYX_VOICE_ID = process.env.NYX_VOICE_ID;

//----------------------------------------------------------
// UTIL — CLEAN META
//----------------------------------------------------------
function cleanMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return {
      stepIndex: 0,
      lastDomain: "general",
      lastIntent: "statement",
      sessionId: "nyx-" + Date.now()
    };
  }

  return {
    stepIndex: typeof meta.stepIndex === "number" ? meta.stepIndex : 0,
    lastDomain: meta.lastDomain || "general",
    lastIntent: meta.lastIntent || "statement",
    lastGoal: meta.lastGoal || null,
    sessionId: meta.sessionId || "nyx-" + Date.now()
  };
}

//----------------------------------------------------------
// OPTIONAL ADMIN / BACKDOOR CHANNEL (STUB)
//----------------------------------------------------------
function isAdminMessage(body) {
  if (!body || typeof body !== "object") return false;

  const { adminToken, message } = body;

  if (adminToken && adminToken === process.env.ADMIN_SECRET) return true;

  if (typeof message === "string" && message.trim().startsWith("::admin")) {
    return true;
  }

  return false;
}

//----------------------------------------------------------
// OPENAI CALL — Core Brain
//----------------------------------------------------------
async function callOpenAI({ message, classification, meta }) {
  if (!OPENAI_API_KEY) {
    return (
      "Nyx is online but running without OpenAI credentials. " +
      "Add OPENAI_API_KEY in Render to enable full intelligence."
    );
  }

  const systemPrompt =
    `You are Nyx — the AI broadcast brain for Sandblast Channel.\n` +
    `Tone: warm, encouraging, slightly witty, grounded in reality.\n` +
    `Your job is to help with TV programming, radio blocks, DJ Nova intros, ` +
    `sponsor packages, News Canada placement, AI consulting, and tech support.\n\n` +
    `Always:\n` +
    `• Keep recommendations realistic for a GROWING channel.\n` +
    `• Provide 1 proof point + 1 actionable next step for sponsor questions.\n` +
    `• Use simple, conversational broadcast energy.\n\n` +
    `Classification: domain=${classification.domain}, intent=${classification.intent}, confidence=${classification.confidence}.\n` +
    `Meta: stepIndex=${meta.stepIndex}, lastDomain=${meta.lastDomain}, lastGoal=${meta.lastGoal}\n`;

  const userPrompt =
    `User message: "${message}".\n` +
    `Reply clearly, concisely, and stay grounded.`;

  try {
    const apiRes = await axios.post(
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

    return apiRes.data?.choices?.[0]?.message?.content || "(No response from model.)";
  } catch (err) {
    console.error("OpenAI Error:", err?.response?.data || err.message);
    return "Nyx hit a snag talking to OpenAI. Try again in a moment.";
  }
}

//----------------------------------------------------------
// HEALTH CHECK
//----------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "sandblast-nyx-backend" });
});

//----------------------------------------------------------
// MAIN BRAIN ENDPOINT
//----------------------------------------------------------
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, mode } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "EMPTY_MESSAGE" });
    }

    const clean = message.trim();
    const meta = cleanMeta(incomingMeta);

    //------------------------------------------------------
    // Admin channel check
    //------------------------------------------------------
    if (isAdminMessage(req.body)) {
      return res.json({
        ok: true,
        admin: true,
        message: "Admin backdoor acknowledged.",
        meta
      });
    }

    //------------------------------------------------------
    // Classify intent + domain
    //------------------------------------------------------
    const classification = classifyIntent(clean);

    //------------------------------------------------------
    // Front-door personality smoothing
    //------------------------------------------------------
    let frontDoor = null;
    if (nyxPersonality.getFrontDoorResponse) {
      frontDoor = nyxPersonality.getFrontDoorResponse(
        clean,
        meta,
        classification
      );
    }

    //------------------------------------------------------
    // Domain payload (TV, radio, sponsors, etc.)
    //------------------------------------------------------
    let domainPayload = {};
    if (nyxPersonality.enrichDomainResponse) {
      domainPayload = nyxPersonality.enrichDomainResponse(
        clean,
        meta,
        classification,
        mode
      );
    }

    //------------------------------------------------------
    // Core intelligence (OpenAI)
    //------------------------------------------------------
    const rawReply = await callOpenAI({
      message: clean,
      classification,
      meta
    });

    //------------------------------------------------------
    // Tone wrapping (Nyx’s broadcast style)
    //------------------------------------------------------
    let finalReply = rawReply;
    if (nyxPersonality.wrapWithNyxTone) {
      finalReply = nyxPersonality.wrapWithNyxTone(
        clean,
        meta,
        classification,
        rawReply
      );
    }

    //------------------------------------------------------
    // Update meta
    //------------------------------------------------------
    const updatedMeta = {
      ...meta,
      stepIndex: meta.stepIndex + 1,
      lastDomain: classification.domain,
      lastIntent: classification.intent
    };

    //------------------------------------------------------
    // Deliver final result
    //------------------------------------------------------
    res.json({
      ok: true,
      reply: finalReply,
      frontDoor,
      domain: classification.domain,
      intent: classification.intent,
      confidence: classification.confidence,
      domainPayload,
      meta: updatedMeta
    });

  } catch (err) {
    console.error("GPT Route Error:", err.message);
    res.status(500).json({
      ok: false,
      error: "SERVER_FAILURE",
      message: "Nyx hit static inside the server.",
      details: err.message
    });
  }
});

//----------------------------------------------------------
// TTS ENDPOINT (ELEVENLABS)
//----------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "EMPTY_TEXT" });
    }

    if (!ELEVENLABS_API_KEY || !NYX_VOICE_ID) {
      return res.status(500).json({
        error: "TTS_NOT_CONFIGURED",
        message: "Missing ELEVENLABS_API_KEY or NYX_VOICE_ID."
      });
    }

    const ttsRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${NYX_VOICE_ID}`,
      {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.85
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
    res.send(Buffer.from(ttsRes.data));

  } catch (err) {
    console.error("TTS Error:", err?.response?.data || err.message);
    res.status(500).json({
      error: "TTS_FAILED",
      details: err?.response?.data || err.message
    });
  }
});

//----------------------------------------------------------
// START SERVER
//----------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Nyx backend running on port ${PORT}`);
});
