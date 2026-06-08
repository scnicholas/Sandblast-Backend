'use strict';

/**
 * LingoSentinelLinkGateway
 *
 * Marion authority gateway for LingoSentinel-to-LingoLink traffic.
 *
 * Purpose:
 * - Keep LingoSentinel traffic aligned with Marion's routing discipline.
 * - Normalize modes: 1:1 Chat, Group Room, Live Translate, Delivered.
 * - Enforce lightweight governance before Ably publishing.
 * - Return clean publish input for LingoSentinelEngine.
 *
 * This file does NOT publish to Ably.
 * Publishing belongs to LingoSentinelEngine.js.
 */

const crypto = require('crypto');

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

const DEFAULT_ROOM_ID = 'lingosentinel-main';
const DEFAULT_LANGUAGE = 'en';

function nowIso() {
  return new Date().toISOString();
}

function createTraceId(prefix = 'lslg') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeMode(mode) {
  const raw = safeString(mode || 'one_to_one');
  return MODE_ALIASES[raw] || 'one_to_one';
}

function normalizeLanguage(value, fallback = DEFAULT_LANGUAGE) {
  const lang = safeString(value || fallback).toLowerCase();
  return lang || fallback;
}

function normalizeParticipant(input = {}, fallbackRole = 'participant') {
  return {
    id: safeString(input.id || input.userId || input.handle || 'anonymous'),
    name: safeString(input.name || input.displayName || input.handle || 'Guest'),
    role: safeString(input.role || fallbackRole),
    preferredLanguage: normalizeLanguage(
      input.preferredLanguage || input.language || input.lang,
      DEFAULT_LANGUAGE
    )
  };
}

function normalizeRecipient(input = null) {
  if (!input) return null;
  return normalizeParticipant(input, input.role || 'recipient');
}

function detectPrivateMaterial(text = '') {
  return /\b(api[_\s-]?key|secret|password|token|private[_\s-]?key|bearer\s+[a-z0-9._-]+)\b/i.test(
    safeString(text)
  );
}

function detectRiskLevel(input = {}) {
  const text = safeString(input.text || input.message || input.body);

  if (detectPrivateMaterial(text)) return 'high';

  if (/\b(emergency|danger|critical|urgent|breach|exploit|harm|weapon)\b/i.test(text)) {
    return 'medium';
  }

  return 'low';
}

function validateGatewayInput(input = {}) {
  const errors = [];
  const mode = normalizeMode(input.mode || input.lane);
  const text = safeString(input.text || input.message || input.body);
  const roomId = safeString(input.roomId || input.channelId || input.conversationId);
  const sender = normalizeParticipant(input.sender || input.from || {
    id: input.senderId || input.userId,
    name: input.senderName || input.name,
    role: input.senderRole,
    preferredLanguage: input.sourceLanguage || input.lang
  });

  const recipient = normalizeRecipient(input.recipient || input.to || null);

  if (!VALID_MODES.includes(mode)) {
    errors.push(`Invalid LingoSentinel mode: ${mode}.`);
  }

  if (!text) {
    errors.push('Message text is required.');
  }

  if (!roomId) {
    errors.push('roomId is required.');
  }

  if (!sender.id || sender.id === 'anonymous') {
    errors.push('sender.id is required.');
  }

  if (mode === 'one_to_one' && !recipient?.id) {
    errors.push('one_to_one mode requires recipient.id.');
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      mode,
      text,
      roomId: roomId || DEFAULT_ROOM_ID,
      sender,
      recipient
    }
  };
}

function buildGovernance(input = {}, normalized = {}) {
  const riskLevel = detectRiskLevel(input);
  const privateMaterial = detectPrivateMaterial(normalized.text);

  return {
    marionAuthority: true,
    nyxPublicFacing: true,
    lingoSentinelAllowed: riskLevel !== 'high',
    requiresReview: riskLevel !== 'low',
    riskLevel,
    privateMaterial,
    confidence: riskLevel === 'low' ? 0.86 : riskLevel === 'medium' ? 0.62 : 0.28,
    decision:
      riskLevel === 'high'
        ? 'reject'
        : riskLevel === 'medium'
          ? 'allow_with_review'
          : 'allow'
  };
}

function buildPublishInput(input = {}, normalized = {}, governance = {}) {
  const targetLanguage = safeString(
    input.targetLanguage ||
      input.targetLang ||
      input.recipientLanguage ||
      normalized.recipient?.preferredLanguage ||
      DEFAULT_LANGUAGE
  );

  return {
    id: safeString(input.id),
    text: normalized.text,
    mode: normalized.mode,
    roomId: normalized.roomId,

    sender: normalized.sender,
    recipient: normalized.recipient,

    targetLanguage:
      normalized.mode === 'group_room' || normalized.mode === 'live_translate'
        ? safeString(input.targetLanguage || input.targetLang || 'multi')
        : targetLanguage,

    recipientLanguage: safeString(
      input.recipientLanguage ||
        normalized.recipient?.preferredLanguage ||
        targetLanguage
    ),

    sourceLanguage: safeString(
      input.sourceLanguage ||
        input.language ||
        input.lang ||
        normalized.sender.preferredLanguage ||
        DEFAULT_LANGUAGE
    ),

    metadata: {
      ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
      gateway: 'LingoSentinelLinkGateway',
      governanceDecision: governance.decision,
      riskLevel: governance.riskLevel
    },

    governance
  };
}

function prepareLingoSentinelPublish(input = {}) {
  const traceId = createTraceId();
  const validation = validateGatewayInput(input);

  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      governance: {
        marionAuthority: true,
        decision: 'reject',
        riskLevel: 'unknown',
        confidence: 0
      },
      telemetry: {
        traceId,
        stage: 'gateway_validation',
        timestamp: nowIso()
      }
    };
  }

  const governance = buildGovernance(input, validation.normalized);

  if (!governance.lingoSentinelAllowed) {
    return {
      ok: false,
      errors: ['Message rejected by Marion gateway governance.'],
      governance,
      telemetry: {
        traceId,
        stage: 'gateway_governance',
        timestamp: nowIso()
      }
    };
  }

  const publishInput = buildPublishInput(input, validation.normalized, governance);

  return {
    ok: true,
    publishInput,
    governance,
    telemetry: {
      traceId,
      stage: 'gateway_ready',
      mode: publishInput.mode,
      roomId: publishInput.roomId,
      timestamp: nowIso()
    }
  };
}

function routePreview(input = {}) {
  const prepared = prepareLingoSentinelPublish(input);

  return {
    ok: prepared.ok,
    mode: prepared.publishInput?.mode,
    roomId: prepared.publishInput?.roomId,
    sender: prepared.publishInput?.sender?.id,
    recipient: prepared.publishInput?.recipient?.id || null,
    governance: prepared.governance,
    errors: prepared.errors || [],
    telemetry: prepared.telemetry
  };
}

module.exports = {
  prepareLingoSentinelPublish,
  routePreview,

  // Exposed for tests.
  normalizeMode,
  normalizeLanguage,
  normalizeParticipant,
  normalizeRecipient,
  validateGatewayInput,
  buildGovernance,
  buildPublishInput,
  detectRiskLevel,
  detectPrivateMaterial
};
