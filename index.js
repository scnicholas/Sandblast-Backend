/**
 * Sandblast Backend — Nyx Intelligence Layer (Stabilized)
 * index.js (FINAL – JSON-safe)
 */

'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

let intentClassifier = null;
let musicKnowledge = null;

try { intentClassifier = require('./Utils/intentClassifier'); } catch (_) {}
try { musicKnowledge = require('./Utils/musicKnowledge'); } catch (_) {}

// -----------------------------
// CONFIG
// -----------------------------
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

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

// ✅ JSON parse error handler (THIS FIXES YOUR 400)
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: 'BAD_JSON',
      message: 'Request body is empty or invalid JSON.'
    });
  }
  next(err);
});

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    if (/^https:\/\/.*\.webflow\.com$/.test(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// -----------------------------
// REQUEST ID + LOGGING
// -----------------------------
app.use((req, res, next) => {
  const rid = req.headers['x-request-id'] || crypto.randomUUID();
  req.rid = rid;
  res.setHeader('X-Request-Id', rid);

  const start = Date.now();
  res.on('finish', () => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms rid=${rid}`
    );
  });
  next();
});

// -----------------------------
// DEBUG STATE
// -----------------------------
const LAST = { at: null, rid: null, request: null, response: null, meta: null, error: null };
const setLast = (o) => Object.assign(LAST, { at: new Date().toISOString(), ...o });

// -----------------------------
// HELPERS
// -----------------------------
const asText = (x) => (x == null ? '' : String(x).trim());

const enforceAdvance = (out, userText) => {
  if (out?.reply && out?.followUp) return out;
  return {
    ok: true,
    mode: out?.mode || 'server',
    reply: out?.reply || 'I need one detail to continue.',
    followUp: out?.followUp || {
      kind: 'slotfill',
      required: ['artist+year OR song title'],
      prompt: 'Give me an artist + year (or a song title).'
    }
  };
};

// -----------------------------
// ROUTES
// -----------------------------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'sandblast-backend',
    env: NODE_ENV,
    time: new Date().toISOString()
  });
});

app.get('/api/debug/last', (req, res) => {
  res.json({ ok: true, last: LAST });
});

app.post('/api/chat', async (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        ok: false,
        error: 'EMPTY_BODY',
        message: 'JSON body is required.'
      });
    }

    const message = asText(req.body.message);
    const sessionId = asText(req.body.sessionId) || 'anon';
    const context = req.body.context || {};

    if (!message) {
      const out = enforceAdvance({
        ok: true,
        reply: 'I didn’t receive a message.'
      });
      setLast({ rid: req.rid, request: req.body, response: out });
      return res.json(out);
    }

    let intent = { primary: 'general', domain: 'general' };
    if (intentClassifier?.classify) {
      intent = intentClassifier.classify(message, context) || intent;
    }

    const looksMusic =
      intent.domain === 'music_history' ||
      /#1|number\s*one|billboard|hot\s*100|top\s*40|song|artist|19\d{2}|20\d{2}/i.test(message);

    let out = null;

    if (looksMusic && musicKnowledge?.handleMessage) {
      out = await musicKnowledge.handleMessage(message, {
        sessionId,
        context,
        intent,
        signal: controller.signal
      });
    }

    if (!out) {
      out = {
        ok: true,
        reply: 'What would you like to explore next?',
        followUp: {
          kind: 'choice',
          options: ['Music moment', 'Sandblast info', 'Sponsors', 'Site help'],
          prompt: 'Pick one.'
        }
      };
    }

    out = enforceAdvance(out, message);
    setLast({ rid: req.rid, request: req.body, response: out, meta: { intent } });

    return res.json(out);
  } catch (err) {
    const out = enforceAdvance({
      ok: false,
      error: 'SERVER_ERROR',
      reply: 'Something went wrong. Please resend your last message.'
    });
    setLast({ rid: req.rid, request: req.body, response: out, error: err.message });
    return res.json(out);
  } finally {
    clearTimeout(timer);
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'NOT_FOUND' });
});

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} — intel-layer stable`);
});
