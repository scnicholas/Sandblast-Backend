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
 *  - Nyx Voice Naturalizer to make ElevenLabs output more human-like
 *
 * CRITICAL UPDATES:
 *  - Year override while musicState=ready (typing a year switches year instead of reverting)
 *  - Top 10 quality guard (prevents dumping mostly-Unknown Title lists)
 *  - Safer formatTopItem (repairs Jay—Z fragments + basic split heuristics)
 *
 * NEW (critical for #6 on your intelligence list):
 *  - Lightweight "memory continuity across visits" (NOT creepy)
 *    - Client supplies visitorId (random UUID stored in localStorage)
 *    - Backend stores only lane + last music year/chart + last seen timestamp + preferred chart (optional)
 *    - TTL expiry (default 30 days)
 *    - Optional persistence to ./Data/nyx_profiles.json (best effort; env-gated)
 *
 * NEW:
 *  - SESSION_TTL cleanup: prevents SESSIONS Map from growing forever on Render
 *    - TTL default 6 hours, cap default 1500 sessions
 *    - Tracks lastActiveAt; cleanup runs every 20 minutes
 *
 * NEW (No.4):
 *  - Anticipatory follow-ups (“Most people ask this next…”)
 *    - Backend-only: automatically populates followUp when absent
 *    - Avoids repeating the same follow-up set back-to-back per session
 *
 * NEW (micro-upgrade):
 *  - Lane-transition aware follow-ups:
 *    - If user mentions another lane while in current lane, chips surface a "Switch to X"
 *    - Optional micro-step: normalizeLanePick understands "Switch to TV", "Go to Sponsors", "TV mode", etc.
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');

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
   LIGHTWEIGHT MEMORY (PROFILES)
========================= */

const PROFILE_TTL_MS = Number(process.env.NYX_PROFILE_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;
const PROFILE_PERSIST = String(process.env.NYX_PROFILE_PERSIST || '').toLowerCase() === '1';
const PROFILE_PATH =
  process.env.NYX_PROFILE_PATH ||
  path.join(process.cwd(), 'Data', 'nyx_profiles.json');

/**
 * visitorId -> { lastSeenAt, lastLane, musicYear, musicChart, musicPrefChart }
 */
const PROFILES = new Map();

let _profileSaveTimer = null;

function nowMs() {
  return Date.now();
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

function readProfilesFromDiskBestEffort() {
  if (!PROFILE_PERSIST) return;
  try {
    if (!fs.existsSync(PROFILE_PATH)) return;
    const raw = fs.readFileSync(PROFILE_PATH, 'utf8');
    const obj = safeJsonParse(raw);
    if (!obj || typeof obj !== 'object') return;

    const entries = Object.entries(obj);
    for (const [visitorId, p] of entries) {
      if (!visitorId || typeof p !== 'object' || !p) continue;

      const lastSeenAt = Number(p.lastSeenAt || 0);
      if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) continue;

      const musicYear = Number.isFinite(Number(p.musicYear)) ? Number(p.musicYear) : null;
      const musicChart = typeof p.musicChart === 'string' && p.musicChart.trim() ? String(p.musicChart) : null;
      const musicPrefChart =
        typeof p.musicPrefChart === 'string' && p.musicPrefChart.trim() ? String(p.musicPrefChart) : null;

      PROFILES.set(visitorId, {
        lastSeenAt,
        lastLane: String(p.lastLane || 'general'),
        musicYear,
        musicChart,
        musicPrefChart,
      });
    }
  } catch (e) {
    console.warn('[Nyx] profile load failed:', e?.message || e);
  }
}

function scheduleProfilesSaveBestEffort() {
  if (!PROFILE_PERSIST) return;
  if (_profileSaveTimer) return;

  _profileSaveTimer = setTimeout(() => {
    _profileSaveTimer = null;
    try {
      const dir = path.dirname(PROFILE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const out = {};
      for (const [k, v] of PROFILES.entries()) out[k] = v;

      fs.writeFileSync(PROFILE_PATH, JSON.stringify(out, null, 2), 'utf8');
    } catch (e) {
      console.warn('[Nyx] profile save failed:', e?.message || e);
    }
  }, 650);
}

function cleanupExpiredProfiles() {
  const cutoff = nowMs() - PROFILE_TTL_MS;
  let removed = 0;

  for (const [visitorId, p] of PROFILES.entries()) {
    if (!p || !Number.isFinite(Number(p.lastSeenAt)) || p.lastSeenAt < cutoff) {
      PROFILES.delete(visitorId);
      removed++;
    }
  }

  if (removed > 0) scheduleProfilesSaveBestEffort();
}

function asVisitorId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^[a-f0-9-]{16,64}$/i.test(s)) return '';
  return s;
}

function getProfile(visitorId) {
  const id = asVisitorId(visitorId);
  if (!id) return null;

  cleanupExpiredProfiles();
  return PROFILES.get(id) || null;
}

function touchProfile(visitorId, patch) {
  const id = asVisitorId(visitorId);
  if (!id) return null;

  cleanupExpiredProfiles();

  const prev = PROFILES.get(id) || {
    lastSeenAt: 0,
    lastLane: 'general',
    musicYear: null,
    musicChart: null,
    musicPrefChart: null,
  };

  const next = {
    ...prev,
    ...patch,
    lastSeenAt: nowMs(),
  };

  if (!['general', 'music', 'tv', 'sponsors', 'ai'].includes(String(next.lastLane))) {
    next.lastLane = 'general';
  }

  if (next.musicYear !== null) {
    const y = Number(next.musicYear);
    if (!Number.isFinite(y) || y < 1970 || y > 2010) next.musicYear = null;
  }

  if (next.musicChart !== null && typeof next.musicChart !== 'string') next.musicChart = null;
  if (typeof next.musicChart === 'string' && !next.musicChart.trim()) next.musicChart = null;

  if (next.musicPrefChart !== null && typeof next.musicPrefChart !== 'string') next.musicPrefChart = null;
  if (typeof next.musicPrefChart === 'string' && !next.musicPrefChart.trim()) next.musicPrefChart = null;

  PROFILES.set(id, next);
  scheduleProfilesSaveBestEffort();
  return next;
}

// Load profiles on startup (best-effort)
readProfilesFromDiskBestEffort();
// Periodic cleanup
setInterval(cleanupExpiredProfiles, 60 * 60 * 1000).unref?.();

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

/**
 * Optional micro-step:
 * Allow friendly lane-switch phrases:
 * - "switch to tv", "go to sponsors", "tv mode", etc
 * - chips like "Switch to TV" are now parsed correctly
 */
function normalizeLanePick(raw) {
  const s0 = clean(raw).toLowerCase();
  if (!s0) return null;

  // Common “switch” / “go to” / “mode” wrappers
  const s = s0
    .replace(/\b(switch|go|goto|move|take)\s+(to|into)\s+/g, '')
    .replace(/\b(switch|go|goto|move|take)\s+/g, '')
    .replace(/\bmode\b/g, '')
    .replace(/\blane\b/g, '')
    .trim();

  // Also support "Switch to TV" -> "switchtotv" -> remove non-letters
  const cleaned = s.replace(/[^a-z]/g, '');

  if (cleaned === 'music') return 'music';
  if (cleaned === 'tv' || cleaned === 'tvs' || cleaned === 'television') return 'tv';
  if (cleaned === 'sponsors' || cleaned === 'sponsor' || cleaned === 'ads' || cleaned === 'advertising')
    return 'sponsors';
  if (cleaned === 'ai') return 'ai';
  if (cleaned === 'general') return 'general';

  return null;
}

function lanePickerReply(session) {
  const lastLane = session?.profile?.lastLane;
  const isResumeCandidate = lastLane && lastLane !== 'general';

  if (isResumeCandidate && lastLane === 'music') {
    const y = session?.profile?.musicYear;
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

  let artist = clean(item?.artist);
  let title = clean(item?.title);

  if (artist) {
    artist = artist
      .replace(/\bJay\s*[—–-]\s*Z\b/gi, 'Jay-Z')
      .replace(/\bJay\s*,\s*Z\b/gi, 'Jay-Z')
      .replace(/\bJay\s+Z\b/gi, 'Jay-Z');
  }

  const sep = /\s[—–-]\s/;
  if ((!title || /unknown title/i.test(title)) && artist && sep.test(artist)) {
    const parts = artist.split(sep).map(clean).filter(Boolean);

    if (parts.length === 2) {
      if (/^jay$/i.test(parts[0]) && /^z$/i.test(parts[1])) {
        artist = 'Jay-Z';
        title = title || 'Unknown Title';
      } else {
        artist = parts[0];
        title = parts[1];
      }
    } else if (parts.length > 2) {
      artist = parts[0];
      title = parts.slice(1).join(' ');
    }
  }

  if (!artist) artist = 'Unknown Artist';
  if (!title) title = 'Unknown Title';

  return `${rank}. ${artist} — ${title}`;
}

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}

/* =========================
   LANE-TRANSITION AWARENESS (micro-upgrade)
========================= */

function laneMentionInText(userText) {
  const u = clean(userText).toLowerCase();
  if (!u) return null;

  const has = (re) => re.test(u);

  // Conservative lane signals (avoid accidental switches)
  if (has(/\b(tv|television|shows?|series|episode)\b/)) return 'tv';
  if (has(/\b(music|song|songs|artist|billboard|hot\s*100|top\s*10|top\s*ten|#1|number\s+one)\b/))
    return 'music';
  if (has(/\b(sponsor|sponsors|advertiser|advertising|ads|packages|pricing)\b/)) return 'sponsors';
  if (has(/\b(ai|artificial\s+intelligence|automation|agent|chatbot|llm)\b/)) return 'ai';

  return null;
}

function capLane(lane) {
  if (lane === 'tv') return 'TV';
  if (lane === 'ai') return 'AI';
  if (!lane) return '';
  return lane.charAt(0).toUpperCase() + lane.slice(1);
}

/**
 * Adds a "Switch to X" chip if user mentions another lane
 * and keeps chip labels parseable by normalizeLanePick().
 */
function applyLaneTransitionFollowUps(session, baseList, userText) {
  const laneNow = session?.lane || 'general';
  const mentioned = laneMentionInText(userText);

  if (mentioned && mentioned !== laneNow) {
    const list = Array.isArray(baseList) ? [...baseList] : [];

    const switchChip = `Switch to ${capLane(mentioned)}`;
    const stayChip = laneNow !== 'general' ? capLane(laneNow) : null;

    if (!list.some((x) => clean(x).toLowerCase() === clean(switchChip).toLowerCase())) {
      list.unshift(switchChip);
    }

    // Optional "stay" affordance (only if it’s not already represented)
    if (stayChip && !list.some((x) => clean(x).toLowerCase() === clean(stayChip).toLowerCase())) {
      list.push(stayChip);
    }

    // Keep chips tight
    return list.slice(0, 5);
  }

  return baseList;
}

/* =========================
   ANTICIPATORY FOLLOW-UP ENGINE (No.4)
========================= */

function normFU(s) {
  return clean(s).toLowerCase();
}

function followSig(list) {
  const a = (Array.isArray(list) ? list : []).map(normFU).filter(Boolean);
  return a.join('|');
}

/**
 * Prevent repeating the same followUp set back-to-back.
 * Stores lastFollowSig on session.
 */
function setFollowUp(session, proposed) {
  const list = Array.isArray(proposed) ? proposed.filter(Boolean) : null;
  if (!list || list.length === 0) return null;

  const sig = followSig(list);
  if (sig && session.lastFollowSig && sig === session.lastFollowSig) return null;

  session.lastFollowSig = sig || null;
  return list;
}

function wantsSurprise(userText) {
  const t = clean(userText).toLowerCase();
  return (
    t === 'surprise me' ||
    t === 'surprise' ||
    t === 'random' ||
    t === "dealer's choice" ||
    t === 'dealer’s choice'
  );
}

function looksLikeTopRequest(userText) {
  const t = clean(userText).toLowerCase();
  return t === 'top 10' || t === 'top10' || t.includes('top 10') || t.includes('top ten');
}

function looksLikeNo1Request(userText) {
  const t = clean(userText).toLowerCase();
  return (
    t === '#1' ||
    t === '1' ||
    t === 'number 1' ||
    t === 'no. 1' ||
    t === 'no 1' ||
    t.includes(' #1')
  );
}

function looksLikeStoryRequest(userText) {
  const t = clean(userText).toLowerCase();
  return t === 'story' || t === 'story moment' || t.includes('story moment') || t.includes('story');
}

function tryExtractYearFromUser(userText) {
  const t = clean(userText);
  if (!/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n < 1970 || n > 2010) return null;
  return n;
}

function preferredMusicCharts(session) {
  const pref = clean(session?.profile?.musicPrefChart || '');
  const base = ['Billboard Year-End Hot 100', 'Top40Weekly Top 100', 'Billboard Hot 100'];

  if (pref && base.includes(pref)) {
    return [pref, ...base.filter((x) => x !== pref)];
  }
  return base;
}

/**
 * Lane-aware + user-text-aware anticipatory follow-ups:
 * - Reacts to what user just said (not only replyText)
 * - Adds lane-transition chips when user hints at another lane
 */
function getAnticipatoryFollowUp(session, replyText, explicitFollowUp, userText) {
  const existing = setFollowUp(session, explicitFollowUp);
  if (existing) return existing;

  const lane = session?.lane || 'general';
  const r = clean(replyText).toLowerCase();
  const u = clean(userText).toLowerCase();

  if (lane === 'music') {
    const st = session.musicState;

    if (wantsSurprise(u)) {
      if (st === 'need_year')
        return (
          setFollowUp(
            session,
            applyLaneTransitionFollowUps(session, ['1984', '1988', '1990', '1999'], userText)
          ) || null
        );

      if (st === 'need_chart')
        return (
          setFollowUp(
            session,
            applyLaneTransitionFollowUps(session, preferredMusicCharts(session), userText)
          ) || null
        );

      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['Top 10', '#1', 'Story moment'], userText)
        ) || null
      );
    }

    const y = tryExtractYearFromUser(u);
    if (y && st === 'ready') {
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, preferredMusicCharts(session), userText)
        ) || null
      );
    }

    if (looksLikeTopRequest(u))
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['#1', 'Story moment', 'Another year'], userText)
        ) || null
      );

    if (looksLikeNo1Request(u))
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['Story moment', 'Top 10', 'Another year'], userText)
        ) || null
      );

    if (looksLikeStoryRequest(u))
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['#1', 'Top 10', 'Another year'], userText)
        ) || null
      );

    if (st === 'need_year') {
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['1984', '1988', '1990', '1999'], userText)
        ) || null
      );
    }

    if (st === 'need_chart') {
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, preferredMusicCharts(session), userText)
        ) || null
      );
    }

    if (st === 'ready') {
      if (r.includes('top 10') || r.includes('top ten')) {
        return (
          setFollowUp(
            session,
            applyLaneTransitionFollowUps(session, ['#1', 'Story moment', 'Another year'], userText)
          ) || null
        );
      }

      if (r.includes('#1') || r.includes('number one') || r.includes('no. 1')) {
        return (
          setFollowUp(
            session,
            applyLaneTransitionFollowUps(session, ['Story moment', 'Top 10', 'Another year'], userText)
          ) || null
        );
      }

      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['Top 10', '#1', 'Story moment'], userText)
        ) || null
      );
    }

    return (
      setFollowUp(
        session,
        applyLaneTransitionFollowUps(session, ['Top 10', '#1', 'Another year'], userText)
      ) || null
    );
  }

  if (lane === 'tv') {
    if (u.includes('western'))
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['Wagon Train', 'Gunsmoke', 'Have a classic pick'], userText)
        ) || null
      );

    if (u.includes('detective') || u.includes('crime'))
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['Detective picks', 'Classic noir vibe', 'One hidden gem'], userText)
        ) || null
      );

    if (r.includes('tell me a show') || r.includes('genre') || r.includes('vibe'))
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['Classic Western', 'Detective', 'Comedy', 'Surprise me'], userText)
        ) || null
      );

    return (
      setFollowUp(
        session,
        applyLaneTransitionFollowUps(session, ['Suggest a show', 'Tonight’s vibe', 'Top picks'], userText)
      ) || null
    );
  }

  if (lane === 'sponsors') {
    if (r.includes('business name') || r.includes('goal'))
      return (
        setFollowUp(
          session,
          applyLaneTransitionFollowUps(session, ['Calls', 'Walk-ins', 'Awareness', 'Lead form'], userText)
        ) || null
      );

    return (
      setFollowUp(
        session,
        applyLaneTransitionFollowUps(session, ['Offer packages', 'Ad script', 'Targeting'], userText)
      ) || null
    );
  }

  if (lane === 'ai') {
    return (
      setFollowUp(
        session,
        applyLaneTransitionFollowUps(session, ['Feature idea', 'Implementation plan', 'Demo script'], userText)
      ) || null
    );
  }

  return (
    setFollowUp(
      session,
      applyLaneTransitionFollowUps(session, ['Music', 'TV', 'Sponsors', 'AI'], userText)
    ) || null
  );
}

