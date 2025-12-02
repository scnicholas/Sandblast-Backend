// index.js

// ============ ENV + DEBUG ============

// Load .env FIRST
const path = require('path');
console.log('DEBUG: Starting Sandblast backend…');
console.log('DEBUG: process.cwd() =', process.cwd());
console.log(
  'DEBUG: Expecting .env at =',
  path.resolve(process.cwd(), '.env')
);

require('dotenv').config();

console.log(
  'DEBUG: OPENAI_API_KEY present?',
  !!process.env.OPENAI_API_KEY
);
if (process.env.OPENAI_API_KEY) {
  console.log(
    'DEBUG: OPENAI_API_KEY length =',
    process.env.OPENAI_API_KEY.length
  );
} else {
  console.warn(
    'WARN: OPENAI_API_KEY is missing or empty in process.env'
  );
}

console.log(
  'DEBUG: ELEVENLABS_API_KEY present?',
  !!process.env.ELEVENLABS_API_KEY
);
console.log(
  'DEBUG: ELEVENLABS_VOICE_ID present?',
  !!process.env.ELEVENLABS_VOICE_ID
);

// ============ Imports ============
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OpenAI = require('openai');

// ============ OpenAI Client (guarded) ============
//
// We DO NOT throw if the key is missing.
// Instead, we log and let the routes return a clean error.
// This avoids the hard crash you're seeing.
let openai = null;

if (!process.env.OPENAI_API_KEY) {
  console.error(
    'ERROR: OPENAI_API_KEY is not set. /api/sandblast-gpt will return a 500 until this is fixed.'
  );
} else {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('DEBUG: OpenAI client initialized.');
}

// ============ App Setup ============
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// ============ INLINE SONG DATABASE ============
//
// No external files. This keeps your brain working
// even if file paths are tricky on Windows.
const SONG_DB = [
  {
    id: 'i_will_always_love_you-whitney_houston-1992',
    title: 'I Will Always Love You',
    artist: 'Whitney Houston',
    year: 1992,
    genre: 'Pop',
    mood: ['powerful', 'emotional'],
    tags: ['love songs', 'big ballad'],
    source: 'Sandblast curated catalog',
    license:
      'Metadata only. Audio/lyrics subject to music licensing via Entandem/SOCAN and other agreements.',
  },
  {
    id: 'at_last-etta_james-1960',
    title: 'At Last',
    artist: 'Etta James',
    year: 1960,
    genre: 'Soul',
    mood: ['romantic', 'classic'],
    tags: ['wedding', 'slow dance'],
    source: 'Sandblast curated catalog',
    license:
      'Metadata only. Audio/lyrics subject to music licensing via Entandem/SOCAN and other agreements.',
  },
  {
    id: 'unforgettable-nat_king_cole_natalie_cole-1991',
    title: 'Unforgettable',
    artist: 'Nat King Cole & Natalie Cole',
    year: 1991,
    genre: 'Jazz',
    mood: ['smooth', 'romantic'],
    tags: ['standards', 'slow set'],
    source: 'Sandblast curated catalog',
    license:
      'Metadata only. Audio/lyrics subject to music licensing via Entandem/SOCAN and other agreements.',
  },
  {
    id: 'when_a_man_loves_a_woman-percy_sledge-1966',
    title: 'When A Man Loves A Woman',
    artist: 'Percy Sledge',
    year: 1966,
    genre: 'Soul',
    mood: ['dramatic', 'emotional'],
    tags: ['love songs', 'deep soul'],
    source: 'Sandblast curated catalog',
    license:
      'Metadata only. Audio/lyrics subject to music licensing via Entandem/SOCAN and other agreements.',
  },
  {
    id: 'unchained_melody-righteous_brothers-1965',
    title: 'Unchained Melody',
    artist: 'The Righteous Brothers',
    year: 1965,
    genre: 'Pop',
    mood: ['haunting', 'romantic'],
    tags: ['slow dance', 'evergreen'],
    source: 'Sandblast curated catalog',
    license:
      'Metadata only. Audio/lyrics subject to music licensing via Entandem/SOCAN and other agreements.',
  },
  {
    id: 'youre_the_inspiration-chicago-1984',
    title: "You're the Inspiration",
    artist: 'Chicago',
    year: 1984,
    genre: 'Soft Rock',
    mood: ['romantic', 'uplifting'],
    tags: ['vera theme', 'slow set'],
    source: 'Sandblast curated catalog',
    license:
      'Metadata only. Audio/lyrics subject to music licensing via Entandem/SOCAN and other agreements.',
  },
];

