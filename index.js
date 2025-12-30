'use strict';

/**
 * Sandblast Backend (Nyx)
 * index.js — Node 18+ friendly (works on Node 25.x too).
 *
 * Adds:
 *  - ElevenLabs STT: POST /api/stt  (multipart form-data, field name: "file")
 *  - Speech-to-Speech: POST /api/s2s (STT -> chat -> TTS, returns JSON w/ audioBase64)
 *
 * Keeps:
 *  - POST /api/chat
 *  - POST /api/tts
 *  - POST /api/voice (alias)
 *
 * CRITICAL CONVERSATION PATCH:
 *  - No blank replies on anti-loop suppression (returns last assistant reply)
 *  - Year parsing supports embedded years (“1987 please”)
 *  - Fuzzy chart matching supports loose variants
 *
 * UI CLEANUP PATCH (THIS RESEND):
 *  - Greeting + “how are you” replies DO NOT return followUp chips (prevents duplicate chip rows)
 *  - Greeting copy is shorter and more natural (less “menu”)
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

let fetchFn = null;
try {
  fetchFn = global.fetch ? global.fetch.bind(global) : null;
} catch (_) {}

async function getFetch() {
  if (fetchFn) return fetchFn;
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
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || '';
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';

// STT defaults (Scribe)
const ELEVENLABS_STT_MODEL_ID = process.env.ELEVENLABS_STT_MODEL_ID || 'scribe_v1';
const ELEVENLABS_STT_LANGUAGE_CODE = process.env.ELEVENLABS_STT_LANGUAGE_CODE || '';
const ELEVENLABS_STT_DIARIZE = (process.env.ELEVENLABS_STT_DIARIZE || 'false').toLowerCase() === 'true';
const ELEVENLABS_STT_TAG_AUDIO_EVENTS = (process.env.ELEVENLABS_STT_TAG_AUDIO_EVENTS || 'false').toLowerCase() === 'true';
const ELEVENLABS_STT_USE_MULTI_CHANNEL = (process.env.ELEVENLABS_STT_USE_MULTI_CHANNEL || 'false').toLowerCase() === 'true';

const NYX_VOICE_STABILITY = process.env.NYX_VOICE_STABILITY || '';
const NYX_VOICE_SIMILARITY = process.env.NYX_VOICE_SIMILARITY || '';
const NYX_VOICE_STYLE = process.env.NYX_VOICE_STYLE || '';
const NYX_VOICE_SPEAKER_BOOST = process.env.NYX_VOICE_SPEAKER_BOOST || '';

const DEBUG_TOKEN = process.env.DEBUG_TOKEN || '';

const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 360);
const SESSION_CLEANUP_MINUTES = Number(process.env.SESSION_CLEANUP_MINUTES || 20);
const SESSION_CAP = Number(process.env.SESSION_CAP || 1500);

const AUDIO_MAX_BYTES = Number(process.env.AUDIO_MAX_BYTES || 12 * 1024 * 1024);

// Anti-loop / forward-motion
const ANTI_LOOP_WINDOW_MS = Number(process.env.NYX_ANTI_LOOP_WINDOW_MS || 1200);
const REPEAT_REPLY_WINDOW_MS = Number(process.env.NYX_REPEAT_REPLY_WINDOW_MS || 120000);
const MAX_REPEAT_REPLY = Number(process.env.NYX_MAX_REPEAT_REPLY || 2);

/* =========================
   DEBUG SNAPSHOT (SINGLETON)
========================= */

let LAST = null;
function setLast(obj) {
  LAST = { ...obj, at: new Date().toISOString() };
}

function asText(x) {
  if (x == null) return '';
  return String(x).trim();
}

function debugAllowed(req) {
  if (!DEBUG_TOKEN) return true;
  const q = asText(req?.query?.token);
  return q && q === DEBUG_TOKEN;
}

/* =========================
   HELPERS
========================= */

