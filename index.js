'use strict';

/**
 * Sandblast Backend (Nyx)
 * index.js — hardened routes + always-on TTS endpoints + safer music rendering + intro-first UX
 *
 * Key critical fixes:
 *  - Always-on /api/tts AND /api/voice (alias) to prevent widget 404s
 *  - Intro-first behavior: empty message returns Nyx intro (not lane picker prompt)
 *  - Top-10/#1 rendering safety: never prints "undefined." or blank artist/title
 *  - fetch() compatibility: works on Node 16+ (dynamic import fallback) instead of assuming global fetch
 *  - Adds GET / so Render/edge probes don’t show "Cannot GET /"
 *  - NEW: Nyx Voice Naturalizer to make ElevenLabs output more human-like
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const net = require('net');

const musicKnowledge = require('./Utils/musicKnowledge'); // must exist in your repo

/* =========================
   ENV + BUILD
========================= */

const ENV = String(process.env.NODE_ENV || 'production');
const HOST = String(process.env.HOST || '0.0.0.0');
const PORT = Number(process.env.PORT || 3000);

const BUILD_TAG = String(
  process.env.BUILD_TAG || process.env.RENDER_GIT_COMMIT || 'nyx-wizard-local'
).slice(0, 32);

const DEFAULT_TIMEOUT_MS = Number(process.env.NYX_TIMEOUT_MS || 20000);

/* =========================
   APP + MIDDLEWARE
========================= */

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.options('/api/tts', cors());
app.options('/api/voice', cors());
app.options('/api/chat', cors());
app.options('/api/health', cors());
app.options('/api/debug/last', cors());

/* =========================
   DEBUG STATE
========================= */

const LAST_DEBUG = {
  route: null,
  request: null,
  response: null,
  error: null,
  at: null,
};

function setLast({ route, request, response, error }) {
  LAST_DEBUG.route = route;
  LAST_DEBUG.request = request;
  LAST_DEBUG.response = response;
  LAST_DEBUG.error = error;
  LAST_DEBUG.at = new Date().toISOString();
}

/* =========================
   UTILS
========================= */

function asText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function clean(v) {
  return asText(v).replace(/\s+/g, ' ').trim();
}

function sigOf(message) {
  const s = clean(message).toLowerCase();
  return s ? s : '';
}

function isGreeting(s) {
  const t = clean(s).toLowerCase();
  return (
    t === 'hi' ||
    t === 'hello' ||
    t === 'hey' ||
    t === 'good morning' ||
    t === 'good afternoon' ||
    t === 'good evening'
  );
}

function normalizeLanePick(raw) {
  const s = clean(raw).toLowerCase();
  if (!s) return null;

  const cleaned = s.replace(/[^a-z]/g, '');

  if (cleaned === 'music') return 'music';
  if (cleaned === 'tv' || cleaned === 'tvs' || cleaned === 'television') return 'tv';
  if (cleaned === 'sponsors' || cleaned === 'sponsor') return 'sponsors';
  if (cleaned === 'ai') return 'ai';
  if (cleaned === 'general') return 'general';

  return null;
}

function lanePickerReply() {
  return {
    reply: 'What would you like to explore next?',
    followUp: ['Music', 'TV', 'Sponsors', 'AI'],
  };
}

function nyxGreeting() {
  return {
    reply: "Welcome to Sandblast. I’m Nyx.\nHow are you today?",
    followUp: null,
  };
}

function formatTopItem(item, idx) {
  const rank = Number.isFinite(Number(item?.rank)) ? Number(item.rank) : idx + 1;
  const artist = clean(item?.artist) || 'Unknown Artist';
  const title = clean(item?.title) || 'Unknown Title';
  return `${rank}. ${artist} — ${title}`;
}

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}

/* =========================
   NYX VOICE NATURALIZER (NEW)
========================= */

/**
 * Make the TTS text sound human:
 * - Replace symbols (#1 -> "number one")
 * - Convert list formatting into spoken cadence
 * - Replace em-dash with phrasing pauses
 * - Reduce "UI-ish" artifacts
 */