console.log(`Inline SONG_DB loaded with ${SONG_DB.length} songs.`);

// ============ SONG HELPERS ============
function findSongsForMessage(message) {
  const text = (message || '').toLowerCase();
  if (!text || !SONG_DB.length) return [];

  const matches = SONG_DB.filter((song) => {
    const titleMatch =
      song.title && text.includes(String(song.title).toLowerCase());
    const artistMatch =
      song.artist && text.includes(String(song.artist).toLowerCase());
    const tagMatch =
      Array.isArray(song.tags) &&
      song.tags.some((tag) => text.includes(String(tag).toLowerCase()));

    return titleMatch || artistMatch || tagMatch;
  });

  return matches.slice(0, 5);
}

function formatSongContext(songs) {
  if (!songs || !songs.length) return '';
  let out = 'Relevant songs from the Sandblast internal catalog:\n';
  songs.forEach((song, idx) => {
    out +=
      `${idx + 1}) ${song.title || 'Unknown title'} — ` +
      `${song.artist || 'Unknown artist'}` +
      (song.year ? ` (${song.year})` : '') +
      (song.genre ? ` | Genre: ${song.genre}` : '') +
      (song.mood && song.mood.length
        ? ` | Mood: ${song.mood.join(', ')}`
        : '') +
      '\n';
  });
  out +=
    '\nUse this catalog information to answer questions about these songs. ' +
    'Describe the songs, artists, style, and mood, but do not output full lyrics.\n';
  return out;
}

// ============ INTENT ROUTING ============

const intentConfig = {
  tv: {
    label: 'tv',
    keywords: [
      'tv',
      'television',
      'channel',
      'channels',
      'movie',
      'movies',
      'film',
      'series',
      'serial',
      'episode',
      'episodes',
      'show',
      'shows',
      'program guide',
      'tv guide',
      'schedule',
      'lineup',
      'on tonight',
      'watch sandblast',
      'watch online',
      'streaming tv',
      'retro tv',
      'sunday movie',
      'movie block',
    ],
    weight: 1.0,
  },
  radio: {
    label: 'radio',
    keywords: [
      'radio',
      'online radio',
      'audio stream',
      'stream audio',
      'listen live',
      'dj',
      'dj nova',
      'nova',
      'music block',
      'gospel sunday',
      'showtime',
      'radio show',
      'talk show',
      'podcast',
    ],
    weight: 1.0,
  },
  news_canada: {
    label: 'news_canada',
    keywords: [
      'news canada',
      'newswire',
      'feature article',
      'ready-to-use content',
      'editorial content',
      'branded content',
      'news distribution',
      'article distribution',
      'content insert',
      'community feature from news canada',
    ],
    weight: 1.2,
  },
  ads: {
    label: 'ads',
    keywords: [
      ' ad ',
      'ads ',
      'advertise',
      'advertising',
      'commercial',
      'ad spot',
      'airtime',
      'rate card',
      'sponsorship',
      'sponsor',
      'sponsored',
      'media buy',
      'campaign',
      'promotion',
      'promote my business',
      'package',
      'pricing',
      'cost to advertise',
      'budget',
      'spend',
      'brand exposure',
    ],
    weight: 1.3,
  },
  public_domain: {
    label: 'public_domain',
    keywords: [
      'public domain',
      'pd ',
      'pd content',
      'copyright',
      'copyright status',
      'rights',
      'licensing',
      'expired copyright',
      'archive.org',
      'publicdomain',
      'royalty free',
      'clearance',
      'rights clearance',
      'ip issues',
      'ip check',
    ],
    weight: 1.3,
  },
  music: {
    label: 'music',
    keywords: [
      'music',
      'song',
      'songs',
      'playlist',
      'track',
      'tracks',
      'lyrics',
      'chorus',
      'verse',
      'album',
      'artist',
      'band',
      'play this song',
      'music licensing',
      'socan',
      'entandem',
      'dj nova',
    ],
    weight: 1.1,
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
    reason:
      'Highest score for "' + best.label + '" based on keywords: ' +
      best.hits.join(', '),
  };
}

