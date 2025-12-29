'use strict';

/**
 * Sandblast Backend (Nyx)
 * index.js — Node 18+ friendly.
 *
 * Adds:
 *  - ElevenLabs STT: POST /api/stt  (multipart form-data, field name: "file")
 *  - Speech-to-Speech: POST /api/s2s (STT -> chat -> TTS, returns JSON w/ audioBase64)
 *
 * Keeps:
 *  - POST /api/chat
 *  - POST /api/tts
 *  - POST /api/voice (alias)
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const axios = require('axios'); // <-- critical for STT multipart reliability
const multer = require('multer');
const FormData = require('form-data');

let fetchFn = null;
try {
  // Node 18+
  fetchFn = global.fetch ? global.fetch.bind(global) : null;
} catch (_) {}

async function getFetch() {
  if (fetchFn) return fetchFn;
  // Node 16 fallback (kept for compatibility)
  const mod = await import('node-fetch');
  fetchFn = mod.default;
  return fetchFn;
}

/* =========================
   ENV + CONSTANTS
========================= */

const PORT = process.env.PORT || 3000;

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || ''; // optional TTS model
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';

// STT defaults (Scribe)
const ELEVENLABS_STT_MODEL_ID = process.env.ELEVENLABS_STT_MODEL_ID || 'scribe_v1';
const ELEVENLABS_STT_LANGUAGE_CODE = process.env.ELEVENLABS_STT_LANGUAGE_CODE || ''; // e.g. "eng" or blank for auto
const ELEVENLABS_STT_DIARIZE = (process.env.ELEVENLABS_STT_DIARIZE || 'false').toLowerCase() === 'true';
const ELEVENLABS_STT_TAG_AUDIO_EVENTS = (process.env.ELEVENLABS_STT_TAG_AUDIO_EVENTS || 'false').toLowerCase() === 'true';
const ELEVENLABS_STT_USE_MULTI_CHANNEL = (process.env.ELEVENLABS_STT_USE_MULTI_CHANNEL || 'false').toLowerCase() === 'true';

const NYX_VOICE_STABILITY = process.env.NYX_VOICE_STABILITY || '';
const NYX_VOICE_SIMILARITY = process.env.NYX_VOICE_SIMILARITY || '';
const NYX_VOICE_STYLE = process.env.NYX_VOICE_STYLE || '';
const NYX_VOICE_SPEAKER_BOOST = process.env.NYX_VOICE_SPEAKER_BOOST || '';

const DEBUG_TOKEN = process.env.DEBUG_TOKEN || '';

const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 360); // 6 hours
const SESSION_CLEANUP_MINUTES = Number(process.env.SESSION_CLEANUP_MINUTES || 20);
const SESSION_CAP = Number(process.env.SESSION_CAP || 1500);

const PROFILES_ENABLED = (process.env.PROFILES_ENABLED || 'true').toLowerCase() === 'true';
const PROFILES_PERSIST = (process.env.PROFILES_PERSIST || 'false').toLowerCase() === 'false' ? false : true; // preserve your prior behavior
const PROFILES_TTL_DAYS = Number(process.env.PROFILES_TTL_DAYS || 30);

// Upload limits (tune later)
const AUDIO_MAX_BYTES = Number(process.env.AUDIO_MAX_BYTES || 12 * 1024 * 1024); // 12MB default

/* =========================
   HELPERS
========================= */

function cleanCellText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asText(x) {
  if (x == null) return '';
  return String(x).trim();
}

function clean(x) {
  const t = asText(x);
  return t.length ? t : '';
}

function asVisitorId(v) {
  const t = asText(v);
  if (!t) return null;
  return t.slice(0, 128);
}

function isGreeting(msg) {
  const m = asText(msg).toLowerCase();
  return (
    m === 'hi' ||
    m === 'hello' ||
    m === 'hey' ||
    m === 'yo' ||
    m.startsWith('hi ') ||
    m.startsWith('hello ') ||
    m.startsWith('hey ')
  );
}

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function boolish(x) {
  const t = String(x || '').toLowerCase().trim();
  return t === 'true' || t === '1' || t === 'yes' || t === 'y';
}

