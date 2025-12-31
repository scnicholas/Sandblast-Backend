'use strict';

/**
 * Sandblast Backend (Nyx)
 * index.js — Node 18+ friendly (works on Node 25.x too).
 *
 * Routes:
 *  - POST /api/chat
 *  - POST /api/tts
 *  - POST /api/voice (alias)
 *  - POST /api/stt  (multipart form-data, field name: "file")
 *  - POST /api/s2s  (STT -> chat -> TTS, returns JSON w/ audioBase64)
 *
 * Critical fixes in this revision:
 *  - FIX: Intro is a single clean line (no menus, no chip instructions, no extra system text)
 *  - FIX: Greetings + “Hi Nyx” are acknowledged naturally (no awkward stitching)
 *  - FIX: Name capture is safe + immediate (Nyx uses the name right away; never mislearns “Hi Nyx”)
 *  - FIX: Removed the “fast vs explore” pace prompt (was causing disjointed, non-human openings)
 *  - TUNE: “Golden sequence” enforced: acknowledge → reflect → advance (one next step)
 *  - KEEP: Existing features (music/tts/stt/s2s/dedupe) unchanged
 *
 * Layer 1/2 upgrades in THIS revision:
 *  - FIX: Layer 2 AI tightening now applies both when user picks "ai" AND when AI is inferred from free-text
 *  - FIX: Grammar polish: "Mac, are we..." (not "Mac, Are we...")
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
const ANTI_LOOP_WINDOW_MS = Number(process.env.NYX_ANTI_LOOP_WINDOW_MS || 1600);
const REPEAT_REPLY_WINDOW_MS = Number(process.env.NYX_REPEAT_REPLY_WINDOW_MS || 120000);
const MAX_REPEAT_REPLY = Number(process.env.NYX_MAX_REPEAT_REPLY || 2);

// HARD DEDUPE window (prevents double-send/double-tap / retry bursts)
const DUP_REQ_WINDOW_MS = Number(process.env.NYX_DUP_REQ_WINDOW_MS || 20000);

// Widget open “hello” token (panel open)
const NYX_HELLO_TOKEN = '__nyx_hello__';

// Intelligence layering (Layer 1 = attentiveness + guidedness; Layer 2 = anticipatory follow-ups + light preference memory)
const NYX_INTELLIGENCE_LEVEL = Number(process.env.NYX_INTELLIGENCE_LEVEL || 2); // 1 or 2 (default 2)

/* =========================
   DEBUG SNAPSHOT (SINGLETON)
========================= */

