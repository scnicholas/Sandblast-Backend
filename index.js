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

// ============ INLINE SONG DATABASE ============
//
// For now we keep this internal so you don’t have to manage
// extra files or build scripts. We can always move it to an
// external JSON later if you want.
//
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
      'Metadata only. Audio/lyrics are governed by music licensing via Entandem, SOCAN, and other agreements.',
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
      'Metadata only. Audio/lyrics are governed by music licensing via Entandem, SOCAN, and other agreements.',
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
      'Metadata only. Audio/lyrics are governed by music licensing via Entandem, SOCAN, and other agreements.',
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
      'Metadata only. Audio/lyrics are governed by music licensing via Entandem, SOCAN, and other agreements.',
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
      'Metadata only. Audio/lyrics are governed by music licensing via Entandem, SOCAN, and other agreements.',
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
      'Metadata only. Audio/lyrics are governed by music licensing via Entandem, SOCAN, and other agreements.',
  },
];

console.log(`Inline SONG_DB loaded with ${SONG_DB.length} songs.`);

// ============ SONG HELPERS ============

// Find songs that match a user message (by title / artist / tags)
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
      song.tags.some((tag) =>
        text.includes(String(tag).toLowerCase())
      );
    return titleMatch || artistMatch || tagMatch;
  });

  return matches.slice(0, 5); // keep prompt tight
}

// Format song metadata as text for the prompt
function formatSongContext(songs) {
  if (!songs || !songs.length) return '';
  let out = 'Relevant songs from the Sandblast internal catalog:\n';
  songs.forEach((song, idx) => {
    out +=
      (idx + 1) +
      ') ' +
      (song.title || 'Unknown title') +
      ' — ' +
      (song.artist || 'Unknown artist') +
      (song.year ? ' (' + song.year + ')' : '') +
      (song.genre ? ' | Genre: ' + song.genre : '') +
      (song.mood && song.mood.length
        ? ' | Mood: ' + song.mood.join(', ')
        : '') +
      '\n';
  });
  out +=
    '\nUse this catalog information to answer questions about these songs. ' +
    'Describe the songs, artists, style, and mood, but do not output full lyrics.\n';
  return out;
}

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

// ============ Intent Routing Helper (Powered-Up + Music) ============

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
      'dj', 'dj nova', 'nova', 'music block', 'gospel sunday', 'showtime',
      'radio show', 'talk show', 'podcast',
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
    weight: 1.2,
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
  music: {
    label: 'music',
    keywords: [
      'music', 'song', 'songs', 'playlist', 'track', 'tracks',
      'lyrics', 'chorus', 'verse', 'album', 'artist', 'band',
      'play this song', 'music licensing', 'socan', 'entandem',
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

// ============ Sandblast Knowledge Layer ============

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

Signature recurring campaigns:
- Sunday Movie Block: weekly retro film showcase using verified public-domain titles.
- Retro TV Hours: rotating classic TV episodes, serials, and vintage dramatic shorts.
- Gospel Sunday (Radio): a consistent inspirational block on the radio stream.
- DJ Nova segments: energetic intros and transitions that shape the Sandblast radio personality.
- AI/Small Business Workshops: Sandblast AI Consulting sessions that teach owners how to apply AI and automation in real operations.
- Sandblast Community Features: spotlight stories, announcements, and public-awareness messages aligned with the platform mission.
`.trim(),

  tv: `
Sandblast TV:
- Focuses on retro content: movie serials, vintage dramas, classic films, and PD-friendly episodes.
- Programming is organized into blocks, such as Sunday Movie and Retro TV Hours, rather than minute-by-minute schedule grids.
- Viewers tune in via the streaming player rather than traditional cable.

Examples of classic titles that may be reviewed (subject to PD verification):
- "Daredevils of the Red Circle"
- "The Shadow" serials
- "Spy Smasher"
- "Agent X-9"
- "Flying G-Men"
- "G-Men"
- "Gangbusters"
- "Highway Patrol"
- "Ghost Squad"
- "Dial 999"

Important:
- These are examples for tone. Do not claim any specific legal status in responses.
`.trim(),

  radio: `
Sandblast Radio:
- Centered on curated music blocks, talk elements, and special event shows.
- Gospel Sunday is a signature recurring block featuring uplifting and inspirational programming.
- DJ Nova is the voiced personality for intros and transitions, giving the station energy and identity.
- Listeners access the stream via the embedded player or direct streaming links.

Licensing note:
- Because Sandblast holds music licensing via Entandem and SOCAN, music programming can include licensed commercial tracks in compliance with those agreements.
- AI responses describe the experience and content; they do not stream or distribute the audio themselves.
`.trim(),

  news_canada: `
News Canada on Sandblast:
- News Canada provides ready-made editorial content on topics like lifestyle, food, finance, and community.
- Sandblast uses selected pieces to add practical, useful information to the mix of entertainment and community programming.
- These features can be aligned with themes, seasons, or campaign focuses.
`.trim(),

  ads: `
Advertising on Sandblast:
- Sandblast offers modular ad placements across TV, radio, and digital platforms.

Typical options:
- TV: short sponsor bumpers around Sunday Movie and Retro TV Hours.
- Radio: sponsor mentions, taglines, or promos around Gospel Sunday and other blocks.
- Digital: banner or tile placements on Sandblast properties.
- Integrated features: pairing informational content or community stories with sponsor messaging where appropriate.

Ad philosophy:
- Accessible for small and medium businesses.
- Focus on community connection, repeated presence, and clear calls to action rather than one-off impressions.
`.trim(),

  public_domain: `
Public Domain and Sandblast:
- Many retro films, serials, and shows used by Sandblast are sourced from the public domain when verified as such.
- Public-domain content allows for stable programming blocks like Sunday Movie and Retro TV Hours.

High-level PD mindset (not legal advice):
1) Quick PD assessment (era, publication, renewal clues).
2) Cross-checking multiple sources and, where relevant, official records.
3) Storing documentation of PD decisions internally.

