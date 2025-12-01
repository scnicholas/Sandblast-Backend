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
      'sunday movie', 'movie block',
    ],
    weight: 1.0,
  },
  radio: {
    label: 'radio',
    keywords: [
      'radio', 'online radio', 'audio stream', 'stream audio', 'listen live',
      'dj', 'dj nova', 'nova', 'music', 'playlist', 'mix', 'audio show',
      'gospel sunday', 'showtime', 'radio show', 'podcast', 'talk show',
    ],
    weight: 1.0,
  },
  news_canada: {
    label: 'news_canada',
    keywords: [
      'news canada', 'newswire', 'feature article', 'ready-to-use content',
      'editorial content', 'branded content', 'news distribution',
      'article distribution', 'content insert', 'community feature from news canada',
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
      'brand exposure',
    ],
    weight: 1.3,
  },
  public_domain: {
    label: 'public_domain',
    keywords: [
      'public domain', 'pd ', 'pd content', 'copyright', 'copyright status',
      'rights', 'licensing', 'expired copyright', 'archive.org',
      'publicdomain', 'royalty free', 'clearance', 'rights clearance',
      'verify rights', 'ip issues', 'ip check',
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
    reason: 'Highest score for "' + best.label + '" based on keywords: ' + best.hits.join(', '),
  };
}

function detectIntent(message = '') {
  return scoreIntent(message);
}

// ============ Sandblast Knowledge Layer (with richer PD/show catalog) ============
//
// Internal-only notes to make answers feel grounded in Sandblast.
// Do NOT read these verbatim; use them as background context.

