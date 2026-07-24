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
const GATEWAY_VERSION = '1.6.0-layer1-layer2-client-identity';
const IDENTITY_CONTRACT = 'lingosentinel.clientIdentity/1.0';
const PHASE2A_CONTINUITY_VERSION = 'nyx.lingosentinel.linkGateway.enFrEsContinuity/2.0';
const PHASE2B_USER_BOUNDARY_VERSION = 'nyx.lingosentinel.userBoundarySilentOversight/2.0';
const PHASE2D_CHANNEL_NAMESPACE_VERSION = 'nyx.lingosentinel.channelNamespaceRoundtrip/2.0';
const PHASE2E_LIVE_ROUNDTRIP_VERSION = 'nyx.lingosentinel.linkGateway.liveAblyRoundtrip/2.0';
const CHANNEL_NAMESPACE = 'lingosentinel';
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
  const raw = safeString(value || fallback, fallback, 32).toLowerCase().replace(/_/g, '-').trim();
  if (!raw) return fallback;
  if (/^(en|eng|english|en-ca|en-us|en-gb)/.test(raw)) return 'en';
  if (/^(fr|fre|fra|french|français|francais|fr-ca|fr-fr)/.test(raw)) return 'fr';
  if (/^(es|spa|spanish|español|espanol|es-mx|es-es|es-419)/.test(raw)) return 'es';
  return raw.slice(0, 16) || fallback;
}

function normalizeLanguagePair(input = {}) {
  if (!isObject(input)) return null;

  const source = normalizeLanguage(input.source || input.from || input.sourceLanguage, '');
  const target = normalizeLanguage(input.target || input.to || input.targetLanguage, '');

  if (!source || !target) return null;

  return { source, target };
}


function buildPhase2ERoundtripReadiness(mode, roomId) {
  const alignment = buildChannelAlignment(mode || 'live_translate', roomId || DEFAULT_ROOM_ID);
  return {
    ...buildPhase2BUserBoundary(),
    version: PHASE2E_LIVE_ROUNDTRIP_VERSION,
    liveAblyRoundtrip: true,
    tokenCreated: false,
    canonicalChannel: alignment.canonicalChannel,
    clientSubscribed: false,
    publishOk: false,
    messageReceivedByClient: false,
    receivedEventType: alignment.mode === 'live_translate' ? 'TRANSLATION_MESSAGE_READY' : EVENT_TYPES[alignment.mode] || '',
    channelNamespaceAligned: alignment.channelNamespaceAligned === true,
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
    roundtripReady: alignment.roundtripReady === true
  };
}

function buildLanguageContinuity(input = {}, normalized = {}) {
  const sourceLanguage = normalizeLanguage(
    input.sourceLanguage || input.language || input.lang || normalized.sender?.preferredLanguage || DEFAULT_LANGUAGE,
    DEFAULT_LANGUAGE
  );
  const targetLanguage = normalizeLanguage(
    input.targetLanguage || input.targetLang || input.recipientLanguage || normalized.recipient?.preferredLanguage || DEFAULT_LANGUAGE,
    DEFAULT_LANGUAGE
  );
  const previousLanguage = normalizeLanguage(
    input.previousLanguage || input.lastLanguage || input.contextLanguage || input.continuity?.lastLanguage || '',
    ''
  );
  const activeLanguages = Array.from(new Set([previousLanguage, sourceLanguage, targetLanguage].filter(Boolean)));
  const languageDriftDetected = Boolean(previousLanguage && previousLanguage !== sourceLanguage);
  const translationAmbiguityFlagged = Boolean(input.translationAmbiguity === true || input.ambiguous === true || input.lowConfidenceLanguage === true);
  return {
    version: PHASE2A_CONTINUITY_VERSION,
    enFrEsContinuityActive: ['en', 'fr', 'es'].includes(sourceLanguage) || ['en', 'fr', 'es'].includes(targetLanguage),
    supportedLanguages: ['en', 'fr', 'es'],
    sourceLanguage,
    targetLanguage,
    previousLanguage,
    activeLanguages,
    languageContinuityPreserved: true,
    contextCarryPreserved: true,
    languageDriftDetected,
    translationAmbiguityFlagged,
    silentOversight: true,
    userToUserBoundary: true,
    marionVisibleParticipant: false,
    visibleToUsers: false,
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: 'LingoSentinel/Nyx',
    finalAuthority: 'Marion',
    advisoryOnly: true,
    source: GATEWAY_NAME
  };
}


