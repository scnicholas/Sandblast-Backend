'use strict';

/**
 * LingoSentinelLinkGateway
 * ------------------------------------------------------------
 * Marion authority gateway for LingoSentinel-to-LingoLink traffic.
 *
 * Purpose:
 * - Keep LingoSentinel traffic aligned with Marion's routing discipline.
 * - Normalize modes: 1:1 Chat, Group Room, Live Translate, Delivered.
 * - Prepare clean, validated publish instructions for the realtime layer.
 * - Keep Ably publishing isolated outside this gateway.
 * - Preserve Marion authority and Nyx/LingoSentinel public-facing boundaries.
 *
 * Architectural boundary:
 * - This file does NOT publish to Ably.
 * - This file does NOT perform translation.
 * - This file does NOT expose private form data, emails, tokens, or API keys.
 * - Publishing belongs to LingoSentinelEngine.js or LingoSentinelRealtimeBridge.js.
 */

const crypto = require('crypto');

const GATEWAY_NAME = 'LingoSentinelLinkGateway';
const GATEWAY_VERSION = '1.1.0';
const DEFAULT_ROOM_ID = 'lingosentinel-main';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_REGION = 'global';
const MAX_TEXT_LENGTH = 4000;
const MAX_FIELD_LENGTH = 160;
const MAX_ROOM_ID_LENGTH = 96;
const MAX_METADATA_KEYS = 24;

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
  one_to_1: 'one_to_one',
  direct: 'one_to_one',
  dm: 'one_to_one',
  private: 'one_to_one',
  chat: 'one_to_one',

  group: 'group_room',
  group_room: 'group_room',
  groupRoom: 'group_room',
  room: 'group_room',
  community: 'group_room',

  live: 'live_translate',
  live_translate: 'live_translate',
  liveTranslate: 'live_translate',
  translate: 'live_translate',
  translation: 'live_translate',

  delivered: 'delivered',
  delivery: 'delivered',
  receipt: 'delivered',
  async: 'delivered',
  handoff: 'delivered'
});

const CHANNEL_LANES = Object.freeze({
  one_to_one: 'direct',
  group_room: 'room',
  live_translate: 'translation',
  delivered: 'delivered'
});

const EVENT_TYPES = Object.freeze({
  one_to_one: 'ONE_TO_ONE_MESSAGE_READY',
  group_room: 'ROOM_MESSAGE_READY',
  live_translate: 'TRANSLATION_MESSAGE_READY',
  delivered: 'DELIVERED_MESSAGE_READY'
});

const GOVERNANCE_DECISIONS = Object.freeze({
  allow: 'allow',
  allowWithReview: 'allow_with_review',
  reject: 'reject'
});

const RISK_LEVELS = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
  unknown: 'unknown'
});

function nowIso() {
  return new Date().toISOString();
}

function createTraceId(prefix = 'lslg') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value, fallback = '', maxLength = MAX_FIELD_LENGTH) {
  if (value === null || value === undefined) return fallback;
  const text = typeof value === 'string' ? value : String(value);
  const trimmed = text.trim();
  return (trimmed || fallback).slice(0, maxLength);
}

function safeText(value, fallback = '') {
  return safeString(value, fallback, MAX_TEXT_LENGTH);
}

function normalizeToken(value, fallback = '') {
  const raw = safeString(value, fallback, MAX_ROOM_ID_LENGTH);
  const cleaned = raw
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || fallback;
}

function normalizeMode(mode) {
  const raw = safeString(mode || 'one_to_one', 'one_to_one');
  return MODE_ALIASES[raw] || null;
}

function normalizeLanguage(value, fallback = DEFAULT_LANGUAGE) {
  const lang = safeString(value || fallback, fallback, 16).toLowerCase();
  return lang || fallback;
}

