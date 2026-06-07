'use strict';

/**
 * LingoSentinelSignalEnvelope
 * Canonical signal-envelope builder for LingoSentinel.
 *
 * Purpose:
 * - Standardize message/event shape before publishing.
 * - Support 1:1 Chat, Group Room, Live Translate, and Delivered lanes.
 * - Preserve Marion authority metadata.
 * - Keep frontend/widget signals clean and backend-safe.
 *
 * This file does NOT publish to Ably.
 * Publishing belongs in LingoSentinelEngine.js.
 */

const crypto = require('crypto');

const VERSION = '1.0.0';

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
const DEFAULT_USER_ID = 'anonymous';
const DEFAULT_LANGUAGE = 'en';

function nowIso() {
  return new Date().toISOString();
}

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function createSignalId(prefix = 'ls_sig') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeMode(mode) {
  const value = safeString(mode || 'one_to_one');
  return MODE_ALIASES[value] || 'one_to_one';
}

function normalizeLanguage(value, fallback = DEFAULT_LANGUAGE) {
  const lang = safeString(value || fallback).toLowerCase();
  return lang || fallback;
}

function normalizeParticipant(input = {}) {
  return {
    id: safeString(input.id || input.userId || input.handle, DEFAULT_USER_ID),
    name: safeString(input.name || input.displayName || input.handle, 'Guest'),
    role: safeString(input.role, 'participant'),
    preferredLanguage: normalizeLanguage(
      input.preferredLanguage || input.language || input.lang,
      DEFAULT_LANGUAGE
    )
  };
}

function normalizeRecipient(input = null) {
  if (!input) return null;

  return normalizeParticipant({
    ...input,
    role: input.role || 'recipient'
  });
}

function normalizeRoom(input = {}) {
  const mode = normalizeMode(input.mode || input.lane);

  return {
    id: safeString(
      input.roomId || input.channelId || input.conversationId,
      DEFAULT_ROOM_ID
    ),
    mode,
    isDirect: mode === 'one_to_one',
    isGroup: mode === 'group_room',
    isLive: mode === 'live_translate',
    isReceipt: mode === 'delivered'
  };
}

function normalizeMessage(input = {}) {
  const text = safeString(input.text || input.message || input.body);

  return {
    text,
    originalText: text,
    normalizedText: text,
    length: text.length,
    hasText: text.length > 0
  };
}

function buildGovernance(input = {}) {
  return {
    marionAuthority: input.marionAuthority !== false,
    nyxPublicFacing: input.nyxPublicFacing !== false,
    requiresApproval: Boolean(input.requiresApproval),
    privateSignal: Boolean(input.privateSignal),
    riskLevel: safeString(input.riskLevel || 'low'),
    confidence:
      typeof input.confidence === 'number'
        ? Math.max(0, Math.min(1, input.confidence))
        : 0.72
  };
}

function buildDelivery(input = {}, room = {}) {
  const mode = room.mode || normalizeMode(input.mode);

  if (mode === 'one_to_one') {
    return {
      scope: 'direct',
      state: 'pending',
      fanout: false,
      requiresRecipient: true
    };
  }

  if (mode === 'group_room') {
    return {
      scope: 'room',
      state: 'pending',
      fanout: true,
      requiresRecipient: false
    };
  }

  if (mode === 'live_translate') {
    return {
      scope: 'live',
      state: 'streaming',
      fanout: true,
      requiresRecipient: false
    };
  }

  return {
    scope: 'receipt',
    state: 'delivered',
    fanout: false,
    requiresRecipient: false
  };
}

function buildLanguage(input = {}, sender = {}, recipient = null, room = {}) {
  const sourceLanguage = normalizeLanguage(
    input.sourceLanguage ||
      input.language ||
      input.lang ||
      sender.preferredLanguage,
    DEFAULT_LANGUAGE
  );

  let targetLanguage = normalizeLanguage(
    input.targetLanguage ||
      input.targetLang ||
      input.recipientLanguage ||
      recipient?.preferredLanguage,
    DEFAULT_LANGUAGE
  );

  if (room.mode === 'group_room' || room.mode === 'live_translate') {
    targetLanguage = safeString(input.targetLanguage || input.targetLang || 'multi');
  }

  return {
    sourceLanguage,
    targetLanguage,
    requiresTranslation:
      targetLanguage === 'multi' ? true : sourceLanguage !== targetLanguage
  };
}