function nyxVoiceNaturalize(raw) {
  let s = asText(raw);
  if (!s) return s;

  // Normalize line endings
  s = s.replace(/\r\n/g, '\n');

  // Replace typical UI glyph bullets with simple speech cues
  s = s.replace(/[•●◦▪︎]+/g, '-');

  // Make "#1" speakable
  s = s.replace(/#\s*1\b/g, 'number one');

  // Replace em/en dashes with pauses
  s = s.replace(/[—–]/g, ', ');

  // Replace "X — Y" patterns that show up in music lists
  // Keep it light; avoid over-parsing.
  s = s.replace(/\s*,\s*,/g, ', ');

  // Make "Top 10 — Chart (2010):" more spoken
  s = s.replace(/\bTop\s*10\b/gi, 'Top ten');
  s = s.replace(/\bTop\s*100\b/gi, 'Top one hundred');

  // Convert "1. Artist — Title" into "Number 1: Artist, Title."
  s = s.replace(/(^|\n)\s*(\d{1,2})\.\s+/g, (m, p1, n) => `${p1}Number ${n}: `);

  // Convert "Artist — Title" into "Artist, Title"
  s = s.replace(/\s-\s/g, ', ');
  s = s.replace(/\s*,\s*Z\b/g, ', Z'); // keep "Jay Z" from becoming weird
  s = s.replace(/\bJay\s*,\s*Z\b/gi, 'Jay-Z');

  // Encourage pauses between sections
  s = s.replace(/\n{3,}/g, '\n\n');

  // If we have a big list, add gentle pauses between items
  // (Small pause is basically a period + newline)
  s = s.replace(/\nNumber\s/g, '.\nNumber ');

  // Remove double periods that can happen after replacements
  s = s.replace(/\.\./g, '.');

  return s.trim();
}

/* =========================
   SESSIONS
========================= */

const SESSIONS = new Map();

function getSession(sessionId) {
  const id = asText(sessionId) || 'anon';
  if (!SESSIONS.has(id)) {
    SESSIONS.set(id, {
      id,
      lane: 'general',
      createdAt: Date.now(),

      // intro + small talk
      greeted: false,
      checkInPending: false,

      // anti-loop
      lastSig: null,
      lastSigAt: 0,

      // music state
      musicState: 'start',
      musicYear: null,
      musicChart: null,
    });
  }
  return SESSIONS.get(id);
}

/* =========================
   MUSIC COVERAGE
========================= */

function rebuildMusicCoverage() {
  const charts = [
    'Top40Weekly Top 100',
    'Billboard Hot 100',
    'Billboard Year-End Hot 100',
    'Canada RPM',
    'UK Singles Chart',
  ];
  const builtAt = new Date().toISOString();
  const range = { start: 1970, end: 2010 };
  return { builtAt, range, charts };
}

let MUSIC_COVERAGE = rebuildMusicCoverage();

/* =========================
   MUSIC HANDLERS
========================= */

function enterMusic(session) {
  session.lane = 'music';
  session.musicState = 'need_year';
  session.musicYear = null;
  session.musicChart = null;

  return {
    reply: 'Music it is.\nGive me a year between 1970 and 2010.',
    followUp: null,
  };
}

function isYear(s) {
  const t = clean(s);
  if (!/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  if (n < 1950 || n > 2100) return null;
  return n;
}

function chartsForYear(/* year */) {
  return (MUSIC_COVERAGE.charts || []).map((c) => ({ chart: c }));
}

function handleMusic(message, session) {
  const text = clean(message);

  if (session.musicState === 'need_year') {
    const y = isYear(text);
    if (!y || y < 1970 || y > 2010) {
      return { reply: 'Give me a year between 1970 and 2010.', followUp: null };
    }
    session.musicYear = y;
    session.musicState = 'need_chart';

    const opts = chartsForYear(y).map((o) => o.chart).slice(0, 5);
    return {
      reply: `Great. For ${y}, I can pull from:\n• ${opts.join('\n• ')}\n\nPick one.`,
      followUp: opts,
    };
  }

  if (session.musicState === 'need_chart') {
    const year = session.musicYear;
    const opts = chartsForYear(year).map((o) => o.chart).slice(0, 5);

    const picked = opts.find((c) => clean(c).toLowerCase() === clean(text).toLowerCase());
    if (!picked) {
      return { reply: `Pick a chart for ${year}:\n• ${opts.join('\n• ')}`, followUp: opts };
    }

    session.musicChart = picked;
    session.musicState = 'ready';

    return {
      reply: `Locked in: ${picked}, ${year}.\nNow tell me one of these:\n• Top 10\n• #1\n• Story moment`,
      followUp: ['Top 10', '#1', 'Story moment'],
    };
  }

  if (session.musicState === 'ready') {
    const mode = clean(text).toLowerCase();
    const year = session.musicYear;
    const chart = session.musicChart;

    if (mode === '#1' || mode === '1' || mode === 'number 1' || mode === 'no. 1' || mode === 'no 1') {
      try {
        const top = safeArray(musicKnowledge.getTopByYear(year, chart, 1));
        const row = top[0] || null;

        if (!row) {
          return {
            reply: `I couldn’t find #1 for ${chart} (${year}). Want Top 10, Story moment, or another chart?`,
            followUp: ['Top 10', 'Story moment', 'Another chart'],
          };
        }

        return {
          reply: `#1 for ${chart} (${year}):\n${formatTopItem(row, 0)}\n\nWant a story moment, Top 10, or another year?`,
          followUp: ['Story moment', 'Top 10', 'Another year'],
        };
      } catch (e) {
        return {
          reply: 'Music engine hiccuped while pulling #1. Try “Top 10” or pick another year.',
          followUp: ['Top 10', 'Another year'],
        };
      }
    }

    if (mode === 'top 10' || mode === 'top10') {
      try {
        const top10 = safeArray(musicKnowledge.getTopByYear(year, chart, 10));
        if (!top10.length) {
          return {
            reply: `Top 10 isn’t available for ${chart} (${year}) in the current dataset.\nWant #1 or a story moment?`,
            followUp: ['#1', 'Story moment'],
          };
        }

        const lines = top10.map((r, i) => formatTopItem(r, i));
        return {
          reply: `Top 10 — ${chart} (${year}):\n${lines.join('\n')}\n\nWant #1, a story moment, or another year?`,
          followUp: ['#1', 'Story moment', 'Another year'],
        };
      } catch (e) {
        return { reply: 'Top 10 lookup failed. Try “#1” or “Another year”.', followUp: ['#1', 'Another year'] };
      }
    }

    if (mode === 'story moment' || mode === 'story') {
      return {
        reply: `Story moment (${year}, ${chart}):\nThat year had a real “radio glue” vibe — the kind of hooks that stay in your head for days.\n\nWant #1, Top 10, or another year?`,
        followUp: ['#1', 'Top 10', 'Another year'],
      };
    }

    if (mode === 'another year' || mode === 'year') {
      session.musicState = 'need_year';
      return { reply: 'Perfect. Give me a year between 1970 and 2010.', followUp: null };
    }

    if (mode === 'another chart' || mode === 'chart') {
      session.musicState = 'need_chart';
      const opts = chartsForYear(year).map((o) => o.chart).slice(0, 5);
      return { reply: `Pick a chart for ${year}:\n• ${opts.join('\n• ')}`, followUp: opts };
    }

    return {
      reply: `For ${chart} (${year}), do you want the #1, a story moment, or Top 10 (if available)?`,
      followUp: ['#1', 'Story moment', 'Top 10'],
    };
  }

  return enterMusic(session);
}

/* =========================
   FETCH (Node compatibility)
========================= */

async function getFetch() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch;

  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const mod = await import('node-fetch');
    return mod.default || mod;
  } catch (e) {
    const err = new Error('NO_FETCH_AVAILABLE');
    err.status = 500;
    throw err;
  }
}

