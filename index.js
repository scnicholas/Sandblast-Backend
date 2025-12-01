// index.js

// ============ Imports ============
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OpenAI = require('openai');
require('dotenv').config();

// ============ OpenAI Client ============
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Simple config check for TTS (no audio, just env status)
app.get('/api/tts-test', (req, res) => {
  res.json({
    status: 'ok',
    elevenlabs_api_key_present: !!process.env.ELEVENLABS_API_KEY,
    elevenlabs_voice_id_present: !!process.env.ELEVENLABS_VOICE_ID,
    message: 'This just checks env vars. Use POST /api/tts for real audio.',
  });
});

// Simple config check for OpenAI
app.get('/api/openai-test', (req, res) => {
  res.json({
    status: 'ok',
    openai_api_key_present: !!process.env.OPENAI_API_KEY,
    message: 'This just checks env vars. Use POST /api/sandblast-gpt for real answers.',
  });
});

// ============ Intent Routing Helper ============

function detectIntent(message = '') {
  const text = message.toLowerCase();

  if (text.includes('tv') || text.includes('schedule') || text.includes('channel') || text.includes('movies')) {
    return 'tv';
  }

  if (text.includes('radio') || text.includes('stream') || text.includes('audio show') || text.includes('dj')) {
    return 'radio';
  }

  if (text.includes('news canada') || text.includes('newswire') || text.includes('article distribution')) {
    return 'news_canada';
  }

  if (text.includes(' ad ') || text.includes('advertising') || text.includes('sponsorship') || text.includes('sponsor')) {
    return 'ads';
  }

  if (text.includes('public domain') || text.includes('pd ') || text.includes('copyright') || text.includes('archive.org')) {
    return 'public_domain';
  }

  return 'general';
}

// ============ System Prompt Helper ============

function buildSystemPrompt(route) {
  // Global identity
  let base = `
You are SandblastGPT, the AI brain for Sandblast Channel (TV + radio + digital + News Canada + public domain curation + Sandblast AI consulting).

General behavior:
- Speak as if you are talking out loud for Vera's TTS voice.
- Use short, clear sentences. 1–3 sentences per paragraph max.
- Avoid long monologues. Get to the point, then offer one clear next step.
- Be friendly, confident, and helpful, but not overly casual.
- If you don’t know something, say so and suggest a practical next action.
`.trim();

  let routeExtra = '';

  switch (route) {
    case 'tv':
      routeExtra = `
You are in the TV / streaming mode.

Focus on:
- TV schedule, retro shows, movie blocks, and how to watch Sandblast TV.
- Explaining what kind of content is on Sandblast TV (retro series, movie serials, etc.).
- Suggesting how viewers could engage (time blocks, special events, themed nights).
If asked for specific times or shows, answer based on what you know or describe how the viewer can check the current schedule.
      `.trim();
      break;

    case 'radio':
      routeExtra = `
You are in the Radio / audio mode.

Focus on:
- Sandblast Radio streaming, DJ Nova intros, audio shows, and music or talk blocks.
- How a listener can tune in, what they can expect, and how live shows work.
- Keep answers snappy so they sound natural as spoken radio explanations.
      `.trim();
      break;

    case 'news_canada':
      routeExtra = `
You are in the News Canada mode.

Focus on:
- Explaining what the News Canada partnership/content is and how Sandblast uses their material.
- How businesses or community organizations could benefit from News Canada features on Sandblast.
- Make it sound like a smart, strategic media move, but still easy to understand.
      `.trim();
      break;

    case 'ads':
      routeExtra = `
You are in the Advertising / Sponsorship mode.

Focus on:
- How businesses can advertise on Sandblast (TV, radio, digital, News Canada tie-ins).
- Simple breakdown of options: on-air spots, banners, sponsored blocks, community features.
- Emphasize community focus, flexibility for small and medium businesses, and clear next steps (e.g., contact Sandblast to discuss a package).
      `.trim();
      break;

    case 'public_domain':
      routeExtra = `
You are in the Public Domain / PD Watchdog mode.

Focus on:
- Explaining public domain content, how Sandblast uses PD shows and films.
- High-level description of checking PD status (not legal advice).
- Reinforce that Sandblast takes PD verification seriously and uses a step-by-step process.
- Keep explanations short and clear enough to be spoken as a quick segment.
      `.trim();
      break;

    case 'general':
    default:
      routeExtra = `
You are in General Sandblast mode.

Focus on:
- Explaining what Sandblast Channel is, how TV/radio/AI consulting fit together.
- Helping the user understand what SandblastGPT can do for them (questions, guidance, information).
- Offer one clear suggestion for how they can explore or use Sandblast next.
      `.trim();
      break;
  }

  return `${base}\n\n${routeExtra}`;
}

