// index.js

// ============ Imports ============
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// ============ App Setup ============
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// ============ Basic Routes ============
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Sandblast backend is running.',
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/sandblast-gpt-test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Test endpoint reached. Backend is responding.',
    hint: 'Use POST /api/sandblast-gpt for real requests.',
  });
});

// Optional: quick config check for TTS (no audio, just config status)
app.get('/api/tts-test', (req, res) => {
  res.json({
    status: 'ok',
    elevelabs_api_key_present: !!process.env.ELEVENLABS_API_KEY,
    elevenlabs_voice_id_present: !!process.env.ELEVENLABS_VOICE_ID,
    message: 'This only checks env vars. Use POST /api/tts for real audio.',
  });
});

// ============ Main Brain Endpoint ============
//
// This is the text “brain” stub. Your Webflow widget calls this first.
//
app.post('/api/sandblast-gpt', async (req, res) => {
  try {
    const userMessage = req.body?.message || req.body?.input || null;
    const persona = req.body?.persona || 'sandblast_assistant';
    const context = req.body?.context || 'homepage';

    const replyText = userMessage
      ? `Backend brain received: "${userMessage}". Persona: ${persona}. Context: ${context}. This is the temporary logic layer before full OpenAI integration.`
      : 'Backend brain is online, but I did not receive any message in the request body.';

    res.json({
      success: true,
      reply: replyText,
      echo: {
        received: userMessage,
        persona,
        context,
      },
      meta: {
        source: 'sandblast-backend',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error in /api/sandblast-gpt:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error in /api/sandblast-gpt.',
    });
  }
});

// ============ ElevenLabs TTS Endpoint ============
//
// POST /api/tts
// Body: { text: "Hello from Sandblast" }
//
// Returns: audio/mpeg stream (MP3)
//
app.post('/api/tts', async (req, res) => {
  const text = req.body?.text;
  const voiceId = req.body?.voiceId || process.env.ELEVENLABS_VOICE_ID;

  // Basic validation
  if (!text) {
    return res.status(400).json({
      success: false,
      error: 'Missing "text" in request body.',
    });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set');
    return res.status(500).json({
      success: false,
      error: 'ELEVENLABS_API_KEY is not configured on the server.',
    });
  }

  if (!voiceId) {
    console.error('ELEVENLABS_VOICE_ID is not set or provided');
    return res.status(500).json({
      success: false,
      error: 'ELEVENLABS_VOICE_ID is not configured or provided.',
    });
  }

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    console.log('Calling ElevenLabs TTS with voiceId:', voiceId);

    const response = await axios({
      method: 'POST',
      url,
      data: {
        text,
        model_id: 'eleven_monolingual_v1', // adjust in ElevenLabs if needed
        voice_settings: {
          stability: 0.3,         // lower = more expressive
          similarity_boost: 0.8,
          style: 0.5,
          use_speaker_boost: true
        }
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      responseType: 'arraybuffer', // get raw audio bytes
    });

    if (!response.data || !response.data.length) {
      console.error('ElevenLabs returned empty audio buffer');
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs returned empty audio buffer.',
      });
    }

    // Audio response headers
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.data.length,
      'Cache-Control': 'no-store',
    });

    return res.send(Buffer.from(response.data, 'binary'));
  } catch (error) {
    const status = error.response?.status;
    const details = error.response?.data || error.message;

    console.error('Error calling ElevenLabs TTS:', {
      status,
      details,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to generate audio with ElevenLabs.',
      status,
      details,
    });
  }
});

// ============ Start Server ============
app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});
