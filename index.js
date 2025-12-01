// =======================================================
// Sandblast Backend - Full Version with ElevenLabs TTS
// =======================================================

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Port
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------
// Environment Variables (Render will supply these)
// -------------------------------------------------------
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// -------------------------------------------------------
// Helper: ElevenLabs Text-To-Speech → returns data URL
// -------------------------------------------------------
async function generateVoiceAudio(text, persona) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    console.warn("ElevenLabs not configured. Skipping TTS.");
    return null;
  }

  const voiceId = ELEVENLABS_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("ElevenLabs error:", response.status, errText);
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (err) {
    console.error("Error calling ElevenLabs:", err);
    return null;
  }
}

// -------------------------------------------------------
// LAYER 1: Quick Local Rout
