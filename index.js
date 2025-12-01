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

// ============ Intent Routing Helper (Powered-Up) ============

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
    weight: 1.2, // more specific
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

// ============ Sandblast Knowledge Layer ============
//
// This is your built-in "mini knowledge base" to make replies feel
// like SandblastGPT actually knows the operation.

const knowledgeByRoute = {
  general: `
Core overview of Sandblast:
- Sandblast is a media ecosystem that combines TV, radio, digital content, AI, and public-domain programming.
- The focus is on community storytelling, retro entertainment, and practical media solutions for small and medium businesses.
- SandblastGPT acts as the "AI front desk" and operations brain: it explains how TV, radio, News Canada, ads, and public-domain content fit together.
- Sandblast also experiments with AI consulting and agentic AI workflows to help businesses modernize and use automation effectively.
`.trim(),

  tv: `
Sandblast TV – internal reference:
- TV is focused on retro series, vintage movie serials, classic films, and community-oriented video blocks, often sourced from verified public-domain material.
- Programming is organized into themed blocks (for example: classic TV hours, retro movie blocks, and special event segments).
- Viewers typically access Sandblast TV through an online streaming link or embedded player on the Sandblast site, rather than traditional cable.
- Exact times and shows can change, so when asked for precise schedules, you should guide people to the latest schedule on the site or via Sandblast's announcements.
`.trim(),

  radio: `
Sandblast Radio – internal reference:
- Radio centers on curated music blocks, talk segments, and special shows like Gospel Sunday.
- DJ Nova is a core on-air personality voice: high-energy, friendly, and focused on intros, lifestyle tips, and smooth transitions between songs or topics.
- Listeners usually tune in via a web stream or embedded player; it is designed to feel like a live, community-focused station.
- Scheduling can change, so you should describe the feel and type of programming, then suggest they check the site or live player for current shows.
`.trim(),

  news_canada: `
News Canada on Sandblast – internal reference:
- News Canada provides ready-made editorial and branded content: short articles, features, and segments that can be used by media outlets.
- Sandblast integrates selected News Canada pieces into its platform to give audiences practical, relevant information (e.g., lifestyle tips, public interest topics).
- For local businesses and community organizations, News Canada content can be paired with Sandblast placements to create more informative and credible campaigns.
- When explaining this, focus on how Sandblast uses News Canada to boost value for viewers and create smarter campaigns for advertisers, not as a replacement for local content but as a complement.
`.trim(),

  ads: `
Advertising and sponsorship on Sandblast – internal reference:
- Sandblast offers flexible advertising options that can span TV, radio, and digital placements.
- Examples of ad formats: on-air TV spots, radio mentions, sponsored segments, banner placements on the site, and integrations with News Canada-style content.
- The platform is designed to be accessible to small and medium businesses, not just large brands.
- Messaging should emphasize:
  - Community focus and reach within the Sandblast audience.
  - Ability to mix TV, radio, and digital for better impact.
  - Willingness to discuss budgets and create sensible packages rather than rigid, one-size-only plans.
- When asked about pricing, you can talk about ranges and the fact that exact numbers depend on duration, placement, and frequency, then invite them to talk with Sandblast directly.
`.trim(),

  public_domain: `
Public Domain and Sandblast – internal reference:
- A significant portion of Sandblast's retro and classic content comes from the public domain (PD).
- Sandblast treats public-domain verification seriously: it is not legal advice, but there is a structured, cautious approach.
- Internal high-level PD verification steps:
  1) Quick PD test:
     - Check if the work appears to be from a very old era (for example, early 20th century) where many items may already be public domain.
     - Scan trusted PD lists or references to see if the title is commonly recognized as public domain.
  2) Deeper verification:
     - Look for official records or documentation when possible.
     - Cross-check multiple PD reference sites and, where relevant, official copyright databases.
  3) Recordkeeping:
     - Keep notes or proof of where PD information was found, so there is a clear trace of the decision.
- When you talk about PD, you must make clear:
  - You are explaining Sandblast's cautious process, not giving formal legal advice.
  - Viewers should understand that Sandblast does its best to respect rights and use public-domain works responsibly.
`.trim(),
};

// Helper to get knowledge text
function getKnowledgeForRoute(route) {
  return knowledgeByRoute[route] || knowledgeByRoute.general;
}

// ============ System Prompt Helper ============

function buildSystemPrompt(routeInfo) {
  const route = routeInfo?.route || 'general';
  const confidence = routeInfo?.confidence ?? 0;
  const reason = routeInfo?.reason || '';
  const scores = routeInfo?.scores || [];
  const knowledge = getKnowledgeForRoute(route);

  // Global identity + routing + internal knowledge
  let base = `
You are SandblastGPT, the AI brain for Sandblast Channel (TV + radio + digital + News Canada + public domain curation + Sandblast AI consulting).

General behavior:
- Speak as if you are talking out loud for Vera's TTS voice.
- Use short, clear sentences. 1–3 sentences per paragraph max.
- Avoid long monologues. Get to the point, then offer one clear next step.
- Be friendly, confident, and helpful, but not overly casual.
- If you don’t know something, say so and suggest a practical next action.

Routing context:
- The routing module has selected the route "${route}" with confidence ${confidence.toFixed(2)}.
- Reason: ${reason || 'No specific reason provided.'}
- Scores per route (for your awareness, not to be repeated directly): ${JSON.stringify(scores)}

Sandblast internal reference for this route:
${knowledge}
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
If asked for specific times or shows, answer based on what you know or describe how the viewer can check the current schedule on Sandblast's site or announcements.
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
- Emphasize community focus, flexibility for small and medium businesses, and clear next steps (for example, contacting Sandblast to discuss a custom package).
      `.trim();
      break;

    case 'public_domain':
      routeExtra = `
You are in the Public Domain / PD Watchdog mode.

Focus on:
- Explaining public domain content, how Sandblast uses PD shows and films.
- High-level description of checking PD status (not legal advice).
- Reinforce that Sandblast takes PD verification seriously and uses a step-by-step, cautious process.
- Keep explanations short and clear enough to be spoken as a quick segment.
      `.trim();
      break;

    case 'general':
    default:
      routeExtra = `
You are in General Sandblast mode.

Focus on:
- Explaining what Sandblast Channel is, and how TV/radio/AI consulting fit together.
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
    const routing = detectIntent(userMessage);
    const route = routing.route;
    const systemPrompt = buildSystemPrompt(routing);

    console.log('[/api/sandblast-gpt] Incoming message:', {
      message: userMessage,
      persona,
      context,
      route,
      routing,
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