/* =========================
   DEBUG SNAPSHOT
========================= */

let LAST = null;
function setLast(obj) {
  LAST = { ...obj, at: new Date().toISOString() };
}

function debugAllowed(req) {
  if (!DEBUG_TOKEN) return true;
  const q = asText(req?.query?.token);
  return q && q === DEBUG_TOKEN;
}

/* =========================
   SESSIONS
========================= */

const SESSIONS = new Map();

function getSession(sessionId, visitorId) {
  const id = asText(sessionId) || 'anon';

  if (!SESSIONS.has(id)) {
    const profile = getProfile(visitorId);

    const s = {
      id,
      visitorId: asVisitorId(visitorId) || null,
      profile: profile || null,

      lane: (profile?.lastLane && String(profile.lastLane)) || 'general',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),

      // intro + small talk
      greeted: false,
      checkInPending: false,

      // conversation continuity
      turnCount: 0,
      userTurnCount: 0,

      // anti-loop
      lastSig: null,
      lastSigAt: 0,

      // follow-up de-dupe
      lastFollowSig: null,

      // music state
      musicState: 'start',
      musicYear: profile?.musicYear ?? null,
      musicChart: profile?.musicChart ?? null,
    };

    SESSIONS.set(id, s);
  }

  return SESSIONS.get(id);
}

function cleanupSessions() {
  const ttlMs = SESSION_TTL_MINUTES * 60 * 1000;
  const cutoff = Date.now() - ttlMs;

  if (SESSIONS.size > SESSION_CAP) {
    const entries = Array.from(SESSIONS.entries());
    entries.sort((a, b) => (a[1]?.lastActiveAt || 0) - (b[1]?.lastActiveAt || 0));
    const over = SESSIONS.size - SESSION_CAP;
    for (let i = 0; i < over; i++) SESSIONS.delete(entries[i][0]);
  }

  for (const [k, s] of SESSIONS.entries()) {
    if ((s?.lastActiveAt || 0) < cutoff) SESSIONS.delete(k);
  }
}
setInterval(cleanupSessions, Math.max(1, SESSION_CLEANUP_MINUTES) * 60 * 1000);

/* =========================
   PROFILES (LIGHTWEIGHT)
========================= */

const PROFILES = new Map();

function profileKey(visitorId) {
  const v = asVisitorId(visitorId);
  return v ? `v:${v}` : null;
}

function getProfile(visitorId) {
  if (!PROFILES_ENABLED) return null;
  const k = profileKey(visitorId);
  if (!k) return null;

  const entry = PROFILES.get(k);
  if (!entry) return null;

  const ttlMs = PROFILES_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (entry.updatedAt && Date.now() - entry.updatedAt > ttlMs) {
    PROFILES.delete(k);
    return null;
  }
  return entry.data || null;
}

function touchProfile(visitorId, patch) {
  if (!PROFILES_ENABLED) return null;
  const k = profileKey(visitorId);
  if (!k) return null;

  const existing = getProfile(visitorId) || {};
  const data = { ...existing, ...(patch || {}) };

  const entry = { data, updatedAt: Date.now() };
  PROFILES.set(k, entry);

  if (PROFILES_PERSIST) {
    // no-op placeholder
  }

  return data;
}

/* =========================
   MUSIC KNOWLEDGE LAYER
========================= */

const musicKnowledge = require('./Utils/musicKnowledge');

let MUSIC_COVERAGE = { builtAt: null, start: 1970, end: 2010, charts: [] };

function rebuildMusicCoverage() {
  const charts = ['Top40Weekly Top 100', 'Billboard Hot 100', 'Billboard Year-End Hot 100', 'Canada RPM', 'UK Singles Chart'];
  const builtAt = new Date().toISOString();
  MUSIC_COVERAGE = { builtAt, start: 1970, end: 2010, charts };
}
rebuildMusicCoverage();