function validateSignal(signal = {}) {
  const errors = [];

  if (!signal.id) errors.push('Signal id is required.');
  if (!signal.room?.id) errors.push('Room id is required.');
  if (!VALID_MODES.includes(signal.room?.mode)) {
    errors.push(`Invalid room mode: ${signal.room?.mode || 'missing'}.`);
  }

  if (!signal.sender?.id) errors.push('Sender id is required.');
  if (!signal.message?.hasText) errors.push('Message text is required.');

  if (signal.delivery?.requiresRecipient && !signal.recipient?.id) {
    errors.push('One-to-one messages require a recipient.');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function channelForSignal(signal = {}) {
  const roomId = safeString(signal.room?.id || DEFAULT_ROOM_ID);

  if (signal.room?.mode === 'one_to_one') {
    return `ls:direct:${roomId}`;
  }

  if (signal.room?.mode === 'live_translate') {
    return `ls:live:${roomId}`;
  }

  if (signal.room?.mode === 'delivered') {
    return `ls:receipt:${roomId}`;
  }

  return `ls:room:${roomId}`;
}

function eventNameForSignal(signal = {}) {
  if (signal.room?.mode === 'delivered') {
    return 'lingosentinel.message.delivered';
  }

  if (signal.room?.mode === 'live_translate') {
    return 'lingosentinel.message.live';
  }

  if (signal.room?.mode === 'group_room') {
    return 'lingosentinel.message.group';
  }

  return 'lingosentinel.message.direct';
}

function buildSignalEnvelope(input = {}) {
  const sender = normalizeParticipant(input.sender || input.from || {
    id: input.senderId || input.userId,
    name: input.senderName || input.name,
    role: input.senderRole,
    preferredLanguage: input.sourceLanguage || input.lang
  });

  const recipient = normalizeRecipient(input.recipient || input.to || null);
  const room = normalizeRoom(input);
  const message = normalizeMessage(input);
  const delivery = buildDelivery(input, room);
  const language = buildLanguage(input, sender, recipient, room);
  const governance = buildGovernance(input);

  const signal = {
    id: safeString(input.id) || createSignalId(),
    type: 'lingosentinel.signal',
    version: VERSION,
    createdAt: nowIso(),

    room,
    sender,
    recipient,
    message,
    language,
    delivery,
    governance,

    metadata: {
      source: safeString(input.source || 'runtime'),
      traceId: safeString(input.traceId) || createSignalId('trace'),
      correlationId: safeString(input.correlationId || input.id),
      tags: Array.isArray(input.tags) ? input.tags : []
    }
  };

  const validation = validateSignal(signal);

  return {
    ok: validation.ok,
    signal,
    publish: validation.ok
      ? {
          channel: channelForSignal(signal),
          eventName: eventNameForSignal(signal),
          payload: signal
        }
      : null,
    errors: validation.errors
  };
}

function fromAdaptiveEnvelope(adaptive = {}) {
  const envelope = adaptive.envelope || adaptive;

  return buildSignalEnvelope({
    id: envelope.id,
    text:
      envelope.message?.normalizedText ||
      envelope.message?.displayText ||
      envelope.message?.originalText,

    mode: envelope.room?.mode,
    roomId: envelope.room?.id,

    sender: envelope.sender,
    recipient: envelope.recipient,

    sourceLanguage: envelope.language?.sourceLanguage,
    targetLanguage: envelope.language?.targetLanguage,

    confidence: envelope.governance?.confidence,
    riskLevel: envelope.governance?.urgency === 'high' ? 'medium' : 'low',
    privateSignal: !envelope.governance?.publicSafe,

    source: 'adaptive-envelope',
    correlationId: envelope.id
  });
}

module.exports = {
  buildSignalEnvelope,
  fromAdaptiveEnvelope,
  validateSignal,
  channelForSignal,
  eventNameForSignal,
  normalizeMode,
  normalizeParticipant,
  normalizeRoom,
  normalizeMessage,
  buildLanguage,
  buildDelivery,
  buildGovernance
};
