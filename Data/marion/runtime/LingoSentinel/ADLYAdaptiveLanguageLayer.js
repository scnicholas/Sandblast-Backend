'use strict';

/**
 * ADLYAdaptiveLanguageLayer
 * Adaptive language envelope builder for LingoSentinel.
 *
 * Purpose:
 * - Accept raw chat input.
 * - Use LingQPatternLayer to detect language and mode.
 * - Build a clean, publish-ready message envelope.
 * - Keep Ably publishing outside this file.
 *
 * Note:
 * ADLY here is treated as your internal Adaptive Language Layer naming.
 * Ably publishing should happen in LingoSentinelEngine.js.
 */

const crypto = require('crypto');
const LingQPatternLayer = require('./LingQPatternLayer');

const DEFAULT_TARGET_LANGUAGE = 'en';

const MODE_LABELS = Object.freeze({
  one_to_one: '1:1 Chat',
  group_room: 'Group Room',
  live_translate: 'Live Translate',
  delivered: 'Delivered'
});

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = 'ls') {
  const random = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${Date.now()}_${random}`;
}

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeParticipant(value = {}) {
  return {
    id: safeString(value.id || value.userId || value.handle || 'anonymous'),
    name: safeString(value.name || value.displayName || value.handle || 'Guest'),
    role: safeString(value.role || 'participant'),
    preferredLanguage: safeString(value.preferredLanguage || value.lang || DEFAULT_TARGET_LANGUAGE)
      .toLowerCase()
  };
}

function normalizeRoom(input = {}) {
  const mode = LingQPatternLayer.normalizeMode(input.mode || input.lane);

  return {
    id: safeString(input.roomId || input.channelId || input.conversationId || 'lingosentinel-main'),
    mode,
    label: MODE_LABELS[mode] || MODE_LABELS.one_to_one
  };
}

function inferTargetLanguage(input = {}, scan = {}) {
  const explicit = safeString(input.targetLanguage || input.targetLang).toLowerCase();

  if (explicit) return explicit;

  if (scan.mode === 'one_to_one') {
    return safeString(input.recipientLanguage || input.toLanguage || DEFAULT_TARGET_LANGUAGE)
      .toLowerCase();
  }

  if (scan.mode === 'group_room' || scan.mode === 'live_translate') {
    return 'multi';
  }

  return DEFAULT_TARGET_LANGUAGE;
}

function buildLanguagePlan(input = {}, scan = {}) {
  const sourceLanguage = scan.language?.code || 'und';
  const targetLanguage = inferTargetLanguage(input, scan);

  return {
    sourceLanguage,
    sourceLabel: scan.language?.label || 'Unknown',
    targetLanguage,
    requiresTranslation:
      targetLanguage === 'multi'
        ? true
        : sourceLanguage !== 'und' && sourceLanguage !== targetLanguage,
    confidence: scan.language?.confidence || 0,
    detectionSource: scan.language?.source || 'unknown'
  };
}

function buildDeliveryPlan(input = {}, scan = {}) {
  const mode = scan.mode;

  if (mode === 'one_to_one') {
    return {
      publishScope: 'direct',
      requiresRecipient: true,
      fanout: false,
      deliveryState: 'pending'
    };
  }

  if (mode === 'group_room') {
    return {
      publishScope: 'room',
      requiresRecipient: false,
      fanout: true,
      deliveryState: 'pending'
    };
  }

  if (mode === 'live_translate') {
    return {
      publishScope: 'live',
      requiresRecipient: false,
      fanout: true,
      deliveryState: 'streaming'
    };
  }

  return {
    publishScope: 'receipt',
    requiresRecipient: false,
    fanout: false,
    deliveryState: 'delivered'
  };
}

function buildAdaptiveEnvelope(input = {}) {
  const scan = LingQPatternLayer.scanMessage(input);
  const sender = normalizeParticipant(input.sender || input.from || {});
  const recipient = input.recipient || input.to
    ? normalizeParticipant(input.recipient || input.to)
    : null;

  const room = normalizeRoom({
    ...input,
    mode: scan.mode
  });

  const languagePlan = buildLanguagePlan(input, scan);
  const deliveryPlan = buildDeliveryPlan(input, scan);

  const envelope = {
    id: safeString(input.id) || createId('ls_msg'),
    type: 'lingosentinel.message.adaptive',
    version: '1.0.0',
    createdAt: nowIso(),

    room,
    sender,
    recipient,

    message: {
      originalText: scan.text,
      normalizedText: scan.text,
      displayText: scan.text
    },

    language: languagePlan,
    delivery: deliveryPlan,

    governance: {
      marionAuthority: true,
      publicSafe: !scan.flags.hasPrivateHint,
      needsReview: scan.needsReview,
      urgency: scan.urgency,
      confidence: scan.confidence
    },

    pattern: {
      flags: scan.flags,
      alternatives: scan.language?.alternatives || [],
      scannedAt: scan.scannedAt
    }
  };

  return {
    ok: scan.ok,
    envelope,
    scan,
    errors: scan.ok ? [] : ['Message text is empty.']
  };
}

function adaptForPublish(input = {}) {
  const result = buildAdaptiveEnvelope(input);

  if (!result.ok) {
    return result;
  }

  const channel =
    result.envelope.room.mode === 'one_to_one'
      ? `ls:direct:${result.envelope.room.id}`
      : `ls:room:${result.envelope.room.id}`;

  return {
    ...result,
    publish: {
      channel,
      eventName: result.envelope.type,
      payload: result.envelope
    }
  };
}

module.exports = {
  buildAdaptiveEnvelope,
  adaptForPublish,
  normalizeParticipant,
  normalizeRoom,
  buildLanguagePlan,
  buildDeliveryPlan
};
