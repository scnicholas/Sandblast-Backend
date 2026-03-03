'use strict';

/**
 * server.js (UPGRADED TEMPLATE)
 *
 * Hardened HTTP entrypoint for Nyx/Nix backend.
 *
 * Goals:
 * - Wire TTS route to Resemble-first handler (utils/tts.js)
 * - Deterministic health endpoints
 * - Safe timeouts + request size guards
 * - No secret leakage
 *
 * IMPORTANT:
 * - If you already have an existing server.js, merge these changes rather than replacing blindly.
 */

const express = require('express');
const cors = require('cors');

function bool(v, def = false) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return def;
  if (['1','true','yes','y','on'].includes(s)) return true;
  if (['0','false','no','n','off'].includes(s)) return false;
  return def;
}

function int(v, def, lo, hi) {
  const n = parseInt(String(v || ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

function makeTraceId(inbound) {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  const base = `tr_${t}_${r}`;
  if (!inbound) return base;
  const s = String(inbound).trim();
  return (s && s.length <= 96) ? s : base;
}

// Load TTS handler with filename fallbacks to prevent "silent no-audio".
function loadTtsHandler() {
  const candidates = [
    './utils/tts',
    './tts',
    './utils/tts.js',
    './tts.js',
  ];
  for (const p of candidates) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const mod = require(p);
      if (mod && typeof mod.handleTts === 'function') return mod.handleTts;
    } catch (_) {}
  }
  return null;
}

const handleTts = loadTtsHandler();

const app = express();

// ---- Core middleware
const enableCors = bool(process.env.SB_CORS, true);
if (enableCors) {
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-SB-Trace-Id', 'Authorization'],
    exposedHeaders: ['X-SB-Trace-Id', 'X-SB-TTS-Provider', 'X-SB-TTS-Ms', 'X-SB-TTS-Upstream-Ms', 'X-SB-TTS-Upstream-Status'],
  }));
}

const bodyLimit = process.env.SB_BODY_LIMIT || '256kb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.text({ limit: bodyLimit, type: ['text/*', 'application/text'] }));

// traceId header helper
app.use((req, res, next) => {
  const inbound = req.get('X-SB-Trace-Id') || req.get('x-sb-trace-id');
  const traceId = makeTraceId(inbound);
  res.set('X-SB-Trace-Id', traceId);
  req._sbTraceId = traceId;
  next();
});

// ---- Health
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({ ok: true, service: 'nyx-backend', traceId: req._sbTraceId || null, ts: Date.now() });
});

// ---- TTS
if (!handleTts) {
  // Fail-open: keep server alive but surface deterministic miswire.
  app.post(['/tts', '/api/tts', '/v1/tts'], (req, res) => {
    res.status(500).json({ ok: false, error: 'TTS_HANDLER_MISSING', message: 'handleTts could not be loaded. Check path ./utils/tts.js (or ./tts.js).', traceId: req._sbTraceId || null });
  });
} else {
  // Standard TTS routes
  app.post(['/tts', '/api/tts', '/v1/tts'], (req, res) => handleTts(req, res));

  // Quick probe endpoint for wiring tests
  app.get(['/tts/probe', '/api/tts/probe'], (req, res) => {
    req.body = { text: 'Quick audio check.', healthCheck: true };
    return handleTts(req, res);
  });
}

// ---- Hard timeouts (avoid hanging sockets)
const serverTimeoutMs = int(process.env.SB_SERVER_TIMEOUT_MS, 65000, 10000, 180000);
const keepAliveTimeoutMs = int(process.env.SB_KEEPALIVE_TIMEOUT_MS, 61000, 5000, 180000);
const headersTimeoutMs = int(process.env.SB_HEADERS_TIMEOUT_MS, 66000, 5000, 180000);

// ---- Error handler (never leak secrets)
app.use((err, req, res, _next) => {
  const msg = err && err.message ? String(err.message) : 'Server error';
  try { res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: msg.slice(0, 240), traceId: req._sbTraceId || null }); }
  catch (_) { try { res.status(500).type('text/plain').send('Server error'); } catch (_) {} }
});

const port = int(process.env.PORT || process.env.SB_PORT, 3000, 1, 65535);
const host = (process.env.SB_HOST || '0.0.0.0').toString();

const server = app.listen(port, host, () => {
  // Minimal boot log (no env dump)
  console.log(`[nyx] server listening on http://${host}:${port}`);
});

// Apply timeouts (Node http.Server)
server.setTimeout(serverTimeoutMs);
server.keepAliveTimeout = keepAliveTimeoutMs;
server.headersTimeout = headersTimeoutMs;

module.exports = { app, server };
