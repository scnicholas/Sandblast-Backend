'use strict';

/**
 * LingoSentinelPublishRoute
 *
 * Backend-safe Express route for publishing LingoSentinel messages.
 *
 * Purpose:
 * - Accept widget/API message requests.
 * - Keep Ably root API key out of the frontend.
 * - Pass traffic through LingoSentinelLinkGateway before publishing.
 * - Return safe telemetry to the widget.
 *
 * Mount example:
 * const route = require('./Data/marion/runtime/LingoSentinelPublishRoute');
 * app.use('/api/lingosentinel', route);
 *
 * Endpoint:
 * POST /api/lingosentinel/publish
 */

const express = require('express');
const LingoSentinelLinkGateway = require('./LingoSentinelLinkGateway');
const LingoSentinelEngine = require('./LingoSentinel/LingoSentinelEngine');

const router = express.Router();

const DEFAULT_LIMIT_BYTES = 8000;

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function readClientIp(req = {}) {
  return (
    req.headers?.['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

function sanitizeBody(body = {}) {
  return {
    id: safeString(body.id),
    text: safeString(body.text || body.message || body.body),
    mode: safeString(body.mode || body.lane || 'one_to_one'),

    roomId: safeString(body.roomId || body.channelId || body.conversationId),

    sender: body.sender || body.from || {
      id: safeString(body.senderId || body.userId || 'guest'),
      name: safeString(body.senderName || body.name || 'Guest'),
      role: safeString(body.senderRole || 'participant'),
      preferredLanguage: safeString(body.sourceLanguage || body.lang || 'en')
    },

    recipient: body.recipient || body.to || null,

    targetLanguage: safeString(body.targetLanguage || body.targetLang),
    recipientLanguage: safeString(body.recipientLanguage || body.toLanguage),

    metadata: {
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      source: 'lingosentinel-publish-route'
    }
  };
}

function validateRequestBody(input = {}) {
  const errors = [];

  if (!input.text) errors.push('Message text is required.');
  if (input.text && Buffer.byteLength(input.text, 'utf8') > DEFAULT_LIMIT_BYTES) {
    errors.push(`Message exceeds ${DEFAULT_LIMIT_BYTES} byte limit.`);
  }

  if (!input.roomId) errors.push('roomId is required.');
  if (!input.sender?.id) errors.push('sender.id is required.');

  if (
    input.mode === 'one_to_one' &&
    !(input.recipient?.id || input.recipientId || input.to?.id)
  ) {
    errors.push('one_to_one mode requires a recipient.');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function safeErrorResponse(error, stage = 'route_failed') {
  return {
    ok: false,
    stage,
    errors: [error?.message || 'Unknown LingoSentinel route error.'],
    telemetry: {
      failedAt: nowIso(),
      code: error?.code || 'LINGOSENTINEL_ROUTE_FAILED'
    }
  };
}

router.post('/publish', async (req, res) => {
  const receivedAt = nowIso();

  try {
    const input = sanitizeBody(req.body || {});
    const validation = validateRequestBody(input);

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        stage: 'request_validation',
        errors: validation.errors,
        telemetry: {
          receivedAt,
          clientIp: readClientIp(req)
        }
      });
    }

    const gatewayResult = LingoSentinelLinkGateway.prepareLingoSentinelPublish({
      ...input,
      metadata: {
        ...input.metadata,
        clientIp: readClientIp(req),
        userAgent: safeString(req.headers?.['user-agent']),
        receivedAt
      }
    });

    if (!gatewayResult.ok) {
      return res.status(422).json({
        ok: false,
        stage: 'gateway_rejected',
        errors: gatewayResult.errors,
        governance: gatewayResult.governance,
        telemetry: gatewayResult.telemetry
      });
    }

    const publishResult = await LingoSentinelEngine.publishMessage(
      gatewayResult.publishInput,
      {
        dryRun: req.query?.dryRun === '1' || req.body?.dryRun === true
      }
    );

    const status = publishResult.ok ? 200 : 502;

    return res.status(status).json({
      ok: publishResult.ok,
      stage: publishResult.stage,
      channel: publishResult.channel,
      eventName: publishResult.eventName,
      signalId: publishResult.signalId,
      envelopeId: publishResult.envelopeId,
      mode: publishResult.mode,
      delivery: publishResult.delivery,
      language: publishResult.language,
      governance: publishResult.governance,
      errors: publishResult.errors || [],
      telemetry: {
        ...publishResult.telemetry,
        gatewayTraceId: gatewayResult.telemetry?.traceId,
        routeReceivedAt: receivedAt,
        routeCompletedAt: nowIso()
      }
    });
  } catch (error) {
    return res.status(500).json(safeErrorResponse(error));
  }
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'LingoSentinelPublishRoute',
    status: 'ready',
    timestamp: nowIso()
  });
});

module.exports = router;