function normalizeBoundaryText(value) {
  return safeString(value || '', '', 180).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isReservedMarionIdentity(value) {
  const text = normalizeBoundaryText(value);
  if (!text) return false;
  return /^(?:marion|marion ai|marion authority|marion admin|marion overseer|marion system|sandblast marion)$/.test(text) ||
    /\bmarion\b/.test(text);
}

function isPublicParticipantReserved(participant = {}) {
  if (!isObject(participant)) return false;
  return isReservedMarionIdentity(participant.id) ||
    isReservedMarionIdentity(participant.name) ||
    isReservedMarionIdentity(participant.displayName) ||
    isReservedMarionIdentity(participant.handle) ||
    isReservedMarionIdentity(participant.role) ||
    isReservedMarionIdentity(participant.publicAgent) ||
    isReservedMarionIdentity(participant.visibleAgent) ||
    isReservedMarionIdentity(participant.speaker) ||
    isReservedMarionIdentity(participant.speakerName);
}

function hasPublicMarionSpoofAttempt(input = {}, normalized = {}) {
  const src = isObject(input) ? input : {};
  const n = isObject(normalized) ? normalized : {};
  return isPublicParticipantReserved(src.sender) ||
    isPublicParticipantReserved(src.from) ||
    isPublicParticipantReserved(src.recipient) ||
    isPublicParticipantReserved(src.to) ||
    isPublicParticipantReserved(n.sender) ||
    isPublicParticipantReserved(n.recipient) ||
    isReservedMarionIdentity(src.senderId) ||
    isReservedMarionIdentity(src.userId) ||
    isReservedMarionIdentity(src.clientId) ||
    isReservedMarionIdentity(src.senderName) ||
    isReservedMarionIdentity(src.name) ||
    isReservedMarionIdentity(src.recipientId) ||
    isReservedMarionIdentity(src.toId) ||
    isReservedMarionIdentity(src.publicAgent) ||
    isReservedMarionIdentity(src.visibleAgent) ||
    isReservedMarionIdentity(src.speaker) ||
    isReservedMarionIdentity(src.speakerName);
}

function buildPhase2BUserBoundary(input = {}, normalized = {}) {
  const spoofAttempt = hasPublicMarionSpoofAttempt(input, normalized);
  return {
    version: PHASE2B_USER_BOUNDARY_VERSION,
    phase: 'phase2b_user_to_user_boundary_silent_oversight_hardlock',
    enabled: true,
    userToUserBoundary: true,
    silentOversight: true,
    advisoryOnly: true,
    finalAuthority: 'Marion',
    publicFacingAgent: 'LingoSentinel/Nyx',
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: 'LingoSentinel/Nyx',
    marionVisibleParticipant: false,
    marionRenderedAsSpeaker: false,
    marionCanPublishToRoom: false,
    marionCanAppearInUserRoster: false,
    marionCanBeSender: false,
    marionCanBeRecipient: false,
    marionPublicChannelAllowed: false,
    marionPublicSpoofAttempt: spoofAttempt,
    visibleToUsers: false,
    source: GATEWAY_NAME
  };
}

function normalizeParticipant(input = {}, fallbackRole = 'participant') {
  const source = isObject(input) ? input : {};
  const id = normalizeToken(
    source.id || source.userId || source.handle || source.clientId || source.email,
    'anonymous'
  );

  const sessionId = normalizeToken(source.sessionId || source.session || '', '');
  const connectionId = normalizeToken(source.connectionId || source.connection || '', '');
  const participant = {
    contract: IDENTITY_CONTRACT,
    id,
    clientId: id,
    sessionId: sessionId || null,
    connectionId: connectionId || null,
    name: safeString(source.name || source.displayName || source.handle || 'Guest', 'Guest'),
    displayName: safeString(source.displayName || source.name || source.handle || 'Guest', 'Guest'),
    role: safeString(source.role || fallbackRole, fallbackRole, 48),
    preferredLanguage: normalizeLanguage(
      source.preferredLanguage || source.language || source.lang,
      DEFAULT_LANGUAGE
    ),
    authenticated: source.authenticated === true,
    anonymous: id === 'anonymous' || source.anonymous === true
  };

  const reservedMarionIdentity = isPublicParticipantReserved(participant);
  return Object.assign(participant, {
    reservedMarionIdentity,
    marionVisibleParticipant: false,
    visibleToUsers: reservedMarionIdentity ? false : undefined
  });
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

  if (hasPublicMarionSpoofAttempt(input)) return RISK_LEVELS.high;
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
  if (hasPublicMarionSpoofAttempt(input, { sender, recipient, roomId, mode })) {
    errors.push('Marion is private authority only and cannot be used as a public sender, recipient, speaker, agent, roster member, or channel identity.');
  }

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

  const userBoundary = buildPhase2BUserBoundary(input, normalized);
  return {
    marionAuthority: true,
    nyxPublicFacing: true,
    lingoSentinelAllowed: decision !== GOVERNANCE_DECISIONS.reject && !userBoundary.marionPublicSpoofAttempt,
    requiresReview: decision === GOVERNANCE_DECISIONS.allowWithReview,
    riskLevel,
    privateMaterial,
    confidence: riskLevel === RISK_LEVELS.low ? 0.88 : riskLevel === RISK_LEVELS.medium ? 0.64 : 0.25,
    decision,
    boundaries: {
      publishesRealtime: false,
      performsTranslation: false,
      exposesPrivateIdentity: false,
      finalAuthority: 'Marion',
      silentOversight: true,
      userToUserBoundary: true,
      marionVisibleParticipant: false,
      marionRenderedAsSpeaker: false,
      marionCanPublishToRoom: false,
      marionCanAppearInUserRoster: false,
      visibleToUsers: false
    },
    userBoundary,
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: 'LingoSentinel/Nyx',
    marionRenderedAsSpeaker: false,
    marionCanPublishToRoom: false,
    marionCanAppearInUserRoster: false
  };
}

function channelForMode(mode, roomId, options = {}) {
  const normalizedMode = normalizeMode(mode) || 'one_to_one';
  const cleanRoomId = normalizeToken(roomId || DEFAULT_ROOM_ID, DEFAULT_ROOM_ID);
  const sessionId = normalizeToken(options.sessionId || cleanRoomId, cleanRoomId);

  if (normalizedMode === 'one_to_one') return `${CHANNEL_NAMESPACE}:direct:${cleanRoomId}`;
  if (normalizedMode === 'live_translate') return `${CHANNEL_NAMESPACE}:translation:${sessionId}`;
  if (normalizedMode === 'delivered') return `${CHANNEL_NAMESPACE}:delivered:${cleanRoomId}`;
  return `${CHANNEL_NAMESPACE}:room:${cleanRoomId}`;
}

function legacyChannelAliasesForMode(mode, roomId, options = {}) {
  const normalizedMode = normalizeMode(mode) || 'one_to_one';
  const cleanRoomId = normalizeToken(roomId || DEFAULT_ROOM_ID, DEFAULT_ROOM_ID);
  const sessionId = normalizeToken(options.sessionId || cleanRoomId, cleanRoomId);
  if (normalizedMode === 'one_to_one') return [`ls:direct:${cleanRoomId}`];
  if (normalizedMode === 'live_translate') return [`ls:live:${sessionId}`, `ls:translation:${sessionId}`];
  if (normalizedMode === 'delivered') return [`ls:receipt:${cleanRoomId}`, `ls:delivered:${cleanRoomId}`];
  return [`ls:room:${cleanRoomId}`];
}

function buildChannelAlignment(mode, roomId, options = {}) {
  const normalizedMode = normalizeMode(mode) || 'one_to_one';
  const canonicalChannel = channelForMode(normalizedMode, roomId, options);
  return {
    version: PHASE2D_CHANNEL_NAMESPACE_VERSION,
    channelNamespaceAligned: true,
    canonicalNamespace: CHANNEL_NAMESPACE,
    mode: normalizedMode,
    canonicalChannel,
    publishChannel: canonicalChannel,
    tokenChannel: canonicalChannel,
    realtimeBridgeChannel: canonicalChannel,
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
    legacyChannelAliases: legacyChannelAliasesForMode(normalizedMode, roomId, options),
    canonicalOnlyForNewTraffic: true,
    roundtripReady: true,
    silentOversight: true,
    userToUserBoundary: true,
    marionVisibleParticipant: false,
    publicUsersMayAddressMarion: false
  };
}

function buildRoute(input = {}, normalized = {}) {
  const mode = normalized.mode;
  const lane = CHANNEL_LANES[mode] || 'direct';
  const eventType = EVENT_TYPES[mode] || EVENT_TYPES.one_to_one;
  const sessionId = normalizeToken(input.sessionId || normalized.roomId, normalized.roomId);
  const channelAlignment = buildChannelAlignment(mode, normalized.roomId, { sessionId });
  const ablyChannel = channelAlignment.canonicalChannel;

  return {
    lane,
    eventType,
    roomId: normalized.roomId,
    sessionId: mode === 'live_translate' ? sessionId : null,
    ablyChannel,
    channel: ablyChannel,
    canonicalChannel: ablyChannel,
    channelNamespace: CHANNEL_NAMESPACE,
    channelAlignment,
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
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
  const languageContinuity = buildLanguageContinuity(input, normalized);
  const userBoundary = buildPhase2BUserBoundary(input, normalized);
  const phase2eRoundtrip = buildPhase2ERoundtripReadiness(normalized.mode, normalized.roomId);

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
    languageContinuity,
    enFrEsContinuity: languageContinuity,
    userBoundary,
    marionSilentOversight: userBoundary,
    phase2eLiveRoundtrip: phase2eRoundtrip,

    route,

    metadata: {
      ...stripSensitiveMetadata(input.metadata),
      gateway: GATEWAY_NAME,
      gatewayVersion: GATEWAY_VERSION,
      governanceDecision: governance.decision,
      riskLevel: governance.riskLevel,
      marionAuthority: true,
      realtimeReady: true,
      channelNamespaceAligned: true,
      canonicalNamespace: CHANNEL_NAMESPACE,
      canonicalChannel: route.canonicalChannel,
      tokenChannelMatchesPublishChannel: true,
      realtimeBridgeChannelMatchesToken: true,
      phase2dChannelNamespaceVersion: PHASE2D_CHANNEL_NAMESPACE_VERSION,
      phase2eLiveRoundtripVersion: PHASE2E_LIVE_ROUNDTRIP_VERSION,
      phase2eLiveRoundtrip: true,
      enFrEsContinuityActive: languageContinuity.enFrEsContinuityActive,
      languageContinuityPreserved: true,
      silentOversight: true,
      userToUserBoundary: true,
      marionVisibleParticipant: false,
      marionRenderedAsSpeaker: false,
      marionCanPublishToRoom: false,
      marionCanAppearInUserRoster: false,
      publicUsersMayAddressMarion: false,
      visibleToUsers: false,
      phase2bUserBoundaryVersion: PHASE2B_USER_BOUNDARY_VERSION
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
          finalAuthority: 'Marion',
          silentOversight: true,
          userToUserBoundary: true,
          marionVisibleParticipant: false,
          marionRenderedAsSpeaker: false,
          marionCanPublishToRoom: false,
          marionCanAppearInUserRoster: false,
          visibleToUsers: false
        },
        userBoundary: buildPhase2BUserBoundary(input, validation.normalized || {})
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
      ablyChannel: publishInput.route.ablyChannel,
      canonicalChannel: publishInput.route.canonicalChannel,
      channelNamespaceAligned: true,
      tokenChannelMatchesPublishChannel: true,
      realtimeBridgeChannelMatchesToken: true,
      languageContinuity: publishInput.languageContinuity,
      silentOversight: true,
      userToUserBoundary: true,
      marionVisibleParticipant: false,
      marionRenderedAsSpeaker: false,
      marionCanPublishToRoom: false,
      marionCanAppearInUserRoster: false,
      publicUsersMayAddressMarion: false,
      visibleToUsers: false,
      phase2bUserBoundaryVersion: PHASE2B_USER_BOUNDARY_VERSION,
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
    canonicalChannel: publishInput.route?.canonicalChannel,
    channelNamespaceAligned: true,
    tokenChannelMatchesPublishChannel: true,
    realtimeBridgeChannelMatchesToken: true,
    sender: publishInput.sender?.id,
    recipient: publishInput.recipient?.id || null,
    languagePair: publishInput.languagePair || null,
    languageContinuity: publishInput.languageContinuity || null,
    userBoundary: publishInput.userBoundary || null,
    silentOversight: true,
    marionVisibleParticipant: false,
    visibleToUsers: false,
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
    channelNamespace: CHANNEL_NAMESPACE,
    phase2dChannelNamespaceVersion: PHASE2D_CHANNEL_NAMESPACE_VERSION,
    canonicalChannels: {
      one_to_one: channelForMode('one_to_one', DEFAULT_ROOM_ID),
      group_room: channelForMode('group_room', DEFAULT_ROOM_ID),
      live_translate: channelForMode('live_translate', DEFAULT_ROOM_ID),
      delivered: channelForMode('delivered', DEFAULT_ROOM_ID)
    },
    eventTypes: { ...EVENT_TYPES },
    identity: {
      contract: IDENTITY_CONTRACT,
      stableClientIdSupported: true,
      perTabSessionIdSupported: true,
      sharedDefaultIdentityAllowed: false
    },
    boundaries: {
      publishesRealtime: false,
      performsTranslation: false,
      finalAuthority: 'Marion',
      publicFace: 'Nyx/LingoSentinel',
      silentOversight: true,
      userToUserBoundary: true,
      marionVisibleParticipant: false,
      marionRenderedAsSpeaker: false,
      marionCanPublishToRoom: false,
      marionCanAppearInUserRoster: false,
      publicUsersMayAddressMarion: false,
      visibleToUsers: false
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
  buildLanguageContinuity,
  buildPhase2BUserBoundary,
  hasPublicMarionSpoofAttempt,
  isReservedMarionIdentity,
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
  channelForMode,
  legacyChannelAliasesForMode,
  buildChannelAlignment,
  buildPhase2ERoundtripReadiness,

  VALID_MODES,
  MODE_ALIASES,
  CHANNEL_LANES,
  EVENT_TYPES,
  GOVERNANCE_DECISIONS,
  RISK_LEVELS,
  PHASE2B_USER_BOUNDARY_VERSION,
  PHASE2D_CHANNEL_NAMESPACE_VERSION,
  PHASE2E_LIVE_ROUNDTRIP_VERSION,
  IDENTITY_CONTRACT,
  CHANNEL_NAMESPACE
};