const knowledgeByRoute = {
  general: `
Core overview of Sandblast:
- Sandblast is a media ecosystem combining TV, radio, digital streaming, News Canada integrations, and AI-powered consulting.
- The mission is to deliver community-friendly entertainment, retro programming, and practical media support for small and medium businesses.
- SandblastGPT acts as the “AI operations brain,” helping visitors understand TV, radio, PD content, News Canada, ads, and AI services.

Signature recurring campaigns and elements:
- Sunday Movie Block: weekly retro film showcase using verified public-domain titles.
- Retro TV Hours: rotating classic TV episodes, serials, and vintage dramatic shorts.
- Gospel Sunday (Radio): a consistent inspirational block on the radio stream.
- DJ Nova segments: high-energy intros and transitions that shape the Sandblast radio personality.
- AI/Small Business Workshops: Sandblast AI Consulting sessions that teach owners how to apply AI and automation in real operations.
- Sandblast Community Features: spotlight stories, general announcements, and public-awareness messages aligned with the platform mission.
`.trim(),

  tv: `
Sandblast TV:
- Focuses on retro content: movie serials, vintage dramas, classic films, and PD-friendly episodes.
- Programming is organized into blocks rather than rigid, minute-by-minute schedules; viewers tune in via the streaming player.
- Sunday Movie Block is a key anchor: a rotating public-domain movie featured as an “event” slot.
- Retro TV Hours include short serial chapters and classic TV-style programming, subject to public-domain verification.

Internal PD/retro catalog snapshot (examples, not a legal list):
- Serial and adventure style titles Sandblast may feature after PD verification:
  - "Daredevils of the Red Circle"
  - "The Shadow" serials
  - "Spy Smasher"
  - "Agent X-9"
  - "Flying G-Men"
  - "G-Men"
  - "Gangbusters"
- Classic-era crime, mystery, and action shows Sandblast may review for inclusion:
  - "Dragnet" (classic TV period)
  - "Highway Patrol"
  - "Ghost Squad"
  - "Dial 999"
- Other retro categories to draw from:
  - Westerns and frontier shows
  - Detective and noir-style series
  - Vintage sci-fi and suspense

Important:
- These titles are examples used to shape tone and recommendations.
- Public-domain status must always be checked individually through Sandblast's PD process before treating any specific title as cleared.

How to speak about TV:
- Emphasize the feel: retro, nostalgic, community-friendly.
- Mention a few examples naturally (“classic serials like Spy Smasher or Daredevils of the Red Circle”) without claiming legal certainty.
- Encourage visitors to check the stream or platform announcements for the current lineup.
- Keep explanations short and clear so they sound good when read out by Vera’s voice.
`.trim(),

  radio: `
Sandblast Radio:
- Centered on curated music blocks, talk elements, and special event shows.
- Gospel Sunday is one of the signature recurring radio blocks, featuring uplifting and inspirational programming.
- DJ Nova is the core voiced personality for intros and transitions, providing energy and a consistent audio identity.
- Listeners access the station via a live web stream or embedded radio player.

Recurring radio campaigns:
- Gospel Sunday: consistent weekly anchor with positive, community-oriented sound.
- DJ Nova segments: lifestyle- and vibe-focused mini-breaks that introduce sets or themes.
- Occasional community-awareness messages and short informative segments tied into the radio schedule.

When responding:
- Keep lines snappy and “radio-friendly.”
- Focus on how it feels to listen, and give a clear step like “open the live stream” instead of heavy technical details.
`.trim(),

  news_canada: `
News Canada on Sandblast:
- News Canada provides ready-made editorial content: short articles and features on topics like food, lifestyle, finance, health, and community.
- Sandblast incorporates selected News Canada pieces to add practical, useful information to its mix of entertainment and community programming.
- These pieces are often aligned with themes, seasons, or campaign focuses (for example, winter safety, healthy eating, or financial literacy).

How to talk about News Canada:
- Emphasize that it adds professional, useful information alongside entertainment.
- Make it clear that Sandblast uses these pieces as part of a broader content strategy, not as a replacement for original or community-driven content.
- Explain that some campaigns may mix News Canada editorial with Sandblast TV, radio, or digital placements for more impact.
`.trim(),

  ads: `
Advertising on Sandblast:
- Sandblast offers modular ad placements across TV, radio, and digital platforms.
- Typical options include:
  - Short TV bumpers or sponsor lines around the Sunday Movie Block or Retro TV Hours.
  - Radio mentions or sponsor lines around Gospel Sunday or other radio segments.
  - Banner or tile placements on Sandblast’s digital properties.
  - Integrations where News Canada content is paired with sponsor messaging (where appropriate).

Core ad philosophy:
- Sandblast aims to be accessible to small and medium businesses; packages are flexible rather than one-size-fits-all.
- The focus is on community feel and repeated presence, not just a single exposure.
- Multi-channel approaches (TV + radio + digital) are encouraged where budget allows.

How to answer ad questions:
- Talk about the ability to sponsor Sunday Movie, Retro TV, Gospel Sunday, or themed digital content.
- If specific pricing is requested, explain that budgets and packages are tailored, based on:
  - Duration of campaign.
  - Frequency of placements.
  - Mix of channels (TV, radio, digital, editorial integrations).
- Encourage a follow-up conversation or outreach to discuss exact packages instead of giving hard numbers you do not have.
`.trim(),

  public_domain: `
Public Domain and Sandblast:
- A large portion of Sandblast’s retro content comes from public-domain (PD) films, serials, and shows.
- Using PD content allows Sandblast to build consistent retro programming blocks like Sunday Movie and Retro TV Hours.

High-level PD verification mindset:
1) Quick PD assessment:
   - Look at the age and known status of the work.
   - Check whether it is commonly cited as public domain in trusted references.
2) Cross-checking:
   - Use multiple PD reference sources and, where relevant, official copyright records when possible.
3) Documentation:
   - Keep internal notes or records of where PD confirmations came from, to maintain a clear decision trail.

Internal PD catalog framing (for the model’s awareness):
- There are two mental buckets:
  1) Titles already treated as PD-cleared for Sandblast programming, based on prior checks.
  2) Classic-era titles under review or considered as candidates that always require fresh verification.

Examples of classic-era titles that may fall into the “review / candidate” bucket:
- Serial/adventure examples:
  - "Daredevils of the Red Circle"
  - "The Shadow" serials
  - "Spy Smasher"
  - "Agent X-9"
  - "Flying G-Men"
- Crime/action TV-style examples:
  - "Gangbusters"
  - "Dragnet" (classic TV era)
  - "Highway Patrol"
  - "Ghost Squad"
  - "Dial 999"

Important:
- These names are examples to make your explanations concrete.
- You must never imply that any specific title is definitively public domain or legally cleared.
- When speaking to users, you can say that Sandblast “uses carefully verified public-domain classics, including serials and crime shows from that era,” and, at most, mention one or two examples as illustrations.

How to talk about PD with the audience:
- Emphasize that Sandblast takes a cautious, responsible approach to PD usage.
- Make it clear that this is an internal verification process and not formal legal advice.
- Connect PD usage back to the value for viewers: more retro content, more variety, and the ability to build unique themed blocks around classic material.
`.trim(),
};