Examples of titles that may be evaluated:
- "Daredevils of the Red Circle"
- "The Shadow" serials
- "Spy Smasher"
- "Agent X-9"
- "Flying G-Men"
- "Gangbusters"
- "Dragnet" (classic era)
- "Highway Patrol"
- "Ghost Squad"
- "Dial 999"

Important:
- Do not present AI answers as legal clearance. Emphasize that Sandblast uses its own verification process.
`.trim(),

  music: `
Music and licensing on Sandblast:
- Sandblast holds appropriate music licensing through organizations like Entandem and SOCAN.
- This licensing supports:
  - Playing licensed music tracks on Sandblast Radio and related streams.
  - Talking about songs, artists, genres, and music history on-air.
  - Referencing lyrics at a high level as part of commentary, not reproducing full lyrics.

Internal song catalog:
- Sandblast maintains an internal catalog with metadata for tracks:
  - Title, artist, year, genre, mood, tags, and programming notes.
- When users ask about specific songs or artists, a subset of matching songs may be provided to the AI for context.

Guidance for AI responses:
- Describe style, mood, and themes of songs and artists.
- Reference titles, artists, albums, and release years.
- Paraphrase or briefly allude to lyrical themes; do not output long lyric passages.
- Make it clear that playback happens on Sandblast streams, not through the chat reply.
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
        'Focus on Sunday Movie Block, Retro TV Hours, and how to watch Sandblast TV via the streaming player.\n' +
        'Describe the style of content (retro, PD-based, classic shows) rather than giving rigid timings if you are not certain.';
      break;

    case 'radio':
      routeExtra =
        'You are in the Radio / audio mode.\n\n' +
        'Focus on Sandblast Radio streaming, Gospel Sunday, DJ Nova segments, and the listening experience.\n' +
        'Keep answers snappy and radio-friendly.';
      break;

    case 'news_canada':
      routeExtra =
        'You are in the News Canada mode.\n\n' +
        'Focus on how News Canada content enhances Sandblast with useful editorial pieces and how businesses or communities can benefit from that.';
      break;

    case 'ads':
      routeExtra =
        'You are in the Advertising / Sponsorship mode.\n\n' +
        'Focus on explaining ad options across TV, radio, and digital, using recurring blocks as examples.\n' +
        'Emphasize flexibility and community orientation, and suggest one clear next step (such as contacting Sandblast to discuss packages).';
      break;

    case 'public_domain':
      routeExtra =
        'You are in the Public Domain / PD Watchdog mode.\n\n' +
        'Focus on why Sandblast uses PD retro content and the high-level verification mindset.\n' +
        'Avoid making legal claims about specific titles; instead, explain the process conceptually.';
      break;

    case 'music':
      routeExtra =
        'You are in the Music / Licensing-aware mode.\n\n' +
        'Focus on how music fits into Sandblast (radio streams, Gospel Sunday, curated playlists, DJ Nova sets).\n' +
        'Acknowledge that Sandblast has music licensing (e.g., via Entandem and SOCAN).\n' +
        'Describe songs, artists, genres, and moods, but do not output long lyric passages.\n' +
        'Clarify that actual playback happens on Sandblast streams, not in this chat.';
      break;

    case 'general':
    default:
      routeExtra =
        'You are in General Sandblast mode.\n\n' +
        'Explain what Sandblast Channel is and how its TV, radio, News Canada, PD content, and AI consulting fit together.\n' +
        'Offer one clear suggestion for what the user can do next.';
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
    const userMessage =
      req.body && (req.body.message || req.body.input)
        ? req.body.message || req.body.input
        : '';
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

    // 1) Detect route
    const routing = detectIntent(userMessage);
    const route = routing.route;

    // 2) If music, pull matching songs from SONG_DB
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

    // 3) Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
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
            (songContextText ? songContextText + '\n\n' : '') +
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

    // 4) Return widget-safe JSON
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
      error && error.response && error.response.data
        ? error.response.data
        : error.message || error;
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
    const status = (error.response && error.response.status) || 500;
    const details = error.response ? error.response.data : error.message;

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
  console.log('Sandblast backend listening on port ' + PORT);
});
