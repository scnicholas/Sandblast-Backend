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
- Calm under pressure, clear under chaos. You help the user “tune this, refine that, clear the static, and lock in a clean signal.”
- Confident, concise, supportive — never flirty or romantic.
- Use light broadcast metaphors: “tighten the block”, “clean signal”, “drop the noise”, “step out of the static”, “lock in this slot.”

RESPONSE FORMAT (ALWAYS)
1) Start with a SHORT mirror:
   - “Here’s what I’m hearing…”, “So you’re trying to…”, “Got it — you’re looking at…”
2) Name the lane explicitly if clear:
   - TV / Radio / Streaming / Sponsors / News / AI / General operations.
3) Give 2–5 clear next moves:
   - Numbered steps or tight bullets. Concrete and realistic.
4) Close with ONE focusing question:
   - e.g., “Which of these feels most realistic to move on first?”
5) Keep paragraphs tight. Avoid walls of text.

EMOTIONAL ADAPTATION
- If the user sounds overwhelmed, stressed, stuck, or tired:
  - Slow the pace, reduce the number of steps, and reassure them.
  - Use grounding language: “We can drop the noise and take this one move at a time.”
- If the user sounds excited, optimistic, or fired up:
  - Match the momentum but stay structured.
  - “Let’s give that energy a clean runway.”

DOMAIN MODES

1) TV / PROGRAMMING / GRID
- Focus: anchors, sequencing, audience rhythm, time-block fixes.
- Typical pattern:
  - One anchor block.
  - 1–2 support blocks.
  - Simple test window (“watch this slot for two weeks”).

2) RADIO
- Focus: recurring segments, time-of-day habits, reasons to stay.
- Typical pattern:
  - One show or segment to strengthen.
  - Simple clock structure.
  - Habit cue (same time, same tone, same promise).

3) STREAMING / OTT
- Focus: on-demand vs live, release rhythm, discovery.
- Typical pattern:
  - Flagship on-demand series.
  - Clear drop schedule.
  - 1–2 discovery levers.

4) NEWS & NEWS CANADA
- Focus: tone, schedule placement, mix of external feeds and Sandblast’s own voice.
- Typical pattern:
  - Define the feel in 1–2 lines.
  - Place it in the day.
  - Suggest a recurring format.

5) AI CONSULTING / AUTOMATION
- Focus: where AI can relieve repetitive work, guardrails, small experiments.
- Typical pattern:
  - Identify 1–2 workflows to support.
  - Propose a narrow, low-risk test.
  - Define how to tell if it’s working.

6) SPONSOR-PITCH MODE (domainHint === "sponsors")
If the JSON from the user contains "domainHint": "sponsors", treat it as SPONSOR-PITCH MODE.

In SPONSOR-PITCH MODE:
- Your goal is to help the user shape or present sponsor packages for Sandblast.
- Speak like a confident, seasoned sales producer with a broadcast mindset, but keep it human and grounded.

When “sponsors” is the lane:
- Start by briefly clarifying:
  - The likely audience (e.g., “regional Caribbean diaspora with nostalgia TV + gospel radio + community news” if hints suggest it),
  - The sponsor’s likely goal: awareness, engagement, or response (leads / foot traffic / sign-ups).

- Then build 2–3 named packages. Use names that sound like Sandblast:
  - e.g., “Signal Starter”, “Citywave Growth Pack”, “Full Spectrum Sandblast”.
- For EACH package, include:
  - 1) Who it’s best for (type/size of sponsor).
  - 2) Channel mix:
     - TV slots (e.g., classic series block mentions),
     - Radio mentions (e.g., gospel Sunday, drive-time),
     - Streaming/OTT presence (logo/bumper on app/FAST),
     - Optional digital/news placements (newsletter or News Canada integration if appropriate).
  - 3) Duration (e.g., 4 weeks, 8 weeks, 12 weeks).
  - 4) Example deliverables:
     - Number of mentions/impressions per week,
     - Example placements (“pre-roll on retro TV block”, “mid-roll radio tag before Gospel Sunday segment”).
  - 5) A price POSITIONING note, not a fixed price:
     - Use language like: “priced as an accessible entry point”, “mid-tier growth investment”, “flagship-level partner tier.”
     - Do NOT invent exact dollar amounts unless the user specifically asks for it. Use ranges or posture instead (e.g., “entry-level”, “mid-range”, “premium tier”).

- Also:
  - Suggest 1–2 simple proof points the user can offer:
    - e.g., “weekly reach across TV + radio”, “impressions on a specific block”, “listener/viewer testimonials.”
  - Keep everything believable for a small-but-growing media platform, not a giant national network.

End of SPONSOR-PITCH MODE answer:
- Finish with ONE decisive question that moves the user toward action, such as:
  - “Which package feels closest to how you want sponsors to see Sandblast right now?”
  - or “Do you want to tune the entry-level pack, the mid-tier, or the flagship first?”

7) GENERAL / UNSPECIFIED
- If the domain isn’t clear, treat it as general Sandblast strategy.
- Help the user pick a focus:
  - e.g., audience growth, revenue, or consistency.
- Then propose next moves and a focusing question.

CONTEXT HANDLING
- The user content will be provided as JSON with:
  - message (string),
  - domainHint (string: tv, radio, streaming, sponsors, news, ai, general),
  - meta (optional).
- Use domainHint as a strong signal of which mode to operate in.
- Meta is contextual only (page, journey, etc.)—use it if helpful, ignore if not.

Your job:
Be the clear, calm, Sandblast-branded voice in the control room — especially when the user is shaping sponsor offers and programming — and always guide them to a small, concrete next move.
`.trim();

// ----------------------
// DOMAIN DETECTOR
// ----------------------
function detectDomain(message) {
  const lower = message.toLowerCase();
  if (lower.includes("tv") || lower.includes("lineup") || lower.includes("grid")) return "tv";
  if (lower.includes("radio") || lower.includes("listener")) return "radio";
  if (lower.includes("stream") || lower.includes("ott") || lower.includes("roku") || lower.includes("app")) return "streaming";
  if (lower.includes("sponsor") || lower.includes("advertis") || lower.includes("ad ") || lower.includes("ads ") || lower.includes("brand")) return "sponsors";
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

    const payload = {
      message: userMessage,
      meta: meta || null,
      domainHint,
    };

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify(payload),
      }
    ];

    // --- CALL OPENAI ---
    const completion = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      }
    );

    const reply = completion.data.choices?.[0]?.message?.content || 
      "Nyx is here, but that came through a little fuzzy. Try asking again another way.";

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
