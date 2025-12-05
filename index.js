// index.js
// Sandblast Backend - Nyx Brain + TTS

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(cors());

// Port (Render will inject PORT)
const PORT = process.env.PORT || 3000;

// --- CONFIG: ElevenLabs ---
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const NYX_VOICE_ID = process.env.NYX_VOICE_ID || '';

// --- ROOT / HEALTH CHECK ROUTES ---

// Simple root route so you can test quickly
app.get('/', (req, res) => {
  res.send('Sandblast backend is alive. 🧠 Nyx is standing by.');
});

// Optional health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'sandblast-backend',
    nyxVoiceConfigured: Boolean(NYX_VOICE_ID),
    elevenLabsConfigured: Boolean(ELEVENLABS_API_KEY),
  });
});

// --- SAND BLAST GPT / NYX BRAIN (STUBBED BUT SAFE) ---
// This ensures your front-end widget always gets *something* back.
// You can later replace the logic with your OpenAI / Nyx personality engine.

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
        reply: "I’m here, but I need something to respond to. What’s on your mind?",
      });
    }

    // Simple Nyx-flavoured stub response
    const reply =
      `Hi Mac, Nyx here in sandbox mode. ` +
      `I received: "${userMessage}". ` +
      `The full brain isn’t wired to OpenAI in this stub, ` +
      `but your backend is alive and ready for the next phase.`;

    return res.json({
      ok: true,
      reply,
      metaEcho: meta || null,
    });
  } catch (err) {
    console.error('[/api/sandblast-gpt] Error:', err);
    return res.status(500).json({
      error: 'SANDBLAST_GPT_FAILED',
      message: 'Nyx hit a backend snag. Check the server logs for details.',
    });
  }
});

// --- TTS ENDPOINT: /api/tts ---
// Frontend sends: { text: "some text" }
// Optional: { text, voiceId }

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
        'Accept': 'audio/mpeg',
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
});