/* =========================
   NYX VOICE NATURALIZER
========================= */

function nyxVoiceNaturalize(raw) {
  let s = asText(raw);
  if (!s) return s;

  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/[•●◦▪︎]+/g, '-');
  s = s.replace(/#\s*1\b/g, 'number one');
  s = s.replace(/[—–]/g, ', ');
  s = s.replace(/\s*,\s*,/g, ', ');
  s = s.replace(/\bTop\s*10\b/gi, 'Top ten');
  s = s.replace(/\bTop\s*100\b/gi, 'Top one hundred');
  s = s.replace(/(^|\n)\s*(\d{1,2})\.\s+/g, (m, p1, n) => `${p1}Number ${n}: `);
  s = s.replace(/\s-\s/g, ', ');
  s = s.replace(/\bJay\s*,\s*Z\b/gi, 'Jay-Z');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/\nNumber\s/g, '.\nNumber ');
  s = s.replace(/\.\./g, '.');

  return s.trim();
}

/* =========================
   SESSIONS + SESSION_TTL CLEANUP
========================= */

const SESSIONS = new Map();

// TTL + cap (Render safety)
const SESSION_TTL_MS = Number(process.env.NYX_SESSION_TTL_MINUTES || 360) * 60 * 1000; // default 6 hours
const SESSION_CLEANUP_INTERVAL_MS = Number(process.env.NYX_SESSION_CLEANUP_MINUTES || 20) * 60 * 1000; // default 20 min
const MAX_SESSIONS = Number(process.env.NYX_MAX_SESSIONS || 1500);