/* =========================
   TTS (ELEVENLABS) — ALWAYS REGISTERED
========================= */

function readNumberEnv(name, fallback) {
  const raw = asText(process.env[name]);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readBoolEnv(name, fallback) {
  const raw = asText(process.env[name]).toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function getTtsStatus() {
  const provider = String(process.env.TTS_PROVIDER || 'elevenlabs').toLowerCase();
  const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  const voiceId = String(process.env.ELEVENLABS_VOICE_ID || '').trim();
  const modelId = String(process.env.ELEVENLABS_MODEL_ID || '').trim();

  return {
    provider,
    configured: provider === 'elevenlabs',
    hasApiKey: Boolean(apiKey),
    hasVoiceId: Boolean(voiceId),
    hasModelId: Boolean(modelId),
  };
}

function getElevenVoiceSettings() {
  // Human-ish defaults (tunable via env without code changes)
  const stability = readNumberEnv('NYX_VOICE_STABILITY', 0.28);
  const similarity_boost = readNumberEnv('NYX_VOICE_SIMILARITY', 0.88);
  const style = readNumberEnv('NYX_VOICE_STYLE', 0.22);
  const use_speaker_boost = readBoolEnv('NYX_VOICE_SPEAKER_BOOST', true);

  return { stability, similarity_boost, style, use_speaker_boost };
}

async function synthElevenLabsMp3(rawText) {
  const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  const voiceId = String(process.env.ELEVENLABS_VOICE_ID || '').trim();
  const modelId = String(process.env.ELEVENLABS_MODEL_ID || '').trim() || 'eleven_turbo_v2_5';

  if (!apiKey) throw Object.assign(new Error('NO_ELEVENLABS_API_KEY'), { status: 500 });
  if (!voiceId) throw Object.assign(new Error('NO_ELEVENLABS_VOICE_ID'), { status: 500 });

  const fetch = await getFetch();
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  // IMPORTANT: feed naturalized text to TTS
  const text = nyxVoiceNaturalize(rawText);

  const voice_settings = getElevenVoiceSettings();

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings,
    }),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    const err = new Error('ELEVENLABS_ERROR');
    err.status = 502;
    err.detail = detail.slice(0, 800);
    err.remoteStatus = r.status;
    throw err;
  }

  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf || buf.length < 800) {
    const err = new Error('TTS_AUDIO_TOO_SMALL');
    err.status = 502;
    throw err;
  }
  return buf;
}