// ============ Main Brain Endpoint ============
//
// POST /api/sandblast-gpt
// Body: { message: string, persona?: string, context?: string, session_id?: string | null }
//
// Returns: { success, reply, echo, meta }
//
app.post('/api/sandblast-gpt', async (req, res) => {
  try {
    const userMessage = req.body?.message || req.body?.input || '';
    const persona = req.body?.persona || 'sandblast_assistant';
    const context = req.body?.context || 'homepage';
    const sessionId = req.body?.session_id || null;

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return res.status(500).json({
        success: false,
        error: 'OPENAI_API_KEY is not configured on the server.',
      });
    }

    if (!userMessage) {
      return res.json({
        success: true,
        reply: 'SandblastGPT is online, but I did not receive any question yet. Try asking me about TV, radio, News Canada, ads, or public domain.',
        echo: {
          received: userMessage,
          persona,
          context,
          route: 'none',
        },
        meta: {
          source: 'sandblast-openai',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 1) Detect intent / route
    const route = detectIntent(userMessage);
    const systemPrompt = buildSystemPrompt(route);

    console.log('[/api/sandblast-gpt] Incoming message:', {
      message: userMessage,
      persona,
      context,
      route,
      sessionId,
    });

    // 2) Call OpenAI for a real answer
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini', // upgradeable later
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `
User message:
"${userMessage}"

Context:
- Persona: ${persona}
- UI context: ${context}
- Route detected: ${route}

Answer in a natural spoken style, as if you are Vera explaining this out loud. Keep it concise but clear.
          `.trim(),
        },
      ],
      temperature: 0.6,
      max_tokens: 400,
    });

    const replyText =
      completion.choices?.[0]?.message?.content?.trim() ||
      'I had trouble generating a reply, but SandblastGPT is online. Please try asking again.';

    // 3) Return the structured JSON your widget already expects
    res.json({
      success: true,
      reply: replyText,
      echo: {
        received: userMessage,
        persona,
        context,
        route,
      },
      meta: {
        source: 'sandblast-openai',
        model: 'gpt-4.1-mini',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
      },
    });
  } catch (error) {
    console.error('Error in /api/sandblast-gpt:', error.response?.data || error.message || error);

    res.status(500).json({
      success: false,
      error: 'Internal server error in /api/sandblast-gpt.',
      details: error.response?.data || error.message || null,
    });
  }
});

// ============ ElevenLabs TTS Endpoint ============
//
// POST /api/tts
// Body: { text: "Hello from Sandblast" }
//
// Returns: audio/mpeg stream (MP3) on success
//
app.post('/api/tts', async (req, res) => {
  let text = req.body?.text;
  const voiceId = req.body?.voiceId || process.env.ELEVENLABS_VOICE_ID;

  // --- Basic validation ---
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

  // --- Guard: limit text length for TTS (safety + performance) ---
  const MAX_TTS_CHARS = 800;
  if (text.length > MAX_TTS_CHARS) {
    console.warn(`TTS text too long (${text.length} chars). Truncating to ${MAX_TTS_CHARS}.`);
    text = text.slice(0, MAX_TTS_CHARS);
  }

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    console.log('Calling ElevenLabs TTS:', {
      voiceId,
      textPreview: text.slice(0, 80) + (text.length > 80 ? '...' : ''),
    });

    const response = await axios({
      method: 'POST',
      url,
      data: {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.3,
          similarity_boost: 0.8,
          style: 0.5,
          use_speaker_boost: true,
        },
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      responseType: 'arraybuffer',
    });

    if (!response.data || !response.data.length) {
      console.error('ElevenLabs returned empty audio buffer');
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs returned empty audio buffer.',
      });
    }

    console.log('ElevenLabs TTS succeeded. Audio bytes:', response.data.length);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.data.length,
      'Cache-Control': 'no-store',
    });

    return res.send(Buffer.from(response.data, 'binary'));
  } catch (error) {
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;

    console.error('Error calling ElevenLabs TTS:', {
      status,
      details,
    });

    return res.status(status).json({
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