function cleanupExpiredSessions() {
  const cutoff = nowMs() - SESSION_TTL_MS;
  let removed = 0;

  // 1) Remove idle sessions by lastActiveAt
  for (const [id, s] of SESSIONS.entries()) {
    const lastActiveAt = Number(s?.lastActiveAt || 0);
    if (!Number.isFinite(lastActiveAt) || lastActiveAt < cutoff) {
      SESSIONS.delete(id);
      removed++;
    }
  }

  // 2) Hard cap: if still too many, drop oldest by lastActiveAt
  const over = SESSIONS.size - MAX_SESSIONS;
  if (over > 0) {
    const arr = [];
    for (const [id, s] of SESSIONS.entries()) {
      arr.push([id, Number(s?.lastActiveAt || 0)]);
    }
    arr.sort((a, b) => (a[1] || 0) - (b[1] || 0)); // oldest first
    for (let i = 0; i < over; i++) {
      const id = arr[i]?.[0];
      if (id) {
        SESSIONS.delete(id);
        removed++;
      }
    }
  }

  if (removed > 0) {
    console.log(
      `[Nyx] session cleanup: removed=${removed} size=${SESSIONS.size} ttlMin=${Math.round(
        SESSION_TTL_MS / 60000
      )} cap=${MAX_SESSIONS}`
    );
  }
}

