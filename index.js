//----------------------------------------------------------
// Sandblast Nyx Backend — Hybrid Brain (OpenAI + Local Fallback)
// With Tiered Greeting / Small-talk Layer and Short, Collaborative Tone
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const NYX_VOICE_ID = process.env.NYX_VOICE_ID;

//----------------------------------------------------------
// META HELPERS
//----------------------------------------------------------
function cleanMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return {
      stepIndex: 0,
      lastDomain: "general",
      lastIntent: "statement",
      lastGoal: null,
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

function isAdminMessage(body) {
  if (!body || typeof body !== "object") return false;
  const { adminToken, message } = body;
  if (adminToken && adminToken === process.env.ADMIN_SECRET) return true;
  if (typeof message === "string" && message.trim().startsWith("::admin")) return true;
  return false;
}

//----------------------------------------------------------
// LOCAL BRAIN – GREETING / SMALL-TALK + DOMAIN RULES
// Tone: warm, supportive, short, collaborative, forward-moving
//----------------------------------------------------------
function localBrainReply(message, classification, meta) {
  const domain = classification?.domain || "general";
  const intent = classification?.intent || "statement";
  const text = (message || "").trim().toLowerCase();

  // --- Tier 1: Initial greeting ---
  if (intent === "greeting") {
    return `Hey, I’m here. How’s your day going? What do you want to dive into — TV, radio, sponsors, or AI?`;
  }

  // --- Tier 2: Follow-up small-talk, with gentle redirect ---
  if (intent === "smalltalk") {
    return `I’m good on my end. What’s on your mind? If you want, we can tune TV, radio, sponsors, or AI — just tell me the lane.`;
  }

  // --- Domain behaviours ---
  switch (domain) {
    case "tv":
      return (
        `Let’s shape one TV block together.\n\n` +
        `Pick a lane like weeknight detectives, Saturday westerns, or a family night. Tell me the vibe and rough time slot, and we’ll build a simple block around it.`
      );

    case "radio":
      return (
        `Let’s build a clean radio mood block.\n\n` +
        `Choose the feeling — late-night smooth, Gospel Sunday, or retro party. Tell me the mood and how long you want it to run, and we’ll map a light flow for Nova to carry.`
      );

    case "sponsors":
      return (
        `We can keep sponsor offers simple.\n\n` +
        `Think in terms of a short test run — a few TV spots plus a couple of on-air mentions around one strong block. Tell me which sponsor you have in mind and we’ll sketch a small, clear package for them.`
      );

    case "ai_help":
    case "ai_consulting":
      return (
        `Let’s pick a few AI tasks that actually help you.\n\n` +
        `For example, drafting outreach, summarizing content, or writing show and social copy. Tell me who you want to help first — yourself, job-seekers, or a sponsor — and we’ll choose two or three practical use cases.`
      );

    case "tech_support":
      return (
        `We can tackle the tech one step at a time.\n\n` +
        `Tell me whether the issue is on Webflow, Render, or inside the code, and I’ll walk with you through the next small fix.`
      );

    case "business_support":
      return (
        `Let’s give one project a clear push.\n\n` +
        `Tell me which project you want to focus on and what you’d like to see in the next 90 days, and we’ll set a simple direction you can move on each week.`
      );

    case "nova":
      return (
        `Let’s tune a block for Nova.\n\n` +
        `Tell me the mood you want her to carry and how long the block should run, and we’ll sketch her intros and transitions to match.`
      );

    default:
      return (
        `I’m with you.\n\n` +
        `Tell me whether you’re thinking about TV, radio, streaming, sponsors, News Canada, or AI, and we’ll take the next step there.`
      );
  }
}

//----------------------------------------------------------
// HYBRID BRAIN – TRY OPENAI, FALL BACK TO LOCAL
//----------------------------------------------------------
async function callBrain({ message, classification, meta }) {
  // For greeting/small-talk we deliberately keep it local
  if (
    classification.intent === "greeting" ||
    classification.intent === "smalltalk"
  ) {
    return localBrainReply(message, classification, meta);
  }

  // If no key, always use local
  if (!OPENAI_API_KEY) {
    console.warn("[Nyx] No OPENAI_API_KEY set — using local brain.");
    return localBrainReply(message, classification, meta);
  }

  const systemPrompt =
    `You are Nyx — the AI broadcast brain for Sandblast Channel.\n` +
    `Tone: warm, supportive, concise, collaborative, and forward-moving.\n` +
    `You help with TV, radio, streaming, sponsors, News Canada, AI consulting, and tech troubleshooting.\n` +
    `Sandblast is a growing channel, not a giant network — keep advice realistic.\n` +
    `Avoid lectures; keep responses short and focused on next steps.\n\n` +
    `Classification: domain=${classification.domain}, intent=${classification.intent}, confidence=${classification.confidence}.\n` +
    `Meta: stepIndex=${meta.stepIndex}, lastDomain=${meta.lastDomain}, lastGoal=${meta.lastGoal}\n`;

  const userPrompt =
    `User message: "${message}".\n` +
    `Give a clear, useful answer in no more than about four short paragraphs, and keep the tone warm, supportive, and collaborative.`;

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

    const reply =
      apiRes.data?.choices?.[0]?.message?.content ||
      localBrainReply(message, classification, meta);

    return reply;
  } catch (err) {
    console.error("[Nyx] OpenAI error, using local brain:", err?.response?.data || err.message);
    return localBrainReply(message, classification, meta);
  }
}

//----------------------------------------------------------
// HEALTH
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

    // Admin / backdoor stub
    if (isAdminMessage(req.body)) {
      return res.json({
        ok: true,
        admin: true,
        message: "Admin backdoor reached. Debug hooks can live here later.",
        meta
      });
    }

    // 1) Classify
    const classification = classifyIntent(clean);

    // 2) Front-door response (optional)
    let frontDoor = null;
    if (nyxPersonality.getFrontDoorResponse) {
      frontDoor = nyxPersonality.getFrontDoorResponse(
        clean,
        meta,
        classification
      );
    }

    // 3) Domain payload
    let domainPayload = {};
    if (nyxPersonality.enrichDomainResponse) {
      domainPayload = nyxPersonality.enrichDomainResponse(
        clean,
        meta,
        classification,
        mode
      );
    }

    // 4) Brain (OpenAI + fallback, with greeting guard)
    const rawReply = await callBrain({
      message: clean,
      classification,
      meta
    });

    // 5) Tone wrapper
    let finalReply = rawReply;
    if (nyxPersonality.wrapWithNyxTone) {
      finalReply = nyxPersonality.wrapWithNyxTone(
        clean,
        meta,
        classification,
        rawReply
      );
    }

    // 6) Update meta
    const updatedMeta = {
      ...meta,
      stepIndex: meta.stepIndex + 1,
      lastDomain: classification.domain,
      lastIntent: classification.intent
    };

    // 7) Respond
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
    console.error("[Nyx] /api/sandblast-gpt error:", err.message);
    res.status(500).json({
      ok: false,
      error: "SERVER_FAILURE",
      message: "Nyx hit static inside the server.",
      details: err.message
    });
  }
});

//----------------------------------------------------------
// TTS ENDPOINT (OPTIONAL – ELEVENLABS)
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
    console.error("[Nyx] TTS error:", err?.response?.data || err.message);
    res.status(500).json({
      ok: false,
      error: "TTS_FAILED",
      details: err?.response?.data || err.message
    });
  }
});

//----------------------------------------------------------
// START SERVER
//----------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Nyx hybrid backend listening on port ${PORT}`);
});