function detectIntent(message = '') {
  return scoreIntent(message);
}

// ============ KNOWLEDGE LAYER ============

const knowledgeByRoute = {
  general: `
Core overview of Sandblast:
- Sandblast is a media ecosystem combining TV, radio, digital streaming, News Canada integrations, and AI-powered consulting.
- The mission is to deliver community-friendly entertainment, retro programming, and practical media support for small and medium businesses.
- SandblastGPT acts as the “AI operations brain,” helping visitors understand TV, radio, PD content, News Canada, ads, and AI services.

Licensing awareness:
- Sandblast holds music performance and communication-to-the-public licensing via organizations such as Entandem and SOCAN.
- This licensing allows Sandblast to legally play music on the platform and talk about music, artists, and songs in a broadcast context.
- Even with licensing, AI answers should describe music and lyrics rather than reproducing long lyric passages.

Signature recurring campaigns and elements:
- Sunday Movie Block: weekly retro film showcase using verified public-domain titles.
- Retro TV Hours: rotating classic TV episodes, serials, and vintage dramatic shorts.
- Gospel Sunday (Radio): a consistent inspirational block on the radio stream.
- DJ Nova segments: high-energy intros and transitions that shape the Sandblast radio personality.
- AI/Small Business Workshops: Sandblast AI Consulting sessions teaching owners how to apply AI and automation in real operations.
`.trim(),

  tv: `
Sandblast TV:
- Focuses on retro content: movie serials, vintage dramas, classic films, and PD-friendly episodes.
- Programming is organized into blocks rather than rigid minute-by-minute schedules; viewers tune in via the streaming player.
- Sunday Movie Block is a key anchor: a rotating public-domain movie featured as an “event” slot.
- Retro TV Hours include short serial chapters and classic TV-style programming, subject to public-domain verification.
`.trim(),

  radio: `
Sandblast Radio:
- Centered on curated music blocks, talk elements, and special event shows.
- Gospel Sunday is one of the signature recurring radio blocks, featuring uplifting and inspirational programming.
- DJ Nova is the core voiced personality for intros and transitions, providing energy and a consistent audio identity.
- Listeners access the station via a live web stream or embedded radio player.

Licensing note:
- Because Sandblast holds music licensing via Entandem and SOCAN, music programming on the radio stream can include licensed commercial tracks in compliance with those agreements.
- AI responses should describe shows, genres, moods, and high-level song information, not stream or distribute music files directly.
`.trim(),

  news_canada: `
News Canada on Sandblast:
- News Canada provides ready-made editorial content: short articles and features on topics like food, lifestyle, finance, health, and community.
- Sandblast incorporates selected News Canada pieces to add practical, useful information to its mix of entertainment and community programming.
`.trim(),

  ads: `
Advertising on Sandblast:
- Sandblast offers modular ad placements across TV, radio, and digital platforms.
- Typical options include:
  - Short TV bumpers or sponsor lines around Sunday Movie Block or Retro TV Hours.
  - Radio mentions or sponsor lines around Gospel Sunday or other radio segments.
  - Banner or tile placements on Sandblast’s digital properties.

Core ad philosophy:
- Sandblast aims to be accessible to small and medium businesses; packages are flexible.
- The focus is on community feel and repeated presence, not just a single exposure.
`.trim(),

  public_domain: `
Public Domain and Sandblast:
- A large portion of Sandblast’s retro content comes from public-domain (PD) films, serials, and shows.
- Using PD content allows Sandblast to build consistent retro programming blocks like Sunday Movie and Retro TV Hours.
- PD status must be checked individually; do not make legal claims about specific titles in AI answers.
`.trim(),

  music: `
Music and licensing on Sandblast:
- Sandblast holds appropriate music licensing through organizations like Entandem and SOCAN, which enables:
  - Playing licensed music tracks on Sandblast Radio and associated streams.
  - Discussing songs, artists, genres, and music history on-air.
  - Referencing lyrics in a high-level, descriptive way as part of commentary.

Internal song catalog:
- Sandblast maintains an internal song catalog with metadata for tracks.
- When users ask about specific songs or artists, a small subset of this catalog may be surfaced for the AI.
- Describe style, mood, and themes; do not output long lyric passages.
`.trim(),
};

