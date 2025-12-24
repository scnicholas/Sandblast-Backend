/**
 * Sandblast Backend — Nyx Intelligence Layer (Stabilized)
 * index.js (drop-in)
 *
 * Goals:
 * - Bulletproof API surface: /api/health, /api/chat, /api/debug/last
 * - CORS sane defaults for Webflow + local dev
 * - Consistent response schema
 * - Loop prevention: enforce "always advance" follow-up behavior
 * - 429 handling: suppress scary fallback, degrade gracefully
 */

'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// Optional: if you have these utilities already, keep paths consistent.
// If you do NOT have them, this file still runs without them.
let intentClassifier = null;
let musicKnowledge = null;

try { intentClassifier = require('./Utils/intentClassifier'); } catch (_) {}
try { musicKnowledge = require('./Utils/musicKnowledge'); } catch (_) {}

// -----------------------------
// CONFIG
// -----------------------------
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// CORS: allow Webflow preview + production + localhost.
// Add your exact domains here to tighten.
const ALLOWED_ORIGINS = new Set([
  'https://sandblast.channel',
  'https://www.sandblast.channel',
  'https://sandblastchannel.com',
  'https://www.sandblastchannel.com',
  'https://sandblast-channel-e69060.design.webflow.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 20000);

// -----------------------------
// APP SETUP
// -----------------------------
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use(cors({
  origin: function (origin, cb) {
    // Allow non-browser clients (no origin)
    if (!origin) return cb(null, true);

    // Exact match allow-list
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);

    // Allow Webflow subdomains (optional safety)
    if (/^https:\/\/.*\.webflow\.com$/.test(origin)) return cb(null, true);

    return cb(new Error('CORS blocked for origin: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Request ID + simple logging
app.use((req, res, next) => {
  const rid = req.headers['x-request-id'] || crypto.randomUUID();
  req.rid = rid;
  res.setHeader('X-Request-Id', rid);
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms rid=${rid}`);
  });

  next();
});

// -----------------------------
// LAST DEBUG STATE (for /api/debug/last)
// -----------------------------
const LAST = {
  at: null,
  rid: null,
  request: null,
  response: null,
  meta: null,
  error: null
};

function setLast({ rid, request, response, meta, error }) {
  LAST.at = new Date().toISOString();
  LAST.rid = rid || null;
  LAST.request = request || null;
  LAST.response = response || null;
  LAST.meta = meta || null;
  LAST.error = error || null;
}

// -----------------------------
// HELPERS
// -----------------------------
function asText(x) {
  if (x === null || x === undefined) return '';
  return String(x).trim();
}

function safeJson(res, status, payload) {
  res.status(status).json(payload);
}

function offlineStyleReply(userText) {
  // Short, helpful, no scary banners. Always advances.
  return {
    ok: true,
    mode: 'offline',
    reply: `I’m here. Quick check: are you asking about music, Sandblast, sponsors, or a site fix?\n\nIf it’s music, give me an artist + year (or a song title).`,
    followUp: {
      kind: 'slotfill',
      required: ['artist+year OR songTitle'],
      prompt: 'Give me an artist + year (or a song title).'
    }
  };
}

/**
 * Prevent loops: if Nyx can't answer, she MUST ask a targeted question.
 * This function enforces the "always advance" rule.
 */
function enforceAdvance(output, userText) {
  const reply = asText(output?.reply);
  const followUp = output?.followUp;

  // If the reply is empty or looks like a dead-end, force a follow-up.
  const deadEnd =
    !reply ||
    reply.toLowerCase() === 'ok' ||
    reply.toLowerCase().includes('i don’t know') ||
    reply.toLowerCase().includes('not sure') ||
    reply.toLowerCase().includes('cannot') ||
    reply.toLowerCase().includes('unable');

  if (deadEnd || !followUp) {
    return {
      ...output,
      reply: reply || `Got it. I need one detail to lock in the next step.`,
      followUp: followUp || {
        kind: 'slotfill',
        required: ['one detail'],
        prompt: 'Give me one detail (artist+year, song title, or what you want Nyx to do next).'
      }
    };
  }

  return output;
}

// -----------------------------
// ROUTES
// -----------------------------

// Basic health (fixes Cannot GET /api/health)
app.get('/api/health', (req, res) => {
  safeJson(res, 200, {
    ok: true,
    service: 'sandblast-backend',
    env: NODE_ENV,
    version: process.env.APP_VERSION || 'nyx-stable',
    time: new Date().toISOString()
  });
});

// Debug last (fixes Cannot GET /api/debug/last)
app.get('/api/debug/last', (req, res) => {
  safeJson(res, 200, { ok: true, last: LAST });
});

/**
 * Main chat endpoint
 * Expected body:
 * {
 *   "message": "hi",
 *   "sessionId": "optional",
 *   "context": { ... optional ... }
 * }
 */
app.post('/api/chat', async (req, res) => {
  const rid = req.rid;

  // Timeout guard
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const message = asText(req.body?.message);
    const sessionId = asText(req.body?.sessionId) || 'anon';
    const context = req.body?.context || {};

    if (!message) {
      const out = enforceAdvance({
        ok: true,
        mode: 'server',
        reply: 'I didn’t receive a message.',
        followUp: { kind: 'slotfill', required: ['message'], prompt: 'Type your message and hit Send.' }
      }, message);

      setLast({ rid, request: req.body, response: out, meta: { sessionId }, error: null });
      return safeJson(res, 200, out);
    }

    // Intent classification (optional module)
    let intent = { primary: 'general', confidence: 0.5, domain: 'general' };
    if (intentClassifier && typeof intentClassifier.classify === 'function') {
      try {
        intent = intentClassifier.classify(message, context) || intent;
      } catch (e) {
        // Do not fail the request
      }
    }

    // Music routing signals:
    // - domain says music_history, OR
    // - strong music regex
    // This captures "When was Madonna #1?" reliably.
    const looksMusic =
      (intent && (intent.domain === 'music_history' || intent.primary === 'music_history')) ||
      /billboard|hot\s*100|top40|top\s*40|top40weekly|chart|charts|#1|number\s*one|no\.?\s*1|music|song|artist|199\d|198\d|197\d|200\d/i.test(message);

    let out = null;

    // Music flow (preferred)
    if (looksMusic && musicKnowledge) {
      try {
        const fn = musicKnowledge.handleMessage || null;
        if (typeof fn === 'function') {
          // Pass context through so chart selection persists.
          out = await fn(message, { sessionId, context, intent, signal: controller.signal });
        }
      } catch (e) {
        // fall through to generic fallback
      }
    }

    // Generic fallback (if no module handled it)
    if (!out) {
      out = {
        ok: true,
        mode: 'server',
        reply: `I’ve got you. What do you want next: music moment, Sandblast info, sponsors, or a site/widget fix?`,
        followUp: {
          kind: 'choice',
          options: ['Music moment', 'Sandblast info', 'Sponsors/ads', 'Site/widget fix'],
          prompt: 'Pick one: Music moment, Sandblast info, Sponsors/ads, or Site/widget fix.'
        }
      };
    }

    // Enforce always-advance behavior
    out = enforceAdvance(out, message);

    // Store debug
    setLast({
      rid,
      request: req.body,
      response: out,
      meta: { sessionId, intent, looksMusic, chart: context?.chart || null },
      error: null
    });

    return safeJson(res, 200, out);
  } catch (err) {
    // 429 / rate-limit handling pattern:
    const msg = (err && err.message) ? String(err.message) : 'Unknown error';

    // If upstream throws a “429” somewhere, degrade gracefully.
    const is429 = /429|rate limit|too many requests/i.test(msg);

    const out = is429
      ? offlineStyleReply(asText(req.body?.message))
      : {
          ok: false,
          mode: 'server',
          error: 'SERVER_ERROR',
          reply: `Something broke on my side. Give me your last message again and I’ll continue cleanly.`,
          followUp: {
            kind: 'slotfill',
            required: ['repeat last message'],
            prompt: 'Copy/paste your last message again.'
          }
        };

    // Enforce advance even in errors
    const enforced = enforceAdvance(out, asText(req.body?.message));

    setLast({
      rid: req.rid,
      request: req.body,
      response: enforced,
      meta: null,
      error: { message: msg }
    });

    return safeJson(res, 200, enforced);
  } finally {
    clearTimeout(t);
  }
});

// -----------------------------
// NOT FOUND HANDLER
// -----------------------------
app.use((req, res) => {
  safeJson(res, 404, { ok: false, error: 'NOT_FOUND', path: req.originalUrl });
});

// -----------------------------
// START
// -----------------------------
app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (nyx-intel-layer1-stable) timeout=${REQUEST_TIMEOUT_MS}ms env=${NODE_ENV}`);
});