function clean(x) {
  const t = asText(x);
  return t.length ? t : '';
}

function asVisitorId(v) {
  const t = asText(v);
  if (!t) return null;
  return t.slice(0, 128);
}

function normText(x) {
  return asText(x).toLowerCase().replace(/\s+/g, ' ').trim();
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

function isGreeting(msg) {
  const m = normText(msg);
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

function isNearEmpty(msg) {
  const m = normText(msg);
  if (!m) return true;
  if (m === '.' || m === '-' || m === '…') return true;
  if (m === 'uh' || m === 'um' || m === 'hmm') return true;
  if (m.length <= 1) return true;
  return false;
}

function isHowAreYou(msg) {
  const m = normText(msg);
  return (
    m === 'how are you' ||
    m === 'how are you?' ||
    m.includes('how are you doing') ||
    m.includes('how r u') ||
    m.includes('how are u')
  );
}

function extractName(msg) {
  const s = asText(msg);
  if (!s) return null;

  const m1 = s.match(/\bmy name is\s+([A-Za-z][A-Za-z'\- ]{1,40})/i);
  if (m1 && m1[1]) return m1[1].trim();

  const m2 = s.match(/\bi am\s+([A-Za-z][A-Za-z'\- ]{1,40})\b/i);
  if (m2 && m2[1]) {
    const candidate = m2[1].trim();
    if (!/^(good|great|fine|ok|okay|well|awesome)$/i.test(candidate)) return candidate;
  }
  return null;
}

function normalizeTranscriptForNyx(t) {
  let s = String(t || '');
  s = s.replace(/\bNix\b/g, 'Nyx');
  s = s.replace(/\bSand\s*blast\b/gi, 'Sandblast');
  s = s.replace(/^\s*on air,?\s*/i, '');
  return s.trim();
}

function pickTopicFromUser(msg) {
  const m = asText(msg);
  if (!m) return '';
  const words = m
    .replace(/[^\w\s'#-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
  return words.join(' ').trim();
}

function laneFromMessage(mLower) {
  if (mLower === 'music') return 'music';
  if (mLower === 'tv') return 'tv';
  if (mLower === 'sponsors' || mLower === 'sponsor') return 'sponsors';
  if (mLower === 'ai') return 'ai';
  if (mLower === 'general') return 'general';
  return null;
}

function isResumeCommand(mLower) {
  if (!mLower) return false;
  return (
    mLower === 'resume' ||
    mLower === 'resume music' ||
    mLower === 'resume tv' ||
    mLower === 'resume sponsors' ||
    mLower === 'resume ai' ||
    mLower === 'pick up' ||
    mLower.includes('pick up where') ||
    mLower.includes('continue') ||
    mLower.includes('resume')
  );
}

function isSwitchLanes(mLower) {
  if (!mLower) return false;
  return (
    mLower === 'switch' ||
    mLower.includes('switch lane') ||
    mLower.includes('switch lanes') ||
    mLower.includes('change lanes')
  );
}

function isStoryMomentCommand(mLower) {
  return mLower === 'story moment' || mLower.includes('story moment') || (mLower.includes('story') && mLower.length <= 20);
}

function extractYearInRange(message, start, end) {
  const s = asText(message);
  if (!s) return null;

  const m = s.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
  if (!m) return null;

  const y = Number(m[1]);
  if (!Number.isFinite(y)) return null;
  if (y < start || y > end) return null;
  return y;
}

function normalizeChartKey(s) {
  return asText(s)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyPickChart(message, charts) {
  const key = normalizeChartKey(message);
  if (!key) return null;

  for (const c of charts) {
    if (normalizeChartKey(c) === key) return c;
  }

  for (const c of charts) {
    const ck = normalizeChartKey(c);
    if (ck.includes(key) || key.includes(ck)) return c;
  }

  const alias = [
    { pat: /\buk\b.*singles|\bsingles\b.*\buk\b|\buk singles\b/, hit: 'UK Singles Chart' },
    { pat: /\bcanada\b.*\brpm\b|\brpm\b/, hit: 'Canada RPM' },
    { pat: /\byear\s*end\b|\byear-end\b|\byearend\b/, hit: 'Billboard Year-End Hot 100' },
    { pat: /\bhot\s*100\b|\bhot100\b/, hit: 'Billboard Hot 100' },
    { pat: /\btop40\b|\btop 40\b/, hit: 'Top40Weekly Top 100' },
  ];

  for (const a of alias) {
    if (a.pat.test(key)) {
      const found = charts.find((c) => normalizeChartKey(c) === normalizeChartKey(a.hit));
      if (found) return found;
    }
  }

  return null;
}

/* =========================
   NYX RESPONSE COMPOSER
========================= */

function nyxCompose({ signal, moment, choice, chips }) {
  const parts = [];
  const s = clean(signal);
  const m = clean(moment);
  const c = clean(choice);

  if (s) parts.push(s);
  if (m) parts.push(m);
  if (c) parts.push(c);

  const reply = parts.join('\n');
  const followUp = Array.isArray(chips) ? chips.filter(Boolean).slice(0, 6) : null;

  return { reply, followUp };
}

function nyxComposeNoChips({ signal, moment, choice }) {
  // This is used specifically for the first-touch experience to avoid duplicate chip rows in the UI.
  return { reply: [clean(signal), clean(moment), clean(choice)].filter(Boolean).join('\n'), followUp: null };
}

function nyxDeMeta(reply, followUp) {
  const r = asText(reply);

  const bad =
    r.includes('Tap a lane') ||
    r.includes('pick up where we left off') ||
    r.includes('Want to pick up where we left off') ||
    r.startsWith('Got it.\nDo you want me to');

  if (!bad) return { reply, followUp };

  // Keep it clean; no extra chips here (the top lane chips exist already)
  return nyxComposeNoChips({
    signal: 'Copy that.',
    moment: 'Tell me what you want to do, and I’ll take it from there.',
    choice: 'Music, TV, Sponsors, or AI?',
  });
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

      greeted: false,
      checkInPending: false,

      turnCount: 0,
      userTurnCount: 0,

      lastSig: null,
      lastSigAt: 0,

      lastAssistantReply: null,
      lastAssistantAt: 0,
      repeatReplyCount: 0,

      lastFollowSig: null,

      topic: (profile?.topic && String(profile.topic)) || '',
      lastUserText: '',
      lastUserAt: 0,

      displayName: profile?.displayName || null,

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

const PROFILES_ENABLED = (process.env.PROFILES_ENABLED || 'true').toLowerCase() === 'true';
const PROFILES_PERSIST = (process.env.PROFILES_PERSIST || 'false').toLowerCase() === 'false' ? false : true;
const PROFILES_TTL_DAYS = Number(process.env.PROFILES_TTL_DAYS || 30);

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
  const charts = [
    'Top40Weekly Top 100',
    'Billboard Hot 100',
    'Billboard Year-End Hot 100',
    'Canada RPM',
    'UK Singles Chart',
  ];
  const builtAt = new Date().toISOString();
  MUSIC_COVERAGE = { builtAt, start: 1970, end: 2010, charts };
}
rebuildMusicCoverage();

/**
 * IMPORTANT: Intro should be clean and not spawn a second chip row.
 * So greeting returns followUp:null always.
 */
function nyxGreeting(session) {
  const name = clean(session?.displayName);
  const who = name ? `${name}, ` : '';
  return nyxComposeNoChips({
    signal: `Welcome to Sandblast. I’m Nyx. ${who}`.trim(),
    moment: 'Tell me what you want to explore, and I’ll guide you.',
    choice: 'Music, TV, Sponsors, or AI?',
  });
}

/**
 * Same principle: keep it warm, but no followUp chips here.
 */
function nyxSocialReply(_message, session) {
  const name = clean(session?.displayName);
  const who = name ? `${name}, ` : '';
  return nyxComposeNoChips({
    signal: `I’m good — steady and switched on. ${who}`.trim(),
    moment: 'What are we doing right now?',
    choice: 'Music, TV, Sponsors, or AI?',
  });
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

  if (artist && title) {
    const aTokens = artist.split(/\s+/).filter(Boolean);
    const tTokens = title.split(/\s+/).filter(Boolean);

    if (aTokens.length >= 2 && tTokens.length >= 1) {
      const movedWord = aTokens[0];
      const restArtist = aTokens.slice(1).join(' ').trim();

      const movedWordLower = movedWord.toLowerCase();
      const titleLower = title.toLowerCase();

      const endsHanging = /(\bits\b|\bthe\b|\bmy\b|\byour\b|\bme\b|\bto\b|\bof\b|\bin\b)$/i.test(title);

      const isLikelyMovedWord =
        movedWord.length >= 3 &&
        !['the', 'and', 'feat', 'ft'].includes(movedWordLower) &&
        !titleLower.includes(movedWordLower) &&
        restArtist.length >= 2;

      if (isLikelyMovedWord && (tTokens.length <= 4 || endsHanging)) {
        artist = restArtist;
        title = `${title} ${movedWord}`.replace(/\s{2,}/g, ' ').trim();
      }
    }
  }

  if (!artist && title) artist = title;
  if (!title && artist) title = artist;

  return `${rank}. ${artist} — ${title}`.replace(/\s+—\s+—/g, ' — ').trim();
}

function safeStoryMoment(y, c) {
  if (musicKnowledge && typeof musicKnowledge.pickRandomByYearWithMeta === 'function') {
    const m = musicKnowledge.pickRandomByYearWithMeta(y, c);
    if (m && m.moment) return String(m.moment).trim();
  }

  const top = (musicKnowledge.getTopByYear(y, c, 1) || [])[0];
  if (!top) return '';

  const artist = clean(top.artist);
  const title = clean(top.title);
  const chart = clean(c);

  return (
    `Quick moment: In ${y}, "${title}" by ${artist} was sitting at the top of ${chart}. ` +
    `That year had a very specific swagger — the kind of radio that sticks to your memory.`
  );
}

function lanePickerReply(session) {
  const lane = session?.lane || 'general';

  if (lane === 'music') {
    const y = session?.musicYear;
    const c = session?.musicChart || session?.profile?.musicChart;
    const label = y && c ? `Resume Music (${y})` : y ? `Resume Music (${y})` : 'Music';
    return nyxCompose({
      signal: 'We can stay in Music or switch lanes.',
      moment: 'I’ll keep the flow tight either way.',
      choice: 'Do you want Music, TV, Sponsors, or AI?',
      chips: [label, 'TV', 'Sponsors', 'AI'],
    });
  }

  return nyxCompose({
    signal: 'Alright.',
    moment: 'Pick a lane and I’ll lead the flow.',
    choice: 'Where are we going?',
    chips: ['Music', 'TV', 'Sponsors', 'AI'],
  });
}

function handleGeneral(message, session) {
  const msg = asText(message);
  const mLower = normText(msg);

  const topic = pickTopicFromUser(msg);
  if (topic) session.topic = topic;

  // We keep “Fun/Build-Fix” as optional user commands, but it won’t lead the greeting anymore.
  if (mLower === 'fun') {
    return nyxCompose({
      signal: 'Alright — fun it is.',
      moment: 'Do you want Music (quick hit) or TV (curated picks)?',
      choice: 'Which one?',
      chips: ['Music', 'TV'],
    });
  }

  if (mLower === 'build/fix' || mLower === 'build' || mLower === 'fix') {
    return nyxCompose({
      signal: 'Good. Build/Fix mode.',
      moment: 'Tell me what’s broken and what “better” looks like.',
      choice: 'Is this the widget or the backend?',
      chips: ['Widget', 'Backend', 'Smoothness', 'Accuracy', 'Speed'],
    });
  }

  const isQuestion =
    msg.includes('?') ||
    mLower.startsWith('how ') ||
    mLower.startsWith('what ') ||
    mLower.startsWith('why ') ||
    mLower.startsWith('when ') ||
    mLower.startsWith('where ');

  if (isQuestion) {
    return nyxCompose({
      signal: 'Copy.',
      moment: 'Give me your goal and your constraint, and I’ll answer cleanly.',
      choice: 'Widget or backend?',
      chips: ['Widget', 'Backend'],
    });
  }

  return nyxCompose({
    signal: 'Got you.',
    moment: 'Say what you want in one sentence and I’ll drive the next step.',
    choice: 'Music, TV, Sponsors, or AI?',
    chips: ['Music', 'TV', 'Sponsors', 'AI'],
  });
}

function followSig(list) {
  const a = (Array.isArray(list) ? list : [])
    .map((x) => asText(x).toLowerCase())
    .filter(Boolean);
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
  if (NYX_VOICE_SPEAKER_BOOST !== '') vs.use_speaker_boost = String(NYX_VOICE_SPEAKER_BOOST).toLowerCase() === 'true';
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
   CHAT CORE
========================= */

function applyReplyRepeatTracking(session, replyText) {
  const now = Date.now();
  const replyNorm = normText(replyText);
  if (!replyNorm) return;

  const last = normText(session.lastAssistantReply || '');
  const within = now - (session.lastAssistantAt || 0) < REPEAT_REPLY_WINDOW_MS;

  if (within && last && replyNorm === last) {
    session.repeatReplyCount = (session.repeatReplyCount || 0) + 1;
  } else {
    session.repeatReplyCount = 0;
  }

  session.lastAssistantReply = replyText;
  session.lastAssistantAt = now;
}

function loopBreakerReply() {
  return nyxCompose({
    signal: 'Okay — I’m steering so we don’t loop.',
    moment: 'Pick a lane and I’ll drive the next step.',
    choice: 'Where are we going?',
    chips: ['Music', 'TV', 'Sponsors', 'AI'],
  });
}

function handleMusic(message, session) {
  const msg = asText(message);
  const mLower = msg.toLowerCase();

  const embeddedYear = extractYearInRange(msg, MUSIC_COVERAGE.start, MUSIC_COVERAGE.end);
  const year = embeddedYear != null ? embeddedYear : Number(msg);
  const isYear = Number.isFinite(year) && year >= MUSIC_COVERAGE.start && year <= MUSIC_COVERAGE.end;

  if (isYear) {
    session.lane = 'music';
    session.musicYear = year;
    session.musicChart = null;
    session.musicState = 'need_chart';

    return nyxCompose({
      signal: `Locked: ${year}.`,
      moment: 'Pick a chart and I’ll pull clean results.',
      choice: 'Which chart do you want?',
      chips: MUSIC_COVERAGE.charts,
    });
  }

  const charts = MUSIC_COVERAGE.charts;
  const chartPick = fuzzyPickChart(msg, charts);
  if (chartPick) {
    session.lane = 'music';
    session.musicChart = chartPick;
    session.musicState = 'ready';

    const y = session.musicYear || 1988;

    return nyxCompose({
      signal: `Locked in: ${chartPick} (${y}).`,
      moment: 'Top 10, #1, or a story moment?',
      choice: 'Pick one.',
      chips: ['Top 10', '#1', 'Story moment', 'Another year'],
    });
  }

  if (mLower === 'music') {
    session.lane = 'music';
    session.musicState = 'need_year';
    return nyxCompose({
      signal: 'Music — perfect.',
      moment: `Give me a year between ${MUSIC_COVERAGE.start} and ${MUSIC_COVERAGE.end}.`,
      choice: 'Pick one, or type your own year.',
      chips: ['1984', '1988', '1990', '1999'],
    });
  }

  if (session.musicState === 'need_year' || session.musicState === 'start') {
    return nyxCompose({
      signal: 'Alright.',
      moment: `Give me a year between ${MUSIC_COVERAGE.start} and ${MUSIC_COVERAGE.end}.`,
      choice: 'Pick one.',
      chips: ['1984', '1988', '1990', '1999'],
    });
  }

  if (session.musicState === 'need_chart') {
    const y = session.musicYear || 1988;
    return nyxCompose({
      signal: `For ${y}, pick a chart:`,
      moment: charts.map((c) => `• ${c}`).join('\n'),
      choice: 'Which chart?',
      chips: charts,
    });
  }

  if (session.musicState === 'ready') {
    const y = session.musicYear || 1988;
    const c = session.musicChart || session.profile?.musicChart || 'Billboard Year-End Hot 100';

    if (mLower === 'top 10' || mLower === 'top10') {
      const list = musicKnowledge.getTopByYear(y, c, 10) || [];
      const lines = list.slice(0, 10).map((it, i) => formatTopItem(it, i)).join('\n');

      return nyxCompose({
        signal: `Top 10 — ${c} (${y}):`,
        moment: lines,
        choice: 'Want #1, a story moment, or another year?',
        chips: ['#1', 'Story moment', 'Another year'],
      });
    }

    if (mLower === '#1' || mLower === '1' || mLower === 'number 1' || mLower === 'no. 1') {
      const list = musicKnowledge.getTopByYear(y, c, 1) || [];
      const it = list[0];
      const line = it ? formatTopItem(it, 0) : `1. (not found) — (not found)`;

      return nyxCompose({
        signal: `#1 — ${c} (${y}):`,
        moment: line,
        choice: 'Want a story moment or Top 10?',
        chips: ['Story moment', 'Top 10', 'Another year'],
      });
    }

    if (isStoryMomentCommand(mLower)) {
      const story = safeStoryMoment(y, c);
      if (story) {
        return nyxCompose({
          signal: story,
          moment: '',
          choice: 'Top 10, #1, or another year?',
          chips: ['Top 10', '#1', 'Another year'],
        });
      }
      return nyxCompose({
        signal: `No story moment loaded for ${y} on ${c} yet.`,
        moment: '',
        choice: 'Top 10 or #1 instead?',
        chips: ['Top 10', '#1', 'Another year'],
      });
    }

    if (mLower.includes('another year') || mLower === 'year') {
      session.musicState = 'need_year';
      session.musicChart = null;
      session.musicYear = null;
      return nyxCompose({
        signal: 'Sure.',
        moment: `Pick a year between ${MUSIC_COVERAGE.start} and ${MUSIC_COVERAGE.end}.`,
        choice: 'Which year?',
        chips: ['1984', '1988', '1990', '1999'],
      });
    }

    return nyxCompose({
      signal: 'I’m with you.',
      moment: 'Top 10, #1, or story moment?',
      choice: 'Pick one.',
      chips: ['Top 10', '#1', 'Story moment', 'Another year'],
    });
  }

  return lanePickerReply(session);
}

function runNyxChat(body) {
  const route = '/api/chat_core';
  const rawMessage = body?.message;
  const message = clean(rawMessage);

  const sessionId = asText(body?.sessionId) || crypto.randomUUID();
  const visitorId = asVisitorId(body?.visitorId);
  const session = getSession(sessionId, visitorId);

  session.lastActiveAt = Date.now();

  if (visitorId) {
    session.visitorId = visitorId;
    session.profile = getProfile(visitorId) || session.profile || null;
  }

  const nm = extractName(message);
  if (nm) session.displayName = nm;

  if (message) {
    session.lastUserText = message;
    session.lastUserAt = Date.now();
  }

  const now = Date.now();
  const sig = `${session.lane}|${session.musicState}|${session.musicYear || ''}|${session.musicChart || ''}|${message || ''}`;

  if (session.lastSig && sig === session.lastSig && now - (session.lastSigAt || 0) < ANTI_LOOP_WINDOW_MS) {
    const response = {
      ok: true,
      reply: clean(session.lastAssistantReply) || 'Copy that. Tap again if you meant to resend — I’m with you.',
      followUp: null,
      noop: true,
      suppressed: true,
      sessionId,
    };
    setLast({ route, request: body, response, error: null });
    return response;
  }
  session.lastSig = sig;
  session.lastSigAt = now;

  let response;

  if (!message || isNearEmpty(message)) {
    const isFirstOpen = !session.turnCount || session.turnCount < 1;
    if (isFirstOpen) {
      session.greeted = true;
      session.checkInPending = false;
      response = nyxGreeting(session);
    } else {
      response = nyxCompose({
        signal: "I didn’t catch that.",
        moment: 'Try again — or pick a lane and I’ll take it from there.',
        choice: 'Where do you want to go?',
        chips: ['Music', 'TV', 'Sponsors', 'AI'],
      });
    }
  } else if (isGreeting(message)) {
    session.greeted = true;
    session.checkInPending = false;
    response = nyxGreeting(session);
  } else if (isHowAreYou(message)) {
    response = nyxSocialReply(message, session);
  } else {
    const mLower = normText(message);

    if (isSwitchLanes(mLower)) {
      response = lanePickerReply(session);
    } else if (isResumeCommand(mLower)) {
      if (mLower.startsWith('resume music')) {
        session.lane = 'music';
        if (session.musicYear && (session.musicChart || session.profile?.musicChart)) {
          session.musicChart = session.musicChart || session.profile?.musicChart || null;
          session.musicState = 'ready';
          response = nyxCompose({
            signal: 'Back in Music.',
            moment: 'Top 10, #1, or story moment?',
            choice: 'Pick one.',
            chips: ['Top 10', '#1', 'Story moment', 'Another year'],
          });
        } else {
          session.musicState = 'need_year';
          response = handleMusic('music', session);
        }
      } else if (session.profile?.lastLane) {
        session.lane = String(session.profile.lastLane);
        response = lanePickerReply(session);
      } else {
        response = lanePickerReply(session);
      }
    } else {
      const lanePick = laneFromMessage(mLower);

      if (lanePick) {
        session.lane = lanePick;

        if (lanePick === 'music') {
          response = handleMusic('music', session);
        } else if (lanePick === 'tv') {
          response = nyxCompose({
            signal: 'TV — nice.',
            moment: 'Give me a vibe and I’ll curate.',
            choice: 'Comfort or mystery?',
            chips: ['Comfort', 'Mystery', 'Action', 'Nostalgic'],
          });
        } else if (lanePick === 'sponsors') {
          response = nyxCompose({
            signal: 'Sponsors — copy.',
            moment: 'I can help you package, price, or pitch.',
            choice: 'Are we selling a package or answering an inquiry?',
            chips: ['Sell package', 'Answer inquiry', 'Rate card', 'Pitch'],
          });
        } else if (lanePick === 'ai') {
          response = nyxCompose({
            signal: 'AI mode.',
            moment: 'Strategy, implementation, or troubleshooting?',
            choice: 'Which one?',
            chips: ['Strategy', 'Implementation', 'Troubleshooting', 'Widget', 'Backend'],
          });
        } else {
          response = handleGeneral(message, session);
        }
      } else {
        if (isStoryMomentCommand(mLower) && (session.lane === 'music' || session.musicState === 'ready')) {
          response = handleMusic('Story moment', session);
        } else if (session.lane === 'music' || mLower === 'music' || session.musicState !== 'start') {
          response = handleMusic(message, session);
        } else if (session.lane === 'general') {
          response = handleGeneral(message, session);
        } else {
          response = lanePickerReply(session);
        }
      }
    }
  }

  if (session.visitorId) {
    const patch = { lastLane: session.lane };
    if (session.topic) patch.topic = session.topic;
    if (session.displayName) patch.displayName = session.displayName;

    if (session.lane === 'music') {
      if (session.musicYear) patch.musicYear = session.musicYear;
      if (session.musicChart) patch.musicChart = session.musicChart;
    }

    const updated = touchProfile(session.visitorId, patch);
    session.profile = updated || session.profile || null;
  }

  let replyText = response?.reply ?? '';
  let followUpFinal = getAnticipatoryFollowUp(session, replyText, response?.followUp ?? null);

  const de = nyxDeMeta(replyText, followUpFinal);
  replyText = de.reply;
  followUpFinal = de.followUp;

  applyReplyRepeatTracking(session, replyText);

  if ((session.repeatReplyCount || 0) >= MAX_REPEAT_REPLY) {
    const lb = loopBreakerReply();
    replyText = lb.reply;
    followUpFinal = lb.followUp;
  }

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
      languageCode: clean(ELEVENLABS_STT_LANGUAGE_CODE) || null,
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
    nyx: {
      antiLoopWindowMs: ANTI_LOOP_WINDOW_MS,
      repeatReplyWindowMs: REPEAT_REPLY_WINDOW_MS,
      maxRepeatReply: MAX_REPEAT_REPLY,
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
      language_code: clean(req.body?.language_code) || clean(ELEVENLABS_STT_LANGUAGE_CODE) || '',
      diarize: req.body?.diarize != null ? boolish(req.body.diarize) : ELEVENLABS_STT_DIARIZE,
      tag_audio_events: req.body?.tag_audio_events != null ? boolish(req.body.tag_audio_events) : ELEVENLABS_STT_TAG_AUDIO_EVENTS,
      use_multi_channel: req.body?.use_multi_channel != null ? boolish(req.body.use_multi_channel) : ELEVENLABS_STT_USE_MULTI_CHANNEL,
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
      language_code: clean(req.body?.language_code) || clean(ELEVENLABS_STT_LANGUAGE_CODE) || '',
      diarize: req.body?.diarize != null ? boolish(req.body.diarize) : ELEVENLABS_STT_DIARIZE,
      tag_audio_events: req.body?.tag_audio_events != null ? boolish(req.body.tag_audio_events) : ELEVENLABS_STT_TAG_AUDIO_EVENTS,
      use_multi_channel: req.body?.use_multi_channel != null ? boolish(req.body.use_multi_channel) : ELEVENLABS_STT_USE_MULTI_CHANNEL,
    };

    const stt = await elevenSTT({
      audioBuffer: f.buffer,
      filename: f.originalname || 'audio.bin',
      contentType: f.mimetype || 'application/octet-stream',
      opts: sttOpts,
    });

    const transcriptRaw = clean(stt?.text);
    const transcript = normalizeTranscriptForNyx(transcriptRaw);

    if (!transcript) {
      const payloadEmpty = { ok: false, error: 'EMPTY_TRANSCRIPT' };
      setLast({ route, request: { bytes: f.size, mimetype: f.mimetype }, response: payloadEmpty, error: 'EMPTY_TRANSCRIPT' });
      return res.status(422).json(payloadEmpty);
    }

    const chatBody = {
      message: transcript,
      sessionId: asText(req.body?.sessionId) || crypto.randomUUID(),
      visitorId: asVisitorId(req.body?.visitorId),
    };

    const chat = runNyxChat(chatBody);
    const replyText = clean(chat?.reply);

    const audioBuf = replyText ? await elevenTTS(replyText) : Buffer.alloc(0);
    const audioBase64 = audioBuf && audioBuf.length ? audioBuf.toString('base64') : '';

    const payload = {
      ok: true,
      transcript,
      transcript_raw: transcriptRaw || '',
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
   CHAT ROUTE
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