function getKnowledgeForRoute(route) {
  return knowledgeByRoute[route] || knowledgeByRoute.general;
}

// ============ SYSTEM PROMPT BUILDER ============

function buildSystemPrompt(routingInfo) {
  const route = routingInfo?.route || 'general';
  const confidence =
    typeof routingInfo?.confidence === 'number'
      ? routingInfo.confidence
      : 0;
  const reason = routingInfo?.reason || '';
  const scores = routingInfo?.scores || [];
  const knowledge = getKnowledgeForRoute(route);

  let base =
    'You are SandblastGPT, the AI brain for Sandblast Channel (TV + radio + digital + News Canada + public domain curation + Sandblast AI consulting).\n\n' +
    'General behavior:\n' +
    "- Speak as if you are talking out loud for Vera's TTS voice.\n" +
    '- Use short, clear sentences. 1–3 sentences per paragraph max.\n' +
    '- Avoid long monologues. Get to the point, then offer one clear next step.\n' +
    '- Be friendly, confident, and helpful, but not overly casual.\n' +
    'If you don’t know something, say so and suggest a practical next action.\n\n' +
    'Routing context:\n' +
    `- The routing module has selected the route "${route}" with confidence ${confidence.toFixed(
      2
    )}.\n` +
    `- Reason: ${reason || 'No specific reason provided.'}\n` +
    `- Scores per route (for your awareness, not to be repeated directly): ${JSON.stringify(
      scores
    )}\n\n` +
    'Sandblast internal reference for this route:\n' +
    knowledge;

  let routeExtra = '';

  switch (route) {
    case 'tv':
      routeExtra =
        '\n\nYou are in TV / streaming mode. Focus on Sunday Movie Block, Retro TV Hours, and how to watch Sandblast TV.';
      break;
    case 'radio':
      routeExtra =
        '\n\nYou are in Radio / audio mode. Focus on Sandblast Radio, Gospel Sunday, DJ Nova segments, and listening experience.';
      break;
    case 'news_canada':
      routeExtra =
        '\n\nYou are in News Canada mode. Explain how News Canada content integrates into Sandblast.';
      break;
    case 'ads':
      routeExtra =
        '\n\nYou are in Advertising / Sponsorship mode. Explain ad options and keep it simple and business-friendly.';
      break;
    case 'public_domain':
      routeExtra =
        '\n\nYou are in Public Domain / PD mode. Explain PD usage at a high level without giving legal advice.';
      break;
    case 'music':
      routeExtra =
        '\n\nYou are in Music mode. You may describe songs, artists, genres, and moods. Do NOT output long lyric passages. Playback happens on Sandblast streams, not via the AI.';
      break;
    default:
      routeExtra =
        '\n\nYou are in General Sandblast mode. Explain how the pieces fit together and offer a clear next step.';
  }

  return `${base}${routeExtra}`;
}