function normalizeLanguagePair(input = {}) {
  if (!isObject(input)) return null;

  const source = normalizeLanguage(input.source || input.from || input.sourceLanguage, '');
  const target = normalizeLanguage(input.target || input.to || input.targetLanguage, '');

  if (!source || !target) return null;

  return { source, target };
}

function normalizeParticipant(input = {}, fallbackRole = 'participant') {
  const source = isObject(input) ? input : {};
  const id = normalizeToken(
    source.id || source.userId || source.handle || source.clientId || source.email,
    'anonymous'
  );

  return {
    id,
    name: safeString(source.name || source.displayName || source.handle || 'Guest', 'Guest'),
    role: safeString(source.role || fallbackRole, fallbackRole, 48),
    preferredLanguage: normalizeLanguage(
      source.preferredLanguage || source.language || source.lang,
      DEFAULT_LANGUAGE
    ),
    anonymous: id === 'anonymous' || source.anonymous === true
  };
}

function normalizeRecipient(input = null) {
  if (!input) return null;
  return normalizeParticipant(input, input.role || 'recipient');
}

function normalizeRoomId(input = {}) {
  const mode = normalizeMode(input.mode || input.lane) || 'one_to_one';
  const explicitRoomId = input.roomId || input.channelId || input.conversationId || input.sessionId;

  if (explicitRoomId) return normalizeToken(explicitRoomId, DEFAULT_ROOM_ID);

  if (mode === 'group_room') return DEFAULT_ROOM_ID;
  if (mode === 'live_translate') return normalizeToken(input.sessionId || 'translation-session', 'translation-session');
  if (mode === 'delivered') return normalizeToken(input.deliveryId || 'delivered-thread', 'delivered-thread');

  return DEFAULT_ROOM_ID;
}

function normalizeRegion(value, fallback = DEFAULT_REGION) {
  return safeString(value || fallback, fallback, 80).toLowerCase();
}

function stripSensitiveMetadata(metadata = {}) {
  if (!isObject(metadata)) return {};

  const blocked = /^(authorization|cookie|password|secret|token|apiKey|apikey|api_key|privateKey|private_key|email)$/i;
  const clean = {};
  let count = 0;

  Object.keys(metadata).forEach(key => {
    if (count >= MAX_METADATA_KEYS) return;
    if (blocked.test(key)) return;

    const value = metadata[key];

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clean[safeString(key, '', 64)] = safeString(value, '', 240);
      count += 1;
    }
  });

  return clean;
}

function detectPrivateMaterial(text = '') {
  const value = safeText(text);

  return /\b(api[_\s-]?key|client[_\s-]?secret|password|private[_\s-]?key|bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9]{12,}|xox[baprs]-[a-z0-9-]{10,})\b/i.test(value);
}

function detectRiskLevel(input = {}) {
  const text = safeText(input.text || input.message || input.body);

  if (detectPrivateMaterial(text)) return RISK_LEVELS.high;

  if (/\b(emergency|danger|critical|urgent|breach|exploit|harm|weapon|self-harm|threat|violence)\b/i.test(text)) {
    return RISK_LEVELS.medium;
  }

  return RISK_LEVELS.low;
}