// background cleanup (Render-safe)
setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL_MS).unref?.();

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

      // anti-loop
      lastSig: null,
      lastSigAt: 0,

      // user input memory (for follow-ups)
      lastUserText: '',
      lastUserSig: '',

      // follow-up de-dupe
      lastFollowSig: null,

      // music state
      musicState: 'start',
      musicYear: profile?.musicYear ?? null,
      musicChart: profile?.musicChart ?? null,
    };

    if (s.lane === 'music' && s.musicYear && s.musicChart) s.musicState = 'ready';
    else if (s.lane === 'music' && s.musicYear && !s.musicChart) s.musicState = 'need_chart';
    else if (s.lane === 'music' && !s.musicYear) s.musicState = 'need_year';

    SESSIONS.set(id, s);
  }

  const session = SESSIONS.get(id);
  if (session) session.lastActiveAt = Date.now();
  return session;
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

function chartsForYear() {
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

    // preference bias: remember last chosen chart as "preferred"
    if (session.profile) {
      session.profile.musicPrefChart = picked;
    }
    if (session.visitorId) {
      touchProfile(session.visitorId, { musicPrefChart: picked });
    }

    return {
      reply: `Locked in: ${picked}, ${year}.\nNow tell me one of these:\n• Top 10\n• #1\n• Story moment`,
      followUp: ['Top 10', '#1', 'Story moment'],
    };
  }

  if (session.musicState === 'ready') {
    const maybeYear = isYear(text);
    if (maybeYear && maybeYear >= 1970 && maybeYear <= 2010) {
      session.musicYear = maybeYear;
      session.musicState = 'need_chart';
      session.musicChart = null;

      const opts = chartsForYear(maybeYear).map((o) => o.chart).slice(0, 5);
      return {
        reply: `Got it — ${maybeYear}.\nPick a chart:\n• ${opts.join('\n• ')}`,
        followUp: opts,
      };
    }

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

        const unknownCount = top10.filter(
          (r) => !clean(r?.title) || /unknown title/i.test(String(r?.title || ''))
        ).length;

        if (unknownCount >= Math.ceil(top10.length * 0.6)) {
          const preferred = ['Billboard Year-End Hot 100', 'Top40Weekly Top 100'];
          const fallbacks = ['UK Singles Chart', 'Canada RPM'].filter((c) => c !== chart);
          return {
            reply:
              `I can see entries for ${chart} (${year}), but titles are missing in the current dataset.\n` +
              `For clean titles, pick Year-End (best) or Top40Weekly, or choose another year.`,
            followUp: [...preferred, 'Another year', ...fallbacks.slice(0, 2)],
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
  const t1 = asText(req.body?.text);
  if (t1) return t1;

  const t2 = asText(req.body?.message);
  if (t2) return t2;

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

app.post('/api/tts', async (req, res) => ttsHandler(req, res, '/api/tts'));
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
    profiles: {
      enabled: true,
      persist: PROFILE_PERSIST,
      ttlDays: Number(process.env.NYX_PROFILE_TTL_DAYS || 30),
      count: PROFILES.size,
    },
    sessions: {
      count: SESSIONS.size,
      ttlMinutes: Math.round(SESSION_TTL_MS / 60000),
      cleanupMinutes: Math.round(SESSION_CLEANUP_INTERVAL_MS / 60000),
      cap: MAX_SESSIONS,
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
  const visitorId = asVisitorId(body?.visitorId);
  const session = getSession(sessionId, visitorId);

  // touch active
  session.lastActiveAt = Date.now();

  if (visitorId) {
    session.visitorId = visitorId;
    session.profile = getProfile(visitorId) || session.profile || null;
  }

  const now = Date.now();
  const sig = sigOf(message);

  // store last user input for lane-aware follow-ups
  session.lastUserText = message || '';
  session.lastUserSig = sig || '';

  if (sig && sig === session.lastSig && now - session.lastSigAt < 900) {
    const response = { ok: true, reply: '', followUp: null, noop: true, suppressed: true, sessionId };
    setLast({ route, request: body, response, error: null });
    return res.status(200).json(response);
  }
  session.lastSig = sig;
  session.lastSigAt = now;

  try {
    let response;

    if (!message) {
      if (!session.greeted) {
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
      const t = clean(message).toLowerCase();
      const wantsResume =
        t === 'resume' ||
        t.startsWith('resume music') ||
        t === 'resume music' ||
        t === 'continue' ||
        t === 'pick up';

      if (wantsResume && session.profile?.lastLane) {
        const lastLane = session.profile.lastLane;

        session.lane = lastLane;

        if (lastLane === 'music') {
          session.musicYear = session.profile.musicYear || session.musicYear || null;
          session.musicChart = session.profile.musicChart || session.musicChart || null;

          if (session.musicYear && session.musicChart) session.musicState = 'ready';
          else if (session.musicYear && !session.musicChart) session.musicState = 'need_chart';
          else session.musicState = 'need_year';

          if (session.musicState === 'ready') {
            response = {
              reply: `Welcome back.\nWe’re set to ${session.musicChart}, ${session.musicYear}.\nDo you want Top 10, #1, or a story moment?`,
              followUp: ['Top 10', '#1', 'Story moment'],
            };
          } else if (session.musicState === 'need_chart') {
            const opts = chartsForYear(session.musicYear).map((o) => o.chart).slice(0, 5);
            response = {
              reply: `Welcome back.\nFor ${session.musicYear}, pick a chart:\n• ${opts.join('\n• ')}`,
              followUp: opts,
            };
          } else {
            response = { reply: 'Welcome back.\nGive me a year between 1970 and 2010.', followUp: null };
          }
        } else if (lastLane === 'tv') {
          response = { reply: 'Welcome back.\nTV mode.\nTell me a show, a genre, or the vibe you want.', followUp: null };
        } else if (lastLane === 'sponsors') {
          response = {
            reply: 'Welcome back.\nSponsors mode.\nWhat’s the business name and the goal—calls, walk-ins, or awareness?',
            followUp: ['Calls', 'Walk-ins', 'Awareness'],
          };
        } else if (lastLane === 'ai') {
          response = {
            reply: 'Welcome back.\nAI mode.\nAre we talking features, implementation, or a demo?',
            followUp: ['Features', 'Implementation', 'Demo'],
          };
        } else {
          response = lanePickerReply(session);
        }
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
          else response = lanePickerReply(session);
        } else {
          if (session.lane === 'music') response = handleMusic(message, session);
          else response = lanePickerReply(session);
        }
      }
    }

    // profile update
    if (session.visitorId) {
      const patch = { lastLane: session.lane };
      if (session.lane === 'music') {
        if (session.musicYear) patch.musicYear = session.musicYear;
        if (session.musicChart) patch.musicChart = session.musicChart;
        if (session.profile?.musicPrefChart) patch.musicPrefChart = session.profile.musicPrefChart;
      }

      const updated = touchProfile(session.visitorId, patch);
      session.profile = updated || session.profile || null;
    }

    // Anticipatory follow-ups (No.4) + lane-transition aware + de-dupe
    const replyText = response?.reply ?? '';
    const followUpFinal = getAnticipatoryFollowUp(
      session,
      replyText,
      response?.followUp ?? null,
      session.lastUserText || ''
    );

    const payload = {
      ok: true,
      reply: replyText,
      followUp: followUpFinal,
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
      try { sock.destroy(); } catch (_) {}
      resolve(true);
    });
    sock.once('timeout', () => {
      if (!done) {
        done = true;
        try { sock.destroy(); } catch (_) {}
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

  if (PROFILE_PERSIST) {
    console.log('[Nyx] profiles persist: ON path=' + PROFILE_PATH);
  } else {
    console.log('[Nyx] profiles persist: OFF (env NYX_PROFILE_PERSIST=1 to enable)');
  }

  console.log(
    `[Nyx] sessions ttlMin=${Math.round(SESSION_TTL_MS / 60000)} cleanupMin=${Math.round(
      SESSION_CLEANUP_INTERVAL_MS / 60000
    )} cap=${MAX_SESSIONS}`
  );
});

server.on('error', (err) => {
  console.error('[Nyx] SERVER_ERROR', err?.code || '', err?.message || err);
});