// ============ BASIC ROUTES ============

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

app.get('/api/openai-test', (req, res) => {
  res.json({
    status: 'ok',
    openai_api_key_present: !!process.env.OPENAI_API_KEY,
    message:
      'This just checks env vars. Use POST /api/sandblast-gpt for real answers.',
  });
});

app.get('/api/tts-test', (req, res) => {
  res.json({
    status: 'ok',
    elevenlabs_api_key_present: !!process.env.ELEVENLABS_API_KEY,
    elevenlabs_voice_id_present: !!process.env.ELEVENLABS_VOICE_ID,
    message: 'This just checks env vars. Use POST /api/tts for real audio.',
  });
});

// ============ MAIN BRAIN ENDPOINT ============

app.post('/api/sandblast-gpt', async (req, res) => {
  try {
    const userMessage =
      req.body?.message || req.body?.input || '';
    const persona = req.body?.persona || 'sandblast_assistant';
    const context = req.body?.context || 'homepage';
    const sessionId = req.body?.session_id || null;

    if (!openai) {
      console.error(
        'ERROR: /api/sandblast-gpt called but OpenAI client is not initialized.'
      );
      return res.status(500).json({
        success: false,
        error:
          'SandblastGPT brain is not available because OPENAI_API_KEY is not configured on the server.',
      });
    }

    if (!userMessage) {
      return res.json({
        success: true,
        reply:
          'SandblastGPT is online, but I did not receive any question yet. Try asking me about TV, radio, music, News Canada, ads, or public domain.',
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

    const routing = detectIntent(userMessage);
    const route = routing.route;

    const matchedSongs =
      route === 'music' ? findSongsForMessage(userMessage) : [];
    const songContextText = formatSongContext(matchedSongs);

    const systemPrompt = buildSystemPrompt(routing);

    console.log('[/api/sandblast-gpt] Incoming message:', {
      message: userMessage,
      persona,
      context,
      route,
      routing,
      matchedSongsCount: matchedSongs.length,
      sessionId,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `User message:\n"${userMessage}"\n\n` +
            (songContextText ? songContextText + '\n\n' : '') +
            'Context:\n' +
            `- Persona: ${persona}\n` +
            `- UI context: ${context}\n` +
            `- Main route detected: ${route} (confidence: ${routing.confidence.toFixed(
              2
            )})\n\n` +
            'Answer in a natural spoken style, as if you are Vera explaining this out loud. Keep it concise but clear.',
        },
      ],
      temperature: 0.6,
      max_tokens: 400,
    });

    const replyText =
      completion?.choices?.[0]?.message?.content?.trim() ||
      'I had trouble generating a reply, but SandblastGPT is online. Please try asking again.';

    res.json({
      success: true,
      reply: replyText,
      echo: {
        received: userMessage,
        persona,
        context,
        route,
        routing,
        matchedSongs,
      },
      meta: {
        source: 'sandblast-openai',
        model: 'gpt-4.1-mini',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
      },
    });
  } catch (error) {
    const details =
      error?.response?.data || error.message || error;
    console.error('Error in /api/sandblast-gpt:', details);

    res.status(500).json({
      success: false,
      error: 'Internal server error in /api/sandblast-gpt.',
      details,
    });
  }
});

// ============ ELEVENLABS TTS ENDPOINT ============

app.post('/api/tts', async (req, res) => {
  let text = req.body?.text;
  const voiceId =
    req.body?.voiceId || process.env.ELEVENLABS_VOICE_ID;

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

  const MAX_TTS_CHARS = 800;
  if (text.length > MAX_TTS_CHARS) {
    console.warn(
      `TTS text too long (${text.length} chars). Truncating to ${MAX_TTS_CHARS}.`
    );
    text = text.slice(0, MAX_TTS_CHARS);
  }

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${String(
      voiceId
    )}`;

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
    const status = error?.response?.status || 500;
    const details = error?.response?.data || error.message;

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

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});