function readTextFromBody(req) {
  // Support multiple client payload shapes
  const t1 = asText(req.body?.text);
  if (t1) return t1;

  // Some callers use "message"
  const t2 = asText(req.body?.message);
  if (t2) return t2;

  // Some callers send { reply: "..." } by mistake
  const t3 = asText(req.body?.reply);
  if (t3) return t3;

  return '';
}

async function ttsHandler(req, res, route) {
  try {
    const text = readTextFromBody(req);
    if (!text) {
      const payload = { ok: false, error: 'NO_TEXT' };
      setLast({ route, request: req.body, response: payload, error: null });
      return res.status(400).json(payload);
    }

    const provider = String(process.env.TTS_PROVIDER || 'elevenlabs').toLowerCase();
    if (provider !== 'elevenlabs') {
      const payload = { ok: false, error: 'UNSUPPORTED_TTS_PROVIDER' };
      setLast({ route, request: req.body, response: payload, error: null });
      return res.status(400).json(payload);
    }

    const audioBuf = await synthElevenLabsMp3(text);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(audioBuf.length));

    setLast({
      route,
      request: {
        textPreview: nyxVoiceNaturalize(text).slice(0, 160),
        voice_settings: getElevenVoiceSettings(),
      },
      response: { ok: true, bytes: audioBuf.length },
      error: null,
    });

    return res.status(200).send(audioBuf);
  } catch (err) {
    const status = Number(err?.status || 500);
    const payload = {
      ok: false,
      error: String(err?.message || 'TTS_ERROR'),
      status,
      remoteStatus: err?.remoteStatus,
      detail: err?.detail ? String(err.detail).slice(0, 800) : undefined,
    };
    setLast({ route, request: req.body, response: payload, error: String(err?.stack || err?.message || err) });
    return res.status(status).json(payload);
  }
}

// Primary route
app.post('/api/tts', async (req, res) => ttsHandler(req, res, '/api/tts'));

// Alias route (back-compat): fixes widget builds that call /api/voice
app.post('/api/voice', async (req, res) => ttsHandler(req, res, '/api/voice'));

/* =========================
   HEALTH + DEBUG + ROOT
========================= */

app.get('/', (_, res) => {
  res.status(200).send('Sandblast backend OK. Try /api/health');
});

app.get('/api/health', (_, res) => {
  const tts = getTtsStatus();
  res.json({
    ok: true,
    service: 'sandblast-backend',
    env: ENV,
    host: HOST,
    port: Number(PORT),
    time: new Date().toISOString(),
    build: BUILD_TAG,
    tts,
    music: {
      coverageBuiltAt: MUSIC_COVERAGE.builtAt,
      coverageRange: MUSIC_COVERAGE.range,
      charts: MUSIC_COVERAGE.charts,
    },
  });
});

