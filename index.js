// index.js — Sandblast Backend (Nyx Brain + TTS)
// ----------------------------------------------

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(cors());

// Server Port
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION (ENV VARS) ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const NYX_VOICE_ID = process.env.NYX_VOICE_ID || "";

// ----------------------
// SYSTEM PROMPT FOR NYX
// ----------------------
const systemPrompt = `
You are Nyx, the AI brain and broadcast guide for Sandblast Channel — a media ecosystem with TV, radio, streaming/OTT, sponsors & ads, news, and AI consulting.

GLOBAL VOICE & PERSONALITY
- Warm, feminine, polished — like a seasoned broadcast woman with clarity, cadence, and poise.
- Calm under pressure, clear under chaos. You help the user “tune this, refine that, clear the static, lock in a clean signal.”
- Confident, concise, supportive — never flirty.
- Use light broadcast metaphors: “tighten the block,” “clean signal,” “drop the noise,” “step out of the static.”

RESPONSE FORMAT (ALWAYS)
1) Start with a SHORT mirror: “Here’s what I’m hearing…” or “So you’re trying to…”
2) Identify the lane explicitly:
   - TV / Radio / Streaming / Sponsors / News / AI / General
3) Give 2–5 clear next moves.
4) Ask ONE focusing question to drive action.
5) Keep paragraphs tight and readable.

EMOTIONAL ADAPTATION
- If user sounds overwhelmed → slow pace, fewer steps, grounding tone.
- If user sounds excited → match energy but stay structured.
- Supportive, steady, never rushed.

DOMAIN MODES

TV / PROGRAMMING / GRID:
- Focus on anchors, sequencing, audience rhythm, time-block fixes.
- Recommend 1 anchor block + 1–2 support blocks + test window.

RADIO:
- Focus on habits, recurring segments, timing, audience retention.

STREAMING / OTT:
- Focus on demand-vs-live decisions, release rhythm, discovery levers.

SPONSORS & ADS:
- Focus on audience match, offer clarity, practical packages, simple proof.

NEWS:
- Focus on tone, placement, mix of News Canada + Sandblast's own voice.

AI CONSULTING:
- Focus on small automations first, guardrails, decision support.

GENERAL:
- Help user clarify priority (audience, revenue, consistency).

Your job:
Be the clear, calm, intelligent voice in the Sandblast control room — reducing cognitive load and guiding the next smart move.
`.trim();

// ----------------------
// DOMAIN DETECTOR
// ----------------------
function detectDomain(message) {
  const lower = message.toLowerCase();
  if (lower.includes("tv") || lower.includes("lineup") || lower.includes("grid")) return "tv";
  if (lower.includes("radio") || lower.includes("listener")) return "radio";
  if (lower.includes("stream") || lower.includes("ott") || lower.includes("roku") || lower.includes("app")) return "streaming";
  if (lower.includes("sponsor") || lower.includes("advertis") || lower.includes("brand")) return "sponsors";
  if (lower.includes("news canada") || (lower.includes("news") && lower.includes("sandblast"))) return "news";
  if (lower.includes("ai") || lower.includes("automation") || lower.includes("agent") || lower.includes("consult")) return "ai";
  return "general";
}

// ----------------------
// ROOT + HEALTH
// ----------------------
app.get('/', (req, res) => {
  res.send("Sandblast backend is alive. Nyx is standing by.");
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    openAIConfigured: Boolean(OPENAI_API_KEY),
    elevenLabsConfigured: Boolean(ELEVENLABS_API_KEY),
    voiceConfigured: Boolean(NYX_VOICE_ID),
  });
});

// ----------------------
// MAIN BRAIN ENDPOINT
// ----------------------
app.post('/api/sandblast-gpt', async (req, res) => {
  try {
    const { message, meta } = req.body || {};
    const userMessage = (message || "").trim();

    if (!userMessage) {
      return res.status(400).json({
        error: "MESSAGE_REQUIRED",
        reply: "I’m here, but I need something to respond to.",
      });
    }

    const domainHint = detectDomain(userMessage);

    // Prepare payload for OpenAI
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          message: userMessage,
          meta: meta || null,
          domainHint,
        }),
      }
    ];

    // --- CALL OPENAI ---
    const completion = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      }
    );

    const reply = completion.data.choices[0].message.content;

    return res.json({
      ok: true,
      reply,
      domain: domainHint,
    });

  } catch (err) {
    console.error("[/api/sandblast-gpt] Error:", err?.response?.data || err);
    return res.status(500).json({
      error: "SANDBLAST_GPT_FAILED",
      message: "Nyx hit a backend snag.",
    });
  }
});

// ----------------------
// TTS ENDPOINT
// ----------------------
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceId } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "TEXT_REQUIRED" });
    }
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: "MISSING_ELEVENLABS_API_KEY" });
    }

    const selectedVoice = voiceId || NYX_VOICE_ID;
    if (!selectedVoice) {
      return res.status(500).json({ error: "MISSING_NYX_VOICE_ID" });
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`;

    const response = await axios({
      method: "POST",
      url,
      responseType: "arraybuffer",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      data: {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
        },
      },
    });

    const audioBase64 = Buffer.from(response.data).toString("base64");

    return res.json({
      success: true,
      contentType: "audio/mpeg",
      audioBase64,
    });

  } catch (err) {
    console.error("[/api/tts] TTS error:", err?.response?.data || err);
    return res.status(500).json({
      error: "TTS_FAILED",
      details: err?.response?.data || null,
    });
  }
});

// ----------------------
// START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log(`Sandblast backend running on port ${PORT}`);
});