let LAST = null;
function setLast(obj) {
  LAST = { ...(obj || {}), at: new Date().toISOString() };
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
    m === 'good morning' ||
    m === 'good afternoon' ||
    m === 'good evening' ||
    m.startsWith('hi ') ||
    m.startsWith('hello ') ||
    m.startsWith('hey ') ||
    m.startsWith('good morning') ||
    m.startsWith('good afternoon') ||
    m.startsWith('good evening')
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

function inferLaneFromFreeText(msg) {
  const m = normText(msg);
  if (!m) return null;

  // Music
  if (/(song|track|artist|album|billboard|year[- ]end|top ?40|top40weekly|chart|hot ?100|rpm|uk singles)/i.test(m))
    return 'music';

  // TV / media programming
  if (/(tv|show|series|episode|season|watch|program|schedule|channel|broadcast)/i.test(m)) return 'tv';

  // Sponsors / ads
  if (/(sponsor|advertis|ad rate|media kit|campaign|placement|brand partner)/i.test(m)) return 'sponsors';

  // AI / tech help
  if (/(api|backend|render|node|express|index\.js|widget|webflow|bug|error|500|cors|tts|stt|mic|deploy|github)/i.test(m))
    return 'ai';

  return null;
}

function nyxGuidedQuestionForLane(lane, session) {
  const name = clean(session?.displayName);
  const who = name ? `${name}, ` : '';

  if (lane === 'music') return `${who}What year are we starting with?`;
  if (lane === 'tv') return `${who}Are you looking for a specific show, a schedule, or recommendations?`;
  if (lane === 'sponsors') return `${who}Are you advertising on Sandblast, or looking for sponsor options?`;
  if (lane === 'ai') return `${who}are we working on the backend, the widget, or content intelligence?`;
  return `${who}What are we doing today?`;
}

// Layer 2: infer a tighter AI sub-topic so we can ask a precise next question.
function inferAiSubtopic(msg) {
  const m = normText(msg);
  if (!m) return null;
  if (/(widget|webflow|frontend|panel|button|launcher|css|mobile)/i.test(m)) return 'widget';
  if (/(backend|index\.js|express|render|deploy|env|cors|endpoint|api\/chat|500|502)/i.test(m)) return 'backend';
  if (/(tts|voice|elevenlabs|audio|stt|s2s|microphone|mic|transcript)/i.test(m)) return 'voice';
  if (/(music|chart|hot ?100|top ?10|year[- ]end|top40weekly)/i.test(m)) return 'music';
  return null;
}

// Layer 2: apply subtopic tightening consistently
function tightenAiGuidanceIfPossible(session, fallbackPrompt) {
  if (NYX_INTELLIGENCE_LEVEL < 2) return fallbackPrompt;

  const sub = clean(session?.aiSubtopic);
  if (sub === 'widget') return 'What part is failing — positioning, looping, mic, or rendering?';
  if (sub === 'backend') return 'What’s the symptom — looping, slow response, 500s, or bad routing?';
  if (sub === 'voice') return 'Is the issue TTS, STT transcript, or S2S playback?';
  return fallbackPrompt;
}

function isClearIntent(msg) {
  const s = asText(msg);
  if (!s) return false;

  const m = normText(s);
  if (!m) return false;

  // Exclude greetings / lane shortcuts
  if (isGreeting(s) || isNyxAddressedGreeting(s)) return false;
  if (laneFromMessage(m)) return false;

  // If it looks like a name-only statement, don't treat as intent
  if (looksLikeBareName(s) || looksLikeNameOnlyStatement(s)) return false;

  // Common intent phrasing, or a question, or simply enough words
  if (/[?]/.test(s)) return true;
  if (/(help|need|want|can you|could you|show me|tell me|find|give me|fix|update|how do i|what is|when was|where is)/i.test(s))
    return true;

  // Enough content to likely be a real request
  const tokens = m.split(' ').filter(Boolean);
  return tokens.length >= 4;
}

// Avoid learning “nyx” or greeting phrases as a user name
function isNyxAddressedGreeting(msg) {
  const m = normText(msg);
  return (
    m === 'hi nyx' ||
    m === 'hello nyx' ||
    m === 'hey nyx' ||
    m.startsWith('hi nyx') ||
    m.startsWith('hello nyx') ||
    m.startsWith('hey nyx')
  );
}

/** Conservative: only accept letters + common name punctuation, and not obviously “commands” */
function looksLikeBareName(msg) {
  const s = clean(msg);
  if (!s) return false;

  // Never treat greetings (or “Hi Nyx”) as a name
  if (isGreeting(s) || isNyxAddressedGreeting(s)) return false;

  // Too long or contains digits/symbols -> no
  if (s.length > 40) return false;
  if (/[0-9@#$/\\]/.test(s)) return false;

  // 1–2 tokens max
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 2) return false;

  // Reject if the first token is a greeting-like word
  const first = normText(tokens[0]);
  if (['hi', 'hello', 'hey', 'yo', 'good'].includes(first)) return false;

  // Must be alphabetic-ish (allow apostrophe/hyphen)
  if (!/^[A-Za-z][A-Za-z'\- ]{0,39}$/.test(s)) return false;

  // Reject common non-names that show up in flows
  const m = normText(s);
  const banned = new Set([
    'music',
    'tv',
    'sponsors',
    'sponsor',
    'ai',
    'general',
    'resume',
    'switch',
    'top 10',
    'top10',
    '#1',
    '1',
    'number 1',
    'no. 1',
    'story',
    'story moment',
    'nyx',
  ]);
  if (banned.has(m)) return false;

  // Reject basic acknowledgements
  if (['ok', 'okay', 'fine', 'great', 'good', 'yes', 'no', 'yeah', 'yep', 'nope'].includes(m)) return false;

  return true;
}

function extractName(msg) {
  const s = asText(msg);
  if (!s) return null;

  // Never accept “Hi Nyx” / “Hello Nyx” as a name
  if (isNyxAddressedGreeting(s) || isGreeting(s)) return null;

  // my name is X
  const m1 = s.match(/\bmy name is\s+([A-Za-z][A-Za-z'\- ]{1,40})/i);
  if (m1 && m1[1]) return m1[1].trim();

  // name is X
  const mNameIs = s.match(/\bname is\s+([A-Za-z][A-Za-z'\- ]{1,40})/i);
  if (mNameIs && mNameIs[1]) return mNameIs[1].trim();

  // i am X
  const m2 = s.match(/\bi am\s+([A-Za-z][A-Za-z'\- ]{1,40})\b/i);
  if (m2 && m2[1]) {
    const candidate = m2[1].trim();
    if (!/^(good|great|fine|ok|okay|well|awesome)$/i.test(candidate)) return candidate;
  }

  // i'm X / I’m X / im X
  const m3 = s.match(/\b(i'?m|i’m|im)\s+([A-Za-z][A-Za-z'\- ]{1,40})\b/i);
  if (m3 && m3[2]) {
    const candidate = m3[2].trim();
    if (!/^(good|great|fine|ok|okay|well|awesome)$/i.test(candidate)) return candidate;
  }

  return null;
}

function looksLikeNameOnlyStatement(msg) {
  const m = normText(msg);
  if (!m) return false;
  if (m.startsWith('my name is ')) return true;
  if (m.startsWith('name is ')) return true;
  if (m.startsWith('i am ')) return true;
  if (m.startsWith("i'm ") || m.startsWith('im ') || m.startsWith('i’m ')) return true;
  return false;
}

function normalizeTranscriptForNyx(t) {
  let s = String(t || '');
  s = s.replace(/\bNix\b/g, 'Nyx');
  s = s.replace(/\bSand\s*blast\b/gi, 'Sandblast');
  s = s.replace(/^\s*on air,?\s*/i, '');
  return s.trim();
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
  return { reply: [clean(signal), clean(moment), clean(choice)].filter(Boolean).join('\n'), followUp: null };
}

// Guard against “support-bot” / meta prompts leaking through
function nyxDeMeta(reply, followUp) {
  const r = asText(reply);

  const bad =
    r.includes('Do you want me to help you plan the next steps') ||
    r.includes('Tap a lane') ||
    r.includes('pick up where we left off') ||
    r.startsWith('Got it.\nDo you want me to');

  if (!bad) return { reply, followUp };

  return nyxComposeNoChips({
    signal: 'Copy that.',
    moment: 'Tell me what you want to do, and I’ll take it from there.',
    choice: '',
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

      turnCount: 0,
      userTurnCount: 0,

      lastSig: null,
      lastSigAt: 0,

      lastAssistantReply: null,
      lastAssistantAt: 0,
      repeatReplyCount: 0,

      topic: (profile?.topic && String(profile.topic)) || '',
      lastUserText: '',
      lastUserAt: 0,

      // Lightweight memory (non-creepy)
      displayName: profile?.displayName || null,

      // Layer 2: lightweight preference hints
      aiSubtopic: profile?.aiSubtopic || null,

      musicState: 'start',
      musicYear: profile?.musicYear ?? null,
      musicChart: profile?.musicChart ?? null,

      // HARD DEDUPE tracking
      lastReqHash: null,
      lastReqAt: 0,
      lastClientMsgId: null,
      lastClientMsgAt: 0,

      // Robust dedupe caches (handles retries even if messages interleave)
      clientMsgSeen: new Map(), // clientMsgId -> ts
      reqHashSeen: new Map(), // reqHash     -> ts
      // monotonic server message id
      serverMsgId: 0,

      // When we suppress a duplicate, count it so we don’t “blank” repeatedly
      recentSuppressCount: 0,
      lastSuppressAt: 0,
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
  const charts = ['Top40Weekly Top 100', 'Billboard Hot 100', 'Billboard Year-End Hot 100', 'Canada RPM', 'UK Singles Chart'];
  const builtAt = new Date().toISOString();
  MUSIC_COVERAGE = { builtAt, start: 1970, end: 2010, charts };
}
rebuildMusicCoverage();

/* =========================
   NYX: HUMAN OPENERS (CRITICAL)
========================= */

// Time-aware, rotation-safe intro selector (does not touch conversational core)
function nyxTimeZone() {
  return clean(process.env.NYX_TIMEZONE) || 'America/Toronto';
}

function nyxLocalParts(date = new Date(), tz = nyxTimeZone()) {
  // hour: 0–23, ymd: YYYY-MM-DD
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const y = get('year');
  const mo = get('month');
  const d = get('day');
  const h = Number(get('hour') || '0');

  return { hour: Number.isFinite(h) ? h : 0, ymd: `${y}-${mo}-${d}` };
}

function nyxDaypart(hour) {
  // simple, stable dayparts for broadcast tone
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  return 'evening';
}

function nyxStablePickIndex(key, n) {
  if (!n || n <= 1) return 0;
  const hex = crypto.createHash('sha1').update(String(key || '')).digest('hex');
  const num = parseInt(hex.slice(0, 8), 16);
  return Number.isFinite(num) ? num % n : 0;
}

function nyxIntroText(session) {
  // Rotation-safe per visitor per daypart per date (stable within a day; changes across days)
  const tz = nyxTimeZone();
  const { hour, ymd } = nyxLocalParts(new Date(), tz);
  const dp = nyxDaypart(hour);

  const base =
    "Welcome to Sandblast Channel — where classic TV, timeless music, and modern insight come together. I’m Nyx, and I’ll help you explore it all. How can I help you?";

  const banks = {
    morning: [
      base,
      "Good morning — welcome to Sandblast Channel, where classic TV, timeless music, and modern insight come together. I’m Nyx. How can I help you?",
      "Morning, and welcome to Sandblast Channel — classic TV, timeless music, modern insight. I’m Nyx. How can I help you?",
    ],
    afternoon: [
      base,
      "Welcome to Sandblast Channel — classic TV, timeless music, and modern insight. I’m Nyx. How can I help you?",
      "Glad you’re here. This is Sandblast Channel — classic TV, timeless music, modern insight. I’m Nyx. How can I help you?",
    ],
    evening: [
      base,
      "Good evening — welcome to Sandblast Channel, where classic TV, timeless music, and modern insight come together. I’m Nyx. How can I help you?",
      "You’re on Sandblast Channel — classic TV, timeless music, and modern insight. I’m Nyx. How can I help you?",
    ],
  };

  const list = banks[dp] || [base];
  const idSeed = clean(session?.visitorId) || clean(session?.id) || 'anon';
  const pickKey = `${idSeed}::${ymd}::${dp}`;
  const idx = nyxStablePickIndex(pickKey, list.length);
  return list[idx] || base;
}

// Single, clean intro line (no menus, no “tap chips”)
function nyxHello(session) {
  return nyxComposeNoChips({
    signal: nyxIntroText(session),
    moment: '',
    choice: '',
  });
}

// Greeting acknowledgment + one forward step
function nyxGreeting(session, rawUserMsg) {
  const name = clean(session?.displayName);
  const who = name ? `, ${name}` : '';
  const m = normText(rawUserMsg);

  let signal = `Hey${who}.`;
  if (m.startsWith('good morning')) signal = `Morning${who}.`;
  else if (m.startsWith('good afternoon')) signal = `Afternoon${who}.`;
  else if (m.startsWith('good evening')) signal = `Evening${who}.`;

  return nyxComposeNoChips({
    signal,
    moment: '',
    choice: 'What are we doing today?',
  });
}

// Name acknowledgment: use the name immediately + one next step
function nyxNameAcknowledge(session, name) {
  const nm = clean(name) || clean(session?.displayName);
  const who = nm ? `${nm}` : 'there';
  return nyxComposeNoChips({
    signal: `Nice to meet you, ${who}.`,
    moment: '',
    choice: 'What should we do first?',
  });
}

function nyxSocialReply(_message, session) {
  const name = clean(session?.displayName);
  const who = name ? `${name}. ` : '';
  return nyxComposeNoChips({
    signal: `I’m good — steady and switched on. ${who}`.trim(),
    moment: '',
    choice: 'What are we doing today?',
  });
}

function _str(x) {
  if (x === null || x === undefined) return '';
  return String(x).trim();
}

function _pick(...vals) {
  for (const v of vals) {
    const s = _str(v);
    if (s) return s;
  }
  return '';
}

function _isUnknown(s) {
  const x = _str(s).toLowerCase();
  return !x || x === 'unknown' || x.includes('unknown title') || x.includes('unknown artist');
}

function _splitArtistTitle(s) {
  const t = _str(s);
  if (!t) return { artist: '', title: '' };

  const seps = [' — ', ' - ', ' – ', '—', ' / ', ' | '];
  for (const sep of seps) {
    if (t.includes(sep)) {
      const parts = t.split(sep).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return { artist: parts[0], title: parts.slice(1).join(' - ') };
      }
    }
  }
  return { artist: '', title: '' };
}

/**
 * Normalize a track row coming from any chart source.
 * Fixes:
 *  - title missing (present under alternate keys like song/track/name)
 *  - combined strings "Artist — Title"
 *  - swapped artist/title fields
 */
function normalizeTrackRow(row) {
  if (typeof row === 'string') {
    const split = _splitArtistTitle(row);
    return {
      rank: null,
      artist: split.artist || '',
      title: split.title || (split.artist ? '' : row.trim()),
      raw: row,
    };
  }

  const rank = row?.rank ?? row?.position ?? row?.pos ?? row?.no ?? row?.['No.'] ?? row?.['#'] ?? null;

  let artist = _pick(row?.artist, row?.Artist, row?.performer, row?.performers, row?.act, row?.by, row?.singer);
  let title = _pick(row?.title, row?.Title, row?.song, row?.Song, row?.track, row?.Track, row?.single, row?.name);

  // If either field is combined "Artist — Title", split it
  if ((!title || _isUnknown(title)) && artist) {
    const split = _splitArtistTitle(artist);
    if (split.artist && split.title) {
      artist = split.artist;
      title = split.title;
    }
  }
  if ((!artist || _isUnknown(artist)) && title) {
    const split = _splitArtistTitle(title);
    if (split.artist && split.title) {
      artist = split.artist;
      title = split.title;
    }
  }

  // Fallback: other combined fields
  const combined = _pick(row?.text, row?.raw, row?.line, row?.display);
  if ((!title || _isUnknown(title)) || (!artist || _isUnknown(artist))) {
    const split = _splitArtistTitle(combined);
    if (split.artist && split.title) {
      if (!artist || _isUnknown(artist)) artist = split.artist;
      if (!title || _isUnknown(title)) title = split.title;
    }
  }

  if (_isUnknown(artist)) artist = '';
  if (_isUnknown(title)) title = '';

  // Final tidy
  artist = artist.replace(/\s{2,}/g, ' ').trim();
  title = title.replace(/\s{2,}/g, ' ').trim();

  return { rank, artist, title, raw: row };
}

function formatTopItem(item, idx) {
  const r = normalizeTrackRow(item);
  const rank = Number.isFinite(Number(r?.rank)) ? Number(r.rank) : idx + 1;

  // Prefer full "Artist — Title". If one side is missing, show what we have.
  if (r.artist && r.title) return `${rank}. ${r.artist} — ${r.title}`;
  if (r.title && !r.artist) return `${rank}. ${r.title}`;
  if (r.artist && !r.title) return `${rank}. ${r.artist}`;
  return `${rank}. (track info unavailable)`;
}

function safeStoryMoment(y, c) {
  if (musicKnowledge && typeof musicKnowledge.pickRandomByYearWithMeta === 'function') {
    const m = musicKnowledge.pickRandomByYearWithMeta(y, c);
    if (m && m.moment) return String(m.moment).trim();
  }

  const top = (musicKnowledge.getTopByYear(y, c, 1) || [])[0];
  if (!top) return '';

  const r = normalizeTrackRow(top);
  const artist = clean(r.artist);
  const title = clean(r.title);
  const chart = clean(c);

  return `Quick moment: In ${y}, "${title}" by ${artist} was sitting at the top of ${chart}. That year had a very specific swagger — the kind of radio that sticks to your memory.`;
}

function isTop10Command(mLower) {
  return mLower === 'top 10' || mLower === 'top10' || mLower === 'top ten';
}
function isNumber1Command(mLower) {
  return (
    mLower === '#1' ||
    mLower === '# 1' ||
    mLower === '1' ||
    mLower === 'number 1' ||
    mLower === 'number one' ||
    mLower === 'no. 1' ||
    mLower === 'no 1'
  );
}

function handleMusic(message, session) {
  const msg = asText(message);
  const mLower = normText(msg);

  const embeddedYear = extractYearInRange(msg, MUSIC_COVERAGE.start, MUSIC_COVERAGE.end);
  const year = embeddedYear != null ? embeddedYear : Number(msg);
  const isYear = Number.isFinite(year) && year >= MUSIC_COVERAGE.start && year <= MUSIC_COVERAGE.end;

  // Priority: when already "ready", execute intent BEFORE trying to re-lock chart/year
  if (session.musicState === 'ready') {
    const y = session.musicYear || 1988;
    const c = session.musicChart || session.profile?.musicChart || 'Billboard Year-End Hot 100';

    if (isTop10Command(mLower)) {
      const list = musicKnowledge.getTopByYear(y, c, 10) || [];
      const lines = list
        .slice(0, 10)
        .map((it, i) => formatTopItem(it, i))
        .join('\n');

      return nyxCompose({
        signal: `Top 10 — ${c} (${y}):`,
        moment: lines,
        choice: 'Want #1, a story moment, or another year?',
        chips: ['#1', 'Story moment', 'Another year'],
      });
    }

    if (isNumber1Command(mLower)) {
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

    // If user says a year while ready, treat as year-change
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
  }

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
      signal: 'Sure.',
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

  return nyxCompose({
    signal: 'Music mode.',
    moment: `Give me a year (${MUSIC_COVERAGE.start}–${MUSIC_COVERAGE.end}).`,
    choice: 'Pick one.',
    chips: ['1984', '1988', '1990', '1999'],
  });
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
  const outputFmt = clean(process.env.ELEVENLABS_OUTPUT_FORMAT) || 'mp3_44100_128';
  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=${encodeURIComponent(outputFmt)}`;

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

function loopBreakerReply(session) {
  const name = clean(session?.displayName);
  const who = name ? `${name}, ` : '';
  return nyxCompose({
    signal: `Okay — I’m steering so we don’t loop. ${who}`.trim(),
    moment: 'Give me one clear choice and I’ll execute it.',
    choice: 'Music, TV, Sponsors, or AI?',
    chips: ['Music', 'TV', 'Sponsors', 'AI'],
  });
}

function forwardMotionNudge(session) {
  if (session?.lane === 'music' || session?.musicState !== 'start') {
    return handleMusic(session.musicState === 'ready' ? 'top 10' : 'music', session);
  }
  return nyxCompose({
    signal: 'I’m here.',
    moment: 'Tell me what you want to do, and I’ll take it from there.',
    choice: '',
    chips: ['Music', 'TV', 'Sponsors', 'AI'],
  });
}

function runNyxChat(body) {
  const route = '/api/chat_core';
  const rawMessage = body?.message;
  const message = clean(rawMessage);

  const sessionId = asText(body?.sessionId) || crypto.randomUUID();
  const visitorId = asVisitorId(body?.visitorId);
  const clientMsgId = clean(body?.clientMsgId); // optional, from widget

  const session = getSession(sessionId, visitorId);
  session.lastActiveAt = Date.now();

  if (visitorId) {
    session.visitorId = visitorId;
    session.profile = getProfile(visitorId) || session.profile || null;
  }

  // Monotonic server message id (for client-side dedupe if needed)
  session.serverMsgId = (session.serverMsgId || 0) + 1;
  const serverMsgId = session.serverMsgId;

  const now = Date.now();

  // Client message dedupe (robust): suppress duplicates even if other messages interleave.
  if (clientMsgId) {
    if (!session.clientMsgSeen || typeof session.clientMsgSeen.get !== 'function') session.clientMsgSeen = new Map();

    const seenAt = session.clientMsgSeen.get(clientMsgId) || 0;
    if (seenAt && now - seenAt < DUP_REQ_WINDOW_MS) {
      session.recentSuppressCount = (session.recentSuppressCount || 0) + 1;
      session.lastSuppressAt = now;

      const response = {
        ok: true,
        reply: '',
        followUp: null,
        noop: true,
        suppressed: true,
        suppressRender: true,
        sessionId,
        serverMsgId,
      };
      setLast({ route, request: body, response, error: null });
      return response;
    }

    // Record + prune old entries (bounded memory)
    session.clientMsgSeen.set(clientMsgId, now);
    for (const [k, t] of session.clientMsgSeen.entries()) {
      if (!t || now - t > DUP_REQ_WINDOW_MS) session.clientMsgSeen.delete(k);
    }
    // Cap to prevent unbounded growth on long sessions
    if (session.clientMsgSeen.size > 250) {
      const entries = Array.from(session.clientMsgSeen.entries()).sort((a, b) => a[1] - b[1]);
      const over = session.clientMsgSeen.size - 250;
      for (let i = 0; i < over; i++) session.clientMsgSeen.delete(entries[i][0]);
    }

    // Keep legacy fields for debugging/visibility
    session.lastClientMsgId = clientMsgId;
    session.lastClientMsgAt = now;
  }

  // Handle widget open explicitly (human intro, stable, not routed)
  if (message === NYX_HELLO_TOKEN) {
    session.greeted = true;
    const payload = {
      ok: true,
      reply: nyxHello(session).reply || '',
      followUp: null,
      sessionId,
      serverMsgId,
    };
    setLast({ route, request: body, response: payload, error: null });
    return payload;
  }

  // Extract/learn name early (but NEVER from greetings / “Hi Nyx”)
  const nm = extractName(message);
  if (nm) session.displayName = nm;
  else if (!session.displayName && looksLikeBareName(message)) session.displayName = clean(message);

  if (message) {
    session.lastUserText = message;
    session.lastUserAt = now;
  }

  // Stable signature for request-hash dedupe:
  // - Use normalized message + lane hint from the message itself (so repeated "music" suppresses even if lane/state changes after first call)
  const msgNorm = normText(message || '');
  const laneHint = laneFromMessage(msgNorm) || inferLaneFromFreeText(message) || session.lane || 'general';
  const sig = `${laneHint}|${msgNorm}`;

  // HARD DEDUPE: suppress duplicate requests (retry bursts) even if other messages interleave.
  const reqHash = crypto.createHash('sha1').update(`${sessionId}::${sig}`).digest('hex');
  if (!session.reqHashSeen || typeof session.reqHashSeen.get !== 'function') session.reqHashSeen = new Map();

  const seenReqAt = session.reqHashSeen.get(reqHash) || 0;
  if (seenReqAt && now - seenReqAt < DUP_REQ_WINDOW_MS) {
    session.recentSuppressCount = (session.recentSuppressCount || 0) + 1;
    session.lastSuppressAt = now;

    const response = {
      ok: true,
      reply: '',
      followUp: null,
      noop: true,
      suppressed: true,
      suppressRender: true,
      sessionId,
      serverMsgId,
    };
    setLast({ route, request: body, response, error: null });
    return response;
  }

  session.reqHashSeen.set(reqHash, now);
  for (const [k, t] of session.reqHashSeen.entries()) {
    if (!t || now - t > DUP_REQ_WINDOW_MS) session.reqHashSeen.delete(k);
  }
  if (session.reqHashSeen.size > 250) {
    const entries = Array.from(session.reqHashSeen.entries()).sort((a, b) => a[1] - b[1]);
    const over = session.reqHashSeen.size - 250;
    for (let i = 0; i < over; i++) session.reqHashSeen.delete(entries[i][0]);
  }

  // Keep legacy fields for debugging/visibility
  session.lastReqHash = reqHash;
  session.lastReqAt = now;

  // Anti-loop suppression: same signature rapidly -> suppress visible output,
  // BUT if we’ve suppressed recently multiple times, stop suppressing and push forward motion.
  if (session.lastSig && sig === session.lastSig && now - (session.lastSigAt || 0) < ANTI_LOOP_WINDOW_MS) {
    const recent = now - (session.lastSuppressAt || 0) < 3000;
    const tooMany = (session.recentSuppressCount || 0) >= 1 && recent;

    if (tooMany) {
      const fm = forwardMotionNudge(session);
      const payload = {
        ok: true,
        reply: fm.reply || '',
        followUp: fm.followUp ?? null,
        sessionId,
        serverMsgId,
      };
      setLast({ route, request: body, response: payload, error: null });
      return payload;
    }

    session.recentSuppressCount = (session.recentSuppressCount || 0) + 1;
    session.lastSuppressAt = now;

    const response = {
      ok: true,
      reply: '',
      followUp: null,
      noop: true,
      suppressed: true,
      suppressRender: true,
      sessionId,
      serverMsgId,
    };
    setLast({ route, request: body, response: response, error: null });
    return response;
  }

  // Reset suppression counter on new sig
  session.recentSuppressCount = 0;
  session.lastSig = sig;
  session.lastSigAt = now;

  let response;

  // First turn / empty: intro line
  if (!message || isNearEmpty(message)) {
    const isFirstOpen = !session.turnCount || session.turnCount < 1;
    if (isFirstOpen) {
      session.greeted = true;
      response = nyxHello(session);
    } else {
      response = nyxComposeNoChips({
        signal: "I didn’t catch that.",
        moment: '',
        choice: 'Say it again in one line.',
      });
    }
  } else if (nm && looksLikeNameOnlyStatement(message)) {
    // Explicit name statement
    response = nyxNameAcknowledge(session, session.displayName);
  } else if (!nm && looksLikeBareName(message)) {
    // Bare-name statement, e.g., "Mac"
    response = nyxNameAcknowledge(session, session.displayName);
  } else if (isGreeting(message) || isNyxAddressedGreeting(message)) {
    session.greeted = true;
    response = nyxGreeting(session, message);
  } else if (isHowAreYou(message)) {
    response = nyxSocialReply(message, session);
  } else {
    const mLower = normText(message);

    if (isSwitchLanes(mLower)) {
      response = nyxComposeNoChips({
        signal: 'Sure.',
        moment: '',
        choice: 'What are we doing today?',
      });
    } else if (isResumeCommand(mLower)) {
      if (mLower.startsWith('resume music')) {
        session.lane = 'music';
        response = handleMusic('music', session);
      } else {
        response = nyxComposeNoChips({
          signal: 'Got it.',
          moment: '',
          choice: 'How can I help you?',
        });
      }
    } else {
      const lanePick = laneFromMessage(mLower);

      if (lanePick) {
        session.lane = lanePick;
        if (lanePick === 'music') response = handleMusic('music', session);
        else {
          // Acknowledge lane, then ask ONE guided next question (Layer 1), optionally tighter in AI (Layer 2)
          const nice = lanePick === 'ai' ? 'AI' : lanePick === 'tv' ? 'TV' : 'Sponsors';

          if (lanePick === 'ai' && NYX_INTELLIGENCE_LEVEL >= 2) {
            const sub = inferAiSubtopic(message);
            if (sub) session.aiSubtopic = sub;
          }

          let guided = nyxGuidedQuestionForLane(lanePick, session);
          if (lanePick === 'ai') guided = tightenAiGuidanceIfPossible(session, guided);

          response = nyxComposeNoChips({
            signal: `${nice} — got it.`,
            moment: '',
            choice: guided,
          });
        }
      } else {
        // Route by current lane
        if (session.lane === 'music' || session.musicState !== 'start') {
          response = handleMusic(message, session);
        } else {
          // General: acknowledge user content briefly, then advance with ONE next step.
          const inferred = inferLaneFromFreeText(message);
          if (inferred === 'music') {
            session.lane = 'music';
            response = handleMusic('music', session);
          } else if (inferred) {
            session.lane = inferred;

            if (inferred === 'ai' && NYX_INTELLIGENCE_LEVEL >= 2) {
              const sub = inferAiSubtopic(message);
              if (sub) session.aiSubtopic = sub;
            }

            let prompt = nyxGuidedQuestionForLane(inferred, session);
            if (inferred === 'ai') prompt = tightenAiGuidanceIfPossible(session, prompt);

            response = nyxComposeNoChips({
              signal: 'Got it.',
              moment: '',
              choice: prompt,
            });
          } else {
            const name = clean(session.displayName);
            const who = name ? `Got it, ${name}.` : 'Got it.';
            response = nyxComposeNoChips({
              signal: who,
              moment: '',
              choice: 'What are we doing today?',
            });
          }
        }
      }
    }
  }

  // Persist lightweight profile
  if (session.visitorId) {
    const patch = { lastLane: session.lane };
    if (session.displayName) patch.displayName = session.displayName;
    if (session.aiSubtopic) patch.aiSubtopic = session.aiSubtopic;
    if (session.lane === 'music') {
      if (session.musicYear) patch.musicYear = session.musicYear;
      if (session.musicChart) patch.musicChart = session.musicChart;
    }
    session.profile = touchProfile(session.visitorId, patch) || session.profile || null;
  }

  let replyText = response?.reply ?? '';
  let followUpFinal = response?.followUp ?? null;

  const de = nyxDeMeta(replyText, followUpFinal);
  replyText = de.reply;
  followUpFinal = de.followUp;

  applyReplyRepeatTracking(session, replyText);

  // If repeating too much, break the pattern with a new directive (forward motion)
  if ((session.repeatReplyCount || 0) >= MAX_REPEAT_REPLY) {
    const lb = loopBreakerReply(session);
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
    serverMsgId,
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
      outputFormat: clean(process.env.ELEVENLABS_OUTPUT_FORMAT) || 'mp3_44100_128',
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
    profiles: { enabled: PROFILES_ENABLED, persist: PROFILES_PERSIST, ttlDays: PROFILES_TTL_DAYS, count: PROFILES.size },
    sessions: { count: SESSIONS.size, ttlMinutes: SESSION_TTL_MINUTES, cleanupMinutes: SESSION_CLEANUP_MINUTES, cap: SESSION_CAP },
    nyx: {
      intelligenceLevel: NYX_INTELLIGENCE_LEVEL,
      antiLoopWindowMs: ANTI_LOOP_WINDOW_MS,
      repeatReplyWindowMs: REPEAT_REPLY_WINDOW_MS,
      maxRepeatReply: MAX_REPEAT_REPLY,
      dupReqWindowMs: DUP_REQ_WINDOW_MS,
      // visibility: dedupe caches are per-session; counts shown via /api/debug/last
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
      clientMsgId: clean(req.body?.clientMsgId) || '',
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
      serverMsgId: chat?.serverMsgId ?? null,
      suppressRender: chat?.suppressRender ?? false,
      audioBase64,
      audioBytes: audioBuf.length,
      audioMime: 'audio/mpeg',
    };

    setLast({
      route,
      request: { bytes: f.size, mimetype: f.mimetype, sttOpts, hasSessionId: !!req.body?.sessionId, hasVisitorId: !!req.body?.visitorId },
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
  const body = req && typeof req.body === 'object' ? req.body : {};
  try {
    const payload = runNyxChat(body);
    return res.status(200).json(payload);
  } catch (err) {
    const payload = { ok: false, error: 'SERVER_ERROR', message: 'Nyx hit an internal error.' };
    setLast({ route: '/api/chat', request: body, response: null, error: (err && err.message) || 'SERVER_ERROR' });
    return res.status(500).json(payload);
  }
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (build=${process.env.RENDER_GIT_COMMIT || 'local'})`);
});