app.post('/api/debug/reload-music-coverage', (_, res) => {
  MUSIC_COVERAGE = rebuildMusicCoverage();
  res.status(200).json({ ok: true, rebuiltAt: MUSIC_COVERAGE.builtAt, charts: MUSIC_COVERAGE.charts });
});

app.get('/api/debug/last', (req, res) => {
  const token = asText(req.query?.token);
  const expected = asText(process.env.DEBUG_TOKEN);

  if (expected && token !== expected) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  return res.status(200).json({ ok: true, ...LAST_DEBUG });
});

/* =========================
   CHAT ROUTE
========================= */

app.post('/api/chat', (req, res) => {
  const route = '/api/chat';
  const body = req && typeof req.body === 'object' ? req.body : {};
  const message = clean(body?.message);

  const sessionId = asText(body?.sessionId) || crypto.randomUUID();
  const session = getSession(sessionId);

  const now = Date.now();
  const sig = sigOf(message);

  if (sig && sig === session.lastSig && now - session.lastSigAt < 900) {
    const response = { ok: true, reply: '', followUp: null, noop: true, suppressed: true, sessionId };
    setLast({ route, request: body, response, error: null });
    return res.status(200).json(response);
  }
  session.lastSig = sig;
  session.lastSigAt = now;

  try {
    let response;

    // Empty message => intro first (once), then lane picker
    if (!message) {
      if (!session.greeted) {
        session.greeted = true;
        session.checkInPending = true;
        response = nyxGreeting();
      } else {
        response = lanePickerReply();
      }
    } else if (isGreeting(message)) {
      session.greeted = true;
      session.checkInPending = true;
      response = nyxGreeting();
    } else if (session.checkInPending) {
      session.checkInPending = false;
      response = lanePickerReply();
    } else {
      const lanePick = normalizeLanePick(message);

      if (lanePick) {
        session.lane = lanePick;

        if (lanePick === 'music') response = enterMusic(session);
        else if (lanePick === 'tv') response = { reply: 'TV it is.\nTell me a show, a genre, or the vibe you want.', followUp: null };
        else if (lanePick === 'sponsors')
          response = {
            reply: 'Sponsors mode.\nWhat’s the business name and the goal—calls, walk-ins, or awareness?',
            followUp: ['Calls', 'Walk-ins', 'Awareness'],
          };
        else if (lanePick === 'ai')
          response = { reply: 'AI mode.\nAre we talking features, implementation, or a demo?', followUp: ['Features', 'Implementation', 'Demo'] };
        else response = lanePickerReply();
      } else {
        if (session.lane === 'music') response = handleMusic(message, session);
        else response = lanePickerReply();
      }
    }

    const payload = {
      ok: true,
      reply: response?.reply ?? '',
      followUp: response?.followUp ?? null,
      sessionId,
    };

    setLast({ route, request: body, response: payload, error: null });
    return res.status(200).json(payload);
  } catch (err) {
    const payload = { ok: false, error: 'SERVER_ERROR', message: 'Nyx hit an internal error.' };
    setLast({ route, request: body, response: null, error: String(err?.stack || err?.message || err) });
    return res.status(500).json(payload);
  }
});

/* =========================
   START (listener truth + self-probe)
========================= */

function selfProbe(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    sock.setTimeout(900);

    sock.once('connect', () => {
      done = true;
      try {
        sock.destroy();
      } catch (_) {}
      resolve(true);
    });
    sock.once('timeout', () => {
      if (!done) {
        done = true;
        try {
          sock.destroy();
        } catch (_) {}
        resolve(false);
      }
    });
    sock.once('error', () => {
      if (!done) {
        done = true;
        resolve(false);
      }
    });

    sock.connect(port, host);
  });
}

const server = app.listen(PORT, HOST);

server.on('listening', async () => {
  const addr = server.address();
  console.log('[Nyx] listening confirmed:', addr);
  console.log(`[Nyx] up on ${HOST}:${PORT} env=${ENV} timeout=${DEFAULT_TIMEOUT_MS}ms build=${BUILD_TAG}`);

  const probeHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  const ok = await selfProbe(probeHost, PORT);
  console.log('[Nyx] self-probe tcp:', ok ? 'OK' : 'FAILED');
});

server.on('error', (err) => {
  console.error('[Nyx] SERVER_ERROR', err?.code || '', err?.message || err);
});
