'use strict';

/**
 * LingoSentinelPrivateMarionVoiceRoute
 *
 * Mount:
 *   const privateVoiceRoute = require('./Data/marion/runtime/LingoSentinelPrivateMarionVoiceRoute');
 *   app.use('/api/lingosentinel/private/marion', privateVoiceRoute);
 *
 * Endpoint:
 *   POST /api/lingosentinel/private/marion/voice
 *
 * Hardlocks:
 * - Header-only admin auth.
 * - No token accepted from body/query.
 * - Transcript-first only.
 * - Raw audio is never stored or returned.
 * - Nyx remains the public surface; Marion remains private authority.
 */

const express = require('express');
const crypto = require('crypto');

const MarionVoiceGateway = require('./MarionVoiceGateway');

const VERSION = 'nyx.lingosentinel.privateMarionVoiceRoute/1.0';
const router = express.Router();

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function hardenNoStore(res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } catch (_) {}
}

function envTokens() {
  return [
    process.env.SB_LINGOSENTINEL_MARION_ADMIN_TOKEN,
    process.env.SB_MARION_ADMIN_VOICE_TOKEN
  ].map(cleanText).filter(Boolean);
}

function timingSafeTextEqual(a, b) {
  const left = Buffer.from(cleanText(a));
  const right = Buffer.from(cleanText(b));
  if (!left.length || !right.length || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
}

function checkAdmin(req) {
  const headers = req && req.headers ? req.headers : {};
  const tokens = envTokens();
  const candidates = [
    { source: 'x-sb-lingosentinel-marion-admin-token', value: headers['x-sb-lingosentinel-marion-admin-token'] },
    { source: 'x-sb-marion-admin-voice-token', value: headers['x-sb-marion-admin-voice-token'] }
  ].map((item) => ({ source: item.source, value: cleanText(item.value) })).filter((item) => item.value);

  for (const candidate of candidates) {
    if (tokens.some((token) => timingSafeTextEqual(candidate.value, token))) {
      return {
        verified: true,
        configured: tokens.length > 0,
        provided: true,
        source: candidate.source
      };
    }
  }

  return {
    verified: false,
    configured: tokens.length > 0,
    provided: candidates.length > 0,
    source: candidates.length ? 'invalid' : 'none'
  };
}

function voicePayload(req, admin) {
  const body = req && req.body && typeof req.body === 'object' ? req.body : {};
  return {
    transcript: cleanText(body.transcript || body.text || body.message || body.query || body.input || ''),
    confidence: body.confidence,
    locale: cleanText(body.locale || body.language || 'en-CA'),
    provider: cleanText(body.provider || 'lingosentinel-private-admin'),
    sessionId: cleanText(body.sessionId || 'lingosentinel-private-voice'),
    requestId: cleanText(body.requestId || body.traceId || `ls_private_voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    source: 'lingosentinel-private-admin-voice',
    client: cleanText(body.client || 'admin-private'),
    final: body.final !== false,
    interim: body.interim === true,
    adminOnlyVoiceDelivery: true,
    privateDelivery: true,
    privateVoiceDelivery: true,
    deliveryChannel: 'lingosentinel_private_voice',
    adminVoiceVerified: admin.verified === true,
    adminVoiceTokenVerified: admin.verified === true,
    adminVoiceDeliveryAllowed: admin.verified === true,
    serverSideAdminVoiceAuth: admin.verified === true,
    trustedServerAuth: admin.verified === true,
    adminVoiceAuthSource: admin.verified ? admin.source : ''
  };
}

router.options('/voice', (req, res) => {
  hardenNoStore(res);
  return res.status(204).end();
});

router.get('/voice/health', (req, res) => {
  hardenNoStore(res);
  return res.status(200).json({
    ok: true,
    service: 'lingosentinel-private-marion-voice',
    routeMounted: true,
    route: '/api/lingosentinel/private/marion/voice',
    method: 'POST',
    publicAgent: 'Nyx',
    authority: 'Marion',
    privateDelivery: true,
    adminOnlyVoiceDelivery: true,
    transcriptOnly: true,
    audioStored: false,
    diagnosticsRedacted: true,
    tokenConfigured: envTokens().length > 0,
    version: VERSION
  });
});

router.post('/voice', async (req, res) => {
  hardenNoStore(res);

  const startedAt = Date.now();
  const admin = checkAdmin(req);
  const payload = voicePayload(req, admin);

  if (!admin.verified) {
    return res.status(403).json({
      ok: false,
      blocked: true,
      error: 'private_marion_voice_admin_required',
      publicAgent: 'Nyx',
      authority: 'Marion',
      privateDelivery: false,
      privateVoiceDelivery: true,
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: false,
      adminVoiceDeliveryAllowed: false,
      transcriptOnly: true,
      audioStored: false,
      noRawAudioStored: true,
      route: '/api/lingosentinel/private/marion/voice',
      version: VERSION,
      meta: {
        configured: admin.configured === true,
        provided: admin.provided === true,
        latencyMs: Date.now() - startedAt
      }
    });
  }

  if (!payload.transcript) {
    return res.status(400).json({
      ok: false,
      error: 'empty_private_voice_transcript',
      publicAgent: 'Nyx',
      authority: 'Marion',
      privateDelivery: true,
      privateVoiceDelivery: true,
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: true,
      adminVoiceDeliveryAllowed: true,
      transcriptOnly: true,
      audioStored: false,
      noRawAudioStored: true,
      route: '/api/lingosentinel/private/marion/voice',
      version: VERSION
    });
  }

  try {
    const packet = await MarionVoiceGateway.handleLingoSentinelPrivateVoiceDelivery(payload, {
      adminVerified: true,
      adminVoiceVerified: true,
      adminVoiceTokenVerified: true,
      adminVoiceDeliveryAllowed: true,
      serverSideAdminVoiceAuth: true,
      trustedServerAuth: true,
      context: {
        sessionId: payload.sessionId,
        requestId: payload.requestId,
        inputChannel: 'voice',
        source: 'lingosentinel-private-admin-voice',
        publicAgent: 'Nyx',
        authority: 'Marion',
        privateDelivery: true,
        privateVoiceDelivery: true
      }
    });

    return res.status(packet.ok === false ? 202 : 200).json(Object.assign({}, packet, {
      route: '/api/lingosentinel/private/marion/voice',
      version: VERSION,
      publicAgent: 'Nyx',
      authority: 'Marion',
      privateDelivery: true,
      privateVoiceDelivery: true,
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: true,
      adminVoiceDeliveryAllowed: true,
      transcriptOnly: true,
      audioStored: false,
      noRawAudioStored: true,
      meta: Object.assign({}, packet.meta || {}, {
        latencyMs: Date.now() - startedAt,
        diagnosticsRedacted: true
      })
    }));
  } catch (_) {
    return res.status(500).json({
      ok: false,
      error: 'private_marion_voice_route_failed',
      publicAgent: 'Nyx',
      authority: 'Marion',
      privateDelivery: true,
      privateVoiceDelivery: true,
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: true,
      adminVoiceDeliveryAllowed: false,
      transcriptOnly: true,
      audioStored: false,
      noRawAudioStored: true,
      route: '/api/lingosentinel/private/marion/voice',
      version: VERSION,
      meta: {
        latencyMs: Date.now() - startedAt,
        diagnosticsRedacted: true
      }
    });
  }
});

router.VERSION = VERSION;
module.exports = router;
