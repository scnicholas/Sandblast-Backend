'use strict';

/**
 * LingoSentinelSubscribeTokenRoute
 *
 * Backend-safe Ably token route for LingoSentinel subscribers.
 *
 * Purpose:
 * - Keep ABLY_ROOT_API_KEY backend-only.
 * - Give widget/client a short-lived Ably token request.
 * - Restrict access to expected LingoSentinel channels.
 * - Support 1:1 Chat, Group Room, Live Translate, and Delivered lanes.
 *
 * Mount example in root index.js:
 *
 * const LingoSentinelSubscribeTokenRoute = require('./Data/marion/runtime/LingoSentinelSubscribeTokenRoute');
 * app.use('/api/lingosentinel', LingoSentinelSubscribeTokenRoute);
 *
 * Endpoint:
 * POST /api/lingosentinel/token
 */

const express = require('express');

const VERSION = 'nyx.lingosentinel.subscribeTokenRoute/1.1-private-voice-compatible';

const router = express.Router();

const DEFAULT_CLIENT_ID = 'lingosentinel-widget';
const DEFAULT_ROOM_ID = 'command-nexus-test';
const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutes

const VALID_MODES = Object.freeze([
  'one_to_one',
  'group_room',
  'live_translate',
  'delivered'
]);

const MODE_ALIASES = Object.freeze({
  one: 'one_to_one',
  one_to_one: 'one_to_one',
  oneToOne: 'one_to_one',
  direct: 'one_to_one',
  dm: 'one_to_one',
  private: 'one_to_one',

  group: 'group_room',
  group_room: 'group_room',
  room: 'group_room',

  live: 'live_translate',
  live_translate: 'live_translate',
  translate: 'live_translate',

  delivered: 'delivered',
  delivery: 'delivered',
  receipt: 'delivered'
});

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function hardenNoStore(res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } catch (_) {}
}

function normalizeMode(mode) {
  const raw = safeString(mode || 'one_to_one');
  return MODE_ALIASES[raw] || 'one_to_one';
}

function sanitizeChannelPart(value, fallback = DEFAULT_ROOM_ID) {
  const clean = safeString(value || fallback)
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);

  return clean || fallback;
}

function getAblyKey() {
  return safeString(process.env.ABLY_ROOT_API_KEY || process.env.ABLY_API_KEY);
}

function loadAblyPackage() {
  try {
    return require('ably');
  } catch (error) {
    const missing = new Error('Ably package is not installed. Run: npm install ably');
    missing.code = 'ABLY_PACKAGE_MISSING';
    missing.cause = error;
    throw missing;
  }
}

function channelForMode(mode, roomId) {
  const cleanRoomId = sanitizeChannelPart(roomId);

  if (mode === 'one_to_one') return `ls:direct:${cleanRoomId}`;
  if (mode === 'live_translate') return `ls:live:${cleanRoomId}`;
  if (mode === 'delivered') return `ls:receipt:${cleanRoomId}`;

  return `ls:room:${cleanRoomId}`;
}

function buildCapability(channel) {
  return {
    [channel]: ['subscribe', 'presence'],
    [`${channel}:receipt`]: ['publish', 'subscribe'],
    [`${channel}:client`]: ['publish', 'subscribe']
  };
}

function sanitizeTokenInput(body = {}, query = {}) {
  const mode = normalizeMode(body.mode || query.mode);
  const roomId = sanitizeChannelPart(
    body.roomId || body.channelId || body.conversationId || query.roomId
  );

  const clientId = sanitizeChannelPart(
    body.clientId ||
      body.userId ||
      body.senderId ||
      query.clientId ||
      DEFAULT_CLIENT_ID,
    DEFAULT_CLIENT_ID
  );

  const ttl =
    Number(body.ttlMs || query.ttlMs) > 0
      ? Math.min(Number(body.ttlMs || query.ttlMs), DEFAULT_TTL_MS)
      : DEFAULT_TTL_MS;

  return {
    mode,
    roomId,
    clientId,
    ttl
  };
}

function validateTokenInput(input = {}) {
  const errors = [];

  if (!VALID_MODES.includes(input.mode)) {
    errors.push(`Invalid LingoSentinel mode: ${input.mode}.`);
  }

  if (!input.roomId) {
    errors.push('roomId is required.');
  }

  if (!input.clientId) {
    errors.push('clientId is required.');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

async function createTokenRequest(input = {}) {
  const key = getAblyKey();

  if (!key) {
    const error = new Error(
      'Missing Ably API key. Set ABLY_ROOT_API_KEY in the backend/runtime environment.'
    );
    error.code = 'ABLY_KEY_MISSING';
    throw error;
  }

  const Ably = loadAblyPackage();
  const rest = new Ably.Rest({ key });

  const channel = channelForMode(input.mode, input.roomId);
  const capability = buildCapability(channel);

  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: input.clientId,
    ttl: input.ttl,
    capability: JSON.stringify(capability)
  });

  return {
    tokenRequest,
    channel,
    capability
  };
}

function safeErrorResponse(error, stage = 'token_failed') {
  const code = error?.code || 'LINGOSENTINEL_TOKEN_FAILED';
  const publicError =
    code === 'ABLY_KEY_MISSING' ? 'ably_not_configured' :
    code === 'ABLY_PACKAGE_MISSING' ? 'ably_unavailable' :
    'token_request_failed';
  return {
    ok: false,
    stage,
    errors: [publicError],
    diagnosticsRedacted: true,
    telemetry: {
      failedAt: nowIso(),
      code
    }
  };
}

router.post('/token', async (req, res) => {
  hardenNoStore(res);
  const requestedAt = nowIso();

  try {
    const input = sanitizeTokenInput(req.body || {}, req.query || {});
    const validation = validateTokenInput(input);

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        stage: 'token_validation',
        errors: validation.errors,
        telemetry: {
          requestedAt
        }
      });
    }

    const result = await createTokenRequest(input);

    return res.status(200).json({
      ok: true,
      stage: 'token_created',
      tokenRequest: result.tokenRequest,
      channel: result.channel,
      mode: input.mode,
      roomId: input.roomId,
      clientId: input.clientId,
      ttlMs: input.ttl,
      telemetry: {
        requestedAt,
        issuedAt: nowIso(),
        route: 'LingoSentinelSubscribeTokenRoute'
      }
    });
  } catch (error) {
    const status =
      error?.code === 'ABLY_KEY_MISSING' || error?.code === 'ABLY_PACKAGE_MISSING'
        ? 500
        : 502;

    return res.status(status).json(safeErrorResponse(error));
  }
});

router.get('/token/health', (req, res) => {
  hardenNoStore(res);
  res.json({
    ok: true,
    service: 'LingoSentinelSubscribeTokenRoute',
    status: 'ready',
    version: VERSION,
    diagnosticsRedacted: true,
    routeMounted: true,
    timestamp: nowIso()
  });
});

router.VERSION = VERSION;
module.exports = router;