function validateGatewayInput(input = {}) {
  const errors = [];
  const mode = normalizeMode(input.mode || input.lane);
  const text = safeText(input.text || input.message || input.body);
  const roomId = normalizeRoomId(input);

  const sender = normalizeParticipant(input.sender || input.from || {
    id: input.senderId || input.userId || input.clientId,
    name: input.senderName || input.name,
    role: input.senderRole,
    preferredLanguage: input.sourceLanguage || input.lang || input.language
  });

  const recipient = normalizeRecipient(input.recipient || input.to || null);
  const languagePair = normalizeLanguagePair(input.languagePair || {
    source: input.sourceLanguage || input.language || input.lang,
    target: input.targetLanguage || input.targetLang || input.recipientLanguage
  });

  if (!mode || !VALID_MODES.includes(mode)) {
    errors.push(`Invalid LingoSentinel mode: ${safeString(input.mode || input.lane || 'missing')}.`);
  }

  if (!text) errors.push('Message text is required.');
  if (text.length > MAX_TEXT_LENGTH) errors.push(`Message text exceeds ${MAX_TEXT_LENGTH} characters.`);
  if (!roomId) errors.push('roomId, conversationId, channelId, or sessionId is required.');
  if (!sender.id || sender.id === 'anonymous') errors.push('sender.id is required.');

  if (mode === 'one_to_one' && (!recipient || !recipient.id || recipient.id === 'anonymous')) {
    errors.push('one_to_one mode requires recipient.id.');
  }

  if (mode === 'live_translate' && !languagePair) {
    errors.push('live_translate mode requires a valid languagePair or source/target language.');
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      mode: mode || 'one_to_one',
      text,
      roomId: roomId || DEFAULT_ROOM_ID,
      sender,
      recipient,
      languagePair,
      region: normalizeRegion(input.region || input.country || input.routeRegion)
    }
  };
}

function buildGovernance(input = {}, normalized = {}) {
  const riskLevel = detectRiskLevel(input);
  const privateMaterial = detectPrivateMaterial(normalized.text);
  const reviewRequested = input.requiresReview === true || input.review === true;

  const decision =
    riskLevel === RISK_LEVELS.high
      ? GOVERNANCE_DECISIONS.reject
      : riskLevel === RISK_LEVELS.medium || reviewRequested
        ? GOVERNANCE_DECISIONS.allowWithReview
        : GOVERNANCE_DECISIONS.allow;

  return {
    marionAuthority: true,
    nyxPublicFacing: true,
    lingoSentinelAllowed: decision !== GOVERNANCE_DECISIONS.reject,
    requiresReview: decision === GOVERNANCE_DECISIONS.allowWithReview,
    riskLevel,
    privateMaterial,
    confidence: riskLevel === RISK_LEVELS.low ? 0.88 : riskLevel === RISK_LEVELS.medium ? 0.64 : 0.25,
    decision,
    boundaries: {
      publishesRealtime: false,
      performsTranslation: false,
      exposesPrivateIdentity: false,
      finalAuthority: 'Marion'
    }
  };
}

function buildRoute(input = {}, normalized = {}) {
  const mode = normalized.mode;
  const lane = CHANNEL_LANES[mode] || 'direct';
  const eventType = EVENT_TYPES[mode] || EVENT_TYPES.one_to_one;
  const sessionId = normalizeToken(input.sessionId || normalized.roomId, normalized.roomId);
  const ablyChannel =
    mode === 'live_translate'
      ? `lingosentinel:translation:${sessionId}`
      : mode === 'group_room'
        ? `lingosentinel:room:${normalized.roomId}`
        : mode === 'delivered'
          ? `lingosentinel:delivered:${normalized.roomId}`
          : `lingosentinel:direct:${normalized.roomId}`;

  return {
    lane,
    eventType,
    roomId: normalized.roomId,
    sessionId: mode === 'live_translate' ? sessionId : null,
    ablyChannel,
    globeContext: {
      region: normalized.region,
      languageHint: normalizeLanguage(input.languageHint || input.lang || input.language, DEFAULT_LANGUAGE)
    }
  };
}

