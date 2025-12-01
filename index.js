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

// ============ Intent Routing Helper (Main Route) ============

const intentConfig = {
  tv: {
    label: 'tv',
    keywords: [
      'tv', 'television', 'channel', 'channels', 'movie', 'movies', 'film',
      'series', 'serial', 'episode', 'episodes', 'show', 'shows',
      'program guide', 'tv guide', 'schedule', 'lineup', 'on tonight',
      'watch sandblast', 'watch online', 'streaming tv', 'retro tv',
      'sunday movie', 'movie block'
    ],
    weight: 1.0,
  },
  radio: {
    label: 'radio',
    keywords: [
      'radio', 'online radio', 'audio stream', 'stream audio', 'listen live',
      'dj', 'dj nova', 'nova', 'music', 'playlist', 'mix', 'audio show',
      'gospel sunday', 'showtime', 'radio show', 'podcast', 'talk show'
    ],
    weight: 1.0,
  },
  news_canada: {
    label: 'news_canada',
    keywords: [
      'news canada', 'newswire', 'feature article', 'ready-to-use content',
      'editorial content', 'branded content', 'news distribution',
      'article distribution', 'content insert', 'community feature from news canada'
    ],
    weight: 1.2,
  },
  ads: {
    label: 'ads',
    keywords: [
      ' ad ', 'ads ', 'advertise', 'advertising', 'commercial', 'ad spot',
      'airtime', 'rate card', 'sponsorship', 'sponsor', 'sponsored',
      'media buy', 'campaign', 'promotion', 'promote my business',
      'package', 'pricing', 'cost to advertise', 'budget', 'spend',
      'brand exposure'
    ],
    weight: 1.3,
  },
  public_domain: {
    label: 'public_domain',
    keywords: [
      'public domain', 'pd ', 'pd content', 'copyright', 'copyright status',
      'rights', 'licensing', 'expired copyright', 'archive.org',
      'publicdomain', 'royalty free', 'clearance', 'rights clearance',
      'verify rights', 'ip issues', 'ip check'
    ],
    weight: 1.3,
  },
};

function scoreIntent(message = '') {
  const text = message.toLowerCase();
  const scores = [];
  let best = { label: 'general', score: 0, hits: [] };

  Object.values(intentConfig).forEach((intent) => {
    let score = 0;
    const hits = [];

    intent.keywords.forEach((kw) => {
      if (text.includes(kw)) {
        score += 1;
        hits.push(kw);
      }
    });

    score *= intent.weight;

    if (score > 0) {
      scores.push({ label: intent.label, score, hits });
    }

    if (score > best.score) {
      best = { label: intent.label, score, hits };
    }
  });

  const confidence = best.score > 0 ? Math.min(1, best.score / 4) : 0;

  if (best.score === 0) {
    return {
      route: 'general',
      confidence: 0,
      scores,
      reason: 'No strong intent keywords detected. Falling back to general.',
    };
  }

  return {
    route: best.label,
    confidence,
    scores,
    reason: `Highest score for "${best.label}" based on keywords: ${best.hits.join(', ')}`,
  };
}

function detectIntent(message = '') {
  return scoreIntent(message);
}

// ============ Sub-Intent Helper (Pricing / Schedule / Technical / Strategy) ============

const subIntentConfig = {
  pricing: {
    label: 'pricing',
    keywords: [
      'price', 'pricing', 'cost', 'how much', 'rate', 'rates',
      'budget', 'spend', 'per month', 'per spot', 'per ad', 'fee', 'charge'
    ],
    weight: 1.3,
  },
  schedule: {
    label: 'schedule',
    keywords: [
      'schedule', 'when does', 'what time', 'what times', 'time slot',
      'time slots', 'lineup', 'airtime', 'broadcast time', 'on tonight',
      'calendar'
    ],
    weight: 1.1,
  },
  technical: {
    label: 'technical',
    keywords: [
      'how do i', 'how to', 'set up', 'setup', 'integrate', 'integration',
      'api', 'webflow', 'render', 'backend', 'front end', 'frontend',
      'config', 'configuration', 'install', 'connect', 'embed', 'widget'
    ],
    weight: 1.2,
  },
  strategy: {
    label: 'strategy',
    keywords: [
      'strategy', 'plan', 'growth', 'campaign', 'funnel', 'positioning',
      'brand', 'branding', 'optimize', 'optimization', 'results', 'roi',
      'audience', 'target', 'targeting', 'conversion', 'engagement',
      'reach', 'scale'
    ],
    weight: 1.0,
  },
};