function lanePickerReply(session) {
  const isResumeCandidate = !!(session?.profile?.lastLane || session?.musicYear || session?.musicChart);

  if (session?.lane === 'music') {
    const y = session?.musicYear;
    const c = session?.profile?.musicChart;
    const label = y && c ? `Resume Music (${y}, ${c})` : y ? `Resume Music (${y})` : 'Resume Music';

    return {
      reply: 'Want to pick up where we left off, or switch lanes?',
      followUp: [label, 'Music', 'TV', 'Sponsors', 'AI'],
    };
  }

  if (isResumeCandidate) {
    return {
      reply: 'Want to pick up where we left off, or switch lanes?',
      followUp: ['Resume', 'Music', 'TV', 'Sponsors', 'AI'],
    };
  }

  return {
    reply: 'What would you like to explore next?',
    followUp: ['General', 'Music', 'TV', 'Sponsors', 'AI'],
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

  let artist = clean(item?.artist);
  let title = clean(item?.title);

  if (artist) {
    artist = artist.replace(/\bJay\s*[—–-]\s*Z\b/gi, 'Jay-Z').replace(/\s{2,}/g, ' ').trim();
  }
  if (title) {
    title = title.replace(/\s{2,}/g, ' ').trim();
  }

  if (!artist && title) artist = title;
  if (!title && artist) title = artist;

  return `${rank}. ${artist} — ${title}`.replace(/\s+—\s+—/g, ' — ').trim();
}

function handleMusic(message, session) {
  const msg = asText(message);
  const mLower = msg.toLowerCase();

  const year = Number(msg);
  const isYear = Number.isFinite(year) && year >= MUSIC_COVERAGE.start && year <= MUSIC_COVERAGE.end;

  if (isYear) {
    session.lane = 'music';
    session.musicYear = year;
    session.musicChart = null;
    session.musicState = 'need_chart';

    return {
      reply: `Got it — ${year}.\nPick a chart:\n` + MUSIC_COVERAGE.charts.map((c) => `• ${c}`).join('\n'),
      followUp: MUSIC_COVERAGE.charts,
    };
  }

  const charts = MUSIC_COVERAGE.charts;
  const chartPick = charts.find((c) => c.toLowerCase() === mLower);
  if (chartPick) {
    session.lane = 'music';
    session.musicChart = chartPick;
    session.musicState = 'ready';

    const y = session.musicYear || 1988;
    return {
      reply: `Locked in: ${chartPick}, ${y}.\nNow tell me one of these:\n• Top 10\n• #1\n• Story moment`,
      followUp: ['Top 10', '#1', 'Story moment'],
    };
  }

  if (mLower === 'music') {
    session.lane = 'music';
    session.musicState = 'need_year';
    return {
      reply: `Music it is.\nGive me a year between ${MUSIC_COVERAGE.start} and ${MUSIC_COVERAGE.end}.`,
      followUp: ['1984', '1988', '1990', '1999'],
    };
  }

  if (session.musicState === 'need_year' || session.musicState === 'start') {
    return {
      reply: `Give me a year between ${MUSIC_COVERAGE.start} and ${MUSIC_COVERAGE.end}.`,
      followUp: ['1984', '1988', '1990', '1999'],
    };
  }

  if (session.musicState === 'need_chart') {
    const y = session.musicYear || 1988;
    return {
      reply: `Great. For ${y}, I can pull from:\n` + charts.map((c) => `• ${c}`).join('\n') + `\n\nPick one.`,
      followUp: charts,
    };
  }

  if (session.musicState === 'ready') {
    const y = session.musicYear || 1988;
    const c = session.musicChart || 'Billboard Year-End Hot 100';

    if (mLower === 'top 10' || mLower === 'top10') {
      const list = musicKnowledge.getTopByYear(y, c, 10) || [];
      const lines = list.slice(0, 10).map((it, i) => formatTopItem(it, i)).join('\n');

      return {
        reply: `Top 10 — ${c} (${y}):\n${lines}\n\nWant #1, a story moment, or another year?`,
        followUp: ['#1', 'Story moment', 'Another year'],
      };
    }

    if (mLower === '#1' || mLower === '1' || mLower === 'number 1' || mLower === 'no. 1') {
      const list = musicKnowledge.getTopByYear(y, c, 1) || [];
      const it = list[0];
      const line = it ? formatTopItem(it, 0) : `1. (not found) — (not found)`;

      return {
        reply: `#1 for ${c} (${y}):\n${line}\n\nWant a story moment, Top 10, or another year?`,
        followUp: ['Story moment', 'Top 10', 'Another year'],
      };
    }

    if (mLower.includes('story')) {
      const moment = musicKnowledge.pickRandomByYearWithMeta(y, c);
      if (moment && moment.moment) {
        return {
          reply: `${moment.moment}\n\nWant Top 10, #1, or another year?`,
          followUp: ['Top 10', '#1', 'Another year'],
        };
      }
      return {
        reply: `I don’t have a story moment loaded for ${y} on ${c} yet.\nWant Top 10, #1, or another year?`,
        followUp: ['Top 10', '#1', 'Another year'],
      };
    }

    if (mLower.includes('another year') || mLower === 'year') {
      session.musicState = 'need_year';
      session.musicChart = null;
      session.musicYear = null;
      return {
        reply: `Sure — pick a year between ${MUSIC_COVERAGE.start} and ${MUSIC_COVERAGE.end}.`,
        followUp: ['1984', '1988', '1990', '1999'],
      };
    }

    return {
      reply: `Want Top 10, #1, or a story moment?`,
      followUp: ['Top 10', '#1', 'Story moment'],
    };
  }

  return lanePickerReply(session);
}

/* =========================
   ANTICIPATORY FOLLOW-UPS
========================= */

function followSig(list) {
  const a = (Array.isArray(list) ? list : []).map((x) => asText(x).toLowerCase()).filter(Boolean);
  return a.join('|');
}

function setFollowUp(session, proposed) {
  const list = Array.isArray(proposed) ? proposed.filter(Boolean) : null;
  if (!list || list.length === 0) return null;

  const sig = followSig(list);
  if (sig && session.lastFollowSig && sig === session.lastFollowSig) return null;

  session.lastFollowSig = sig || null;
  return list;
}

function getAnticipatoryFollowUp(session, replyText, proposedFollowUp) {
  const base = Array.isArray(proposedFollowUp) ? proposedFollowUp : null;
  const reply = asText(replyText).toLowerCase();

  if (session?.lane && reply.includes('pick a chart')) {
    return setFollowUp(session, base);
  }

  if (session?.lane === 'music' && reply.includes('want') && reply.includes('another year')) {
    return setFollowUp(session, base);
  }

  return setFollowUp(session, base);
}

/* =========================
   TTS (ELEVENLABS)
========================= */

function elevenVoiceSettings() {
  const vs = {};
  if (NYX_VOICE_STABILITY !== '') vs.stability = clamp(NYX_VOICE_STABILITY, 0, 1);
  if (NYX_VOICE_SIMILARITY !== '') vs.similarity_boost = clamp(NYX_VOICE_SIMILARITY, 0, 1);
  if (NYX_VOICE_STYLE !== '') vs.style = clamp(NYX_VOICE_STYLE, 0, 1);
  if (NYX_VOICE_SPEAKER_BOOST !== '')
    vs.use_speaker_boost = String(NYX_VOICE_SPEAKER_BOOST).toLowerCase() === 'true';
  return vs;
}

async function elevenTTS(text) {
  const fetch = await getFetch();
  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`;

  const payload = {
    text,
    ...(ELEVENLABS_MODEL_ID ? { model_id: ELEVENLABS_MODEL_ID } : {}),
    voice_settings: elevenVoiceSettings(),
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error(`ELEVENLABS_TTS_ERROR: ${r.status} ${txt}`);
    err.status = r.status;
    throw err;
  }

  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf || buf.length < 800) {
    const err = new Error(`ELEVENLABS_AUDIO_TOO_SMALL: ${buf ? buf.length : 0}`);
    err.status = 502;
    throw err;
  }
  return buf;
}

function resolveTtsText(body) {
  if (!body || typeof body !== 'object') return '';
  return clean(body.text) || clean(body.message) || clean(body.reply) || '';
}

/* =========================
   STT (ELEVENLABS)
   Critical fix:
   - Use axios + form-data to avoid Undici(fetch) multipart serialization issues.
========================= */

async function elevenSTT({ audioBuffer, filename, contentType, opts }) {
  const url = `${ELEVENLABS_BASE_URL}/v1/speech-to-text`;

  const fd = new FormData();
  fd.append('file', audioBuffer, {
    filename: filename || 'audio.mp3',
    contentType: contentType || 'audio/mpeg',
  });

  fd.append('model_id', (opts && opts.model_id) || ELEVENLABS_STT_MODEL_ID);

  const tagAudioEvents = opts?.tag_audio_events ?? ELEVENLABS_STT_TAG_AUDIO_EVENTS;
  const diarize = opts?.diarize ?? ELEVENLABS_STT_DIARIZE;
  const useMultiChannel = opts?.use_multi_channel ?? ELEVENLABS_STT_USE_MULTI_CHANNEL;

  fd.append('tag_audio_events', String(!!tagAudioEvents));
  fd.append('diarize', String(!!diarize));
  fd.append('use_multi_channel', String(!!useMultiChannel));

  const lang = clean(opts?.language_code) || clean(ELEVENLABS_STT_LANGUAGE_CODE);
  if (lang) fd.append('language_code', lang);

  const headers = {
    ...fd.getHeaders(),
    'xi-api-key': ELEVENLABS_API_KEY,
    Accept: 'application/json',
  };

  const resp = await axios.post(url, fd, {
    headers,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000,
    validateStatus: () => true,
  });

  if (resp.status < 200 || resp.status >= 300) {
    const txt = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    const err = new Error(`ELEVENLABS_STT_ERROR: ${resp.status} ${txt}`);
    err.status = resp.status;
    throw err;
  }

  const json = resp.data;
  if (!json || typeof json !== 'object') {
    const err = new Error('ELEVENLABS_STT_BAD_RESPONSE');
    err.status = 502;
    throw err;
  }

  return json;
}

/* =========================
   CHAT CORE (shared by /api/chat and /api/s2s)
========================= */

function runNyxChat(body) {
  const route = '/api/chat_core';
  const message = clean(body?.message);

  const sessionId = asText(body?.sessionId) || crypto.randomUUID();
  const visitorId = asVisitorId(body?.visitorId);
  const session = getSession(sessionId, visitorId);

  session.lastActiveAt = Date.now();

  if (visitorId) {
    session.visitorId = visitorId;
    session.profile = getProfile(visitorId) || session.profile || null;
  }

  // anti-loop signature
  const now = Date.now();
  const sig = `${session.lane}|${session.musicState}|${session.musicYear || ''}|${session.musicChart || ''}|${message || ''}`;
  const antiLoopWindowMs = 1200;

  if (session.lastSig && sig === session.lastSig && now - (session.lastSigAt || 0) < antiLoopWindowMs) {
    const response = { ok: true, reply: '', followUp: null, noop: true, suppressed: true, sessionId };
    setLast({ route, request: body, response, error: null });
    return response;
  }
  session.lastSig = sig;
  session.lastSigAt = now;

  let response;

  if (!message) {
    const isFirstOpen = !session.turnCount || session.turnCount < 1;
    if (isFirstOpen) {
      session.greeted = true;
      session.checkInPending = true;
      response = nyxGreeting();
    } else {
      response = lanePickerReply(session);
    }
  } else if (isGreeting(message)) {
    session.greeted = true;
    session.checkInPending = true;
    response = nyxGreeting();
  } else if (session.checkInPending) {
    session.checkInPending = false;
    response = lanePickerReply(session);
  } else {
    const mLower = asText(message).toLowerCase();

    if (mLower === 'general') {
      session.lane = 'general';
      response = { reply: 'General it is. What are you in the mood for?', followUp: null };
    } else if (mLower === 'tv') {
      session.lane = 'tv';
      response = { reply: 'TV lane is warming up. What should we explore — classics, schedules, or recommendations?', followUp: null };
    } else if (mLower === 'sponsors') {
      session.lane = 'sponsors';
      response = { reply: 'Sponsors lane. Are you looking to advertise, or explore current sponsor spots?', followUp: null };
    } else if (mLower === 'ai') {
      session.lane = 'ai';
      response = { reply: 'AI lane. Want consulting, a strategy plan, or a quick diagnostic?', followUp: null };
    } else {
      if (session.lane === 'music' || mLower === 'music' || session.musicState !== 'start') {
        response = handleMusic(message, session);
      } else {
        response = lanePickerReply(session);
      }
    }
  }

  if (session.visitorId) {
    const patch = { lastLane: session.lane };
    if (session.lane === 'music') {
      if (session.musicYear) patch.musicYear = session.musicYear;
      if (session.musicChart) patch.musicChart = session.musicChart;
    }

    const updated = touchProfile(session.visitorId, patch);
    session.profile = updated || session.profile || null;
  }

  const replyText = response?.reply ?? '';
  const followUpFinal = getAnticipatoryFollowUp(session, replyText, response?.followUp ?? null);

  session.turnCount = (session.turnCount || 0) + 1;
  if (message) session.userTurnCount = (session.userTurnCount || 0) + 1;

  const payload = {
    ok: true,
    reply: replyText,
    followUp: followUpFinal,
    sessionId,
  };

  setLast({ route, request: body, response: payload, error: null });
  return payload;
}

/* =========================
   EXPRESS APP
========================= */

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Multer for audio uploads (memory; sized)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_MAX_BYTES },
});

app.get('/', (req, res) => {
  res.status(200).send('Sandblast backend OK. Try /api/health');
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'sandblast-backend',
    env: process.env.NODE_ENV || 'production',
    host: '0.0.0.0',
    port: Number(process.env.PORT || 10000),
    time: new Date().toISOString(),
    build: process.env.RENDER_GIT_COMMIT || process.env.BUILD || process.env.COMMIT || 'unknown',
    tts: {
      provider: 'elevenlabs',
      configured: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
      hasApiKey: !!ELEVENLABS_API_KEY,
      hasVoiceId: !!ELEVENLABS_VOICE_ID,
      hasModelId: !!ELEVENLABS_MODEL_ID,
      voiceSettings: elevenVoiceSettings(),
    },
    stt: {
      provider: 'elevenlabs',
      configured: !!ELEVENLABS_API_KEY,
      modelId: ELEVENLABS_STT_MODEL_ID,
      languageCode: ELEVENLABS_STT_LANGUAGE_CODE || null,
      diarize: ELEVENLABS_STT_DIARIZE,
      tagAudioEvents: ELEVENLABS_STT_TAG_AUDIO_EVENTS,
      useMultiChannel: ELEVENLABS_STT_USE_MULTI_CHANNEL,
    },
    music: {
      coverageBuiltAt: MUSIC_COVERAGE.builtAt,
      coverageRange: { start: MUSIC_COVERAGE.start, end: MUSIC_COVERAGE.end },
      charts: MUSIC_COVERAGE.charts,
    },
    profiles: {
      enabled: PROFILES_ENABLED,
      persist: PROFILES_PERSIST,
      ttlDays: PROFILES_TTL_DAYS,
      count: PROFILES.size,
    },
    sessions: {
      count: SESSIONS.size,
      ttlMinutes: SESSION_TTL_MINUTES,
      cleanupMinutes: SESSION_CLEANUP_MINUTES,
      cap: SESSION_CAP,
    },
  });
});

app.get('/api/debug/last', (req, res) => {
  if (!debugAllowed(req)) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  res.status(200).json({ ok: true, ...(LAST || { route: null, request: null, response: null, error: null }) });
});

/* =========================
   TTS ROUTES
========================= */

async function handleTts(req, res, routeName) {
  const route = routeName || '/api/tts';
  const body = req && typeof req.body === 'object' ? req.body : {};
  const text = resolveTtsText(body);

  try {
    if (!text) {
      setLast({ route, request: body, response: null, error: 'NO_TEXT' });
      return res.status(400).json({ ok: false, error: 'NO_TEXT' });
    }
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      setLast({ route, request: body, response: null, error: 'TTS_NOT_CONFIGURED' });
      return res.status(500).json({ ok: false, error: 'TTS_NOT_CONFIGURED' });
    }

    const audio = await elevenTTS(text);

    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audio.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    setLast({ route, request: body, response: { ok: true, bytes: audio.length }, error: null });
    return res.send(audio);
  } catch (err) {
    const msg = (err && err.message) || 'TTS_FAILED';
    setLast({ route, request: body, response: null, error: msg });
    return res.status(502).json({ ok: false, error: 'TTS_FAILED', message: msg });
  }
}

app.post('/api/tts', (req, res) => handleTts(req, res, '/api/tts'));
app.post('/api/voice', (req, res) => handleTts(req, res, '/api/voice'));

/* =========================
   STT ROUTE
   - multipart form-data
   - file field name: "file"
========================= */

app.post('/api/stt', upload.single('file'), async (req, res) => {
  const route = '/api/stt';

  try {
    if (!ELEVENLABS_API_KEY) {
      setLast({ route, request: { hasFile: !!req.file }, response: null, error: 'STT_NOT_CONFIGURED' });
      return res.status(500).json({ ok: false, error: 'STT_NOT_CONFIGURED' });
    }

    const f = req.file;
    if (!f || !f.buffer || !f.size) {
      setLast({ route, request: { hasFile: !!f }, response: null, error: 'NO_FILE' });
      return res.status(400).json({ ok: false, error: 'NO_FILE' });
    }

    const opts = {
      model_id: clean(req.body?.model_id) || ELEVENLABS_STT_MODEL_ID,
      language_code: clean(req.body?.language_code) || ELEVENLABS_STT_LANGUAGE_CODE || '',
      diarize: req.body?.diarize != null ? boolish(req.body.diarize) : ELEVENLABS_STT_DIARIZE,
      tag_audio_events:
        req.body?.tag_audio_events != null ? boolish(req.body.tag_audio_events) : ELEVENLABS_STT_TAG_AUDIO_EVENTS,
      use_multi_channel:
        req.body?.use_multi_channel != null ? boolish(req.body.use_multi_channel) : ELEVENLABS_STT_USE_MULTI_CHANNEL,
    };

    const stt = await elevenSTT({
      audioBuffer: f.buffer,
      filename: f.originalname || 'audio.bin',
      contentType: f.mimetype || 'application/octet-stream',
      opts,
    });

    const text = clean(stt?.text);
    const payload = {
      ok: true,
      text: text || '',
      language_code: stt?.language_code || null,
      language_probability: stt?.language_probability ?? null,
      words: Array.isArray(stt?.words) ? stt.words : null,
    };

    setLast({ route, request: { hasFile: true, bytes: f.size, mimetype: f.mimetype, opts }, response: payload, error: null });
    return res.status(200).json(payload);
  } catch (err) {
    const msg = (err && err.message) || 'STT_FAILED';
    setLast({ route, request: { hasFile: !!req.file }, response: null, error: msg });
    return res.status(502).json({ ok: false, error: 'STT_FAILED', message: msg });
  }
});

/* =========================
   S2S ROUTE
   - multipart form-data
   - file field name: "file"
   - supports extra fields: sessionId, visitorId, diarize, language_code, tag_audio_events, use_multi_channel
========================= */

app.post('/api/s2s', upload.single('file'), async (req, res) => {
  const route = '/api/s2s';

  try {
    if (!ELEVENLABS_API_KEY) {
      setLast({ route, request: { hasFile: !!req.file }, response: null, error: 'STT_NOT_CONFIGURED' });
      return res.status(500).json({ ok: false, error: 'STT_NOT_CONFIGURED' });
    }
    if (!ELEVENLABS_VOICE_ID) {
      setLast({ route, request: { hasFile: !!req.file }, response: null, error: 'TTS_NOT_CONFIGURED' });
      return res.status(500).json({ ok: false, error: 'TTS_NOT_CONFIGURED' });
    }

    const f = req.file;
    if (!f || !f.buffer || !f.size) {
      setLast({ route, request: { hasFile: !!f }, response: null, error: 'NO_FILE' });
      return res.status(400).json({ ok: false, error: 'NO_FILE' });
    }

    const sttOpts = {
      model_id: clean(req.body?.model_id) || ELEVENLABS_STT_MODEL_ID,
      language_code: clean(req.body?.language_code) || ELEVENLABS_STT_LANGUAGE_CODE || '',
      diarize: req.body?.diarize != null ? boolish(req.body.diarize) : ELEVENLABS_STT_DIARIZE,
      tag_audio_events:
        req.body?.tag_audio_events != null ? boolish(req.body.tag_audio_events) : ELEVENLABS_STT_TAG_AUDIO_EVENTS,
      use_multi_channel:
        req.body?.use_multi_channel != null ? boolish(req.body.use_multi_channel) : ELEVENLABS_STT_USE_MULTI_CHANNEL,
    };

    const stt = await elevenSTT({
      audioBuffer: f.buffer,
      filename: f.originalname || 'audio.bin',
      contentType: f.mimetype || 'application/octet-stream',
      opts: sttOpts,
    });

    const transcript = clean(stt?.text);
    if (!transcript) {
      const payloadEmpty = { ok: false, error: 'EMPTY_TRANSCRIPT' };
      setLast({ route, request: { bytes: f.size, mimetype: f.mimetype }, response: payloadEmpty, error: 'EMPTY_TRANSCRIPT' });
      return res.status(422).json(payloadEmpty);
    }

    // Run Nyx chat with transcript as the message
    const chatBody = {
      message: transcript,
      sessionId: asText(req.body?.sessionId) || crypto.randomUUID(),
      visitorId: asVisitorId(req.body?.visitorId),
    };

    const chat = runNyxChat(chatBody);
    const replyText = clean(chat?.reply);

    // TTS the reply
    const audioBuf = replyText ? await elevenTTS(replyText) : Buffer.alloc(0);
    const audioBase64 = audioBuf && audioBuf.length ? audioBuf.toString('base64') : '';

    const payload = {
      ok: true,
      transcript,
      reply: replyText,
      followUp: chat?.followUp ?? null,
      sessionId: chat?.sessionId || chatBody.sessionId,
      audioBase64,
      audioBytes: audioBuf.length,
      audioMime: 'audio/mpeg',
    };

    setLast({
      route,
      request: {
        bytes: f.size,
        mimetype: f.mimetype,
        sttOpts,
        hasSessionId: !!req.body?.sessionId,
        hasVisitorId: !!req.body?.visitorId,
      },
      response: { ok: true, audioBytes: audioBuf.length, transcriptChars: transcript.length, replyChars: replyText.length },
      error: null,
    });

    return res.status(200).json(payload);
  } catch (err) {
    const msg = (err && err.message) || 'S2S_FAILED';
    setLast({ route, request: { hasFile: !!req.file }, response: null, error: msg });
    return res.status(502).json({ ok: false, error: 'S2S_FAILED', message: msg });
  }
});

/* =========================
   CHAT ROUTE (existing)
========================= */

app.post('/api/chat', (req, res) => {
  const route = '/api/chat';
  const body = req && typeof req.body === 'object' ? req.body : {};

  try {
    const payload = runNyxChat(body);
    setLast({ route, request: body, response: payload, error: null });
    return res.status(200).json(payload);
  } catch (err) {
    const payload = { ok: false, error: 'SERVER_ERROR', message: 'Nyx hit an internal error.' };
    setLast({ route, request: body, response: null, error: (err && err.message) || 'SERVER_ERROR' });
    return res.status(500).json(payload);
  }
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (build=${process.env.RENDER_GIT_COMMIT || 'local'})`);
});