function buildPublishInput(input = {}, normalized = {}, governance = {}) {
  const targetLanguage = normalizeLanguage(
    input.targetLanguage ||
      input.targetLang ||
      input.recipientLanguage ||
      normalized.recipient?.preferredLanguage ||
      DEFAULT_LANGUAGE,
    DEFAULT_LANGUAGE
  );

  const sourceLanguage = normalizeLanguage(
    input.sourceLanguage ||
      input.language ||
      input.lang ||
      normalized.sender.preferredLanguage ||
      DEFAULT_LANGUAGE,
    DEFAULT_LANGUAGE
  );

  const route = buildRoute(input, normalized);

  return {
    id: safeString(input.id || createTraceId('lsmsg'), '', 96),
    text: normalized.text,
    mode: normalized.mode,
    roomId: normalized.roomId,

    sender: normalized.sender,
    recipient: normalized.recipient,

    sourceLanguage,
    targetLanguage:
      normalized.mode === 'group_room'
        ? safeString(input.targetLanguage || input.targetLang || 'multi', 'multi', 24)
        : targetLanguage,
    recipientLanguage: normalizeLanguage(
      input.recipientLanguage || normalized.recipient?.preferredLanguage || targetLanguage,
      targetLanguage
    ),
    languagePair: normalized.languagePair || { source: sourceLanguage, target: targetLanguage },

    route,

    metadata: {
      ...stripSensitiveMetadata(input.metadata),
      gateway: GATEWAY_NAME,
      gatewayVersion: GATEWAY_VERSION,
      governanceDecision: governance.decision,
      riskLevel: governance.riskLevel,
      marionAuthority: true,
      realtimeReady: true
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
        nyxPublicFacing: true,
        lingoSentinelAllowed: false,
        decision: GOVERNANCE_DECISIONS.reject,
        riskLevel: RISK_LEVELS.unknown,
        confidence: 0,
        boundaries: {
          publishesRealtime: false,
          performsTranslation: false,
          exposesPrivateIdentity: false,
          finalAuthority: 'Marion'
        }
      },
      telemetry: {
        traceId,
        gateway: GATEWAY_NAME,
        version: GATEWAY_VERSION,
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
        gateway: GATEWAY_NAME,
        version: GATEWAY_VERSION,
        stage: 'gateway_governance',
        mode: validation.normalized.mode,
        roomId: validation.normalized.roomId,
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
      gateway: GATEWAY_NAME,
      version: GATEWAY_VERSION,
      stage: 'gateway_ready',
      mode: publishInput.mode,
      roomId: publishInput.roomId,
      lane: publishInput.route.lane,
      eventType: publishInput.route.eventType,
      timestamp: nowIso()
    }
  };
}

function routePreview(input = {}) {
  const prepared = prepareLingoSentinelPublish(input);
  const publishInput = prepared.publishInput || {};

  return {
    ok: prepared.ok,
    mode: publishInput.mode,
    roomId: publishInput.roomId,
    lane: publishInput.route?.lane,
    eventType: publishInput.route?.eventType,
    ablyChannel: publishInput.route?.ablyChannel,
    sender: publishInput.sender?.id,
    recipient: publishInput.recipient?.id || null,
    languagePair: publishInput.languagePair || null,
    governance: prepared.governance,
    errors: prepared.errors || [],
    telemetry: prepared.telemetry
  };
}

function getGatewayContract() {
  return {
    gateway: GATEWAY_NAME,
    version: GATEWAY_VERSION,
    validModes: VALID_MODES.slice(),
    lanes: { ...CHANNEL_LANES },
    eventTypes: { ...EVENT_TYPES },
    boundaries: {
      publishesRealtime: false,
      performsTranslation: false,
      finalAuthority: 'Marion',
      publicFace: 'Nyx/LingoSentinel'
    }
  };
}

module.exports = {
  prepareLingoSentinelPublish,
  routePreview,
  getGatewayContract,

  // Exposed for tests.
  normalizeMode,
  normalizeLanguage,
  normalizeLanguagePair,
  normalizeParticipant,
  normalizeRecipient,
  normalizeRoomId,
  validateGatewayInput,
  buildGovernance,
  buildRoute,
  buildPublishInput,
  detectRiskLevel,
  detectPrivateMaterial,
  stripSensitiveMetadata,

  VALID_MODES,
  MODE_ALIASES,
  CHANNEL_LANES,
  EVENT_TYPES,
  GOVERNANCE_DECISIONS,
  RISK_LEVELS
};