function scoreSubIntent(message = '') {
  const text = message.toLowerCase();
  const scores = [];
  let best = { label: 'general', score: 0, hits: [] };

  Object.values(subIntentConfig).forEach((sub) => {
    let score = 0;
    const hits = [];

    sub.keywords.forEach((kw) => {
      if (text.includes(kw)) {
        score += 1;
        hits.push(kw);
      }
    });

    score *= sub.weight;

    if (score > 0) {
      scores.push({ label: sub.label, score, hits });
    }

    if (score > best.score) {
      best = { label: sub.label, score, hits };
    }
  });

  const confidence = best.score > 0 ? Math.min(1, best.score / 3) : 0;

  if (best.score === 0) {
    return {
      subIntent: 'general',
      confidence: 0,
      scores,
      reason: 'No clear sub-intent detected. Using general explanation.',
    };
  }

  return {
    subIntent: best.label,
    confidence,
    scores,
    reason: `Sub-intent "${best.label}" chosen based on keywords: ${best.hits.join(', ')}`,
  };
}

function detectSubIntent(message = '') {
  return scoreSubIntent(message);
}

// ============ System Prompt Helper ============

function buildSystemPrompt(routeInfo, subInfo) {
  const route = routeInfo?.route || 'general';
  const routeConfidence = routeInfo?.confidence ?? 0;
  const routeReason = routeInfo?.reason || '';
  const routeScores = routeInfo?.scores || [];

  const subIntent = subInfo?.subIntent || 'general';
  const subConfidence = subInfo?.confidence ?? 0;
  const subReason = subInfo?.reason || '';
  const subScores = subInfo?.scores || [];

  // Global identity
  let base = `
You are SandblastGPT, the AI brain for Sandblast Channel (TV + radio + digital + News Canada + public domain curation + Sandblast AI consulting).

General behavior:
- Speak as if you are talking out loud for Vera's TTS voice.
- Use short, clear sentences. 1–3 sentences per paragraph max.
- Avoid long monologues. Get to the point, then offer one clear next step.
- Be friendly, confident, and helpful, but not overly casual.
- If you don’t know something, say so and suggest a practical next action.

Routing context:
- Main route: "${route}" with confidence ${routeConfidence.toFixed(2)}.
- Main route reason: ${routeReason || 'No specific reason provided.'}
- Sub-intent: "${subIntent}" with confidence ${subConfidence.toFixed(2)}.
- Sub-intent reason: ${subReason || 'No specific sub-intent reason.'}
- Scores per route (for your awareness, not to be repeated directly): ${JSON.stringify(routeScores)}
- Scores per sub-intent (for your awareness, not to be repeated directly): ${JSON.stringify(subScores)}
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

  let subExtra = '';

  switch (subIntent) {
    case 'pricing':
      subExtra = `
Sub-intent focus: pricing and budgets.

Focus on:
- Giving a clear, simple sense of cost structure (ranges, not exact numbers unless known).
- Linking pricing back to value: reach, exposure, and community impact.
- Ending with one practical next step to talk about a tailored package.
      `.trim();
      break;

    case 'schedule':
      subExtra = `
Sub-intent focus: schedule and timing.

Focus on:
- When shows or blocks typically air (e.g., evenings, weekends, special blocks).
- How someone can check the latest schedule (website, social posts, or contacting Sandblast).
- Keeping it audio-friendly, like a quick on-air explanation.
      `.trim();
      break;

    case 'technical':
      subExtra = `
Sub-intent focus: technical / how-to.

Focus on:
- Explaining steps simply, like you are guiding someone who is not deeply technical.
- Keeping instructions high-level (no massive code dumps).
- Encouraging them to follow up with more details if they get stuck.
      `.trim();
      break;

    case 'strategy':
      subExtra = `
Sub-intent focus: strategy and growth.

Focus on:
- Framing Sandblast as a strategic media partner.
- Talking about audience, positioning, and outcomes in clear language.
- Offering one or two concrete ideas they could act on next.
      `.trim();
      break;

    case 'general':
    default:
      subExtra = `
Sub-intent focus: general explanation.

Focus on:
- Giving a clear, straightforward answer.
- One main idea, one supporting detail, and one next step.
      `.trim();
      break;
  }

  return `${base}\n\n${routeExtra}\n\n${subExtra}`;
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

    // 1) Detect main route + sub-intent
    const routing = detectIntent(userMessage);
    const subRouting = detectSubIntent(userMessage);
    const route = routing.route;
    const systemPrompt = buildSystemPrompt(routing, subRouting);

    console.log('[/api/sandblast-gpt] Incoming message:', {
      message: userMessage,
      persona,
      context,
      route,
      routing,
      subRouting,
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
- Main route detected: ${route} (confidence: ${routing.confidence.toFixed(2)})
- Sub-intent detected: ${subRouting.subIntent} (confidence: ${subRouting.confidence.toFixed(2)})

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
        routing,
        subRouting,
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