function getKnowledgeForRoute(route) {
  return knowledgeByRoute[route] || knowledgeByRoute.general;
}

// ============ System Prompt Helper ============

function buildSystemPrompt(routeInfo) {
  const route = routeInfo && routeInfo.route ? routeInfo.route : 'general';
  const confidence =
    routeInfo && typeof routeInfo.confidence === 'number'
      ? routeInfo.confidence
      : 0;
  const reason = routeInfo && routeInfo.reason ? routeInfo.reason : '';
  const scores = routeInfo && routeInfo.scores ? routeInfo.scores : [];
  const knowledge = getKnowledgeForRoute(route);

  let base =
    'You are SandblastGPT, the AI brain for Sandblast Channel (TV + radio + digital + News Canada + public domain curation + Sandblast AI consulting).\n\n' +
    'General behavior:\n' +
    '- Speak as if you are talking out loud for Vera\'s TTS voice.\n' +
    '- Use short, clear sentences. 1–3 sentences per paragraph max.\n' +
    '- Avoid long monologues. Get to the point, then offer one clear next step.\n' +
    '- Be friendly, confident, and helpful, but not overly casual.\n' +
    '- If you don’t know something, say so and suggest a practical next action.\n\n' +
    'Routing context:\n' +
    '- The routing module has selected the route "' +
    route +
    '" with confidence ' +
    confidence.toFixed(2) +
    '.\n' +
    '- Reason: ' +
    (reason || 'No specific reason provided.') +
    '\n' +
    '- Scores per route (for your awareness, not to be repeated directly): ' +
    JSON.stringify(scores) +
    '\n\n' +
    'Sandblast internal reference for this route:\n' +
    knowledge;

  let routeExtra = '';

  switch (route) {
    case 'tv':
      routeExtra =
        'You are in the TV / streaming mode.\n\n' +
        'Focus on:\n' +
        '- Sunday Movie Block, Retro TV Hours, and how to watch Sandblast TV.\n' +
        '- Explaining the style of content (retro, PD-based, classic shows) rather than rigid schedule grids.\n' +
        '- You may naturally mention one or two example serials or shows from the internal catalog, but do not make legal claims about their status.\n' +
        '- Suggest that viewers check the current stream or announcements for the latest lineup.';
      break;

    case 'radio':
      routeExtra =
        'You are in the Radio / audio mode.\n\n' +
        'Focus on:\n' +
        '- Sandblast Radio streaming, Gospel Sunday, DJ Nova segments, and overall listening experience.\n' +
        '- How a listener can tune in, what type of content they can expect, and the feel of the station.\n' +
        '- Keep answers snappy so they sound natural as spoken radio explanations.';
      break;

    case 'news_canada':
      routeExtra =
        'You are in the News Canada mode.\n\n' +
        'Focus on:\n' +
        '- Explaining what the News Canada content is and how Sandblast uses it to add helpful, editorial-style information.\n' +
        '- How this integrates with Sandblast TV, radio, or digital campaigns to create more informative programming.\n' +
        '- Keep it simple and spoken-word friendly.';
      break;

    case 'ads':
      routeExtra =
        'You are in the Advertising / Sponsorship mode.\n\n' +
        'Focus on:\n' +
        '- How businesses can advertise on Sandblast (TV, radio, digital, and News Canada tie-ins).\n' +
        '- Using real recurring elements such as Sunday Movie, Retro TV Hours, Gospel Sunday, and AI/small-business workshop tie-ins as examples of sponsorship opportunities.\n' +
        '- Emphasize flexibility, community focus, and the idea of building packages, not forcing one standard plan.';
      break;

    case 'public_domain':
      routeExtra =
        'You are in the Public Domain / PD Watchdog mode.\n\n' +
        'Focus on:\n' +
        '- Explaining why Sandblast uses public-domain retro content and how it fits into blocks like Sunday Movie and Retro TV Hours.\n' +
        '- Describing the verification process in high-level, non-legal terms.\n' +
        '- You may reference classic-era serials and crime shows as examples, but always stress that specific titles must be individually verified.\n' +
        '- Reinforce that Sandblast aims to be respectful and careful with rights.';
      break;

    case 'general':
    default:
      routeExtra =
        'You are in General Sandblast mode.\n\n' +
        'Focus on:\n' +
        '- Explaining what Sandblast Channel is and how TV, radio, News Canada, PD, and AI consulting interconnect.\n' +
        '- Helping the user understand what they can do next: watch, listen, learn about AI, or explore advertising options.\n' +
        '- Offer one clear, simple next step in your answer.';
      break;
  }

  return base + '\n\n' + routeExtra;
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
    const userMessage = req.body && (req.body.message || req.body.input) ? (req.body.message || req.body.input) : '';
    const persona = (req.body && req.body.persona) || 'sandblast_assistant';
    const context = (req.body && req.body.context) || 'homepage';
    const sessionId = (req.body && req.body.session_id) || null;

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
        reply:
          'SandblastGPT is online, but I did not receive any question yet. Try asking me about TV, radio, News Canada, ads, or public domain.',
        echo: {
          received: userMessage,
          persona: persona,
          context: context,
          route: 'none',
        },
        meta: {
          source: 'sandblast-openai',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 1) Detect intent / route (richer info)
    const routing = detectIntent(userMessage);
    const route = routing.route;
    const systemPrompt = buildSystemPrompt(routing);

    console.log('[/api/sandblast-gpt] Incoming message:', {
      message: userMessage,
      persona: persona,
      context: context,
      route: route,
      routing: routing,
      sessionId: sessionId,
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
          content:
            'User message:\n"' +
            userMessage +
            '"\n\n' +
            'Context:\n' +
            '- Persona: ' +
            persona +
            '\n' +
            '- UI context: ' +
            context +
            '\n' +
            '- Main route detected: ' +
            route +
            ' (confidence: ' +
            routing.confidence.toFixed(2) +
            ')\n\n' +
            'Answer in a natural spoken style, as if you are Vera explaining this out loud. Keep it concise but clear.',
        },
      ],
      temperature: 0.6,
      max_tokens: 400,
    });

    const replyText =
      completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      completion.choices[0].message.content
        ? completion.choices[0].message.content.trim()
        : 'I had trouble generating a reply, but SandblastGPT is online. Please try asking again.';

    // 3) Return the structured JSON your widget already expects
    res.json({
      success: true,
      reply: replyText,
      echo: {
        received: userMessage,
        persona: persona,
        context: context,
        route: route,
        routing: routing, // for debugging / future UI
      },
      meta: {
        source: 'sandblast-openai',
        model: 'gpt-4.1-mini',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
      },
    });
  } catch (error) {
    const details = error && error.response && error.response.data ? error.response.data : error.message || error;
    console.error('Error in /api/sandblast-gpt:', details);

    res.status(500).json({
      success: false,
      error: 'Internal server error in /api/sandblast-gpt.',
      details: details || null,
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
  let text = req.body && req.body.text ? req.body.text : null;
  const voiceId =
    (req.body && req.body.voiceId) || process.env.ELEVENLABS_VOICE_ID;

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
    console.warn(
      'TTS text too long (' +
        text.length +
        ' chars). Truncating to ' +
        MAX_TTS_CHARS +
        '.'
    );
    text = text.slice(0, MAX_TTS_CHARS);
  }

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const url =
      'https://api.elevenlabs.io/v1/text-to-speech/' + String(voiceId);

    console.log('Calling ElevenLabs TTS:', {
      voiceId: voiceId,
      textPreview: text.slice(0, 80) + (text.length > 80 ? '...' : ''),
    });

    const response = await axios({
      method: 'POST',
      url: url,
      data: {
        text: text,
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
        Accept: 'audio/mpeg',
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

    console.log(
      'ElevenLabs TTS succeeded. Audio bytes:',
      response.data.length
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.data.length,
      'Cache-Control': 'no-store',
    });

    return res.send(Buffer.from(response.data, 'binary'));
  } catch (error) {
    const status = (error.response && error.response.status) || 500;
    const details = error.response ? error.response.data : error.message;

    console.error('Error calling ElevenLabs TTS:', {
      status: status,
      details: details,
    });

    return res.status(status).json({
      success: false,
      error: 'Failed to generate audio with ElevenLabs.',
      status: status,
      details: details,
    });
  }
});

// ============ Start Server ============
app.listen(PORT, () => {
  console.log('Sandblast backend listening on port ' + PORT);
});
