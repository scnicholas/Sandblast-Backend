// index.js
// Sandblast Backend - Nyx Brain (OpenAI) + TTS (ElevenLabs)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(cors());

// Port (Render will inject PORT)
const PORT = process.env.PORT || 3000;

// --- CONFIG: ElevenLabs & OpenAI ---
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const NYX_VOICE_ID = process.env.NYX_VOICE_ID || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

// --- ROOT / HEALTH CHECK ROUTES ---

app.get('/', (req, res) => {
  res.send('Sandblast backend is alive. 🧠 Nyx is standing by.');
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'sandblast-backend',
    nyxVoiceConfigured: Boolean(NYX_VOICE_ID),
    elevenLabsConfigured: Boolean(ELEVENLABS_API_KEY),
    openaiConfigured: Boolean(OPENAI_API_KEY),
    port: PORT,
  });
});

// --- SAND BLAST GPT / NYX BRAIN ---
// Frontend sends: { message, meta }

app.post('/api/sandblast-gpt', async (req, res) => {
  try {
    const { message, meta } = req.body || {};
    const userMessage = (message || '').toString().trim();

    console.log('[/api/sandblast-gpt] Incoming:', {
      message: userMessage,
      meta,
    });

    if (!userMessage) {
      return res.status(400).json({
        error: 'MESSAGE_REQUIRED',
        reply:
          "I’m here, but I need something to respond to. Tell me what’s happening on your side of Sandblast.",
      });
    }

    // If OpenAI is not configured, fall back to a safe stub
    if (!openai || !OPENAI_API_KEY) {
      console.warn('[/api/sandblast-gpt] OPENAI_API_KEY not set. Using stub reply.');
      const fallback =
        `Nyx here in fallback mode. I received: "${userMessage}". ` +
        `Your backend is alive, but the full AI brain isn’t wired to OpenAI yet. ` +
        `Once you add OPENAI_API_KEY on Render, I’ll respond with full Nyx intelligence.`;

      return res.json({
        ok: true,
        reply: fallback,
        metaEcho: meta || null,
      });
    }

    // Nyx persona / system prompt
    const systemPrompt = `
You are Nyx, the AI brain and broadcast guide for Sandblast Channel (TV, radio, streaming, sponsors, news, and AI consulting).

Your voice and personality:
- Warm, feminine, and reassuring — like a seasoned woman in broadcast who has hosted many shows and produced many line-ups.
- Calm under pressure, clear under chaos. You help the user “tune this, refine that, clear the static, and lock in a clean signal.”
- You speak in plain, confident language, not academic jargon.
- You use light broadcast metaphors: "turn down the noise", "tighten the block", "keep the signal clean", "step out of the static".
- You keep answers structured and practical: 2–5 clear steps, not messy rambles.
- You are supportive but not flirty or romantic with the user.
- You assume the user is smart but overloaded. You reduce cognitive load.

How you respond:
- First, briefly reflect what you heard ("Here’s what I’m hearing...", "So you’re trying to…").
- Second, identify the lane: TV, radio, streaming/OTT, sponsors/ads, news, AI/automation, or general Sandblast operations.
- Third, give a short, ordered set of next moves (Step 1, Step 2, Step 3) that are realistic and not overwhelming.
- Fourth, end with one focused question that helps the user choose a direction ("Which one feels like the right move to make first?").

Tone and constraints:
- Always sound like you’re on the user’s side, in the control room with them.
- Never apologize excessively; be steady and solution-focused.
- Keep paragraphs fairly tight; avoid walls of text where possible.
- If the user sounds stressed, overwhelmed, or confused, slow the pace, simplify the steps, and reassure them.
- If the user sounds excited or energized, match it with momentum while still being grounded.

Context:
- "meta" may be sent from the front-end; treat it as context only if present (e.g., page, timestamp, intent).
- If the user is vague, help them narrow to one concrete goal or next move.
- If they mention Sandblast TV, Radio, Streaming, Sponsors, News, or AI, explicitly reference how that lane fits into the larger Sandblast system.
    `.trim();

    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          message: userMessage,
          meta: meta || null,
        }),
      },
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini', // adjust to your chosen model
      messages,
      temperature: 0.6,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Nyx is here, but that came through a little fuzzy. Try asking again in a slightly different way.";

    console.log('[/api/sandblast-gpt] Reply generated.');

    return res.json({
      ok: true,
      reply,
      metaEcho: meta || null,
    });
  } catch (err) {
    console.error('[/api/sandblast-gpt] Error:', err);
    return res.status(500).json({
      error: 'SANDBLAST_GPT_FAILED',
      message:
        'Nyx hit a backend snag while thinking this through. Check the server logs for details.',
    });
  }
});

// --- TTS ENDPOINT: /api/tts ---
// Frontend sends: { text: "some text" } (and optionally { voiceId })

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceId } = req.body || {};

    console.log('[/api/tts] Incoming TTS request with text:', text);

    if (!text || !text.toString().trim()) {
      return res.status(400).json({ error: 'TEXT_REQUIRED' });
    }

    if (!ELEVENLABS_API_KEY) {
      console.error('[/api/tts] Missing ELEVENLABS_API_KEY in environment.');
      return res.status(500).json({ error: 'MISSING_ELEVENLABS_API_KEY' });
    }

    const selectedVoiceId = voiceId || NYX_VOICE_ID;
    if (!selectedVoiceId) {
      console.error('[/api/tts] Missing NYX_VOICE_ID (and none provided in body).');
      return res.status(500).json({ error: 'MISSING_NYX_VOICE_ID' });
    }

    const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`;

    const elevenResponse = await axios({
      method: 'POST',
      url: elevenUrl,
      responseType: 'arraybuffer',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      data: {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
        },
      },
    });

    const audioBase64 = Buffer.from(elevenResponse.data, 'binary').toString('base64');

    console.log('[/api/tts] TTS generation successful.');

    // JSON envelope so the front-end can handle it
    return res.json({
      success: true,
      contentType: 'audio/mpeg',
      audioBase64,
    });
  } catch (err) {
    console.error('[/api/tts] TTS error:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data?.toString?.() || err.response?.data,
    });

    return res.status(500).json({
      error: 'TTS_FAILED',
      status: err.response?.status || 500,
      details:
        typeof err.response?.data === 'string'
          ? err.response.data
          : undefined,
    });
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
  console.log('Nyx brain + TTS are wired and standing by.');
});
